/**
 * B.2 — Cases CRUD API · versión completa del mockup
 *
 * POST /api/admin/cases · crear case + patient (+ opcionalmente appointment)
 *   en una sola transacción · todo lo capturado en la llamada
 *
 * Phase 1A: PHI mock-only en local. Phase 2+ con BAA Supabase = data real.
 *
 * Códigos:
 *  - caseCode    → consecutivo global estilo v2 (MVA-3130, CASE-3131, …).
 *                  Ver nextCaseCode(): numeración compartida entre prefijos y
 *                  protegida con advisory lock contra creaciones simultáneas.
 *  - patientCode → todavía timestamp (PT-787285ET9). PENDIENTE decidir si pasa
 *                  a consecutivo continuando la serie P-<n> de los migrados.
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
import { db, writeAuditLog, actorFromHeaders, Prisma } from '@precision-medical/database';

const InputSchema = z.object({
  // Patient
  patient: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    // Para pacientes existentes el phone puede venir vacío · se ignora en el update
    phone: z.string().max(30).default(''),
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
    chiropractor: z.string().max(120).nullable().optional(),
  }),
  // Insurance
  insurance: z.object({
    primaryInsuranceId: z.string().nullable().optional(),
    primaryPolicyNumber: z.string().max(50).nullable().optional(),
  }),
  // Workflow
  specialtyId: z.string().nullable().optional(),
  caseType: z.enum(['MVA', 'GENERAL', 'WORKERS_COMP', 'NURSING_HOME']).default('MVA'),
  source: z.enum([
    'PHONE_CALL', 'WALK_IN', 'WEB_FORM', 'AI_AGENT',
    'LAW_FIRM', 'LAW_FIRM_REFERRAL', 'PATIENT_REFERRAL',
    'WEB_SEARCH', 'ACCIDENT_CENTER', 'FACEBOOK', 'FAMILY',
    'GOOGLE', 'GOOGLE_MAPS', 'INSTAGRAM', 'WEBSITE',
    'CLINIC_STAFF', 'CHIROPRACTOR', 'REFERRAL', 'INSURANCE',
    'MEDICAL_INSURANCE', 'TIKTOK', 'OTHER',
  ]).default('WALK_IN'),

  // ─── Appointment (opcional · si se agenda en la llamada) ────────────
  appointment: z.object({
    clinicId: z.string().min(1),
    providerId: z.string().min(1),
    scheduledFor: z.string().datetime(),
    durationMinutes: z.number().int().min(15).max(240).default(45),
    type: z.enum(['AUTO_ACCIDENT', 'FAMILY_PRACTICE', 'URGENT_CARE', 'FOLLOW_UP']).default('AUTO_ACCIDENT'),
    notes: z.string().max(1000).nullable().optional(),
  }).nullable().optional(),

  // ─── Form delivery (opcional · si se elige durante la llamada) ──────
  formDelivery: z.object({
    sendEmail: z.boolean(),
    sendSms:   z.boolean(),
  }).nullable().optional(),

  // ─── Paciente existente (desde PreCallStep · evita duplicados) ─────
  existingPatientId: z.string().cuid().nullable().optional(),

  // ─── Métrica de la llamada ──────────────────────────────────────────
  callDurationSeconds: z.number().int().min(0).max(7200).optional(),
  twilioCallSid: z.string().nullable().optional(),

  // ─── Consentimientos (wizard desde paciente) ─────────────────────────
  consents: z.object({
    hipaa:           z.boolean(),
    assignedParties: z.boolean(),
    assignedPartiesOpts: z.object({
      check1: z.boolean(),
      check2: z.boolean(),
      check3: z.boolean(),
    }).optional(),
    treatment:        z.boolean(),
    financial:        z.boolean(),
    medicalHistory:   z.boolean(),
    signatureDataUrl: z.string().nullable().optional(),
    lawFirm:          z.string().nullable().optional(),
    chiropractor:     z.string().nullable().optional(),
  }).optional(),
});

async function generateNextCode(prefix: string): Promise<string> {
  // Phase 1A: timestamp-based. Phase 2 con DB sequence proper.
  const ts = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${ts}${random}`;
}

/**
 * Código de caso consecutivo, como en v2: MVA-3130, CASE-3131, MVA-3132, …
 *
 * El número es GLOBAL, compartido entre prefijos. Así lo hacía v2 — MVA-2865
 * cae dentro del rango de CASE-1..3129 — y evita que existan dos casos con el
 * mismo número y distinto prefijo, que en soporte telefónico es un problema.
 *
 * Solo considera códigos de hasta 6 dígitos: los códigos viejos con timestamp
 * (`CASE-787285RX`) pueden salir con la parte aleatoria en dígitos, y uno de
 * 9 cifras envenenaría la secuencia para siempre.
 *
 * OJO — llamar SIEMPRE dentro de la transacción que ya tomó el advisory lock.
 * Sin el lock, dos creaciones simultáneas leen el mismo máximo, arman el mismo
 * código y una revienta contra el @unique de `caseCode`.
 */
async function nextCaseCode(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
  const rows = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT MAX(split_part("caseCode", '-', 2)::int) AS max_num
      FROM cases
     WHERE "caseCode" ~ '^[A-Z]+-[0-9]{1,6}$'
  `;
  return `${prefix}-${(rows[0]?.max_num ?? 0) + 1}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const key = issue.path.join('.');
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      const LABELS: Record<string, string> = {
        'patient.firstName':    'Nombre',
        'patient.lastName':     'Apellido',
        'patient.email':        'Email',
        'patient.phone':        'Teléfono',
        'patient.dateOfBirth':  'Fecha de nacimiento',
        'accident.date':        'Fecha del accidente',
        'source':               'Fuente de referido',
        'caseType':             'Tipo de caso',
      };
      const msgs = Object.entries(fieldErrors)
        .filter(([, errs]) => errs.length)
        .map(([path, errs]) => `${LABELS[path] ?? path}: ${errs[0]}`);
      return NextResponse.json(
        { error: 'INVALID_PAYLOAD', message: msgs.join(' · ') || 'Verifica los campos requeridos.', details: { fieldErrors } },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'INVALID_PAYLOAD', message: String(err) }, { status: 400 });
  }

  // ─── Paciente nuevo requiere teléfono válido ────────────────────────
  if (!parsed.existingPatientId && parsed.patient.phone.replace(/\D/g, '').length < 7) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', message: 'El teléfono es requerido para pacientes nuevos.' },
      { status: 400 },
    );
  }

  // ─── Validaciones de unicidad (solo pacientes nuevos) ───────────────
  if (!parsed.existingPatientId) {
    const checks = await Promise.all([
      // Email único
      parsed.patient.email
        ? db.patient.findUnique({ where: { email: parsed.patient.email }, select: { id: true, firstName: true, lastName: true } })
        : null,
      // Duplicado: mismo nombre + teléfono
      db.patient.findFirst({
        where: {
          firstName: { equals: parsed.patient.firstName, mode: 'insensitive' },
          lastName:  { equals: parsed.patient.lastName,  mode: 'insensitive' },
          phone:     parsed.patient.phone,
        },
        select: { id: true, patientCode: true, firstName: true, lastName: true },
      }),
    ]);

    const emailOwner    = checks[0];
    const duplicatePatient = checks[1];

    if (emailOwner) {
      return NextResponse.json({
        error: 'EMAIL_TAKEN',
        message: `Este email ya pertenece a ${emailOwner.firstName} ${emailOwner.lastName}.`,
        existingPatientId: emailOwner.id,
      }, { status: 409 });
    }

    if (duplicatePatient) {
      return NextResponse.json({
        error: 'DUPLICATE_PATIENT',
        message: `Ya existe un paciente con ese nombre y teléfono: ${duplicatePatient.firstName} ${duplicatePatient.lastName} (${duplicatePatient.patientCode}).`,
        existingPatientId: duplicatePatient.id,
        existingPatientCode: duplicatePatient.patientCode,
      }, { status: 409 });
    }
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

    // ─── Verificar conflicto de horario (P1) ────────────────────────────
    const apptEnd     = new Date(scheduledForDate.getTime() + parsed.appointment.durationMinutes * 60 * 1000);
    const bufferStart = new Date(scheduledForDate.getTime() - 240 * 60 * 1000);

    const conflict = await db.appointment.findFirst({
      where: {
        providerId: parsed.appointment.providerId,
        status:     { not: 'CANCELLED' },
        scheduledFor: { gte: bufferStart, lt: apptEnd },
      },
      select: {
        id: true, scheduledFor: true, durationMinutes: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    });

    if (conflict) {
      const conflictEnd = new Date(conflict.scheduledFor.getTime() + conflict.durationMinutes * 60 * 1000);
      if (conflict.scheduledFor < apptEnd && conflictEnd > scheduledForDate) {
        const conflictTime = conflict.scheduledFor.toLocaleTimeString('es-US', {
          hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
        });
        return NextResponse.json(
          {
            error:   'SLOT_CONFLICT',
            message: `El doctor ya tiene una cita a las ${conflictTime} con ${conflict.patient.firstName} ${conflict.patient.lastName}. Selecciona otro horario.`,
          },
          { status: 409 },
        );
      }
    }
  }

  // ─── Resolver nombres para pre-llenar consentsData del wizard ──────────
  const [lawFirmRecord, attorneyRecord, insuranceRecord] = await Promise.all([
    parsed.legal.lawFirmId
      ? db.lawyer.findUnique({ where: { id: parsed.legal.lawFirmId }, select: { firmName: true } })
      : null,
    parsed.legal.attorneyId
      ? db.lawyer.findUnique({ where: { id: parsed.legal.attorneyId }, select: { firstName: true, lastName: true } })
      : null,
    parsed.insurance.primaryInsuranceId
      ? db.insuranceCarrier.findUnique({ where: { id: parsed.insurance.primaryInsuranceId }, select: { name: true, shortCode: true, color: true } })
      : null,
  ]);

  // Generate codes
  // patientCode sigue con el esquema viejo (timestamp) — pendiente decidir si
  // tambien pasa a consecutivo, ver nota en el header del archivo.
  const patientCode = await generateNextCode('PT');
  const casePrefix  = parsed.caseType === 'MVA' ? 'MVA' : 'CASE';

  // ─── Determinar status inicial ──────────────────────────────────────
  // Si agendamos cita en la llamada → CONFIRMED (todo listo)
  // Si NO agendamos                → NEW_REFERRAL (flujo asíncrono)
  const initialStatus = parsed.appointment ? 'CONFIRMED' : 'NEW_REFERRAL';
  const now = new Date();

  // ─── Transacción · Patient + Case (+ Appointment opcional) ──────────
  const result = await db.$transaction(async (tx) => {
    // El código de caso es consecutivo, así que "leer el máximo y sumar 1" es
    // una carrera: dos requests simultáneas leerían el mismo número. Este lock
    // serializa solo esa parte y se libera al cerrar la transacción.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pm:case_code'))`;
    const caseCode = await nextCaseCode(tx, casePrefix);

    // Paciente conocido → solo actualizar campos del accidente/caso · nunca tocar
    //                     demografía (nombre, teléfono) para evitar corrupción
    // Paciente nuevo    → crear con código generado
    const patient = parsed.existingPatientId
      ? await tx.patient.update({
          where: { id: parsed.existingPatientId },
          data: {
            ...(parsed.accident.date && { accidentDate: new Date(parsed.accident.date) }),
            accidentType: parsed.accident.type,
            ...(parsed.legal.lawFirmId && { lawyerReferrerId: parsed.legal.lawFirmId }),
          },
        })
      : await tx.patient.create({
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
        // consentsData: pre-llenado desde la llamada (wizard lo lee al abrirse)
        // Los campos del wizard sobreescriben via PATCH al ir completando steps.
        consentsData: parsed.consents
          ? parsed.consents
          : {
              lawFirm:      lawFirmRecord?.firmName ?? null,
              attorney:     attorneyRecord
                ? `${attorneyRecord.firstName ?? ''} ${attorneyRecord.lastName ?? ''}`.trim() || null
                : null,
              chiropractor: parsed.legal.chiropractor ?? null,
              insurances: insuranceRecord
                ? [{
                    id:       `pre-${Date.now()}`,
                    insType:  'AUTO',
                    carrier:  insuranceRecord.name,
                    policyId: parsed.insurance.primaryPolicyNumber ?? '',
                    holderName: '', groupNum: '', holderDOB: '', holderRelation: '',
                    effectiveDate: '', copay: '', deductible: '',
                    lossDate: '', pipAvailable: 'N/A', claimNum: '',
                    adjusterName: '', adjusterPhone: '', adjusterFax: '',
                    adjusterPhone2: '', adjusterEmail: '', comments: '',
                    fullLien: false, lienComments: '',
                  }]
                : [],
            },
        ...(parsed.consents ? {
          consentsSignedAt:    new Date(),
          consentSignaturePng: parsed.consents.signatureDataUrl ?? null,
        } : {}),
        // Si en la llamada se agenda cita Y se manda formulario, marca timestamps
        intakeFormSentAt: (parsed.formDelivery?.sendEmail || parsed.formDelivery?.sendSms) ? now : null,
        intakeFormSentVia: parsed.formDelivery?.sendEmail && parsed.formDelivery?.sendSms
          ? 'EMAIL_AND_SMS'
          : parsed.formDelivery?.sendEmail
          ? 'EMAIL'
          : parsed.formDelivery?.sendSms
          ? 'SMS'
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
          notes: [
            parsed.appointment.notes?.trim() || null,
            parsed.legal.lawyerStatus === 'SEEKING'
              ? '⚠ Paciente sin abogado · Edson debe contactar para asignar bufete antes de la cita'
              : null,
          ].filter(Boolean).join('\n') || null,
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
          parsed.formDelivery?.sendEmail && parsed.formDelivery?.sendSms
            ? 'Formulario enviado por email y SMS'
            : parsed.formDelivery?.sendEmail
            ? 'Formulario enviado por email'
            : parsed.formDelivery?.sendSms
            ? 'Formulario enviado por SMS'
            : parsed.formDelivery === null
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

  // ─── Vincular CallLog con paciente y caso ──────────────────────────
  if (parsed.twilioCallSid) {
    await db.callLog.updateMany({
      where: { twilioCallSid: parsed.twilioCallSid },
      data: { patientId: result.patient.id, caseId: result.case.id },
    }).catch((e) => console.error('[cases] callLog link failed:', e));
  }

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
      existingPatient: !!parsed.existingPatientId,
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
  if (parsed.formDelivery?.sendEmail || parsed.formDelivery?.sendSms) {
    const channels = [
      parsed.formDelivery.sendEmail ? 'EMAIL' : null,
      parsed.formDelivery.sendSms   ? 'SMS'   : null,
    ].filter(Boolean).join('+');
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
        via: channels,
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
