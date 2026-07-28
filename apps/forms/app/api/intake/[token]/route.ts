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
import { decryptFieldOrOriginal } from '@/lib/decrypt';

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
      id: true, caseCode: true, status: true, caseType: true,
      accidentDate: true, accidentType: true,
      accidentNotes: true, accidentLocation: true,
      primaryPolicyNumber: true,
      intakeFormCompletedAt: true,
      consentsData: true,
      patient: {
        select: {
          id: true, firstName: true, lastName: true,
          dateOfBirth: true,
          phone: true, phone2: true, email: true,
          addressLine1: true, addressCity: true, addressState: true, addressZip: true,
          referralSource: true, communicationPreference: true,
          preferredPharmacy: true, employer: true,
          race: true, ethnicity: true, sex: true, maritalStatus: true,
          emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
          emergency2Name: true, emergency2Phone: true, emergency2Relation: true,
          guardianName: true, guardianPhone: true, guardianRelation: true,
          insuranceCarrier: true, policyNumber: true,
        },
      },
      intakeSubmission: {
        select: {
          healthStatus: true, hasMedications: true, medications: true,
          hasAllergies: true, allergies: true,
          hasPreviousInjuries: true, previousInjuries: true,
        },
      },
      lienSignatures: {
        where: { signerType: 'PATIENT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { signatureSvg: true, signerName: true, signerEmail: true },
      },
    },
  });

  if (!rec) {
    return NextResponse.json({ error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  const cd = (rec.consentsData ?? {}) as Record<string, unknown>;
  const lienSig = rec.lienSignatures[0] ?? null;

  return NextResponse.json({
    caseId:    rec.id,
    caseCode:  rec.caseCode,
    status:    rec.status,
    completed: !!rec.intakeFormCompletedAt,
    patient: {
      id:                       rec.patient.id,
      firstName:                rec.patient.firstName,
      lastName:                 rec.patient.lastName,
      dob:                      rec.patient.dateOfBirth?.toISOString() ?? null,
      phone:                    decryptFieldOrOriginal(rec.patient.phone),
      cellPhone:                rec.patient.phone2 ?? null,
      email:                    rec.patient.email,
      addressLine1:             rec.patient.addressLine1 ?? null,
      addressCity:              decryptFieldOrOriginal(rec.patient.addressCity),
      addressState:             decryptFieldOrOriginal(rec.patient.addressState),
      addressZip:               decryptFieldOrOriginal(rec.patient.addressZip),
      referralSource:           rec.patient.referralSource ?? null,
      communicationPreference:  rec.patient.communicationPreference ?? null,
      preferredPharmacy:        decryptFieldOrOriginal(rec.patient.preferredPharmacy),
      employer:                 decryptFieldOrOriginal(rec.patient.employer),
      race:                     rec.patient.race ?? null,
      ethnicity:                rec.patient.ethnicity ?? null,
      sex:                      rec.patient.sex ?? null,
      maritalStatus:            rec.patient.maritalStatus ?? null,
      emergencyContactName:     decryptFieldOrOriginal(rec.patient.emergencyContactName),
      emergencyContactPhone:    decryptFieldOrOriginal(rec.patient.emergencyContactPhone),
      emergencyContactRelation: decryptFieldOrOriginal(rec.patient.emergencyContactRelation),
      emergency2Name:           rec.patient.emergency2Name ?? null,
      emergency2Phone:          rec.patient.emergency2Phone ?? null,
      emergency2Relation:       decryptFieldOrOriginal(rec.patient.emergency2Relation),
      guardianName:             rec.patient.guardianName ?? null,
      guardianPhone:            rec.patient.guardianPhone ?? null,
      guardianRelation:         decryptFieldOrOriginal(rec.patient.guardianRelation),
    },
    accident: {
      date:         rec.accidentDate?.toISOString() ?? null,
      // OJO: para el wizard `accident.type` es el TIPO DE CASO (MVA | GM), no
      // el mecanismo del accidente. El POST del step 5 lo guarda en la columna
      // `caseType` (GM → GENERAL), asi que hay que leerlo de ahi. Antes se leia
      // de `accidentType` — otra columna, que guarda AUTO/FALL/etc — y por eso
      // un caso GM se reabria siempre como MVA y arrastraba el lien.
      type:         rec.caseType === 'GENERAL' ? 'GM' : 'MVA',
      // Mecanismo real del accidente, por si se necesita mas adelante.
      mechanism:    rec.accidentType,
      location:     rec.accidentLocation,
      notes:        rec.accidentNotes,
      lawFirm:      (cd.lawFirm as string) ?? null,
      attorney:     (cd.attorney as string) ?? null,
      chiropractor: (cd.chiropractor as string) ?? null,
    },
    insurance: {
      carrier:      rec.patient.insuranceCarrier,
      policyNumber: rec.primaryPolicyNumber ?? rec.patient.policyNumber,
    },
    insurances:   Array.isArray(cd.insurances) ? cd.insurances : [],
    health:       rec.intakeSubmission ?? null,
    consents: {
      hipaa:                  cd.hipaa ?? null,
      assignedParties:        cd.assignedParties ?? null,
      authRecords:            cd.authRecords ?? null,
      financialSignatureSvg:  (cd.financialSignatureSvg as string) ?? null,
      authVoicemail:     cd.authVoicemail ?? null,
      authNotifications: cd.authNotifications ?? null,
      treatment:         cd.treatment ?? null,
      financial:         cd.financial ?? null,
      medicalHistory:    cd.medicalHistory ?? null,
      authorizedPersons: Array.isArray(cd.authorizedPersons) ? cd.authorizedPersons : [],
    },
    saved: {
      referredBy:        (cd.referredBy as string) ?? null,
      guardianLastName:  (cd.guardianLastName as string) ?? null,
      guardianEmail:     (cd.guardianEmail as string) ?? null,
      guardianDOB:       (cd.guardianDOB as string) ?? null,
      guardianCellPhone: (cd.guardianCellPhone as string) ?? null,
      guardianAddress:   (cd.guardianAddress as string) ?? null,
    },
    lienSignature: lienSig ? {
      signatureSvg: lienSig.signatureSvg ?? null,
      signerName:   lienSig.signerName,
      signerEmail:  lienSig.signerEmail ?? null,
    } : null,
    photos: (cd.photos ?? null) as {
      selfie?: string; insuranceCardFront?: string;
      insuranceCardBack?: string; dlFront?: string;
    } | null,
  });
}

// ─── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;

  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true, caseCode: true,
      patient: { select: { id: true, email: true } },
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
        date?: string; type?: string; notes?: string;
        lawFirm?: string; attorney?: string; chiropractor?: string;
      };
      insurances?: object[];
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

  try {

  if (step === 2 && data.personal) {
    const p = data.personal;
    const patientData: Record<string, unknown> = {};
    if (p.firstName)              patientData.firstName                  = p.firstName;
    if (p.lastName)               patientData.lastName                   = p.lastName;
    if (p.phone)                  patientData.phone                      = p.phone;
    if (p.cellPhone !== undefined) patientData.phone2                    = p.cellPhone || null;
    // Solo actualiza email si realmente cambió (evita conflicto unique en mismo paciente)
    if (p.email !== undefined && p.email !== rec.patient.email) patientData.email = p.email || null;
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
    if (a.preferredPharmacy !== undefined) patientData.preferredPharmacy = a.preferredPharmacy || null;
    if (a.employer !== undefined) patientData.employer = a.employer || null;
    if (a.race) patientData.race = a.race;
    if (a.ethnicity) patientData.ethnicity = a.ethnicity;
    if (a.sex) patientData.sex = a.sex;
    if (a.maritalStatus) patientData.maritalStatus = a.maritalStatus;
    if (Object.keys(patientData).length > 0) {
      await db.patient.update({ where: { id: rec.patient.id }, data: patientData });
    }
    if (a.referredBy !== undefined) {
      const existingCase = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
      const prev = (existingCase?.consentsData ?? {}) as Record<string, unknown>;
      await db.case.update({ where: { id: rec.id }, data: { consentsData: { ...prev, referredBy: a.referredBy || null } } });
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
    // 'MVA' → caseType=MVA, 'GM' → caseType=GENERAL (CaseTypeWorkflow enum)
    if (a.type)     caseData.caseType         = a.type === 'GM' ? 'GENERAL' : 'MVA';
    if (a.date)     caseData.accidentDate     = parseDateLocal(a.date);
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

  if (step === 6 && data.insurances !== undefined) {
    const existingCase = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
    const prev = (existingCase?.consentsData ?? {}) as Record<string, unknown>;
    await db.case.update({ where: { id: rec.id }, data: { consentsData: { ...prev, insurances: data.insurances as object[] } } });
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

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[intake PATCH] step=${step} error:`, msg);
    // Unique constraint (P2002) — email/phone duplicado
    if (msg.includes('P2002') || msg.includes('Unique constraint')) {
      const field = msg.includes('email') ? 'correo electrónico' : msg.includes('phone') ? 'teléfono' : 'campo';
      return NextResponse.json(
        { error: 'DUPLICATE_FIELD', detail: `El ${field} ingresado ya está registrado en otro paciente. Por favor usa uno diferente.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'SAVE_FAILED', detail: msg }, { status: 500 });
  }
}
