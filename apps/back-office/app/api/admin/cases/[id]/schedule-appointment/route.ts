/**
 * B.10 — Schedule first appointment (post-CONFIRMED)
 *
 * POST /api/admin/cases/[id]/schedule-appointment
 *
 * Status flow: CONFIRMED → ACTIVE
 * Crea: Appointment con patient + case + clinic + provider + scheduledFor.
 * Audit log: action=SCHEDULE_FIRST_APPOINTMENT
 *
 * En Phase 1A no validamos overlapping slots — Phase 2 con calendar real
 * agregamos disponibilidad real del provider.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const InputSchema = z.object({
  clinicId: z.string().min(1),
  providerId: z.string().min(1),
  /** ISO date string · ej "2026-06-10T10:00:00.000Z" */
  scheduledFor: z.string().datetime({ message: 'Fecha/hora inválida (ISO 8601)' }),
  durationMinutes: z.number().int().min(15).max(240).default(30),
  type: z.enum(['AUTO_ACCIDENT', 'FAMILY_PRACTICE', 'URGENT_CARE', 'FOLLOW_UP']).default('AUTO_ACCIDENT'),
  notes: z.string().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { id: caseId } = await ctx.params;

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      caseCode: true,
      status: true,
      patientId: true,
      patient: { select: { firstName: true, lastName: true } },
      deletedAt: true,
    },
  });

  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  // Validation: solo se agenda desde CONFIRMED
  if (caseRecord.status !== 'CONFIRMED') {
    return NextResponse.json(
      {
        error: 'INVALID_STATUS',
        message: `No se puede agendar desde status ${caseRecord.status}. Esperado: CONFIRMED.`,
        currentStatus: caseRecord.status,
      },
      { status: 409 },
    );
  }

  // Validar que clinic y provider existan y estén activos
  const [clinic, provider] = await Promise.all([
    db.clinic.findUnique({ where: { id: parsed.clinicId }, select: { id: true, name: true } }),
    db.provider.findUnique({
      where: { id: parsed.providerId },
      select: { id: true, firstName: true, lastName: true, specialty: true, status: true },
    }),
  ]);

  if (!clinic) {
    return NextResponse.json({ error: 'CLINIC_NOT_FOUND' }, { status: 404 });
  }
  if (!provider || provider.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'PROVIDER_NOT_FOUND_OR_INACTIVE' }, { status: 404 });
  }

  // Validar que scheduledFor sea futuro
  const scheduledForDate = new Date(parsed.scheduledFor);
  if (scheduledForDate.getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'INVALID_DATE', message: 'La fecha/hora debe ser futura.' },
      { status: 400 },
    );
  }

  // Transaction: crear Appointment + Case.status → ACTIVE
  const result = await db.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        patientId: caseRecord.patientId,
        caseId: caseRecord.id,
        clinicId: parsed.clinicId,
        providerId: parsed.providerId,
        scheduledFor: scheduledForDate,
        durationMinutes: parsed.durationMinutes,
        type: parsed.type,
        status: 'SCHEDULED',
        notes: parsed.notes ?? null,
      },
    });

    const updatedCase = await tx.case.update({
      where: { id: caseRecord.id },
      data: { status: 'ACTIVE' },
      select: { id: true, caseCode: true, status: true },
    });

    return { appointment, updatedCase };
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SCHEDULE_FIRST_APPOINTMENT',
    entityType: 'cases',
    entityId: caseRecord.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      caseCode: caseRecord.caseCode,
      patientName: `${caseRecord.patient.firstName} ${caseRecord.patient.lastName}`,
      appointmentId: result.appointment.id,
      clinicId: clinic.id,
      clinicName: clinic.name,
      providerId: provider.id,
      providerName: `${provider.firstName} ${provider.lastName}`,
      providerSpecialty: provider.specialty,
      scheduledFor: scheduledForDate.toISOString(),
      durationMinutes: parsed.durationMinutes,
      type: parsed.type,
      previousStatus: 'CONFIRMED',
      newStatus: 'ACTIVE',
    },
  });

  return NextResponse.json({
    ok: true,
    appointment: {
      id: result.appointment.id,
      scheduledFor: result.appointment.scheduledFor,
      durationMinutes: result.appointment.durationMinutes,
      type: result.appointment.type,
      status: result.appointment.status,
      clinic: { id: clinic.id, name: clinic.name },
      provider: {
        id: provider.id,
        firstName: provider.firstName,
        lastName: provider.lastName,
        specialty: provider.specialty,
      },
    },
    case: result.updatedCase,
  });
}
