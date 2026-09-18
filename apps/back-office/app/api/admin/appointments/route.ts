/**
 * GET /api/admin/appointments
 *
 * Endpoint del Calendario B.10-B.11.
 * Devuelve citas en un rango de fechas con toda la info necesaria para
 * renderizar el grid semanal y el panel de detalle.
 *
 * Query params:
 *   from      — ISO datetime (inicio del rango)
 *   to        — ISO datetime (fin del rango)
 *   clinicId  — filtrar por clínica (opcional)
 *   providerId — filtrar por doctor (opcional)
 *   type      — AppointmentType (opcional)
 *   status    — AppointmentStatus (opcional, si no se pasa excluye CANCELLED)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, Prisma, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { isWeekendInDenver, findOverlappingAppointments, describeOverlap, findBlocksCovering, describeBlocks } from '@/lib/scheduling-rules';
import { COVERAGE_FIELDS, resolveCoverage, serializeCoverage } from '@/lib/coverage';
import { enviarRecordatorioDeCita } from '@/lib/recordatorio-cita';

// ─── Include shape (typed via satisfies para que Prisma infiera GetPayload) ──
const APPT_INCLUDE = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      dateOfBirth: true,
    },
  },
  // 'case' es palabra reservada en JS pero Prisma lo maneja bien como key de objeto
  case: {
    select: {
      id: true,
      caseCode: true,
      caseType: true,
      accidentType: true,
      accidentDate: true,
      status: true,
      intakeFormCompletedAt: true,
      // Cobertura: ordena qué catálogo abre primero el picker de cargos. Es una
      // columna del caso, no una consulta extra — se deriva con
      // `resolveCoverage` para no reimplementar la regla en el cliente.
      ...COVERAGE_FIELDS,
      // En el modelo Case la relación al attorney es "attorney" (no lawyerReferrer)
      attorney: {
        select: {
          id: true,
          firmName: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
      // El seguro primario (PIP) es "primaryInsurance" (no insurance)
      primaryInsurance: {
        select: { id: true, name: true },
      },
    },
  },
  // `color` lo elige recepción en Settings, una vez por sede. Sirve para
  // distinguir de qué oficina es cada cita cuando se miran todas juntas.
  clinic: { select: { id: true, name: true, color: true } },
  /**
   * Solo el ESTADO de la nota clinica, nunca su contenido: el calendario no
   * muestra PHI de la nota. Con esto el boton sabe que ofrecer — abrirla,
   * retomar el borrador, o decir que esa visita no dejo nota.
   */
  visitNote: { select: { status: true } },
  provider: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialty: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

type ApptRow = Prisma.AppointmentGetPayload<{ include: typeof APPT_INCLUDE }>;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const from       = searchParams.get('from');
  const to         = searchParams.get('to');
  const clinicId   = searchParams.get('clinicId')   ?? undefined;
  const providerId = searchParams.get('providerId') ?? undefined;
  const type       = searchParams.get('type')       ?? undefined;
  const status     = searchParams.get('status')     ?? undefined;
  const patientId  = searchParams.get('patientId')  ?? undefined;
  /**
   * Incluir las canceladas. El calendario las pide para pintarlas TACHADAS: el
   * hueco quedo libre y recepcion necesita ver por que. El resto de las
   * pantallas que consumen este endpoint (ficha del paciente, citas del caso)
   * siguen sin verlas, que es como venian.
   */
  const includeCancelled = searchParams.get('includeCancelled') === '1';

  // Rango por defecto: semana actual (lunes–domingo)
  const fromDate = from ? new Date(from) : (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() + 1); // lunes
    return d;
  })();
  const toDate = to ? new Date(to) : (() => {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  })();

  // ─── Build where clause (sin duplicate keys) ─────────────────────────────
  const where: Prisma.AppointmentWhereInput = {
    scheduledFor: { gte: fromDate, lte: toDate },
    // Si pasan un status específico, úsalo. Si no: se excluyen las canceladas,
    // salvo que las pidan explícitamente con includeCancelled.
    ...(status
      ? { status: status as Prisma.EnumAppointmentStatusFilter }
      : includeCancelled ? {} : { status: { not: 'CANCELLED' as const } }),
  };
  if (clinicId)   where.clinicId   = clinicId;
  if (providerId) where.providerId = providerId;
  if (patientId)  where.patientId  = patientId;
  if (type)       where.type       = type as Prisma.EnumAppointmentTypeFilter;

  try {
    const appointments: ApptRow[] = await db.appointment.findMany({
      where,
      include: APPT_INCLUDE,
      orderBy: { scheduledFor: 'asc' },
    });

    /**
     * ─── visitNumber · 0 = el paciente NUNCA vino antes ──────────────────────
     *
     * Se cuenta por PACIENTE, no por caso. Hasta el 2026-09-14 era por caso, y
     * eso hacía que el calendario marcara como "1st visit" a gente conocida:
     * basta con que abran un caso nuevo —otro accidente— para que su próxima
     * cita sea la primera DE ESE CASO.
     *
     * Lo reportó la clínica con un paciente concreto: "This patient appears in
     * LM as new MVA patient. That isn't true. This patient has been treated with
     * Precision since January of 2025". Tenían razón.
     *
     * Esta pantalla es la de Edson, y la pregunta que se hace mirándola es
     * **"¿a esta persona la conocemos?"**, no "¿cuántas van de este expediente?".
     * Con el conteo por caso la respuesta era que no, aunque llevara un año
     * viniendo.
     *
     * Medido antes de cambiarlo: de 2.800 citas marcadas como primera, 144 (5%)
     * dejan de estarlo. Entre las FUTURAS —lo único que Edson mira— son 3 de 21.
     *
     * ⚠️ `cases/[id]/appointments` sigue contando POR CASO, y está bien: ahí se
     * listan las citas de un solo expediente y "visita 3" significa la tercera
     * de ese caso. Son dos preguntas distintas con la misma etiqueta; lo que
     * cambia es el contexto en el que se lee.
     *
     * Las CANCELADAS no cuentan como visita previa: el paciente no vino.
     */
    const patientIds = [...new Set(appointments.map(a => a.patientId))];
    const visitCountsByCaseAndAppt: Record<string, number> = {};

    if (patientIds.length > 0) {
      const priorCounts = await db.appointment.groupBy({
        by: ['patientId'],
        where: {
          patientId:    { in: patientIds },
          status:       { not: 'CANCELLED' },
          scheduledFor: { lt: fromDate },
        },
        _count: { id: true },
      });
      const priorByPatient: Record<string, number> = {};
      for (const r of priorCounts) priorByPatient[r.patientId] = r._count.id;

      // A lo que ya tenía antes del período se le suman las de ESTE período que
      // van delante suyo: `appointments` viene ordenado por fecha, así que las
      // anteriores son las de índice menor.
      for (let i = 0; i < appointments.length; i++) {
        const appt = appointments[i];
        const enElPeriodo = appointments.slice(0, i).filter(a => a.patientId === appt.patientId).length;
        visitCountsByCaseAndAppt[appt.id] = (priorByPatient[appt.patientId] ?? 0) + enElPeriodo;
      }
    }

    // ─── Map to response ─────────────────────────────────────────────────────
    const result = appointments.map(appt => ({
      id:              appt.id,
      scheduledFor:    appt.scheduledFor.toISOString(),
      durationMinutes: appt.durationMinutes,
      type:            appt.type,
      status:          appt.status,
      // Distingue la cancelacion del mismo dia: esa conserva servicios y admite
      // penalidad, la cancelacion con aviso no. El panel decide con esto si
      // ofrece entrar al caso.
      cancelledSameDay: appt.cancelledSameDay,
      // Si el paciente ya firmo la confirmacion de la cita. El panel lo muestra
      // como sello y con esto decide si ofrece el QR: una cita firmada ya no
      // necesita link, necesita el impreso.
      attendanceSignedAt: appt.attendanceSignedAt?.toISOString() ?? null,
      notes:           appt.notes,
      /** 'DRAFT' | 'SIGNED' | null (esa visita no dejo nota). */
      noteStatus:      appt.visitNote?.status ?? null,
      isOnline:        appt.isOnline,
      meetingUrl:      appt.meetingUrl,
      visitNumber:     visitCountsByCaseAndAppt[appt.id] ?? 0,
      patient: {
        id:          appt.patient.id,
        firstName:   appt.patient.firstName,
        lastName:    appt.patient.lastName,
        phone:       appt.patient.phone,
        email:       appt.patient.email,
        dateOfBirth: appt.patient.dateOfBirth?.toISOString() ?? null,
      },
      case: appt.case ? {
        id:                     appt.case.id,
        caseCode:               appt.case.caseCode,
        caseType:               appt.case.caseType,
        accidentType:           appt.case.accidentType,
        accidentDate:           appt.case.accidentDate?.toISOString() ?? null,
        status:                 appt.case.status,
        intakeFormCompletedAt:  appt.case.intakeFormCompletedAt?.toISOString() ?? null,
        attorney: appt.case.attorney ? {
          id:        appt.case.attorney.id,
          firmName:  appt.case.attorney.firmName,
          firstName: appt.case.attorney.firstName,
          lastName:  appt.case.attorney.lastName,
          phone:     appt.case.attorney.phone,
          email:     appt.case.attorney.email,
        } : null,
        primaryInsurance: appt.case.primaryInsurance ? {
          id:   appt.case.primaryInsurance.id,
          name: appt.case.primaryInsurance.name,
        } : null,
        coverage: serializeCoverage(resolveCoverage(appt.case)),
      } : null,
      clinic: {
        id:    appt.clinic.id,
        name:  appt.clinic.name,
        color: appt.clinic.color,
      },
      provider: appt.provider ? {
        id:        appt.provider.id,
        firstName: appt.provider.firstName,
        lastName:  appt.provider.lastName,
        specialty: appt.provider.specialty,
      } : null,
    }));

    return NextResponse.json({ ok: true, appointments: result, count: result.length });
  } catch (err) {
    console.error('[GET /api/admin/appointments]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// ─── POST — Crear cita (uso general desde calendario) ────────────────────────
const CreateSchema = z.object({
  caseId:          z.string(),
  clinicId:        z.string(),
  providerId:      z.string(),
  scheduledFor:    z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(30),
  type:            z.enum(['AUTO_ACCIDENT', 'FAMILY_PRACTICE', 'URGENT_CARE', 'FOLLOW_UP']).default('AUTO_ACCIDENT'),
  notes:           z.string().max(2000).optional(),
  isOnline:        z.boolean().default(false),
  meetingUrl:      z.string().url().nullable().optional(),
  /** Ver PatchSchema en [id]/route.ts: el cruce avisa y deja decidir. */
  allowOverlap:    z.boolean().optional(),
  /**
   * Aceptar el aviso de agenda (almuerzo, reunión) y guardar igual. Aparte de
   * `allowOverlap`: son dos avisos distintos.
   */
  allowBlocked:    z.boolean().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);

  let parsed: z.infer<typeof CreateSchema>;
  try {
    parsed = CreateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // Allow up to 60 min in the past — the slot picker can be open for a while
  // before the user submits, and the slot is still legitimately chosen.
  const GRACE_MS = 60 * 60 * 1000;
  if (new Date(parsed.scheduledFor).getTime() < Date.now() - GRACE_MS) {
    return NextResponse.json({
      error: 'DATE_IN_PAST',
      message: 'El horario seleccionado ya pasó. Por favor selecciona un nuevo horario disponible.',
    }, { status: 400 });
  }

  // Ninguna clínica atiende sábado/domingo — antes solo el sugeridor de
  // horarios (available-slots) respetaba esto; agendar a mano un fin de
  // semana se guardaba sin ningún chequeo.
  if (isWeekendInDenver(new Date(parsed.scheduledFor))) {
    return NextResponse.json({
      error: 'WEEKEND_NOT_ALLOWED',
      message: 'No se pueden agendar citas en fin de semana.',
    }, { status: 400 });
  }

  const [caseRecord, clinic, provider] = await Promise.all([
    db.case.findUnique({ where: { id: parsed.caseId }, select: { id: true, patientId: true, status: true } }),
    db.clinic.findUnique({ where: { id: parsed.clinicId }, select: { id: true } }),
    db.provider.findUnique({ where: { id: parsed.providerId }, select: { id: true } }),
  ]);

  if (!caseRecord) return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  if (!clinic)     return NextResponse.json({ error: 'CLINIC_NOT_FOUND' }, { status: 404 });
  if (!provider)   return NextResponse.json({ error: 'PROVIDER_NOT_FOUND' }, { status: 404 });

  const SCHEDULABLE = ['NEW_REFERRAL', 'CONFIRMED', 'ACTIVE', 'INTAKE_COMPLETED', 'INTAKE_PENDING'];
  if (!SCHEDULABLE.includes(caseRecord.status)) {
    return NextResponse.json(
      { error: 'INVALID_CASE_STATUS', message: `El caso está en status ${caseRecord.status} y no permite agendar` },
      { status: 422 },
    );
  }

  // ─── Verificar cruce con otra cita del doctor (P1) ─────────────────────
  // Ver lib/scheduling-rules: antes esto era un findFirst sin orden que solo
  // chequeaba el cruce contra UNA candidata de la ventana, así que dejaba pasar
  // cruces reales de forma intermitente.
  if (!parsed.allowOverlap) {
    const overlaps = await findOverlappingAppointments({
      providerId:      parsed.providerId,
      start:           new Date(parsed.scheduledFor),
      durationMinutes: parsed.durationMinutes,
    });
    if (overlaps.length > 0) {
      return NextResponse.json(
        {
          error:   'SLOT_CONFLICT',
          message: describeOverlap(overlaps),
          conflictAppointmentId: overlaps[0]!.id,
          overlapCount: overlaps.length,
          canOverride: true,
        },
        { status: 409 },
      );
    }
  }

  /**
   * ─── Los avisos de agenda ────────────────────────────────────────────────
   *
   * Avisan, no impiden (Devin, 2026-09-17: *"warn but allow"*). Va DESPUÉS del
   * cruce de citas y con su propia bandera: son dos motivos distintos y quien
   * agenda puede querer aceptar uno y no el otro. Un solo `allowOverlap` para
   * los dos dejaría pasar en silencio el que no se miró.
   */
  if (!parsed.allowBlocked) {
    const bloqueos = await findBlocksCovering({
      providerId:      parsed.providerId,
      start:           new Date(parsed.scheduledFor),
      durationMinutes: parsed.durationMinutes,
    });
    if (bloqueos.length > 0) {
      return NextResponse.json(
        {
          error:   'BLOCKED_SLOT',
          message: describeBlocks(bloqueos),
          blockIds: bloqueos.map((b) => b.id),
          canOverride: true,
        },
        { status: 409 },
      );
    }
  }

  const shouldActivate = caseRecord.status === 'CONFIRMED';

  const apptData = {
    patientId:       caseRecord.patientId,
    caseId:          parsed.caseId,
    clinicId:        parsed.clinicId,
    providerId:      parsed.providerId,
    scheduledFor:    new Date(parsed.scheduledFor),
    durationMinutes: parsed.durationMinutes,
    type:            parsed.type,
    notes:           parsed.notes ?? null,
    isOnline:        parsed.isOnline,
    meetingUrl:      parsed.meetingUrl ?? null,
    status:          'SCHEDULED' as const,
    // Quien agenda, para que Edson sepa a quien preguntarle. El nombre va
    // denormalizado: la grilla no puede hacer join a `users` en cada fila.
    createdByUserId: actor.actorUserId,
    createdByName:   actor.actorName,
  };

  let appointment;
  if (shouldActivate) {
    const [appt] = await db.$transaction([
      db.appointment.create({ data: apptData, include: { clinic: { select: { name: true } }, provider: { select: { firstName: true, lastName: true } } } }),
      db.case.update({ where: { id: parsed.caseId }, data: { status: 'ACTIVE' } }),
    ]);
    appointment = appt;
  } else {
    appointment = await db.appointment.create({
      data: apptData,
      include: { clinic: { select: { name: true } }, provider: { select: { firstName: true, lastName: true } } },
    });
  }

  await writeAuditLog(db, {
    actorType:    actor.actorType,
    actorUserId:  actor.actorUserId,
    actorRole:    actor.actorRole,
    action:       'CREATE_APPOINTMENT',
    entityType:   'appointments',
    entityId:     appointment.id,
    ipAddress:    actor.ipAddress,
    userAgent:    actor.userAgent,
    after:        appointment as unknown as Prisma.JsonValue,
    metadata:     { caseId: parsed.caseId, caseActivated: shouldActivate },
  });

  /**
   * El recordatorio al paciente, recién ahora.
   *
   * Va DESPUÉS del audit log y con `await`: la cita ya está guardada, así que
   * nada de lo de acá puede perderla. Se espera en vez de dispararlo y seguir
   * porque el resultado viaja en la respuesta —recepción tiene que poder ver
   * en el acto si el aviso salió o no—, y porque en serverless una promesa sin
   * await se corta cuando la función termina: el SMS saldría o no según la
   * suerte del apagado.
   *
   * `enviarRecordatorioDeCita` no lanza nunca. Lo peor que puede devolver es
   * un motivo.
   */
  const recordatorio = await enviarRecordatorioDeCita({
    appointmentId: appointment.id,
    actorUserId:   actor.actorUserId,
    actorName:     actor.actorName,
  });

  return NextResponse.json({ ok: true, appointment, recordatorio }, { status: 201 });
}
