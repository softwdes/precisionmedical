/**
 * PATCH /api/admin/patients/[id]
 *
 * P1-13 — Edición completa del paciente.
 * Permite actualizar datos personales, contacto de emergencia,
 * datos del accidente y seguro.
 *
 * Escribe audit log con actorType HUMAN_USER.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { Prisma } from '@precision-medical/database';

const empty = z.literal('').transform(() => null);

const PatchSchema = z.object({
  firstName:             z.string().min(1).max(100),
  lastName:              z.string().min(1).max(100),
  email:                 z.string().email().nullable().optional().or(empty),
  phone:                 z.string().min(7).max(30).nullable().optional().or(empty),
  dateOfBirth:           z.string().nullable().optional().or(empty),
  status:                z.enum(['NEW', 'ACTIVE', 'COMPLETED', 'DISCHARGED', 'INACTIVE']).optional(),
  preferredLanguage:     z.string().nullable().optional().or(empty),
  emergencyContactName:  z.string().nullable().optional().or(empty),
  emergencyContactPhone: z.string().nullable().optional().or(empty),
  accidentDate:          z.string().nullable().optional().or(empty),
  accidentType:          z.enum(['AUTO', 'MOTORCYCLE', 'PEDESTRIAN', 'WORKPLACE', 'OTHER']).nullable().optional(),
  insuranceCarrier:      z.string().nullable().optional().or(empty),
  policyNumber:          z.string().nullable().optional().or(empty),
  guardianName:          z.string().nullable().optional().or(empty),
  guardianPhone:         z.string().nullable().optional().or(empty),
  guardianRelation:      z.enum(['FATHER', 'MOTHER', 'LEGAL_GUARDIAN', 'OTHER']).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const existing = await db.patient.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }

  const {
    firstName, lastName, email, phone,
    dateOfBirth, status, preferredLanguage,
    emergencyContactName, emergencyContactPhone,
    accidentDate, accidentType, insuranceCarrier, policyNumber,
    guardianName, guardianPhone, guardianRelation,
  } = parsed.data;

  let updated;
  try {
  updated = await db.patient.update({
    where: { id },
    data: {
      firstName,
      lastName,
      ...(email      !== undefined ? { email }      : {}),
      ...(phone      !== undefined ? { phone }      : {}),
      ...(status     !== undefined ? { status }     : {}),
      ...(preferredLanguage     !== undefined ? { preferredLanguage }     : {}),
      ...(emergencyContactName  !== undefined ? { emergencyContactName }  : {}),
      ...(emergencyContactPhone !== undefined ? { emergencyContactPhone } : {}),
      ...(insuranceCarrier      !== undefined ? { insuranceCarrier }      : {}),
      ...(policyNumber          !== undefined ? { policyNumber }          : {}),
      ...(accidentType          !== undefined ? { accidentType }          : {}),
      ...(guardianName          !== undefined ? { guardianName }          : {}),
      ...(guardianPhone         !== undefined ? { guardianPhone }         : {}),
      ...(guardianRelation      !== undefined ? { guardianRelation }      : {}),
      ...(dateOfBirth  !== undefined ? { dateOfBirth:  dateOfBirth  ? new Date(dateOfBirth)  : null } : {}),
      ...(accidentDate !== undefined ? { accidentDate: accidentDate ? new Date(accidentDate) : null } : {}),
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
    actorType:  actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:     'UPDATE_PATIENT',
    entityType: 'patients',
    entityId:   id,
    metadata:   { patientCode: updated.patientCode, fields: Object.keys(parsed.data) },
    ipAddress:  req.headers.get('x-forwarded-for') ?? undefined,
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

  // Soft delete — no borrar si tiene casos activos
  if (existing._count.cases > 0) {
    return NextResponse.json(
      { ok: false, error: 'HAS_CASES', message: 'No se puede eliminar un paciente con casos asociados.' },
      { status: 409 },
    );
  }

  await db.patient.update({
    where: { id },
    data: { deletedAt: new Date() },
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
