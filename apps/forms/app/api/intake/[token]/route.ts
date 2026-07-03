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

// Parsea "YYYY-MM-DD" como fecha local (noon) para evitar el off-by-one de UTC midnight
function parseDateLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date((y ?? 1970), (m ?? 1) - 1, (d ?? 1), 12, 0, 0, 0);
}

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
      personal?:  {
        firstName?: string; lastName?: string; dateOfBirth?: string;
        phone?: string; cellPhone?: string; email?: string; preferredLanguage?: string;
        addressLine1?: string; addressCity?: string; addressState?: string; addressZip?: string;
        referralSource?: string; communicationPreference?: string;
      };
      additional?: {
        emergencyContactName?: string; emergencyContactPhone?: string; emergencyContactRelation?: string;
        emergency2Name?: string; emergency2Phone?: string; emergency2Relation?: string;
        guardianName?: string; guardianPhone?: string; guardianRelation?: string;
        referredBy?: string; preferredPharmacy?: string; employer?: string;
        race?: string; ethnicity?: string; sex?: string; maritalStatus?: string;
      };
      guardian?: {
        guardianName?: string; guardianLastName?: string; guardianEmail?: string;
        guardianDOB?: string; guardianPhone?: string; guardianCellPhone?: string;
        guardianAddress?: string; guardianRelation?: string;
      };
      accident?:  {
        date?: string; type?: string; location?: string; notes?: string;
        lawFirm?: string; attorney?: string; chiropractor?: string;
      };
      insurance?: { carrier?: string; policyNumber?: string };
      health?: {
        healthStatus?: string;
        hasMedications?: boolean; medications?: string;
        hasAllergies?: boolean; allergies?: string;
        hasPreviousInjuries?: boolean; previousInjuries?: string;
        preferredLanguage?: string;
      };
      consents?: {
        hipaa?: boolean;
        assignedParties?: boolean;
        authRecords?: boolean; authVoicemail?: boolean; authNotifications?: boolean;
        authorizedPersons?: { name: string; relation: string }[];
        treatment?: boolean; financial?: boolean; financialSignatureSvg?: string;
        medicalHistory?: boolean;
      };
    };
  };

  const { step, data } = body;

  if (step === 2 && data.personal) {
    const p = data.personal;
    const patientData: Record<string, unknown> = {};
    if (p.firstName)              patientData.firstName                  = p.firstName;
    if (p.lastName)               patientData.lastName                   = p.lastName;
    if (p.phone)                  patientData.phone                      = p.phone;
    if (p.cellPhone !== undefined) patientData.phone2                    = p.cellPhone || null;
    if (p.email !== undefined)    patientData.email                      = p.email;
    if (p.dateOfBirth)            patientData.dateOfBirth                = parseDateLocal(p.dateOfBirth);
    if (p.preferredLanguage)      patientData.preferredLanguage          = p.preferredLanguage;
    if (p.addressLine1 !== undefined) patientData.addressLine1           = p.addressLine1 || null;
    if (p.addressCity !== undefined)  patientData.addressCity            = p.addressCity || null;
    if (p.addressState !== undefined) patientData.addressState           = p.addressState || null;
    if (p.addressZip !== undefined)   patientData.addressZip             = p.addressZip || null;
    if (p.referralSource)         patientData.referralSource             = p.referralSource;
    if (p.communicationPreference) patientData.communicationPreference   = p.communicationPreference;

    if (Object.keys(patientData).length > 0) {
      await db.patient.update({
        where: { id: rec.patient.id },
        data:  patientData,
      });
    }
  }

  if (step === 3 && data.additional) {
    const a = data.additional;
    const patientData: Record<string, unknown> = {};
    if (a.emergencyContactName !== undefined) patientData.emergencyContactName = a.emergencyContactName || null;
    if (a.emergencyContactPhone !== undefined) patientData.emergencyContactPhone = a.emergencyContactPhone || null;
    if (a.emergencyContactRelation !== undefined) patientData.emergencyContactRelation = a.emergencyContactRelation || null;
    if (a.emergency2Name !== undefined) patientData.emergency2Name = a.emergency2Name || null;
    if (a.emergency2Phone !== undefined) patientData.emergency2Phone = a.emergency2Phone || null;
    if (a.emergency2Relation !== undefined) patientData.emergency2Relation = a.emergency2Relation || null;
    if (a.referredBy !== undefined) patientData.referredBy = a.referredBy || null;
    if (a.preferredPharmacy !== undefined) patientData.preferredPharmacy = a.preferredPharmacy || null;
    if (a.employer !== undefined) patientData.employer = a.employer || null;
    if (a.race) patientData.race = a.race;
    if (a.ethnicity) patientData.ethnicity = a.ethnicity;
    if (a.sex) patientData.sex = a.sex;
    if (a.maritalStatus) patientData.maritalStatus = a.maritalStatus;
    if (Object.keys(patientData).length > 0) {
      await db.patient.update({ where: { id: rec.patient.id }, data: patientData });
    }
  }

  if (step === 4 && data.guardian) {
    const g = data.guardian;
    const patientData: Record<string, unknown> = {};
    if (g.guardianName !== undefined) patientData.guardianName = g.guardianName || null;
    if (g.guardianPhone !== undefined) patientData.guardianPhone = g.guardianPhone || null;
    if (g.guardianRelation !== undefined) patientData.guardianRelation = g.guardianRelation || null;
    if (Object.keys(patientData).length > 0) {
      await db.patient.update({ where: { id: rec.patient.id }, data: patientData });
    }
    // Extra fields (lastName, email, dob, cellPhone, address) → consentsData JSON
    const extraFields = {
      ...(g.guardianLastName !== undefined ? { guardianLastName: g.guardianLastName || null } : {}),
      ...(g.guardianEmail !== undefined ? { guardianEmail: g.guardianEmail || null } : {}),
      ...(g.guardianDOB !== undefined ? { guardianDOB: g.guardianDOB || null } : {}),
      ...(g.guardianCellPhone !== undefined ? { guardianCellPhone: g.guardianCellPhone || null } : {}),
      ...(g.guardianAddress !== undefined ? { guardianAddress: g.guardianAddress || null } : {}),
    };
    if (Object.keys(extraFields).length > 0) {
      const existing = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
      const prev = (existing?.consentsData ?? {}) as Record<string, unknown>;
      await db.case.update({ where: { id: rec.id }, data: { consentsData: { ...prev, ...extraFields } } });
    }
  }

  if (step === 5 && data.accident) {
    const a = data.accident;
    const caseData: Record<string, unknown> = {};
    if (a.date)     caseData.accidentDate     = parseDateLocal(a.date);
    if (a.type)     caseData.accidentType     = a.type;
    if (a.location) caseData.accidentLocation = a.location;
    if (a.notes)    caseData.accidentNotes    = a.notes;

    if (a.lawFirm !== undefined || a.attorney !== undefined || a.chiropractor !== undefined) {
      const existing = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
      const prev = (existing?.consentsData ?? {}) as Record<string, unknown>;
      caseData.consentsData = {
        ...prev,
        ...(a.lawFirm      !== undefined ? { lawFirm:      a.lawFirm || null }      : {}),
        ...(a.attorney     !== undefined ? { attorney:     a.attorney || null }      : {}),
        ...(a.chiropractor !== undefined ? { chiropractor: a.chiropractor || null }  : {}),
      };
    }

    if (Object.keys(caseData).length > 0) {
      await db.case.update({ where: { id: rec.id }, data: caseData });
    }
  }

  if (step === 6 && data.insurance) {
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

  if (step === 7 && data.health) {
    const h = data.health;
    await db.intakeSubmission.upsert({
      where:  { caseId: rec.id },
      create: {
        caseId:             rec.id,
        healthStatus:       h.healthStatus ?? null,
        hasMedications:     h.hasMedications ?? false,
        medications:        h.medications ?? null,
        hasAllergies:       h.hasAllergies ?? false,
        allergies:          h.allergies ?? null,
        hasPreviousInjuries: h.hasPreviousInjuries ?? false,
        previousInjuries:   h.previousInjuries ?? null,
        language:           h.preferredLanguage ?? 'es',
      },
      update: {
        healthStatus:       h.healthStatus ?? null,
        hasMedications:     h.hasMedications ?? false,
        medications:        h.medications ?? null,
        hasAllergies:       h.hasAllergies ?? false,
        allergies:          h.allergies ?? null,
        hasPreviousInjuries: h.hasPreviousInjuries ?? false,
        previousInjuries:   h.previousInjuries ?? null,
        language:           h.preferredLanguage ?? 'es',
      },
    });
  }

  if (step === 9 && data.consents) {
    const c = data.consents;
    const existing = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
    const prev = (existing?.consentsData ?? {}) as Record<string, unknown>;
    await db.case.update({
      where: { id: rec.id },
      data: {
        consentsData: {
          ...prev,
          ...(c.hipaa                !== undefined ? { hipaa: c.hipaa }                               : {}),
          ...(c.assignedParties      !== undefined ? { assignedParties: c.assignedParties }           : {}),
          ...(c.authRecords          !== undefined ? { authRecords: c.authRecords }                   : {}),
          ...(c.authVoicemail        !== undefined ? { authVoicemail: c.authVoicemail }               : {}),
          ...(c.authNotifications    !== undefined ? { authNotifications: c.authNotifications }       : {}),
          ...(c.authorizedPersons    !== undefined ? { authorizedPersons: c.authorizedPersons }       : {}),
          ...(c.treatment            !== undefined ? { treatment: c.treatment }                       : {}),
          ...(c.financial            !== undefined ? { financial: c.financial }                       : {}),
          ...(c.financialSignatureSvg !== undefined ? { financialSignatureSvg: c.financialSignatureSvg } : {}),
          ...(c.medicalHistory        !== undefined ? { medicalHistory: c.medicalHistory }             : {}),
        },
      },
    });
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
