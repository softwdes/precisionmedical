/**
 * GET  /api/admin/cases/[id]/prescriptions
 *   Lista las prescripciones del caso via sus appointments.
 *   Patrón idéntico al OR de billing: caseId directo o appointment.caseId.
 *
 * POST /api/admin/cases/[id]/prescriptions
 *   Registra una prescripción en el medicalHistory JSON del paciente
 *   (stub hasta integración DAW — no escribe en Prescription model que
 *   requiere appointmentId).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { randomUUID } from 'crypto';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(
  _req: NextRequest,
  { params }: Ctx,
): Promise<NextResponse> {
  const { id: caseId } = await params;

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      deletedAt: true,
      patient: { select: { id: true, medicalHistory: true } },
    },
  });

  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  // Fase 1: prescripciones en medicalHistory JSON del paciente
  // Fase 2 (DAW): leer de Prescription model via appointments
  const medHx = (caseRecord.patient?.medicalHistory ?? {}) as Record<string, unknown>;
  const allMeds = (medHx.medications as Array<Record<string, unknown>> | undefined) ?? [];

  const prescriptions = allMeds.map(m => ({
    id: m.id as string ?? randomUUID(),
    medicationName: m.name as string ?? '—',
    dose: m.dose as string | null ?? null,
    instructions: m.instructions as string | null ?? null,
    quantity: m.quantity as number | null ?? null,
    unit: m.unit as string | null ?? null,
    refills: m.refills as string | null ?? null,
    startDate: m.startDate as string | null ?? null,
    expirationDate: null,
    autoExpire: m.autoExpire as boolean ?? false,
    autoRenew: m.autoRenew as boolean ?? false,
    prescribedBy: m.prescribedBy as string | null ?? null,
    diagnosisCode: m.diagnosisCode as string | null ?? null,
    diagnosisLabel: m.diagnosisLabel as string | null ?? null,
    pharmacy: m.pharmacy as string | null ?? null,
    pharmacyNote: m.pharmacyNote as string | null ?? null,
    status: (m.status as string ?? 'IN_USE') as 'IN_USE' | 'HISTORY',
    createdAt: new Date().toISOString(),
  }));

  return NextResponse.json({ prescriptions });
}

export async function POST(
  req: NextRequest,
  { params }: Ctx,
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { id: caseId } = await params;

  const body = await req.json();

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      deletedAt: true,
      patient: { select: { id: true, medicalHistory: true } },
    },
  });

  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const patientId = caseRecord.patient?.id;
  if (!patientId) {
    return NextResponse.json({ error: 'PATIENT_NOT_FOUND' }, { status: 404 });
  }

  const medHx = (caseRecord.patient?.medicalHistory ?? {}) as Record<string, unknown>;
  const existing = (medHx.medications as Array<Record<string, unknown>> | undefined) ?? [];

  const newEntry = {
    id: randomUUID(),
    name: body.medicationName,
    status: body.status ?? 'IN_USE',
    dose: body.dose ?? null,
    instructions: body.instructions ?? null,
    quantity: body.quantity ?? null,
    unit: body.unit ?? null,
    refills: body.refills ?? null,
    startDate: body.startDate ?? null,
    autoExpire: body.autoExpire ?? false,
    autoRenew: body.autoRenew ?? false,
    prescribedBy: body.prescribedBy ?? null,
    diagnosisCode: body.diagnosisCode ?? null,
    diagnosisLabel: body.diagnosisLabel ?? null,
    pharmacy: body.pharmacy ?? null,
    pharmacyNote: body.pharmacyNote ?? null,
  };

  await db.patient.update({
    where: { id: patientId },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      medicalHistory: { ...medHx, medications: [...existing, newEntry] } as any,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'ADD_PRESCRIPTION',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { medicationName: newEntry.name, patientId },
  });

  return NextResponse.json({ ok: true, prescription: newEntry }, { status: 201 });
}
