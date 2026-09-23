/**
 * POST /api/admin/appointments/:id/restore — sacar una cita de la papelera
 *
 * ── Por qué no es un PATCH más ──────────────────────────────────────────────
 *
 * Porque restaurar puede CHOCAR. Mientras la cita estaba eliminada su horario
 * quedó libre, y es probable que alguien lo haya usado — de hecho ese es el
 * punto de eliminarla. Erick, 2026-09-23: *"el sistema ve que esa fecha esté
 * libre; si no lo está envía una alerta"*.
 *
 * El chequeo NO es nuevo: es el mismo `findOverlappingAppointments` que usan el
 * arrastre del calendario, el alta de cita y el agendado desde el caso. Así el
 * aviso sale con el formato de siempre —nombra la cita que choca y su hora— y
 * **avisa sin bloquear**, que es la regla que fijó Erick el 2026-08-05. Quien
 * restaura decide, igual que quien agenda.
 *
 * Reintentar con `allowOverlap: true` restaura igual.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, Prisma, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { findOverlappingAppointments, describeOverlap, overlapDetails } from '@/lib/scheduling-rules';
import { puedeEscribirLaCita } from '@/lib/appointment-scope';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!(await puedeEscribirLaCita(id))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const cita = await db.appointment.findUnique({
    where:  { id },
    select: {
      id: true, deletedAt: true, scheduledFor: true,
      durationMinutes: true, providerId: true, status: true,
    },
  });
  if (!cita)            return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!cita.deletedAt)  return NextResponse.json({ error: 'NOT_DELETED' }, { status: 409 });

  const body         = await req.json().catch(() => ({}));
  const allowOverlap = body?.allowOverlap === true;

  /**
   * ¿Alguien ocupó su horario mientras no estaba?
   *
   * Se excluye a sí misma por si acaso, aunque hoy no haría falta: la consulta
   * de cruce ya filtra las eliminadas, así que una cita en la papelera no se ve
   * a sí misma. Ponerlo igual cuesta nada y sobrevive a que eso cambie.
   */
  if (!allowOverlap && cita.providerId) {
    const overlaps = await findOverlappingAppointments({
      providerId:           cita.providerId,
      start:                cita.scheduledFor,
      durationMinutes:      cita.durationMinutes,
      excludeAppointmentId: id,
    });
    if (overlaps.length > 0) {
      const detalle = overlapDetails(overlaps)!;
      return NextResponse.json({
        error:   'SLOT_CONFLICT',
        message: describeOverlap(overlaps),
        conflictAppointmentId: overlaps[0]!.id,
        conflictAt:      detalle.at,
        conflictPatient: detalle.patient,
        overlapCount:    detalle.count,
        canOverride: true,
      }, { status: 409 });
    }
  }

  const actor = await resolveActor(req.headers);

  const restaurada = await db.appointment.update({
    where: { id },
    data:  {
      deletedAt:     null,
      deletedById:   null,
      deletedByName: null,
      // El motivo del borrado se borra con él: si mañana la vuelven a eliminar,
      // el motivo viejo contaría una historia que no es la de esta vez. El
      // registro de por qué se borró aquella vez queda en el audit log.
      deleteReason:  null,
    },
    select: { id: true, scheduledFor: true, status: true },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'RESTORE_APPOINTMENT',
    entityType:  'appointments',
    entityId:    id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    after:       restaurada as unknown as Prisma.JsonValue,
    // Queda anotado si se restauró ENCIMA de otra cita: es lo que hay que poder
    // buscar el día que dos pacientes se presenten a la misma hora.
    metadata:    { solapoAproposito: allowOverlap },
  });

  return NextResponse.json({ ok: true, appointment: restaurada });
}
