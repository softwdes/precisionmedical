/**
 * PATCH /api/admin/appointments/[id]/follow-up — marcar el seguimiento de un no-show.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 *
 * Beatriz llevaba en un Excel el listado de pacientes que faltaron, anotando si
 * se los contactó después y qué dijeron. Esto es esa anotación.
 *
 * Lo pidió el 2026-10-01. Se arranca con lo MÍNIMO —contactado sí/no + una nota
 * libre— a propósito: ella lo va a usar y nos va a decir si necesita distinguir
 * "llamé y no atendió" de "hablé con el paciente". Ese sería un estado más y se
 * agrega cuando lo pida, no antes.
 *
 * ── Lo que esta ruta NO guarda ──────────────────────────────────────────────
 *
 * "¿Volvió a agendar?" NO se escribe acá. Se calcula en la lista mirando si el
 * paciente tiene una cita posterior — guardarlo sería copiar un dato que se
 * desincroniza en cuanto alguien reprograma.
 *
 * ── Desmarcar ───────────────────────────────────────────────────────────────
 *
 * `contactado: false` limpia los tres campos del contacto, no solo la fecha.
 * Dejar el nombre de quien lo marcó con la fecha en NULL deja una fila que dice
 * "Beatriz lo contactó en ningún momento", que es peor que no decir nada.
 *
 * La NOTA sobrevive a propósito: alguien puede desmarcar porque se equivocó de
 * fila, y tirarle lo que escribió sería el mismo descarte silencioso que ya
 * arreglamos dos veces esta semana en los formularios de ajustador y case
 * manager.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const InputSchema = z.object({
  contactado: z.boolean().optional(),
  /** Qué dijo el paciente. Vacío se guarda como NULL, no como cadena vacía. */
  nota: z.string().max(2000).nullable().optional(),
}).refine(
  v => v.contactado !== undefined || v.nota !== undefined,
  { message: 'Mandá al menos uno: contactado o nota' },
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const before = await db.appointment.findUnique({
    where:  { id },
    select: {
      id: true, status: true, cancelledSameDay: true, deletedAt: true,
      followUpContactedAt: true, followUpContactedByName: true, followUpNote: true,
    },
  });
  if (!before || before.deletedAt) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  /*
   * Solo sobre una visita que SE PERDIÓ.
   *
   * Sin esto, el campo se podría llenar en cualquier cita y la lista dejaría de
   * significar algo. Es la misma condición que usa la sección de Day Admission:
   * no-show, o cancelada el mismo día.
   */
  const sePerdio = before.status === 'NO_SHOW'
    || (before.status === 'CANCELLED' && before.cancelledSameDay);
  if (!sePerdio) {
    return NextResponse.json({ error: 'NOT_A_MISSED_VISIT' }, { status: 409 });
  }

  const ahora = new Date();
  const data: Prisma.AppointmentUpdateInput = {
    ...(parsed.contactado !== undefined
      ? parsed.contactado
        ? {
            followUpContactedAt:     ahora,
            followUpContactedById:   actor.actorUserId,
            followUpContactedByName: actor.actorName,
          }
        : {
            followUpContactedAt:     null,
            followUpContactedById:   null,
            followUpContactedByName: null,
          }
      : {}),
    // `?? null` y no `|| null`: una nota de un solo carácter es válida.
    ...(parsed.nota !== undefined
      ? { followUpNote: parsed.nota?.trim() ? parsed.nota.trim() : null }
      : {}),
  };

  const updated = await db.appointment.update({
    where: { id },
    data,
    select: {
      id: true,
      followUpContactedAt: true, followUpContactedByName: true, followUpNote: true,
    },
  });

  /*
   * El audit no puede voltear una escritura que YA ocurrió: si falla el log, la
   * fila igual se guardó y devolver error le mentiría al usuario sobre su
   * propio trabajo. Mismo criterio que la ruta de ajustadores.
   */
  try {
    await writeAuditLog(db, {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: parsed.contactado === false ? 'UNMARK_NO_SHOW_FOLLOW_UP' : 'MARK_NO_SHOW_FOLLOW_UP',
      entityType: 'appointments',
      entityId: id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      before: before as unknown as Prisma.JsonValue,
      after:  updated as unknown as Prisma.JsonValue,
    });
  } catch (err) {
    console.error('[follow-up] audit log fallido:', err);
  }

  return NextResponse.json({ ok: true, appointment: updated });
}
