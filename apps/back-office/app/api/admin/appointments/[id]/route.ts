/**
 * PATCH /api/admin/appointments/:id
 *
 * Actualización parcial de una cita: status, notes, durationMinutes.
 * Usado por:
 *   - "Cancelar cita" en AppointmentDetailPanel → { status: 'CANCELLED' }
 *   - "Editar" en AppointmentDetailPanel         → { notes, durationMinutes }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, Prisma, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { isWeekendInDenver, findOverlappingAppointments, describeOverlap } from '@/lib/scheduling-rules';
import { pagadoPorCodigoCpt, respuestaYaPagado } from '@/lib/charge-payments';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const appt = await db.appointment.findUnique({
    where: { id },
    select: { id: true, plannedServiceCodes: true },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json(appt);
}

const PlannedServiceSchema = z.object({
  id:          z.string(),
  code:        z.string(),
  description: z.string(),
  fee:         z.number(),
  category:    z.string(),
});

const PatchSchema = z.object({
  status:               z.enum(['SCHEDULED','CONFIRMED','CANCELLED','NO_SHOW','COMPLETED']).optional(),
  /**
   * Cancelacion del MISMO DIA: el horario ya se perdio, asi que la visita
   * conserva sus servicios y admite un cobro de penalidad. Es intencion de
   * recepcion (elige el boton), no un calculo de fechas — asi se puede perdonar
   * la penalidad cuando hubo una razon legitima.
   */
  cancelledSameDay:     z.boolean().optional(),
  notes:                z.string().max(2000).nullable().optional(),
  durationMinutes:      z.number().int().min(5).max(480).optional(),
  plannedServiceCodes:  z.array(PlannedServiceSchema).optional(),
  clinicId:             z.string().min(1).optional(),
  providerId:           z.string().min(1).nullable().optional(),
  scheduledFor:         z.string().datetime().optional(),
  type:                 z.enum(['AUTO_ACCIDENT','FAMILY_PRACTICE','URGENT_CARE','FOLLOW_UP','CONSULTATION']).optional(),
  isOnline:             z.boolean().optional(),
  meetingUrl:           z.string().url().nullable().optional(),
  /**
   * El cruce de horarios avisa y deja decidir, no bloquea (regla confirmada por
   * Erick 2026-08-05): el 409 SLOT_CONFLICT trae `canOverride`, y el cliente
   * reintenta con esto en true cuando el usuario elige solapar igual.
   */
  allowOverlap:         z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Al menos un campo requerido' });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor  = await resolveActor(req.headers);

  let parsed: z.infer<typeof PatchSchema>;
  try {
    parsed = PatchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const existing = await db.appointment.findUnique({
    where: { id },
    select: { id: true, status: true, caseId: true, providerId: true, scheduledFor: true, durationMinutes: true },
  });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // COMPLETED appointments: only plannedServiceCodes may be updated (Step 4 billing happens post-visit)
  if (existing.status === 'COMPLETED') {
    const keys = Object.keys(parsed);
    const onlyServices = keys.length === 1 && keys[0] === 'plannedServiceCodes';
    if (!onlyServices) {
      return NextResponse.json({ error: 'IMMUTABLE', message: 'No se puede modificar una cita completada' }, { status: 422 });
    }
  }

  /**
   * Un CPT ya cobrado no se saca de la lista.
   *
   * Los CPT los paga el seguro, pero pueden tener plata del PACIENTE encima —un
   * copago es exactamente eso—, y quitarlos de `plannedServiceCodes` dejaba el
   * cobro huérfano: `sync-billing` no borra una fila con pagos, así que el
   * código desaparecía del tab de Servicios y su monto seguía vivo en el de
   * Pagar sin nada que lo explicara. Misma regla que férulas, labs y efectivo
   * (ver lib/charge-payments.ts): primero se anula el pago.
   */
  if (parsed.plannedServiceCodes !== undefined) {
    const pagados = await pagadoPorCodigoCpt(id);
    if (pagados.size > 0) {
      const quedan = new Set(parsed.plannedServiceCodes.map((s) => s.code));
      const quitado = [...pagados.entries()].find(([code]) => !quedan.has(code));
      if (quitado) return respuestaYaPagado(quitado[1]);
    }
  }

  // Ninguna clínica atiende sábado/domingo (ver /api/admin/appointments POST)
  if (parsed.scheduledFor !== undefined && isWeekendInDenver(new Date(parsed.scheduledFor))) {
    return NextResponse.json({
      error: 'WEEKEND_NOT_ALLOWED',
      message: 'No se pueden agendar citas en fin de semana.',
    }, { status: 400 });
  }

  // Nota: NO hay chequeo de fecha pasada acá, a diferencia del POST (que
  // rechaza con DATE_IN_PAST). Es deliberado — regla confirmada por Erick
  // 2026-08-05: mover una cita a una fecha pasada es libre, sirve para corregir
  // registros viejos. No agregar el guard sin volver a preguntar.

  // Chequeo de cruce con otra cita del mismo doctor. Solo corre si algo
  // relacionado al horario realmente cambió, y excluye esta misma cita (si no,
  // siempre "chocaría" consigo misma). La lógica vive en lib/scheduling-rules
  // porque los tres endpoints que guardan una cita la necesitan igual.
  const timingChanged = parsed.scheduledFor !== undefined || parsed.providerId !== undefined || parsed.durationMinutes !== undefined;
  if (timingChanged && !parsed.allowOverlap) {
    const effectiveProviderId = parsed.providerId !== undefined ? parsed.providerId : existing.providerId;
    const effectiveDuration   = parsed.durationMinutes ?? existing.durationMinutes;
    const newStart = parsed.scheduledFor !== undefined ? new Date(parsed.scheduledFor) : new Date(existing.scheduledFor);

    if (effectiveProviderId) {
      const overlaps = await findOverlappingAppointments({
        providerId:           effectiveProviderId,
        start:                newStart,
        durationMinutes:      effectiveDuration,
        excludeAppointmentId: id,
      });
      if (overlaps.length > 0) {
        return NextResponse.json({
          error:   'SLOT_CONFLICT',
          message: describeOverlap(overlaps),
          conflictAppointmentId: overlaps[0]!.id,
          overlapCount: overlaps.length,
          // El cruce avisa y deja decidir: el cliente puede reintentar con
          // allowOverlap para solapar a propósito.
          canOverride: true,
        }, { status: 409 });
      }
    }
  }

  let updated;
  try {
    updated = await db.appointment.update({
      where: { id },
      data: {
        ...(parsed.status               !== undefined && { status:               parsed.status }),
        ...(parsed.cancelledSameDay     !== undefined && { cancelledSameDay:     parsed.cancelledSameDay }),
        ...(parsed.notes                !== undefined && { notes:                parsed.notes }),
        ...(parsed.durationMinutes      !== undefined && { durationMinutes:      parsed.durationMinutes }),
        ...(parsed.plannedServiceCodes  !== undefined && { plannedServiceCodes:  parsed.plannedServiceCodes }),
        ...(parsed.clinicId             !== undefined && { clinicId:             parsed.clinicId }),
        ...(parsed.providerId           !== undefined && { providerId:           parsed.providerId }),
        ...(parsed.scheduledFor         !== undefined && { scheduledFor:         new Date(parsed.scheduledFor) }),
        ...(parsed.type                 !== undefined && { type:                 parsed.type }),
        ...(parsed.isOnline             !== undefined && { isOnline:             parsed.isOnline }),
        ...(parsed.meetingUrl           !== undefined && { meetingUrl:           parsed.meetingUrl }),
      },
      select: { id: true, status: true, notes: true, durationMinutes: true, clinicId: true, providerId: true, scheduledFor: true, type: true },
    });
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    return NextResponse.json({ error: 'DB_ERROR', message: msg }, { status: 500 });
  }

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      parsed.status === 'CANCELLED' ? 'CANCEL_APPOINTMENT' : 'UPDATE_APPOINTMENT',
    entityType:  'appointments',
    entityId:    id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    after:       updated as unknown as Prisma.JsonValue,
    metadata:    { changes: parsed },
  });

  return NextResponse.json({ ok: true, appointment: updated });
}
