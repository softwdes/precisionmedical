/**
 * PATCH /api/admin/patients/[id]
 *
 * Edición completa del paciente — datos personales, clínicos, domicilio,
 * contactos de emergencia. Escribe audit log con actorType HUMAN_USER.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  db, writeAuditLog,
  resolveGuardian, GuardianIsSelfError, type GuardianResolution,
} from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
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
  referralSourceOther:       z.string().nullable().optional().or(empty),
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
  // Guardian — campos de TEXTO legado ("quedan por compatibilidad con la data",
  // dice el schema). El vínculo real es `guardian` (abajo).
  guardianName:              z.string().nullable().optional().or(empty),
  guardianPhone:             z.string().nullable().optional().or(empty),
  guardianRelation:          z.enum(['FATHER', 'MOTHER', 'LEGAL_GUARDIAN', 'OTHER']).nullable().optional(),

  // ─── Tutor legal como Paciente vinculado ────────────────────────────────
  // Mismo sub-objeto que acepta POST /api/admin/cases y misma regla
  // (packages/database/src/guardian.ts). Semántica de las tres formas:
  //   ausente → no se toca el vínculo (así se comportaba este endpoint hasta hoy)
  //   null    → se desvincula
  //   objeto  → `patientId` vincula a uno existente · nombre+apellido crea ficha
  guardian: z.object({
    patientId:   z.string().nullable().optional(),
    firstName:   z.string().max(100).default(''),
    lastName:    z.string().max(100).default(''),
    email:       z.string().email().nullable().optional().or(empty),
    phone:       z.string().max(30).default(''),
    dateOfBirth: z.string().nullable().optional(),
    relation:    z.enum(['MOTHER', 'FATHER', 'LEGAL_GUARDIAN', 'OTHER']).default('MOTHER'),
  }).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const existing = await db.patient.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body   = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }

  const d = parsed.data;

  // El correo del apoderado no puede ser el del propio paciente: el dedupe por
  // correo excluye al paciente a propósito (si no, se vincularía como su propio
  // tutor), así que sin este corte el create del apoderado reventaría contra el
  // @unique de Patient.email y saldría como un error sin explicación. Mismo
  // chequeo que en POST /api/admin/cases.
  if (d.guardian?.email && !d.guardian.patientId) {
    const correoPaciente = d.email !== undefined ? d.email : existing.email;
    if (correoPaciente && correoPaciente.toLowerCase() === d.guardian.email.toLowerCase()) {
      return NextResponse.json({
        ok: false,
        error: 'GUARDIAN_EMAIL_IS_PATIENT_EMAIL',
        message: 'El correo del apoderado no puede ser también el del paciente. '
          + 'El correo del apoderado vive en su propia ficha — dejá vacío el del menor.',
      }, { status: 400 });
    }
  }

  // El vínculo con el tutor puede tener que CREAR una ficha de paciente, así que
  // el update va en transacción: si el update del paciente falla, no queda un
  // apoderado huérfano.
  let updated;
  let guardianResult: GuardianResolution | null = null;
  try {
    updated = await db.$transaction(async (tx) => {
      // Tipo propio y no `Prisma.PatientUpdateInput`: en el input "checked" el FK
      // solo se toca via `guardianPatient: { connect | disconnect }`. Escribir el
      // escalar directo (como ya hace el alta de caso) exige el input
      // "unchecked", que Prisma infiere solo del literal final.
      const guardianData: { guardianPatientId?: string | null; guardianRelation?: string } = {};
      if (d.guardian !== undefined) {
        guardianResult = await resolveGuardian(tx, d.guardian, { forPatientId: id });
        guardianData.guardianPatientId = guardianResult.guardianPatientId;
        if (d.guardian) guardianData.guardianRelation = d.guardian.relation;
      }

      return tx.patient.update({
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
          ...(d.referralSourceOther      !== undefined && { referralSourceOther:      d.referralSourceOther }),
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
          // Después del spread legado a propósito: si llegan los dos, la relación
          // del vínculo real manda sobre el campo de texto.
          ...guardianData,
        },
        select: { id: true, patientCode: true, firstName: true, lastName: true },
      });
    });
  } catch (e) {
    if (e instanceof GuardianIsSelfError) {
      return NextResponse.json(
        { ok: false, error: 'GUARDIAN_IS_SELF', message: e.message },
        { status: 400 },
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: 'EMAIL_TAKEN', message: 'Este email ya está registrado en otro paciente.' },
        { status: 409 },
      );
    }
    throw e;
  }

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'UPDATE_PATIENT',
    entityType:  'patients',
    entityId:    id,
    metadata:    {
      patientCode: updated.patientCode,
      fields: Object.keys(parsed.data),
      // Regla #3: el vínculo con el tutor puede haber creado OTRO Patient, y esa
      // mutación tiene que quedar registrada acá.
      ...(guardianResult ? {
        guardianAction:    (guardianResult as GuardianResolution).action,
        guardianPatientId: (guardianResult as GuardianResolution).guardianPatientId,
      } : {}),
    },
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
    select: {
      id: true,
      patientCode: true,
      status: true,
      cases: { select: { id: true } },
    },
  });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  // Soft-delete en cascada: marcar paciente INACTIVE + deletedAt en todos sus casos
  const now = new Date();
  await db.$transaction([
    db.patient.update({
      where: { id },
      data: { status: 'INACTIVE' },
    }),
    // Soft-delete de casos (deletedAt ya existe en el schema de Case)
    ...(existing.cases.length > 0
      ? [db.case.updateMany({
          where: { patientId: id, deletedAt: null },
          data: { deletedAt: now },
        })]
      : []),
  ]);

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'DELETE_PATIENT',
    entityType:  'patients',
    entityId:    id,
    metadata:    { patientCode: existing.patientCode, casesArchived: existing.cases.length },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/admin/patients/[id]/restore  — se llama desde un sub-path,
 * pero aquí exponemos la lógica via un body action para evitar crear otro route file.
 *
 * En realidad creamos un endpoint separado en /restore/route.ts.
 * Este comentario es solo referencia.
 */
