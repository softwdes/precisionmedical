/**
 * B.2 — Cases CRUD API
 *
 * POST /api/admin/cases  → crear case + patient en transaction
 *
 * Phase 1A: PHI mock-only en local. Phase 2+ con BAA Supabase = data real.
 * Auto-genera patientCode (PT-XXXX) y caseCode (MVA-XXXX).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const InputSchema = z.object({
  // Patient
  patient: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    phone: z.string().min(7).max(30),
    email: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
    dateOfBirth: z.string().datetime().nullable().optional(),
    preferredLanguage: z.enum(['es', 'en']).default('es'),
  }),
  // Accident
  accident: z.object({
    date: z.string().datetime().nullable().optional(),
    type: z.enum(['AUTO', 'MOTORCYCLE', 'PEDESTRIAN', 'WORKPLACE', 'OTHER']).default('AUTO'),
    location: z.string().max(200).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  // Legal
  legal: z.object({
    lawFirmId: z.string().nullable().optional(),
    attorneyId: z.string().nullable().optional(),
  }),
  // Insurance
  insurance: z.object({
    primaryInsuranceId: z.string().nullable().optional(),
    primaryPolicyNumber: z.string().max(50).nullable().optional(),
  }),
  // Workflow
  specialtyId: z.string().nullable().optional(),
  caseType: z.enum(['MVA', 'GENERAL', 'WORKERS_COMP', 'NURSING_HOME']).default('MVA'),
  source: z.enum(['PHONE_CALL', 'WALK_IN', 'LAW_FIRM_REFERRAL', 'PATIENT_REFERRAL', 'WEB_FORM', 'AI_AGENT', 'OTHER']).default('PHONE_CALL'),
});

async function generateNextCode(prefix: string): Promise<string> {
  // Phase 1A: timestamp-based. Phase 2 con DB sequence proper.
  const ts = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${ts}${random}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // Generate codes
  const patientCode = await generateNextCode('PT');
  const caseCode = await generateNextCode(parsed.caseType === 'MVA' ? 'MVA' : 'CASE');

  // Transaction: create patient + case atomically
  const result = await db.$transaction(async (tx) => {
    const patient = await tx.patient.create({
      data: {
        patientCode,
        firstName: parsed.patient.firstName,
        lastName: parsed.patient.lastName,
        email: parsed.patient.email,
        phone: parsed.patient.phone,
        dateOfBirth: parsed.patient.dateOfBirth ? new Date(parsed.patient.dateOfBirth) : null,
        accidentDate: parsed.accident.date ? new Date(parsed.accident.date) : null,
        accidentType: parsed.accident.type,
        lawyerReferrerId: parsed.legal.lawFirmId ?? null,
        status: 'NEW',
      },
    });

    const newCase = await tx.case.create({
      data: {
        caseCode,
        patientId: patient.id,
        caseType: parsed.caseType,
        specialtyId: parsed.specialtyId ?? null,
        lawFirmId: parsed.legal.lawFirmId ?? null,
        attorneyId: parsed.legal.attorneyId ?? null,
        primaryInsuranceId: parsed.insurance.primaryInsuranceId ?? null,
        primaryPolicyNumber: parsed.insurance.primaryPolicyNumber ?? null,
        accidentDate: parsed.accident.date ? new Date(parsed.accident.date) : null,
        accidentType: parsed.accident.type,
        accidentLocation: parsed.accident.location ?? null,
        accidentNotes: parsed.accident.notes ?? null,
        status: 'NEW_REFERRAL',
        source: parsed.source,
      },
    });

    return { patient, case: newCase };
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CREATE_CASE_FROM_CALL',
    entityType: 'cases',
    entityId: result.case.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      caseCode: result.case.caseCode,
      patientCode: result.patient.patientCode,
      source: parsed.source,
      lawFirmId: parsed.legal.lawFirmId,
      primaryInsuranceId: parsed.insurance.primaryInsuranceId,
    },
  });

  return NextResponse.json(
    { ok: true, case: { id: result.case.id, caseCode: result.case.caseCode }, patient: { id: result.patient.id, patientCode: result.patient.patientCode } },
    { status: 201 },
  );
}
