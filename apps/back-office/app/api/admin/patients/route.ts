/**
 * POST /api/admin/patients
 *
 * Crea un nuevo paciente desde la UI de Pacientes (B.4).
 * Genera un patientCode único y escribe audit log.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders, Prisma } from '@precision-medical/database';

const empty = z.literal('').transform(() => null);

const CreateSchema = z.object({
  firstName:               z.string().min(1).max(100),
  lastName:                z.string().min(1).max(100),
  email:                   z.string().email().nullable().optional().or(empty),
  phone:                   z.string().min(7).max(30).nullable().optional().or(empty),
  phone2:                  z.string().nullable().optional().or(empty),
  dateOfBirth:             z.string().nullable().optional().or(empty),
  preferredLanguage:       z.string().nullable().optional().or(empty),
  sex:                     z.enum(['MALE','FEMALE','NON_BINARY','OTHER','PREFER_NOT_TO_SAY']).nullable().optional(),
  maritalStatus:           z.enum(['SINGLE','MARRIED','DIVORCED','WIDOWED','SEPARATED','OTHER']).nullable().optional(),
  employer:                z.string().nullable().optional().or(empty),
  preferredPharmacy:       z.string().nullable().optional().or(empty),
  communicationPreference: z.enum(['PHONE','EMAIL','TEXT','ANY']).nullable().optional(),
  referralSource:          z.enum(['PHONE_CALL','WALK_IN','LAW_FIRM_REFERRAL','PATIENT_REFERRAL','WEB_FORM','AI_AGENT','OTHER']).nullable().optional(),
  addressLine1:            z.string().nullable().optional().or(empty),
  addressCity:             z.string().nullable().optional().or(empty),
  addressState:            z.string().nullable().optional().or(empty),
  addressZip:              z.string().nullable().optional().or(empty),
  emergencyContactName:    z.string().nullable().optional().or(empty),
  emergencyContactPhone:   z.string().nullable().optional().or(empty),
  emergencyContactRelation:z.string().nullable().optional().or(empty),
  emergency2Name:          z.string().nullable().optional().or(empty),
  emergency2Phone:         z.string().nullable().optional().or(empty),
  emergency2Relation:      z.string().nullable().optional().or(empty),
  guardianName:            z.string().nullable().optional().or(empty),
  guardianPhone:           z.string().nullable().optional().or(empty),
  guardianRelation:        z.enum(['FATHER','MOTHER','LEGAL_GUARDIAN','OTHER']).nullable().optional(),
});

async function generatePatientCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const code = `PAT-${suffix}`;
    const exists = await db.patient.findUnique({ where: { patientCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error('No se pudo generar un código de paciente único');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }

  const d = parsed.data;
  const patientCode = await generatePatientCode();

  let patient;
  try {
    patient = await db.patient.create({
      data: {
        patientCode,
        firstName:               d.firstName,
        lastName:                d.lastName,
        status:                  'NEW',
        ...(d.email             !== undefined && { email:             d.email }),
        ...(d.phone             !== undefined && { phone:             d.phone }),
        ...(d.phone2            !== undefined && { phone2:            d.phone2 }),
        ...(d.preferredLanguage !== undefined && { preferredLanguage: d.preferredLanguage }),
        ...(d.sex               !== undefined && { sex:               d.sex }),
        ...(d.maritalStatus     !== undefined && { maritalStatus:     d.maritalStatus }),
        ...(d.employer          !== undefined && { employer:          d.employer }),
        ...(d.preferredPharmacy !== undefined && { preferredPharmacy: d.preferredPharmacy }),
        ...(d.communicationPreference !== undefined && { communicationPreference: d.communicationPreference }),
        ...(d.referralSource    !== undefined && { referralSource:    d.referralSource }),
        ...(d.addressLine1      !== undefined && { addressLine1:      d.addressLine1 }),
        ...(d.addressCity       !== undefined && { addressCity:       d.addressCity }),
        ...(d.addressState      !== undefined && { addressState:      d.addressState }),
        ...(d.addressZip        !== undefined && { addressZip:        d.addressZip }),
        ...(d.emergencyContactName     !== undefined && { emergencyContactName:     d.emergencyContactName }),
        ...(d.emergencyContactPhone    !== undefined && { emergencyContactPhone:    d.emergencyContactPhone }),
        ...(d.emergencyContactRelation !== undefined && { emergencyContactRelation: d.emergencyContactRelation }),
        ...(d.emergency2Name    !== undefined && { emergency2Name:    d.emergency2Name }),
        ...(d.emergency2Phone   !== undefined && { emergency2Phone:   d.emergency2Phone }),
        ...(d.emergency2Relation !== undefined && { emergency2Relation: d.emergency2Relation }),
        ...(d.guardianName      !== undefined && { guardianName:      d.guardianName }),
        ...(d.guardianPhone     !== undefined && { guardianPhone:     d.guardianPhone }),
        ...(d.guardianRelation  !== undefined && { guardianRelation:  d.guardianRelation }),
        ...(d.dateOfBirth ? { dateOfBirth: new Date(d.dateOfBirth) } : {}),
      },
      select: { id: true, patientCode: true, firstName: true, lastName: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: 'EMAIL_TAKEN', message: 'Este email ya está registrado en otro paciente.' },
        { status: 409 },
      );
    }
    throw e;
  }

  const actor = actorFromHeaders(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:      'CREATE_PATIENT',
    entityType:  'patients',
    entityId:    patient.id,
    metadata:    { patientCode: patient.patientCode },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true, patient }, { status: 201 });
}
