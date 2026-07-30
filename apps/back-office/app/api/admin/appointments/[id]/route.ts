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
    select: { id: true, status: true, caseId: true },
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
