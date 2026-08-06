/**
 * GET  /api/admin/cases/[id]/labs
 *   Lista los lab orders del caso via sus appointments.
 *
 * POST /api/admin/cases/[id]/labs
 *   Registra un lab order en el medicalHistory JSON del paciente
 *   (stub hasta integración DAW — LabOrder model requiere appointmentId).
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

  const medHx = (caseRecord.patient?.medicalHistory ?? {}) as Record<string, unknown>;
  const allLabs = (medHx.labs as Array<Record<string, unknown>> | undefined) ?? [];

  const labs = allLabs.map(l => ({
    id: l.id as string ?? randomUUID(),
    sampleDate: l.sampleDate as string | null ?? null,
    billingType: l.billingType as string | null ?? null,
    providerName: l.providerName as string | null ?? null,
    status: l.status as string ?? 'PENDING',
    labItems: (l.labItems as string[] | undefined) ?? [],
    diagnoses: (l.diagnoses as string[] | undefined) ?? [],
    createdAt: l.createdAt as string ?? new Date().toISOString(),
  }));

  return NextResponse.json({ labs });
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
  const existing = (medHx.labs as Array<Record<string, unknown>> | undefined) ?? [];

  const newEntry = {
    id: randomUUID(),
    sampleDate: body.sampleDate ?? null,
    billingType: body.billingType ?? null,
    providerName: body.providerName ?? null,
    status: body.status ?? 'PENDING',
    labItems: body.labItems ?? [],
    diagnoses: body.diagnoses ?? [],
    createdAt: new Date().toISOString(),
  };

  await db.patient.update({
    where: { id: patientId },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      medicalHistory: { ...medHx, labs: [...existing, newEntry] } as any,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'ADD_LAB_ORDER',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { labCount: newEntry.labItems.length, patientId },
  });

  return NextResponse.json({ ok: true, lab: newEntry }, { status: 201 });
}
