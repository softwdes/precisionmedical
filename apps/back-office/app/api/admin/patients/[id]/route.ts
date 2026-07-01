/**
 * PATCH /api/admin/patients/[id]
 *
 * Edición completa del paciente — datos personales, clínicos, domicilio,
 * contactos de emergencia. Escribe audit log con actorType HUMAN_USER.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { Prisma } from '@precision-medical/database';

const empty = z.literal('').transform(() => null);

const PatchSchema = z.object({
  // Personal
  firstName:                 z.string().min(1).max(100),
  lastName:                  z.string().min(1).max(100),
  email:                     z.string().email().nullable().optional().or(empty),
  phone:                     z.string().min(7).max(30).nullable().optional().or(empty),
  phone2:                    z.string().nullable().optional().or(empty),
  dateOfBirth:               z.string().nullable().optional().or(empty),
  status:                    z.enum(['NEW', 'ACTIVE', 'COMPLETED', 'DISCHARGED', 'INACTIVE']).optional(),
  preferredLanguage:         z.string().nullable().optional().or(empty),
  sex:                       z.enum(['MALE','FEMALE','NON_BINARY','OTHER','PREFER_NOT_TO_SAY']).nullable().optional(),
  maritalStatus:             z.enum(['SINGLE','MARRIED','DIVORCED','WIDOWED','SEPARATED','OTHER']).nullable().optional(),
  // Clinical
  employer:                  z.string().nullable().optional().or(empty),
  preferredPharmacy:         z.string().nullable().optional().or(empty),
  communicationPreference:   z.enum(['PHONE','EMAIL','TEXT','ANY']).nullable().optional(),
  referralSource:            z.enum(['PHONE_CALL','WALK_IN','LAW_FIRM','LAW_FIRM_REFERRAL','PATIENT_REFERRAL','WEB_FORM','WEB_SEARCH','AI_AGENT','ACCIDENT_CENTER','FACEBOOK','FAMILY','GOOGLE','GOOGLE_MAPS','INSTAGRAM','WEBSITE','CLINIC_STAFF','CHIROPRACTOR','REFERRAL','INSURANCE','MEDICAL_INSURANCE','TIKTOK','OTHER']).nullable().optional(),
  race:                      z.enum(['AFRICAN_AMERICAN','AMERICAN_INDIAN_ALASKA_NATIVE','ASIAN','NATIVE_HAWAIIAN','PACIFIC_ISLANDER','WHITE','OTHER','PREFER_NOT_TO_SAY']).nullable().optional(),
  ethnicity:                 z.enum(['HISPANIC_LATINO','NOT_HISPANIC_LATINO','PREFER_NOT_TO_SAY']).nullable().optional(),
  socialSecurityNumber:      z.string().nullable().optional().or(empty),
  // Address
  addressLine1:              z.string().nullable().optional().or(empty),
  addressCity:               z.string().nullable().optional().or(empty),
  addressState:              z.string().nullable().optional().or(empty),
  addressZip:                z.string().nullable().optional().or(empty),
  // Emergency contacts
  emergencyContactName:      z.string().nullable().optional().or(empty),
  emergencyContactPhone:     z.string().nullable().optional().or(empty),
  emergencyContactRelation:  z.string().nullable().optional().or(empty),
  emergency2Name:            z.string().nullable().optional().or(empty),
  emergency2Phone:           z.string().nullable().optional().or(empty),
  emergency2Relation:        z.string().nullable().optional().or(empty),
  // Guardian
  guardianName:              z.string().nullable().optional().or(empty),
  guardianPhone:             z.string().nullable().optional().or(empty),
  guardianRelation:          z.enum(['FATHER', 'MOTHER', 'LEGAL_GUARDIAN', 'OTHER']).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const existing = await db.patient.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body   = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }

  const d = parsed.data;

  let updated;
  try {
    updated = await db.patient.update({
      where: { id },
      data: {
        firstName: d.firstName,
        lastName:  d.lastName,
        ...(d.email                    !== undefined && { email:                    d.email }),
        ...(d.phone                    !== undefined && { phone:                    d.phone }),
        ...(d.phone2                   !== undefined && { phone2:                   d.phone2 }),
        ...(d.status                   !== undefined && { status:                   d.status }),
        ...(d.preferredLanguage        !== undefined && { preferredLanguage:        d.preferredLanguage }),
        ...(d.sex                      !== undefined && { sex:                      d.sex }),
        ...(d.maritalStatus            !== undefined && { maritalStatus:            d.maritalStatus }),
        ...(d.employer                 !== undefined && { employer:                 d.employer }),
        ...(d.preferredPharmacy        !== undefined && { preferredPharmacy:        d.preferredPharmacy }),
        ...(d.communicationPreference  !== undefined && { communicationPreference:  d.communicationPreference }),
        ...(d.referralSource           !== undefined && { referralSource:           d.referralSource }),
        ...(d.race                     !== undefined && { race:                     d.race }),
        ...(d.ethnicity                !== undefined && { ethnicity:                d.ethnicity }),
        ...(d.socialSecurityNumber     !== undefined && { socialSecurityNumber:     d.socialSecurityNumber }),
        ...(d.addressLine1             !== undefined && { addressLine1:             d.addressLine1 }),
        ...(d.addressCity              !== undefined && { addressCity:              d.addressCity }),
        ...(d.addressState             !== undefined && { addressState:             d.addressState }),
        ...(d.addressZip               !== undefined && { addressZip:               d.addressZip }),
        ...(d.emergencyContactName     !== undefined && { emergencyContactName:     d.emergencyContactName }),
        ...(d.emergencyContactPhone    !== undefined && { emergencyContactPhone:    d.emergencyContactPhone }),
        ...(d.emergencyContactRelation !== undefined && { emergencyContactRelation: d.emergencyContactRelation }),
        ...(d.emergency2Name           !== undefined && { emergency2Name:           d.emergency2Name }),
        ...(d.emergency2Phone          !== undefined && { emergency2Phone:          d.emergency2Phone }),
        ...(d.emergency2Relation       !== undefined && { emergency2Relation:       d.emergency2Relation }),
        ...(d.guardianName             !== undefined && { guardianName:             d.guardianName }),
        ...(d.guardianPhone            !== undefined && { guardianPhone:            d.guardianPhone }),
        ...(d.guardianRelation         !== undefined && { guardianRelation:         d.guardianRelation }),
        ...(d.dateOfBirth !== undefined ? { dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null } : {}),
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
    action:      'UPDATE_PATIENT',
    entityType:  'patients',
    entityId:    id,
    metadata:    { patientCode: updated.patientCode, fields: Object.keys(parsed.data) },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true, patient: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const existing = await db.patient.findUnique({
    where: { id },
    select: { id: true, patientCode: true, _count: { select: { cases: true } } },
  });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (existing._count.cases > 0) {
    return NextResponse.json(
      { ok: false, error: 'HAS_CASES', message: 'No se puede eliminar un paciente con casos asociados.' },
      { status: 409 },
    );
  }

  await db.patient.update({
    where: { id },
    data: { status: 'INACTIVE' },
  });

  const actor = actorFromHeaders(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:      'DELETE_PATIENT',
    entityType:  'patients',
    entityId:    id,
    metadata:    { patientCode: existing.patientCode },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
