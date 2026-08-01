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
import { db, Prisma, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { isWeekendInDenver } from '@/lib/scheduling-rules';

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
  notes:                z.string().max(2000).nullable().optional(),
  durationMinutes:      z.number().int().min(5).max(480).optional(),
  plannedServiceCodes:  z.array(PlannedServiceSchema).optional(),
  clinicId:             z.string().min(1).optional(),
  providerId:           z.string().min(1).nullable().optional(),
  scheduledFor:         z.string().datetime().optional(),
  type:                 z.enum(['AUTO_ACCIDENT','FAMILY_PRACTICE','URGENT_CARE','FOLLOW_UP','CONSULTATION']).optional(),
  isOnline:             z.boolean().optional(),
  meetingUrl:           z.string().url().nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Al menos un campo requerido' });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor  = actorFromHeaders(req.headers);

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

  // Ninguna clínica atiende sábado/domingo (ver /api/admin/appointments POST)
  if (parsed.scheduledFor !== undefined && isWeekendInDenver(new Date(parsed.scheduledFor))) {
    return NextResponse.json({
      error: 'WEEKEND_NOT_ALLOWED',
      message: 'No se pueden agendar citas en fin de semana.',
    }, { status: 400 });
  }

  // Chequeo de conflicto (mismo criterio que POST /api/admin/appointments) —
  // faltaba acá: se podía editar hora/doctor/duración a un horario que ya
  // tenía otra cita sin ningún aviso, porque el PATCH nunca revalidaba.
  // Solo corre si algo relacionado al horario realmente cambió, y excluye
  // esta misma cita del chequeo (si no, siempre "chocaría" consigo misma).
  const timingChanged = parsed.scheduledFor !== undefined || parsed.providerId !== undefined || parsed.durationMinutes !== undefined;
  if (timingChanged) {
    const effectiveProviderId = parsed.providerId !== undefined ? parsed.providerId : existing.providerId;
    const effectiveDuration   = parsed.durationMinutes ?? existing.durationMinutes;
    const newStart = parsed.scheduledFor !== undefined ? new Date(parsed.scheduledFor) : new Date(existing.scheduledFor);
    const newEnd   = new Date(newStart.getTime() + effectiveDuration * 60 * 1000);

    if (effectiveProviderId) {
      const bufferStart = new Date(newStart.getTime() - 240 * 60 * 1000);
      const conflict = await db.appointment.findFirst({
        where: {
          id:           { not: id },
          providerId:   effectiveProviderId,
          status:       { not: 'CANCELLED' },
          scheduledFor: { gte: bufferStart, lt: newEnd },
        },
        select: { id: true, scheduledFor: true, durationMinutes: true },
      });
      if (conflict) {
        const conflictEnd = new Date(conflict.scheduledFor.getTime() + conflict.durationMinutes * 60 * 1000);
        if (conflict.scheduledFor < newEnd && conflictEnd > newStart) {
          const conflictTime = conflict.scheduledFor.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
          return NextResponse.json({
            error: 'SLOT_CONFLICT',
            message: `El doctor ya tiene una cita a las ${conflictTime} que se cruza con este horario.`,
            conflictAppointmentId: conflict.id,
          }, { status: 409 });
        }
      }
    }
  }

  let updated;
  try {
    updated = await db.appointment.update({
      where: { id },
      data: {
        ...(parsed.status               !== undefined && { status:               parsed.status }),
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
