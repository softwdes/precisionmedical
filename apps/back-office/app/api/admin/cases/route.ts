/**
 * B.2 — Cases CRUD API · versión completa del mockup
 *
 * POST /api/admin/cases · crear case + patient (+ opcionalmente appointment)
 *   en una sola transacción · todo lo capturado en la llamada
 *
 * Phase 1A: PHI mock-only en local. Phase 2+ con BAA Supabase = data real.
 * Auto-genera patientCode (PT-XXXX) y caseCode (MVA-XXXX).
 *
 * Status flow:
 *  - Sin appointment      → status NEW_REFERRAL  (flujo asíncrono · agendar después)
 *  - Con appointment      → status CONFIRMED      (todo en una llamada · happy path)
 *  - formDelivery=SEND_NOW → marca intakeFormSentAt + audit log de envío mock
 *
 * Action "pause" guarda parcial sin requerir todos los campos (los flexibles).
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
  // Legal (extendido del mockup)
  legal: z.object({
    lawyerStatus: z.enum(['HAS', 'SEEKING', 'DECLINED']).default('HAS'),
    lawFirmId: z.string().nullable().optional(),
    attorneyId: z.string().nullable().optional(),
    caseManagerName: z.string().max(120).nullable().optional(),
    caseManagerEmail: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
    firmPhone: z.string().max(30).nullable().optional(),
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

  // ─── Appointment (opcional · si se agenda en la llamada) ────────────
  appointment: z.object({
    clinicId: z.string().min(1),
    providerId: z.string().min(1),
    scheduledFor: z.string().datetime(),
    durationMinutes: z.number().int().min(15).max(240).default(45),
    type: z.enum(['AUTO_ACCIDENT', 'FAMILY_PRACTICE', 'URGENT_CARE', 'FOLLOW_UP']).default('AUTO_ACCIDENT'),
  }).nullable().optional(),

  // ─── Form delivery (opcional · si se elige durante la llamada) ──────
  formDelivery: z.enum(['SEND_NOW', 'TABLET_AT_CLINIC']).nullable().optional(),

  // ─── Métrica de la llamada ──────────────────────────────────────────
  callDurationSeconds: z.number().int().min(0).max(7200).optional(),
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

  // ─── Validaciones cruzadas ──────────────────────────────────────────
  if (parsed.appointment) {
    const [clinic, provider] = await Promise.all([
      db.clinic.findUnique({ where: { id: parsed.appointment.clinicId }, select: { id: true, name: true } }),
      db.provider.findUnique({
        where: { id: parsed.appointment.providerId },
        select: { id: true, firstName: true, lastName: true, specialty: true, status: true },
      }),
    ]);
    if (!clinic) return NextResponse.json({ error: 'CLINIC_NOT_FOUND' }, { status: 404 });
    if (!provider || provider.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'PROVIDER_NOT_FOUND_OR_INACTIVE' }, { status: 404 });
    }
    const scheduledForDate = new Date(parsed.appointment.scheduledFor);
    if (scheduledForDate.getTime() < Date.now()) {
      return NextResponse.json({ error: 'INVALID_DATE', message: 'La fecha/hora debe ser futura.' }, { status: 400 });
    }
  }

  // Generate codes
  const patientCode = await generateNextCode('PT');
  const caseCode = await generateNextCode(parsed.caseType === 'MVA' ? 'MVA' : 'CASE');

  // ─── Determinar status inicial ──────────────────────────────────────
  // Si agendamos cita en la llamada → CONFIRMED (todo listo)
  // Si NO agendamos                → NEW_REFERRAL (flujo asíncrono)
  const initialStatus = parsed.appointment ? 'CONFIRMED' : 'NEW_REFERRAL';
  const now = new Date();

  // ─── Transacción · Patient + Case (+ Appointment opcional) ──────────
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
        lawFirmId: parsed.legal.lawyerStatus === 'HAS' ? (parsed.legal.lawFirmId ?? null) : null,
        attorneyId: parsed.legal.lawyerStatus === 'HAS' ? (parsed.legal.attorneyId ?? null) : null,
        primaryInsuranceId: parsed.insurance.primaryInsuranceId ?? null,
        primaryPolicyNumber: parsed.insurance.primaryPolicyNumber ?? null,
        accidentDate: parsed.accident.date ? new Date(parsed.accident.date) : null,
        accidentType: parsed.accident.type,
        accidentLocation: parsed.accident.location ?? null,
        accidentNotes: parsed.accident.notes ?? null,
        status: initialStatus,
        source: parsed.source,
        // Si en la llamada se agenda cita Y se manda formulario, marca timestamps
        intakeFormSentAt: parsed.formDelivery === 'SEND_NOW' ? now : null,
        intakeFormSentVia: parsed.formDelivery === 'SEND_NOW'
          ? (parsed.patient.email ? 'EMAIL' : 'SMS')
          : null,
        firstAppointmentConfirmedAt: parsed.appointment ? now : null,
        firstAppointmentConfirmedById: parsed.appointment ? actor.actorUserId : null,
      },
    });

    // Crear appointment si fue agendado en la llamada
    let appointment = null;
    if (parsed.appointment) {
      appointment = await tx.appointment.create({
        data: {
          patientId: patient.id,
          caseId: newCase.id,
          clinicId: parsed.appointment.clinicId,
          providerId: parsed.appointment.providerId,
          scheduledFor: new Date(parsed.appointment.scheduledFor),
          durationMinutes: parsed.appointment.durationMinutes,
          type: parsed.appointment.type,
          status: 'SCHEDULED',
          notes: parsed.legal.lawyerStatus === 'SEEKING'
            ? '⚠ Paciente sin abogado · Edson debe contactar para asignar bufete antes de la cita'
            : null,
        },
      });
    }

    // Crear nota interna con el resumen de la llamada
    const callDurationLabel = parsed.callDurationSeconds
      ? `${Math.floor(parsed.callDurationSeconds / 60)}m ${parsed.callDurationSeconds % 60}s`
      : 'desconocido';

    const lawyerInfo = parsed.legal.lawyerStatus === 'HAS'
      ? `Bufete: ${parsed.legal.lawFirmId ? 'asignado' : 'sin asignar'}${parsed.legal.caseManagerName ? ` · CM: ${parsed.legal.caseManagerName}` : ''}`
      : parsed.legal.lawyerStatus === 'SEEKING'
        ? '🔍 Paciente busca abogado · Edson revisar'
        : '⚠ Sin abogado · cash o seguro propio';

    await tx.caseNote.create({
      data: {
        caseId: newCase.id,
        content: [
          `Llamada inicial · ${callDurationLabel}`,
          `Tipo de caso: ${parsed.caseType}`,
          `Referido por: ${parsed.source}`,
          lawyerInfo,
          parsed.insurance.primaryInsuranceId ? 'Seguro PIP: capturado' : 'Seguro PIP: pendiente',
          parsed.appointment
            ? `Cita agendada: ${new Date(parsed.appointment.scheduledFor).toLocaleString('es-US', { dateStyle: 'medium', timeStyle: 'short' })}`
            : 'Cita: pendiente de agendar',
          parsed.formDelivery === 'SEND_NOW'
            ? `Formulario enviado por ${parsed.patient.email ? 'email' : 'SMS'}`
            : parsed.formDelivery === 'TABLET_AT_CLINIC'
              ? 'Formulario: tablet en clínica al llegar'
              : 'Formulario: sin definir',
        ].join('\n'),
        isPrivate: true,
        authorUserId: actor.actorUserId,
        authorName: 'Front Office (llamada inicial)',
      },
    });

    return { patient, case: newCase, appointment };
  });

  // ─── Audit log principal ────────────────────────────────────────────
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
      caseType: parsed.caseType,
      lawyerStatus: parsed.legal.lawyerStatus,
      lawFirmId: parsed.legal.lawFirmId,
      caseManagerName: parsed.legal.caseManagerName ?? null,
      primaryInsuranceId: parsed.insurance.primaryInsuranceId,
      initialStatus,
      scheduledInCall: !!parsed.appointment,
      formDelivery: parsed.formDelivery ?? null,
      callDurationSeconds: parsed.callDurationSeconds ?? null,
    },
  });

  // ─── Audit log adicional: agendamiento en llamada ───────────────────
  if (result.appointment) {
    await writeAuditLog(db, {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      action: 'SCHEDULE_FIRST_APPOINTMENT',
      entityType: 'cases',
      entityId: result.case.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        caseCode: result.case.caseCode,
        appointmentId: result.appointment.id,
        scheduledFor: result.appointment.scheduledFor.toISOString(),
        viaB2: true,
      },
    });
  }

  // ─── Audit log adicional: envío de formulario ───────────────────────
  if (parsed.formDelivery === 'SEND_NOW') {
    await writeAuditLog(db, {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      action: 'SEND_PORTAL_LINK',
      entityType: 'cases',
      entityId: result.case.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        caseCode: result.case.caseCode,
        via: parsed.patient.email ? 'EMAIL' : 'SMS',
        language: parsed.patient.preferredLanguage,
        viaB2: true,
        phase: '1A_mock',
      },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      case: {
        id: result.case.id,
        caseCode: result.case.caseCode,
        status: result.case.status,
      },
      patient: {
        id: result.patient.id,
        patientCode: result.patient.patientCode,
      },
      appointment: result.appointment ? {
        id: result.appointment.id,
        scheduledFor: result.appointment.scheduledFor,
      } : null,
    },
    { status: 201 },
  );
}
