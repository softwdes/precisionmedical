/**
 * POST /api/admin/visit-notes/[appointmentId]/addenda
 *
 * Agrega un addendum al pie de una nota firmada. **No toca el cuerpo**: eso es
 * lo que lo hace válido como enmienda (CMS PIM 3.3.2.5 — la corrección se
 * identifica, lleva fecha y autor, y no borra ni tapa el original).
 *
 * Nace FIRMADO. Un addendum es una atestiguación, no un borrador: se escribe y
 * se firma en el mismo acto, así que no hay estado intermedio que administrar.
 *
 * ── Cuándo se usa ───────────────────────────────────────────────────────────
 *
 * Es la corrección de DESPUÉS de las 48 h, cuando el cuerpo ya no se reabre.
 * Pero **no se bloquea dentro de la ventana**: si el provider prefiere dejar
 * constancia aparte en la hora 5 en vez de reabrir y reescribir, eso es más
 * limpio, no menos. El porqué completo está en el .sql.
 *
 * ── Quién ───────────────────────────────────────────────────────────────────
 *
 * El mismo que podría firmarla: el provider de la cita, o un admin. Se reusa la
 * regla de `../sign` en vez de inventar una — dos permisos parecidos pero
 * distintos para el mismo documento es cómo aparecen los agujeros.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { nombreProvider } from '@/lib/provider-name';

type Ctx = { params: Promise<{ appointmentId: string }> };

const BodySchema = z.object({
  // El mismo HTML que las secciones de la nota. El tope es el de los snippets:
  // suficiente para un addendum largo, no tanto como para que un pegado
  // accidental de un PDF entero entre en la base.
  texto: z.string().trim().min(1).max(200_000),
});

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let parsed;
  try { parsed = BodySchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // Un addendum de etiquetas vacías no es un addendum. Mismo criterio que el
  // guardrail de la firma, que rechaza una nota en blanco.
  if (parsed.texto.replace(/<[^>]*>/g, '').trim().length === 0) {
    return NextResponse.json({ error: 'ADDENDUM_EMPTY' }, { status: 400 });
  }

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
    select: { id: true, status: true, reopenedAt: true },
  });
  if (!note) return NextResponse.json({ error: 'NOTE_NOT_FOUND' }, { status: 404 });

  /**
   * Solo sobre una nota FIRMADA y CERRADA.
   *
   * Sobre un borrador no tiene sentido —se escribe en el cuerpo—, y sobre una
   * reabierta tampoco: ahí el cuerpo está abierto y agregar un bloque aparte
   * dejaría la corrección repartida en dos lugares por ningún motivo.
   */
  if (note.status !== 'SIGNED') {
    return NextResponse.json({ error: 'NOTE_NOT_SIGNED' }, { status: 409 });
  }
  if (note.reopenedAt) {
    return NextResponse.json({ error: 'NOTE_REOPENED' }, { status: 409 });
  }

  const dbUser = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true },
  });
  const firmante = nombreProvider(appt.provider)
    || `${dbUser?.firstName ?? ''} ${dbUser?.lastName ?? ''}`.trim()
    || user.email;

  /**
   * El número lo protege el índice único `(visitNoteId, numero)`: si dos
   * addenda entraran a la vez, el segundo falla en vez de repetir el número.
   */
  const ultimo = await db.visitNoteAddendum.findFirst({
    where: { visitNoteId: note.id },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  });
  const numero = (ultimo?.numero ?? 0) + 1;

  const signedAt = new Date();
  const creado = await db.visitNoteAddendum.create({
    data: {
      visitNoteId: note.id,
      numero,
      texto: parsed.texto,
      signedAt,
      signedById: dbUser?.id ?? null,
      signedByName: firmante,
    },
    select: { id: true, numero: true, signedAt: true, signedByName: true },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: dbUser?.id ?? actor.actorUserId,
    action: 'ADD_VISIT_NOTE_ADDENDUM',
    entityType: 'visit_notes',
    entityId: note.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      appointmentId,
      patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
      numero,
      firmadoPor: firmante,
      firmadoEl: signedAt.toISOString(),
    },
  });

  return NextResponse.json({ ok: true, addendum: creado });
}
