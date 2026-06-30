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

  if (existing.status === 'COMPLETED') {
    return NextResponse.json({ error: 'IMMUTABLE', message: 'No se puede modificar una cita completada' }, { status: 422 });
  }

  const updated = await db.appointment.update({
    where: { id },
    data: {
      ...(parsed.status               !== undefined && { status:               parsed.status }),
      ...(parsed.notes                !== undefined && { notes:                parsed.notes }),
      ...(parsed.durationMinutes      !== undefined && { durationMinutes:      parsed.durationMinutes }),
      ...(parsed.plannedServiceCodes  !== undefined && { plannedServiceCodes:  parsed.plannedServiceCodes }),
    },
    select: { id: true, status: true, notes: true, durationMinutes: true },
  });

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
