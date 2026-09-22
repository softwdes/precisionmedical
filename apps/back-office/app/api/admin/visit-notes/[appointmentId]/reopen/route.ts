/**
 * POST /api/admin/visit-notes/[appointmentId]/reopen
 *
 * Reabre una nota firmada para corregirla, dentro de su ventana de 48 h.
 *
 * NO borra ni toca lo firmado: la copia de esa firma ya está en
 * `visit_note_versions` y ahí se queda. Lo que se corrija se firma de nuevo y
 * escribe la versión siguiente. Es la forma que exige la regla de enmiendas
 * (CMS PIM 3.3.2.5): la corrección se identifica como tal, lleva fecha y autor,
 * y no borra ni tapa el original.
 *
 * La nota **sigue en `SIGNED`** — lo que habilita la edición es `reopenedAt`.
 * El porqué está en `lib/visit-note-reopen.ts`.
 *
 * Quién puede: el provider que FIRMÓ, o un SUPER_ADMIN. Decisión de Devin,
 * 2026-09-21.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { evaluarReapertura } from '@/lib/visit-note-reopen';

type Ctx = { params: Promise<{ appointmentId: string }> };

/** El motivo que devuelve el evaluador → el código HTTP que le corresponde. */
const ESTADO: Record<string, number> = {
  'no-firmada':      409,
  'ya-reabierta':    409,
  'ventana-vencida': 403,
  'no-es-suya':      403,
};

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const dbUser = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true },
  });
  const rol = await fetchDbRole(user.email);

  const note = await db.visitNote.findUnique({
    where: { appointmentId },
    select: {
      id: true, status: true, signedAt: true, signedById: true,
      signedByName: true, reopenedAt: true,
    },
  });
  if (!note) return NextResponse.json({ error: 'NOTE_NOT_FOUND' }, { status: 404 });

  const veredicto = evaluarReapertura(note, dbUser?.id ?? null, rol, new Date());
  if (!veredicto.puede) {
    return NextResponse.json(
      { error: 'CANNOT_REOPEN', motivo: veredicto.motivo, venceEn: veredicto.venceEn?.toISOString() ?? null },
      { status: ESTADO[veredicto.motivo ?? ''] ?? 403 },
    );
  }

  const nombre = `${dbUser?.firstName ?? ''} ${dbUser?.lastName ?? ''}`.trim() || user.email;

  /**
   * La auditoría va ANTES del update, y con `await`.
   *
   * Reabrir una nota firmada es el acto que un auditor va a mirar primero. Si se
   * reabriera y después fallara el registro, quedaría una nota editable sin
   * constancia de quién la abrió — que es justo lo que el versionado existe para
   * impedir. El mismo criterio que el audit de divulgación de PHI.
   */
  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: dbUser?.id ?? actor.actorUserId,
    action: 'REOPEN_VISIT_NOTE',
    entityType: 'visit_notes',
    entityId: note.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      appointmentId,
      // De quién era la firma que se está reabriendo, y de cuándo.
      firmadaPor: note.signedByName,
      firmadaEl: note.signedAt?.toISOString() ?? null,
      reabiertaPor: nombre,
      // Queda escrito si entró por ser el dueño o por ser super admin: son dos
      // permisos distintos y el registro tiene que distinguirlos.
      porSerSuperAdmin: note.signedById !== (dbUser?.id ?? null),
    },
  });

  const updated = await db.visitNote.update({
    where: { id: note.id },
    data: {
      reopenedAt: new Date(),
      reopenedById: dbUser?.id ?? null,
      reopenedByName: nombre,
    },
    select: { id: true, status: true, reopenedAt: true, reopenedByName: true },
  });

  return NextResponse.json({ ok: true, note: updated, venceEn: veredicto.venceEn?.toISOString() ?? null });
}
