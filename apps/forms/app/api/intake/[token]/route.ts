/**
 * B.6 — Portal Intake · GET + PATCH step data
 *
 * GET  /api/intake/[token]  → retorna datos del caso para pre-llenar wizard
 * PATCH /api/intake/[token] → guarda datos de un paso específico (autosave)
 *
 * Phase 1A: guarda en Patient + Case directamente.
 * Phase 2: guardará en IntakeSubmission (PHI encriptada, tras BAA).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';

type Ctx = { params: Promise<{ token: string }> };

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;

  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true, caseCode: true, status: true,
      accidentDate: true, accidentType: true,
      accidentNotes: true, accidentLocation: true,
      primaryPolicyNumber: true,
      intakeFormCompletedAt: true,
      patient: {
        select: {
          id: true, firstName: true, lastName: true,
          dateOfBirth: true, phone: true, email: true,
          insuranceCarrier: true, policyNumber: true,
        },
      },
    },
  });

  if (!rec) {
    return NextResponse.json({ error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json({
    caseId:    rec.id,
    caseCode:  rec.caseCode,
    status:    rec.status,
    completed: !!rec.intakeFormCompletedAt,
    patient: {
      id:        rec.patient.id,
      firstName: rec.patient.firstName,
      lastName:  rec.patient.lastName,
      dob:       rec.patient.dateOfBirth?.toISOString() ?? null,
      phone:     rec.patient.phone,
      email:     rec.patient.email,
    },
    accident: {
      date:     rec.accidentDate?.toISOString() ?? null,
      type:     rec.accidentType,
      location: rec.accidentLocation,
      notes:    rec.accidentNotes,
    },
    insurance: {
      carrier:      rec.patient.insuranceCarrier,
      policyNumber: rec.primaryPolicyNumber ?? rec.patient.policyNumber,
    },
  });
}

// ─── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;

  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true, caseCode: true,
      patient: { select: { id: true } },
    },
  });

  if (!rec) {
    return NextResponse.json({ error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  const body = await req.json() as {
    step: number;
    data: {
      personal?:  { firstName?: string; lastName?: string; dateOfBirth?: string; phone?: string; email?: string };
      accident?:  { date?: string; type?: string; location?: string; notes?: string };
      insurance?: { carrier?: string; policyNumber?: string };
    };
  };

  const { step, data } = body;

  if (step === 2 && data.personal) {
    const p = data.personal;
    const patientData: Record<string, unknown> = {};
    if (p.firstName)   patientData.firstName   = p.firstName;
    if (p.lastName)    patientData.lastName    = p.lastName;
    if (p.phone)       patientData.phone       = p.phone;
    if (p.email)       patientData.email       = p.email;
    if (p.dateOfBirth) patientData.dateOfBirth = new Date(p.dateOfBirth);

    if (Object.keys(patientData).length > 0) {
      await db.patient.update({
        where: { id: rec.patient.id },
        data:  patientData,
      });
    }
  }

  if (step === 3 && data.accident) {
    const a = data.accident;
    const caseData: Record<string, unknown> = {};
    if (a.date)     caseData.accidentDate     = new Date(a.date);
    if (a.type)     caseData.accidentType     = a.type;
    if (a.location) caseData.accidentLocation = a.location;
    if (a.notes)    caseData.accidentNotes    = a.notes;

    if (Object.keys(caseData).length > 0) {
      await db.case.update({ where: { id: rec.id }, data: caseData });
    }
  }

  if (step === 4 && data.insurance) {
    const ins = data.insurance;
    const caseData: Record<string, unknown> = {};
    if (ins.policyNumber) caseData.primaryPolicyNumber = ins.policyNumber;
    if (Object.keys(caseData).length > 0) {
      await db.case.update({ where: { id: rec.id }, data: caseData });
    }
    if (ins.carrier) {
      await db.patient.update({
        where: { id: rec.patient.id },
        data:  { insuranceCarrier: ins.carrier },
      });
    }
  }

  // Audit log — autosave (non-blocking, best-effort)
  writeAuditLog(db, {
    actorType:    'SYSTEM',
    actorUserId:  null,
    action:       'INTAKE_STEP_SAVE',
    entityType:   'Case',
    entityId:     rec.id,
    metadata:     { step, token: token.slice(0, 8) + '…' },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
