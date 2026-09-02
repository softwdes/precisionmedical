/**
 * B.2 — Cases CRUD API · versión completa del mockup
 *
 * POST /api/admin/cases · crear case + patient (+ opcionalmente appointment)
 *   en una sola transacción · todo lo capturado en la llamada
 *
 * Phase 1A: PHI mock-only en local. Phase 2+ con BAA Supabase = data real.
 *
 * Códigos: ambos consecutivos, estilo v2 — caseCode (MVA-3130 / CASE-3131) y
 * patientCode (P-6993). Se generan con nextCaseCode/nextPatientCode dentro de
 * la transacción; ver packages/database/src/codes.ts.
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
import {
  db, writeAuditLog, Prisma, nextCaseCode, nextPatientCode,
  casePrefixFor, resolveGuardian, GuardianIsSelfError,
} from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import {
  construirNotaLlamadaInicial, llevaBufeteYPip, type Idioma,
} from '@/lib/nota-llamada-inicial';

/**
 * Idioma en el que se escribe la nota interna del alta.
 *
 * Sale de la cookie `locale` —la misma que lee `i18n/request.ts`— y NO de un
 * campo del payload. Es el mismo criterio que el idioma del SMS del portal:
 * resolverlo en el servidor cierra el agujero de raíz, porque los TRES diálogos
 * que postean acá (`new-case-dialog`, `quick-register-dialog`,
 * `case-wizard-dialog`) tendrían que acordarse de mandarlo, y uno nuevo que se
 * olvide reintroduce el bug sin que se note.
 *
 * El default es `en`, igual que `i18n/request.ts`: el back-office arranca en
 * inglés. La nota salía en español fijo y por eso un tester con la pantalla en
 * inglés leía el cuerpo en español.
 */
async function idiomaDelStaffDesdeLaCookie(): Promise<Idioma> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  return store.get('locale')?.value === 'es' ? 'es' : 'en';
}

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
  // Padre / apoderado — solo viene si el paciente es menor de edad.
  // `patientId` con valor → linkear a un paciente que ya existe.
  // `patientId` null      → crear un Patient nuevo (sin caso) con estos datos.
  guardian: z.object({
    patientId:   z.string().nullable().optional(),
    firstName:   z.string().max(100).default(''),
    lastName:    z.string().max(100).default(''),
    email:       z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
    phone:       z.string().max(30).default(''),
    dateOfBirth: z.string().nullable().optional(),
    relation:    z.enum(['MOTHER', 'FATHER', 'LEGAL_GUARDIAN', 'OTHER']).default('MOTHER'),
  }).nullable().optional(),
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
    // Los tres nombres unificados con el formulario en línea. `assignedPartiesOpts`
    // se sigue aceptando: es el nombre viejo de los mismos tres checkboxes.
    authRecords:       z.boolean().optional(),
    authVoicemail:     z.boolean().optional(),
    authNotifications: z.boolean().optional(),
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
    /**
     * Personas autorizadas a recibir información médica (la liberación HIPAA).
     *
     * Faltaba acá, y como Zod BORRA en silencio las claves que no declara, el
     * wizard las mandaba y se perdían sin un error ni un log. Mismo nombre que
     * usa el formulario en línea, que ya las guarda en `consentsData`.
     */
    authorizedPersons: z.array(z.object({
      name:     z.string().trim().min(1).max(120),
      relation: z.string().trim().max(120),
    })).max(10).optional(),
  }).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  // Se resuelve acá y no dentro de la transacción: `cookies()` no tiene nada que
  // ver con la DB y no hay razón para tenerlo adentro del lock.
  const idiomaDelStaff = await idiomaDelStaffDesdeLaCookie();

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

  // El teléfono NO es obligatorio (decisión de negocio 2026-07-29). Antes acá
  // había un bloqueo que exigía >=7 dígitos para pacientes nuevos, y como el
  // cliente nunca lo validaba, recepción completaba los 4 pasos del wizard y
  // recién al apretar "Save case" se enteraba de que faltaba un dato del paso 1.
  //
  // Un caso puede quedar sin email ni teléfono: en ese escenario el formulario
  // no se puede enviar y la vía es la tablet en clínica. El UI lo refleja
  // apagando los canales que no se pueden usar, sin impedir el guardado.

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

  // ─── El correo del apoderado no puede ser el del propio menor ───────
  // Solo aplica cuando hay que CREAR/reutilizar la ficha del apoderado: si vino
  // `patientId` ya está elegido y no se toca ningún correo.
  //
  // Antes esto no se podía dar porque el dedupe por correo encontraba al propio
  // menor y lo vinculaba como su propio tutor — silencioso y peor. Ahora que el
  // dedupe lo excluye, el intento de crear al apoderado con un correo que el
  // menor ya tiene reventaría contra el @unique de Patient.email en medio de la
  // transacción, y eso sale como un 500 sin explicación. Se corta acá con un
  // mensaje que dice qué hacer.
  if (parsed.guardian?.email && !parsed.guardian.patientId) {
    const correoApoderado = parsed.guardian.email.toLowerCase();
    const correoMenor = parsed.existingPatientId
      ? (await db.patient.findUnique({
          where:  { id: parsed.existingPatientId },
          select: { email: true },
        }))?.email ?? null
      : parsed.patient.email ?? null;
    if (correoMenor && correoMenor.toLowerCase() === correoApoderado) {
      return NextResponse.json({
        error: 'GUARDIAN_EMAIL_IS_PATIENT_EMAIL',
        message: 'El correo del apoderado no puede ser también el del paciente. '
          + 'El correo del apoderado vive en su propia ficha — dejá vacío el del menor.',
      }, { status: 400 });
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
  const [lawFirmRecord, attorneyRecord] = await Promise.all([
    parsed.legal.lawFirmId
      ? db.lawyer.findUnique({ where: { id: parsed.legal.lawFirmId }, select: { firmName: true } })
      : null,
    parsed.legal.attorneyId
      ? db.lawyer.findUnique({ where: { id: parsed.legal.attorneyId }, select: { firstName: true, lastName: true } })
      : null,
  ]);

  // El prefijo es solo una etiqueta; los códigos se generan dentro de la
  // transacción porque el advisory lock que los protege vive con ella.
  // El mapeo tipo→prefijo vive en codes.ts — es el MISMO que usa el PATCH
  // al renombrar cuando se corrige el tipo de caso.
  const casePrefix = casePrefixFor(parsed.caseType);

  // ─── Determinar status inicial ──────────────────────────────────────
  // Si agendamos cita en la llamada → CONFIRMED (todo listo)
  // Si NO agendamos                → NEW_REFERRAL (flujo asíncrono)
  const initialStatus = parsed.appointment ? 'CONFIRMED' : 'NEW_REFERRAL';
  const now = new Date();

  // ─── Transacción · Patient + Case (+ Appointment opcional) ──────────
  const run = () => db.$transaction(async (tx) => {
    // Consecutivo; la función toma su propio advisory lock (ver codes.ts).
    const caseCode = await nextCaseCode(tx, casePrefix);

    // ─── Padre / apoderado (paciente menor de edad) ────────────────────────
    // La regla vive en packages/database/src/guardian.ts: es la misma que usan
    // el PATCH del paciente y la re-migración. Va en esta transacción para que
    // no pueda quedar un apoderado huérfano si algo falla después.
    const guardian = await resolveGuardian(tx, parsed.guardian, {
      forPatientId: parsed.existingPatientId ?? null,
    });
    const guardianPatientId = guardian.guardianPatientId;

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
            ...(guardianPatientId ? {
              guardianPatientId,
              guardianRelation: parsed.guardian?.relation ?? null,
            } : {}),
          },
        })
      : await tx.patient.create({
          data: {
            // Solo se pide el código si de verdad hay que crear al paciente.
            patientCode: await nextPatientCode(tx),
            firstName: parsed.patient.firstName,
            lastName: parsed.patient.lastName,
            email: parsed.patient.email,
            // null, no '' — un string vacío en la columna se lee como
            // "teléfono presente pero en blanco" en varias vistas
            phone: parsed.patient.phone || null,
            dateOfBirth: parsed.patient.dateOfBirth ? new Date(parsed.patient.dateOfBirth) : null,
            accidentDate: parsed.accident.date ? new Date(parsed.accident.date) : null,
            accidentType: parsed.accident.type,
            lawyerReferrerId: parsed.legal.lawFirmId ?? null,
            status: 'NEW',
            ...(guardianPatientId ? {
              guardianPatientId,
              guardianRelation: parsed.guardian?.relation ?? null,
            } : {}),
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
        createdByUserId: actor.actorUserId,
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
              // Ya NO se pre-llena una entrada AUTO acá. Copiaba
              // `primaryInsuranceId` + `primaryPolicyNumber`, que el caso ya
              // guarda en sus propias columnas, y ese duplicado es justo lo que
              // se desincronizaba. El seguro de auto vive en
              // `case_auto_insurances` y la vista cae a los datos del caso
              // mientras esa fila no exista.
              insurances: [],
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
          createdByUserId: actor.actorUserId,
          createdByName:   actor.actorName,
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
            /**
             * El aviso para Edson SOLO en casos que llevan bufete.
             *
             * Antes bastaba `lawyerStatus === 'SEEKING'`, y como el diálogo no
             * limpia ese estado al cambiar de MVA a GENERAL, la cita de un caso
             * general terminaba con la instrucción "asignar bufete antes de la
             * cita" — una tarea que no existe, asignada a una persona. Ya había
             * pasado en 8 citas de casos GENERAL. El predicado es compartido con
             * la nota interna (`llevaBufeteYPip`) para que no se arregle uno y
             * quede el otro.
             */
            llevaBufeteYPip(parsed.caseType) && parsed.legal.lawyerStatus === 'SEEKING'
              ? '⚠ Paciente sin abogado · Edson debe contactar para asignar bufete antes de la cita'
              : null,
          ].filter(Boolean).join('\n') || null,
        },
      });
    }

    /**
     * Nota interna con el resumen de la llamada.
     *
     * El texto lo arma `lib/nota-llamada-inicial.ts`: ahí está por qué omite
     * bufete y PIP cuando el caso no es MVA, y por qué se escribe en el idioma
     * de quien da el alta en vez de en español fijo.
     */
    await tx.caseNote.create({
      data: {
        caseId:  newCase.id,
        content: construirNotaLlamadaInicial({
          caseType:            parsed.caseType,
          source:              parsed.source,
          callDurationSeconds: parsed.callDurationSeconds,
          legal:               parsed.legal,
          insurance:           parsed.insurance,
          appointment:         parsed.appointment,
          formDelivery:        parsed.formDelivery,
        }, idiomaDelStaff),
        isPrivate: true,
        authorUserId: actor.actorUserId,
        authorName: 'Front Office (llamada inicial)',
      },
    });

    return { patient, case: newCase, appointment, guardian };
  });

  let result: Awaited<ReturnType<typeof run>>;
  try {
    result = await run();
  } catch (err) {
    if (err instanceof GuardianIsSelfError) {
      return NextResponse.json(
        { error: 'GUARDIAN_IS_SELF', message: err.message },
        { status: 400 },
      );
    }
    throw err;
  }

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
    actorRole: actor.actorRole,
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
      // `null` cuando el caso no lleva bufete: el esquema tiene `.default('HAS')`
      // y los tres diálogos que postean acá lo mandan fijo, así que un caso
      // GENERAL quedaba auditado como "tiene abogado" sin que nadie lo dijera.
      lawyerStatus: llevaBufeteYPip(parsed.caseType) ? parsed.legal.lawyerStatus : null,
      lawFirmId: parsed.legal.lawFirmId,
      caseManagerName: parsed.legal.caseManagerName ?? null,
      primaryInsuranceId: parsed.insurance.primaryInsuranceId,
      initialStatus,
      // 'created' = se abrió una ficha de paciente nueva para el apoderado.
      guardianAction:    result.guardian.action,
      guardianPatientId: result.guardian.guardianPatientId,
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
      actorRole: actor.actorRole,
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
      actorRole: actor.actorRole,
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
