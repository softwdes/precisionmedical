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
import { db, Prisma, writeAuditLog, VIGENTES } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { isWeekendInDenver, horarioYaPaso, findOverlappingAppointments, describeOverlap, overlapDetails, medirSobrecarga, findBlocksCovering, describeBlocks } from '@/lib/scheduling-rules';
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
      where: { ...VIGENTES, ...where },
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
    /** Casos que Edson marco como control recurrente. Ver donde se llena, abajo. */
    const marcadosRecurrentes = new Set<string>();

    if (patientIds.length > 0) {
      /*
       * La cuenta va por ACCIDENTE. Dos casos del mismo paciente son el mismo
       * accidente cuando comparten `accidentDate`; si a un caso le falta la
       * fecha, se cuenta solo, porque no hay con qué afirmar que es el mismo.
       *
       * Se usa `cases.accidentDate` y NO el `lossDate` de la fila de seguro: el
       * lossDate y el número de claim SE COPIAN al abrir un caso nuevo para el
       * mismo paciente, así que comparar por ahí da "iguales" siempre. Esa
       * confusión hizo que el 2026-09-17 se fusionaran 10 pares de casos que
       * eran accidentes distintos.
       */
      const casos = await db.case.findMany({
        where:  { patientId: { in: patientIds } },
        select: { id: true, patientId: true, accidentDate: true },
      });
      const claveDelCaso = new Map<string, string>();
      for (const c of casos) {
        claveDelCaso.set(
          c.id,
          c.accidentDate
            ? `${c.patientId}|${c.accidentDate.toISOString().slice(0, 10)}`
            : `caso:${c.id}`,
        );
      }
      /** El accidente al que pertenece una cita. Sin caso, cuenta sola. */
      const claveDe = (a: { caseId: string | null; patientId: string }) =>
        a.caseId ? (claveDelCaso.get(a.caseId) ?? `caso:${a.caseId}`) : `sincaso:${a.patientId}`;

      /*
       * La marca manual de Edson ("MVA F/U"), que GANA sobre el conteo.
       *
       * El conteo de abajo responde "¿vino antes?" mirando el historial. Cuando
       * el historial no alcanza —y no alcanza: el 54% de los casos MVA no tiene
       * `accidentDate`, asi que no se puede distinguir un control de un
       * accidente nuevo— decide la persona que mira la fila.
       *
       * Una sola consulta por tanda, no una por cita: son a lo sumo tantas filas
       * como casos haya en la semana que se esta mirando.
       *
       * Solo interesa `true`. `false` significa "Edson dice que SI es primera
       * visita", que es lo mismo que haria el conteo, y `null` es "no lo miro".
       */
      const caseIds = [...new Set(appointments.map(a => a.caseId).filter((x): x is string => !!x))];
      if (caseIds.length > 0) {
        const marcas = await db.caseTracking.findMany({
          where:  { caseId: { in: caseIds }, followUpOverride: true },
          select: { caseId: true },
        });
        for (const m of marcas) marcadosRecurrentes.add(m.caseId);
      }

      const priorCounts = await db.appointment.groupBy({
        by: ['caseId'],
        where: {
          ...VIGENTES,
          patientId:    { in: patientIds },
          status:       { not: 'CANCELLED' },
          scheduledFor: { lt: fromDate },
        },
        _count: { id: true },
      });
      const priorPorAccidente: Record<string, number> = {};
      for (const r of priorCounts) {
        if (!r.caseId) continue;
        const k = claveDelCaso.get(r.caseId) ?? `caso:${r.caseId}`;
        priorPorAccidente[k] = (priorPorAccidente[k] ?? 0) + r._count.id;
      }

      /**
       * ⚠️ Las del período se cuentan sobre TODAS las del paciente, no sobre
       * `appointments`.
       *
       * `appointments` ya viene filtrado por clínica y por proveedor —esos dos
       * filtros viajan al servidor—, así que contar ahí hacía que **el número
       * de visita dependiera del filtro que el usuario tuviera puesto**.
       *
       * Medido el 2026-09-24 en la semana del 21: con el filtro de proveedor en
       * "Clanton", la cita de Gabriela Oropeza (MVA-3392, martes 17:00) pasaba
       * de visita #1 a visita #0 y se colaba en "MVA · 1ª visita". Su cita de
       * las 16:00 existía, pero era de otro provider y el filtro la escondía.
       *
       * Es la falla que reportó Edson —"el filtro no muestra la cantidad que se
       * ve"— y la que más pesa, porque un conteo que cambia según cómo mires no
       * se puede usar para nada, y menos para algo que él usa como registro.
       *
       * Tampoco cuentan las CANCELADAS, igual que en el tramo anterior al
       * período: el paciente no vino. Antes sí contaban acá, porque el
       * calendario las pide a propósito para pintarlas tachadas — o sea que una
       * cancelada del lunes le sumaba una visita a la del miércoles.
       */
      const enRango = await db.appointment.findMany({
        where: {
          ...VIGENTES,
          patientId:    { in: patientIds },
          status:       { not: 'CANCELLED' },
          scheduledFor: { gte: fromDate, lte: toDate },
        },
        select: { id: true, caseId: true, patientId: true, scheduledFor: true },
        orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      });

      /** Cuántas del mismo accidente van ANTES que ésta, dentro del período. */
      const delanteEnRango = new Map<string, number>();
      const vistas: Record<string, number> = {};
      for (const a of enRango) {
        const k = claveDe(a);
        delanteEnRango.set(a.id, vistas[k] ?? 0);
        vistas[k] = (vistas[k] ?? 0) + 1;
      }

      for (const appt of appointments) {
        const k = claveDe(appt);
        // Una cita cancelada no está en `enRango`: se le da el conteo que le
        // tocaría por su lugar en el tiempo, sin ocupar lugar para las demás.
        const delante = delanteEnRango.get(appt.id)
          ?? enRango.filter(a => claveDe(a) === k && a.scheduledFor < appt.scheduledFor).length;
        visitCountsByCaseAndAppt[appt.id] = (priorPorAccidente[k] ?? 0) + delante;
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
      /*
       * 0 = nunca vino antes, y de ahi salen el 🆕, el resplandor de la tarjeta
       * y el contador de primeras visitas.
       *
       * El `Math.max(1, ...)` es la marca de Edson: si el dijo que esta fila es
       * un control recurrente, la cita NO puede ser una primera visita, aunque
       * el historial no tenga con que probarlo. Se fuerza a 1 —"ya hubo una
       * antes"— y no a un numero inventado: lo unico que esta pantalla pregunta
       * es si vale cero o no.
       *
       * Pedido de Erick el 2026-09-28: marcar MVA F/U en la grilla tiene que
       * quitar el NEW aca. Si el dato solo viviera en la grilla de Edson, las
       * dos pantallas se contradecirian igual que antes.
       */
      visitNumber:     appt.caseId && marcadosRecurrentes.has(appt.caseId)
        ? Math.max(1, visitCountsByCaseAndAppt[appt.id] ?? 0)
        : visitCountsByCaseAndAppt[appt.id] ?? 0,
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
  /**
   * El provider es OPCIONAL desde el 2026-09-28 (Erick: *"cita sin provider es
   * un estado normal desde ahora"*).
   *
   * Se agenda la fecha, la hora y la sede, y quién atiende se decide en el
   * check-in: en Day Admission lo elige el mostrador, y en Mi Día el propio
   * provider toma la cita. Es lo que la clínica ya hacía de hecho — reservaba el
   * horario sin saber todavía quién iba a estar.
   *
   * La columna ya era nullable y había 22 citas así en producción (todas
   * PENDING, de 2024-2025): el caso no se inaugura acá, se vuelve usable.
   *
   * ⚠️ Sin provider NO hay chequeo de cruce: no hay con qué chocar. Es la única
   * garantía que se pierde y es a sabiendas.
   */
  /**
   * El string VACIO se normaliza a null antes de validar.
   *
   * Los tres diálogos que crean citas arrancan el estado en `useState('')`, así
   * que "sin provider" viajaba como `providerId: ""`. Sin esto, `""` pasaba la
   * validación, llegaba entero al `create` y Prisma reventaba contra la clave
   * foránea: la pantalla mostraba "no se pudo completar la acción" y nada más,
   * porque un 500 no trae código de error que traducir.
   *
   * Un parámetro VACÍO no es un parámetro AUSENTE — el mismo error que tenía el
   * selector de horarios el 28-sep-2026, encontrado el mismo día.
   */
  providerId: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().min(1).nullable().optional(),
  ),
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
  /**
   * Registrar una visita que YA OCURRIÓ.
   *
   * La clínica tiene casos excepcionales —el paciente vino y no se alcanzó a
   * cargar— y sin esto la visita no entra al sistema y no se puede facturar
   * (Erick, 2026-09-18). Mover una cita ya creada a una fecha pasada era legal
   * desde el 2026-08-05; crearla ahí no, que es la mitad que faltaba.
   *
   * Tiene que venir explícita: sin la bandera, una fecha pasada sigue siendo un
   * error, porque el caso abrumadoramente más común de una fecha vieja es un
   * dedazo en el año.
   *
   * Dos consecuencias, las dos decididas por la clínica y NO configurables:
   *  · nace ATENDIDA (`COMPLETED`) — es el único motivo por el que se carga;
   *  · no se le avisa NADA al paciente (el candado está en `lib/recordatorio-cita`).
   */
  allowPast:       z.boolean().optional(),
  /** Aceptar el aviso de sobrecarga de la franja. Aparte de `allowOverlap`. */
  allowOverbook:   z.boolean().optional(),
});

/**
 * La red que faltaba: una excepción tiene que salir como `INTERNAL_ERROR`.
 *
 * Sin esto, cualquier falla no prevista sale como un 500 pelado, SIN campo
 * `error`. El cliente traduce por código, no encuentra ninguno, y muestra el
 * genérico "no se pudo completar la acción" — que no dice nada y no deja
 * rastro para soporte.
 *
 * Pasó de verdad el 28-sep-2026: un `providerId` vacío reventaba contra la
 * clave foránea y la pantalla se quedaba muda. El GET de este módulo ya tenía
 * su catch desde siempre; los POST que GUARDAN, no.
 *
 * El `console.error` es lo único que ve soporte: el detalle de la excepción no
 * viaja al cliente a propósito — puede traer nombres de pacientes.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    return await crearCita(req);
  } catch (err) {
    console.error('[POST /api/admin/appointments]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

async function crearCita(req: NextRequest): Promise<NextResponse> {
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

  /**
   * El MOTIVO es obligatorio al crear.
   *
   * La pantalla ya lo valida; esto es el respaldo. Sin él, un `fetch` a mano o
   * una pantalla futura vuelven a dejar citas sin motivo — y el motivo es lo que
   * el provider lee meses después para elegir de qué visita anterior traer
   * texto. Devin, 2026-09-23: *"we could simply incorporate it on our end and
   * make it required"*.
   *
   * Solo al CREAR: el PATCH vive en `[id]/route.ts` y ahí NO se exige, porque el
   * 60% de las citas que ya existen no tiene motivo y pedirlo para corregir una
   * hora bloquearía editar la mayor parte del historial.
   */
  if (!parsed.notes?.trim()) {
    return NextResponse.json({ error: 'REASON_REQUIRED' }, { status: 400 });
  }

  /**
   * Dos preguntas distintas sobre la misma fecha, y por eso dos variables:
   *
   *  · ¿se RECHAZA? — con la gracia de una hora de lib/scheduling-rules, que
   *    existe para que el horario elegido a las 8:59 no se caiga al guardarlo a
   *    las 9:01.
   *  · ¿es una VISITA QUE YA OCURRIÓ? — solo si quien agenda lo dijo, y sin
   *    gracia ninguna.
   *
   * Con una sola variable graciada, una visita marcada como pasada pero de hace
   * media hora nacía SCHEDULED y le mandaba el SMS al paciente: justo las dos
   * cosas que no tienen que pasar.
   */
  const yaPaso        = new Date(parsed.scheduledFor).getTime() < Date.now();
  const esRetroactiva = parsed.allowPast === true && yaPaso;
  if (!parsed.allowPast && horarioYaPaso(new Date(parsed.scheduledFor))) {
    return NextResponse.json({
      error: 'DATE_IN_PAST',
    }, { status: 400 });
  }

  // Ninguna clínica atiende sábado/domingo — antes solo el sugeridor de
  // horarios (available-slots) respetaba esto; agendar a mano un fin de
  // semana se guardaba sin ningún chequeo.
  //
  // Vale TAMBIÉN para una visita retroactiva: Erick lo confirmó al abrir el
  // registro de visitas pasadas (2026-09-18). La clínica no abre el fin de
  // semana, así que una visita de un sábado es un error de carga, no una
  // excepción.
  if (isWeekendInDenver(new Date(parsed.scheduledFor))) {
    return NextResponse.json({
      error: 'WEEKEND_NOT_ALLOWED',
    }, { status: 400 });
  }

  /**
   * El provider puede no venir: la cita queda sin asignar y se resuelve en el
   * check-in. Si VIENE, tiene que existir — un id inventado sigue siendo un
   * error, no una cita sin asignar.
   */
  const [caseRecord, clinic, provider] = await Promise.all([
    db.case.findUnique({ where: { id: parsed.caseId }, select: { id: true, patientId: true, status: true } }),
    db.clinic.findUnique({ where: { id: parsed.clinicId }, select: { id: true } }),
    parsed.providerId
      ? db.provider.findUnique({ where: { id: parsed.providerId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (!caseRecord) return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  if (!clinic)     return NextResponse.json({ error: 'CLINIC_NOT_FOUND' }, { status: 404 });
  if (parsed.providerId && !provider) {
    return NextResponse.json({ error: 'PROVIDER_NOT_FOUND' }, { status: 404 });
  }

  const SCHEDULABLE = ['NEW_REFERRAL', 'CONFIRMED', 'ACTIVE', 'INTAKE_COMPLETED', 'INTAKE_PENDING'];
  if (!SCHEDULABLE.includes(caseRecord.status)) {
    return NextResponse.json(
      { error: 'INVALID_CASE_STATUS', params: { status: caseRecord.status } },
      { status: 422 },
    );
  }

  // ─── Verificar cruce con otra cita del doctor (P1) ─────────────────────
  // Ver lib/scheduling-rules: antes esto era un findFirst sin orden que solo
  // chequeaba el cruce contra UNA candidata de la ventana, así que dejaba pasar
  // cruces reales de forma intermitente.
  /**
   * ─── Sobrecarga de la franja ─────────────────────────────────────────────
   *
   * Solo cuando la cita va SIN provider. Con provider ya la cuida el chequeo
   * de cruce, que es más preciso: mira una agenda concreta.
   *
   * Sin provider no hay agenda que mirar, así que se cuenta cuánta gente cabe:
   * si a esa hora ya hay tantos pacientes como providers atienden ese día en
   * esa sede, el que entra no tiene quién lo vea.
   *
   * Bandera propia (`allowOverbook`) y no `allowOverlap`: son dos motivos
   * distintos y aceptar uno no puede hacer pasar el otro en silencio — el
   * mismo criterio con el que ya conviven `allowOverlap` y `allowBlocked`.
   */
  if (!parsed.providerId && !parsed.allowOverbook) {
    const carga = await medirSobrecarga({
      clinicId:        parsed.clinicId,
      start:           new Date(parsed.scheduledFor),
      durationMinutes: parsed.durationMinutes,
    });
    if (carga && carga.ocupadas >= carga.capacidad) {
      return NextResponse.json({
        error: 'CAPACITY_WARNING',
        ocupadas:  carga.ocupadas,
        capacidad: carga.capacidad,
        canOverride: true,
      }, { status: 409 });
    }
  }
  /**
   * Sin provider no hay cruce que chequear: no hay agenda contra la cual chocar.
   * Es la única garantía que se pierde al dejar la cita sin asignar, y se pierde
   * a sabiendas — el choque, si lo hay, aparece al asignarla en el check-in.
   */
  if (!parsed.allowOverlap && parsed.providerId) {
    const overlaps = await findOverlappingAppointments({
      providerId:      parsed.providerId,
      start:           new Date(parsed.scheduledFor),
      durationMinutes: parsed.durationMinutes,
    });
    if (overlaps.length > 0) {
      const detalle = overlapDetails(overlaps)!;
      return NextResponse.json(
        {
          error:   'SLOT_CONFLICT',
          message: describeOverlap(overlaps),
          conflictAppointmentId: overlaps[0]!.id,
          conflictAt:      detalle.at,
          conflictPatient: detalle.patient,
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
    /**
     * Una visita que ya ocurrió nace ATENDIDA.
     *
     * Como `SCHEDULED` quedaría pendiente para siempre: aparecería en el
     * Check-in de un día que ya pasó, sumando al contador de pendientes de una
     * jornada que nadie va a volver a abrir.
     *
     * NO se inventan los sellos de reloj (`checkedInAt`, `admittedAt`,
     * `checkedOutAt`): son horas reales y de ahí salen las métricas de los
     * providers. Quedan en null, que es como se leen "no medido".
     */
    status:          (esRetroactiva ? 'COMPLETED' : 'SCHEDULED') as 'COMPLETED' | 'SCHEDULED',
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
    // `retroactiva` queda en la auditoría a propósito: esta cita termina en un
    // lien y en un HCFA, y una visita que aparece facturada sin que nadie la
    // haya visto ocurrir tiene que poder explicarse.
    metadata:     { caseId: parsed.caseId, caseActivated: shouldActivate, retroactiva: esRetroactiva },
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
  /**
   * A una visita que ya ocurrió NO se le avisa nada al paciente (Erick,
   * 2026-09-18). Ni se llama al recordatorio: el candado del clock que hay en
   * `lib/recordatorio-cita` es la red por si alguien agrega otra ruta, pero acá
   * se sabe la intención y decirla explícita es más barato que deducirla.
   */
  const recordatorio = esRetroactiva
    ? { enviado: false as const, motivo: 'CITA_PASADA' as const }
    : await enviarRecordatorioDeCita({
        appointmentId: appointment.id,
        actorUserId:   actor.actorUserId,
        actorName:     actor.actorName,
      });

  return NextResponse.json({ ok: true, appointment, recordatorio }, { status: 201 });
}
