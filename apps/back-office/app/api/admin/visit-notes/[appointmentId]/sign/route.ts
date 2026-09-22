/**
 * POST /api/admin/visit-notes/[appointmentId]/sign
 *
 * Finaliza (firma) la nota clínica: DRAFT → SIGNED con snapshot del firmante.
 * A partir de aquí la nota es INMUTABLE (requisito HIPAA) — el PUT del borrador
 * responde 409. No cierra la consulta: eso lo hace el asistente en Day Admission.
 *
 * ── Cada firma deja su COPIA (2026-09-21) ───────────────────────────────────
 *
 * Firmar escribe una fila en `visit_note_versions` con las seis secciones y una
 * foto de los diagnósticos. Hasta hoy no quedaba copia de lo firmado: el PUT no
 * audita contenido y acá solo se guardaba metadata, así que el texto vivía en un
 * único lugar sobreescribible.
 *
 * Es la precondición de la reapertura de 48 h que pidió Devin: sin la copia,
 * reabrir y editar borra el original sin rastro — la versión que reprueba una
 * auditoría (CMS PIM 3.3.2.5). Ver `prisma/sql/20260921e-versiones-de-la-nota.sql`.
 *
 * La copia y el UPDATE van en la MISMA transacción: una nota marcada como
 * firmada sin su copia es peor que no tener versionado, porque parece que lo hay.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { nombreProvider } from '@/lib/provider-name';

type Ctx = { params: Promise<{ appointmentId: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const role = await fetchDbRole(user.email);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      provider: { select: { email: true, firstName: true, lastName: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const isOwner = appt.provider?.email?.toLowerCase() === user.email.toLowerCase();
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const note = await db.visitNote.findUnique({
    where: { appointmentId },
    select: {
      id: true, status: true, reopenedAt: true,
      // Las SEIS secciones: antes se traían cuatro porque solo servían para
      // saber si la nota estaba vacía. Ahora son el contenido de la copia.
      chiefComplaint: true, hpi: true, ros: true, physicalExam: true,
      assessment: true, plan: true,
      diagnoses: {
        orderBy: { sortOrder: 'asc' },
        select: { icd10Code: true, icd10Label: true, snomedCode: true, snomedLabel: true },
      },
    },
  });
  if (!note) return NextResponse.json({ error: 'NOTE_NOT_FOUND' }, { status: 404 });

  /**
   * Firmada Y sin reabrir = no hay nada que hacer.
   *
   * La reabierta sigue en SIGNED a propósito (ver el schema), así que preguntar
   * solo por el estado la dejaría sin poder volver a firmarse — que es
   * exactamente lo que tiene que pasar cuando el provider termina de corregir.
   */
  if (note.status === 'SIGNED' && !note.reopenedAt) {
    return NextResponse.json({ ok: true, alreadySigned: true, status: 'SIGNED' });
  }

  // Guardrail clínico: no se firma una nota vacía
  const hasContent = [note.chiefComplaint, note.hpi, note.assessment, note.plan]
    .some((v) => (v ?? '').replace(/<[^>]*>/g, '').trim().length > 0);
  if (!hasContent) return NextResponse.json({ error: 'NOTE_EMPTY' }, { status: 400 });

  const dbUser = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true },
  });

  const signerName = nombreProvider(appt.provider) || `${dbUser?.firstName ?? ''} ${dbUser?.lastName ?? ''}`.trim() || user.email;

  const signedAt = new Date();

  /**
   * El número de versión se calcula acá y lo protege el índice único
   * `(visitNoteId, version)`: si dos firmas entraran a la vez, la segunda falla
   * con violación de unicidad en vez de escribir dos veces la versión 2.
   */
  const ultima = await db.visitNoteVersion.findFirst({
    where: { visitNoteId: note.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (ultima?.version ?? 0) + 1;

  const [, updated] = await db.$transaction([
    db.visitNoteVersion.create({
      data: {
        visitNoteId: note.id,
        version,
        chiefComplaint: note.chiefComplaint,
        hpi: note.hpi,
        ros: note.ros,
        physicalExam: note.physicalExam,
        assessment: note.assessment,
        plan: note.plan,
        diagnoses: note.diagnoses,
        signedAt,
        signedById: dbUser?.id ?? null,
        signedByName: signerName,
        motivo: version === 1 ? 'FIRMA_INICIAL' : 'REFIRMA',
      },
    }),
    db.visitNote.update({
      where: { id: note.id },
      data: {
        status: 'SIGNED',
        signedAt,
        signedById: dbUser?.id ?? null,
        signedByName: signerName,
        // Se cierra la ventana de corrección: lo que se corrigió ya quedó
        // firmado y copiado. Para volver a tocarla hay que reabrirla otra vez.
        reopenedAt: null,
        reopenedById: null,
        reopenedByName: null,
      },
      select: { id: true, status: true, signedAt: true, signedByName: true },
    }),
  ]);

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: dbUser?.id ?? actor.actorUserId,
    action: 'SIGN_VISIT_NOTE',
    entityType: 'visit_notes',
    entityId: note.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      appointmentId,
      patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
      signedByName: signerName,
      signedAt: signedAt.toISOString(),
      version,
      motivo: version === 1 ? 'FIRMA_INICIAL' : 'REFIRMA',
    },
  });

  return NextResponse.json({ ok: true, note: updated, version });
}
