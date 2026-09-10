import { db } from '@precision-medical/database';
import { claveDia, ZONA_CLINICA } from '@/lib/fechas';
import { colaIntake, DIAS_VENTANA } from '@/lib/cola-intake';
import {
  atrasosRecepcion, HORAS_SIN_PORTAL,
  HORAS_INTAKE_SIN_RESPUESTA, HORAS_CONFIRMADO_SIN_AGENDA,
} from '@/lib/atrasos-recepcion';
import { getNotesSummary } from '@/lib/notes-summary';
import type { Herramienta, ResultadoHerramienta } from '@/lib/agente/tipos';
import type { AlcanceClinica } from './alcance';

/**
 * CIFO · las herramientas de recepción.
 *
 * Dos reglas gobiernan este archivo, y la segunda es la que lo hace distinto de
 * Vigía.
 *
 * ── 1. Nada de SQL libre ─────────────────────────────────────────────────────
 *
 * Siete funciones tipadas y se terminó. Una herramienta que ejecute consultas
 * arbitrarias es la misma cosa que darle la clínica entera a quien sepa
 * preguntar. Igual que en el portal legal.
 *
 * ── 2. NINGUNA devuelve el nombre de un paciente ─────────────────────────────
 *
 * Acá está la diferencia con Vigía, y no es una preferencia: es la única
 * garantía que nos queda.
 *
 * En el portal legal el alcance ENCIERRA — `lawyerCaseFilter()` deja al abogado
 * dentro de su bufete, así que `buscar_paciente` podía mandar un nombre al
 * proveedor del modelo con el daño acotado. Del lado de la clínica no hay nada
 * que encerrar: el alcance legítimo son los casi 6.000 pacientes del padrón. La
 * misma herramienta se convertiría en una búsqueda sobre todo el padrón, y eso
 * no crece un poco: cambia de orden de magnitud.
 *
 * Así que el modelo trabaja con **códigos de caso, conteos y fechas**. Los
 * nombres se resuelven de este lado, en la pantalla, DESPUÉS de que contestó —
 * igual que los botones de Vigía resuelven el id del caso del lado del servidor.
 * Quien necesite buscar a una persona por su nombre usa el buscador de
 * pacientes, que existe y no pasa por ningún modelo.
 *
 * Consecuencia práctica: **saca el BAA del camino crítico.** Sin datos
 * identificables saliendo hacia el proveedor, CIFO se puede construir y usar
 * mientras el acuerdo siga en trámite.
 *
 * **Los nombres de PROVIDER sí viajan** (`notas_sin_firmar`). Es una decisión
 * consciente y la línea está en otro lado: el nombre de un médico con notas
 * pendientes es dato de desempeño del staff, no información de salud de un
 * paciente. Y sin el nombre la herramienta no puede responder la pregunta que
 * existe para responder.
 *
 * ── Y ninguna escribe ────────────────────────────────────────────────────────
 *
 * CIFO es de solo lectura. Las acciones —llamar, mandar el formulario— las
 * hace la persona apretando un botón de la pantalla, con su propio audit. El
 * agente propone; no ejecuta.
 */

const MAX_FILAS = 25;

/** Decimal de Prisma → número. */
const n = (v: unknown): number => (v == null ? 0 : Number(v));

/** Los bordes de hoy en la zona de la CLÍNICA, no en la del servidor. */
function rangoDeHoy(): { desde: Date; hasta: Date } {
  const hoy = claveDia(new Date());
  const [y, m, d] = hoy.split('-').map(Number);
  // El desfase real de esa fecha sale de cómo se ve el mediodía UTC en la zona
  // de la clínica: 6 horas en verano, 7 en invierno. Fijar uno rompe medio año.
  const tentativo = Date.UTC(y!, m! - 1, d!, 12, 0, 0);
  const horaLocal = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: ZONA_CLINICA, hour12: false, hour: '2-digit' })
      .format(new Date(tentativo)),
  );
  const desde = new Date(Date.UTC(y!, m! - 1, d!, 12 - horaLocal, 0, 0));
  return { desde, hasta: new Date(desde.getTime() + 86_400_000) };
}

/** `YYYY-MM-DD` en la zona de la clínica. */
const iso = (d: Date | null | undefined): string | null => (d ? claveDia(d) : null);

/** Horas enteras desde una fecha. El agente razona mejor con horas que con timestamps. */
const horasDesde = (d: Date): number => Math.floor((Date.now() - d.getTime()) / 3_600_000);

// ─── 1 · El pulso del día ────────────────────────────────────────────────────

/**
 * Cómo viene el día. Es la primera pregunta de cualquier recepcionista y hoy no
 * se puede responder sin abrir tres pantallas.
 */
export async function pulsoDelDia(): Promise<ResultadoHerramienta> {
  const { desde, hasta } = rangoDeHoy();

  const [porEstado, cobradoHoy, enviosHoy, llamadasHoy] = await Promise.all([
    db.appointment.groupBy({
      by: ['status'],
      where: { scheduledFor: { gte: desde, lt: hasta } },
      _count: true,
    }),
    db.appointmentBilling.aggregate({
      _sum: { amountPaid: true },
      where: { updatedAt: { gte: desde, lt: hasta } },
    }),
    db.messageLog.count({ where: { createdAt: { gte: desde } } }),
    db.callLog.count({ where: { createdAt: { gte: desde } } }),
  ]);

  const cuenta = (...estados: string[]): number =>
    porEstado.filter((g) => estados.includes(g.status)).reduce((a, g) => a + g._count, 0);

  return {
    data: {
      // El total excluye las canceladas: no son trabajo de hoy.
      citasHoy: porEstado.filter((g) => g.status !== 'CANCELLED').reduce((a, g) => a + g._count, 0),
      porEstado: Object.fromEntries(porEstado.map((g) => [g.status, g._count])),
      enElEdificio: cuenta('CHECKED_IN', 'IN_PROGRESS'),
      yaSalieron: cuenta('COMPLETED', 'CHECKED_OUT'),
      sinLlegarTodavia: cuenta('SCHEDULED', 'CONFIRMED', 'PENDING'),
      noShowHoy: cuenta('NO_SHOW'),
      canceladasHoy: cuenta('CANCELLED'),
      cobradoHoy: n(cobradoHoy._sum.amountPaid),
      // Los dos canales de contacto del día, para poder comparar el esfuerzo.
      sms0EmailsEnviadosHoy: enviosHoy,
      llamadasHoy,
    },
    sources: ['appointments', 'appointment_billing', 'message_logs', 'call_logs'],
  };
}

// ─── 2 · La cola de intake ───────────────────────────────────────────────────

/**
 * Quién llega sin el formulario firmado. Envoltorio de `colaIntake()`, la misma
 * función que pinta el panel: el número del agente y el de la pantalla no se
 * pueden contradecir porque son la misma cuenta.
 */
export async function colaDeIntake(args?: { dias?: number }): Promise<ResultadoHerramienta> {
  const cola = await colaIntake({ dias: args?.dias });

  /**
   * El filo de la regla 2 está en esta función.
   *
   * `FilaIntake` trae `paciente`, `nombre`, `apellido`, `telefono` y `email`
   * porque la PANTALLA los necesita para el botón de llamar. Acá se descartan
   * todos y queda el código de caso. Si alguien agrega un campo a `FilaIntake`,
   * este `pick` explícito es lo que evita que se cuele: no es un `omit`, es una
   * lista blanca.
   */
  const publico = (f: (typeof cola.filas)[number]) => ({
    caso: f.caseCode,
    cita: iso(f.cita),
    diasHasta: f.diasHasta,
    nivel: f.nivel,
    pctCompleto: f.pct,
    faltan: f.faltan,
    yaLoContactamos: f.ultimoContacto
      ? { canal: f.ultimoContacto.canal, hace: `${horasDesde(f.ultimoContacto.cuando)} h` }
      : null,
    envioBloqueado: f.bloqueoEnvio,
  });

  return {
    data: {
      ventanaDias: args?.dias ?? DIAS_VENTANA,
      citasHoy: cola.citasHoy,
      citasEnLaVentana: cola.citasEnVentana,
      totalSinFirmar: cola.filas.length + cola.yaLlegaron.length,
      // Los que ya llegaron no son una llamada: se firman en la tablet.
      yaLlegaronSinFirmar: cola.yaLlegaron.length,
      mostrando: Math.min(cola.filas.length, MAX_FILAS),
      casos: cola.filas.slice(0, MAX_FILAS).map(publico),
    },
    sources: ['cases', 'appointments', 'patients', 'message_logs', 'call_logs'],
    count: cola.filas.length,
  };
}

// ─── 3 · Notas sin firmar ────────────────────────────────────────────────────

/**
 * Cuántas notas debe cada provider. Envoltorio de `getNotesSummary()`, el mismo
 * criterio de "cita que debe nota" que usa la pantalla de supervisión.
 *
 * Es la única que devuelve nombres, y son de PROVIDER — ver el encabezado.
 */
export async function notasSinFirmar(): Promise<ResultadoHerramienta> {
  const resumen = await getNotesSummary({});

  return {
    data: {
      totales: resumen.totales,
      // Solo los que deben algo, ordenados por lo que duele: la más vieja.
      providers: resumen.providers
        .filter((p) => p.sinNota > 0 || p.borradores > 0)
        .sort((a, b) => b.masVieja - a.masVieja)
        .slice(0, MAX_FILAS)
        .map((p) => ({
          provider: p.providerName,
          sinNingunaNota: p.sinNota,
          borradores: p.borradores,
          firmadas: p.firmadas,
          diasDeLaMasVieja: p.masVieja,
        })),
    },
    sources: ['appointments', 'visit_notes', 'providers'],
    count: resumen.totales.pendientes,
  };
}

// ─── 4 · Los atrasos del front office ────────────────────────────────────────

/**
 * Los tres relojes de deuda acumulada. Envoltorio de `atrasosRecepcion()`, el
 * mismo módulo que pinta el bloque del panel.
 */
export async function atrasosDeRecepcion(): Promise<ResultadoHerramienta> {
  const a = await atrasosRecepcion();

  // Sin nombres: código de caso y cuánto lleva esperando.
  const publico = (f: { caseCode: string; desde: Date }) => ({
    caso: f.caseCode,
    esperandoHace: `${horasDesde(f.desde)} h`,
  });

  return {
    data: {
      criterios: {
        sinPortal: `referido nuevo con más de ${HORAS_SIN_PORTAL} h y sin portal enviado`,
        intakeSinRespuesta: `portal enviado hace más de ${HORAS_INTAKE_SIN_RESPUESTA} h y el paciente no contestó`,
        confirmadoSinAgenda: `confirmó hace más de ${HORAS_CONFIRMADO_SIN_AGENDA} h y sigue sin cita`,
      },
      sinPortal: { total: a.sinPortal.length, casos: a.sinPortal.map(publico) },
      intakeSinRespuesta: { total: a.intakeSinRespuesta.length, casos: a.intakeSinRespuesta.map(publico) },
      confirmadoSinAgenda: { total: a.confirmadoSinAgenda.length, casos: a.confirmadoSinAgenda.map(publico) },
      // Las dos pileta grandes, que son contexto y no una lista.
      intakePendienteTotal: a.intakePendiente,
      sinAgendarTotal: a.sinAgendar,
    },
    sources: ['cases'],
    count: a.sinPortal.length + a.intakeSinRespuesta.length + a.confirmadoSinAgenda.length,
  };
}

// ─── 5 · Saldos y cobros ─────────────────────────────────────────────────────

/**
 * La plata. El saldo total y qué casos la concentran — por código, nunca por
 * paciente.
 */
export async function saldosYCobros(): Promise<ResultadoHerramienta> {
  const { desde, hasta } = rangoDeHoy();

  const [totales, cobradoHoy, porCaso] = await Promise.all([
    db.appointmentBilling.aggregate({ _sum: { totalCost: true, amountPaid: true, balanceDue: true } }),
    db.appointmentBilling.aggregate({
      _sum: { amountPaid: true },
      where: { updatedAt: { gte: desde, lt: hasta } },
    }),
    /**
     * Los casos que más deben. Se agrupa por caso y NO por paciente a
     * propósito: el caso tiene código y el paciente tiene nombre.
     */
    db.$queryRaw<Array<{ caseCode: string; saldo: number }>>`
      SELECT c."caseCode" AS "caseCode", SUM(ab."balanceDue")::float AS saldo
      FROM appointment_billing ab
      JOIN appointments a ON a.id = ab."appointmentId"
      JOIN cases c ON c.id = a."caseId"
      WHERE ab."balanceDue" > 0 AND c."deletedAt" IS NULL
      GROUP BY c."caseCode"
      ORDER BY saldo DESC
      LIMIT 10
    `,
  ]);

  return {
    data: {
      cargadoTotal: n(totales._sum.totalCost),
      pagadoTotal: n(totales._sum.amountPaid),
      saldoPendienteTotal: n(totales._sum.balanceDue),
      cobradoHoy: n(cobradoHoy._sum.amountPaid),
      losQueMasDeben: porCaso.map((r) => ({ caso: r.caseCode, saldo: r.saldo })),
    },
    sources: ['appointment_billing', 'appointments', 'cases'],
  };
}

// ─── 6 · Pedidos de los bufetes ──────────────────────────────────────────────

/**
 * Qué pidieron los despachos y a qué escritorio le cayó. Es el único trabajo de
 * la clínica que llega de afuera y hoy solo se ve entrando a Mensajes.
 */
export async function pedidosDeBufetes(): Promise<ResultadoHerramienta> {
  const hilos = await db.messageThread.findMany({
    where: { type: 'REQUEST' },
    orderBy: { lastEntryAt: 'desc' },
    take: MAX_FILAS,
    select: {
      subject: true, priority: true, lastEntryAt: true, createdAt: true,
      case: { select: { caseCode: true } },
    },
  });

  return {
    data: {
      total: hilos.length,
      urgentes: hilos.filter((h) => h.priority === 'URGENT').length,
      /**
       * El `subject` sí viaja: lo escribió el bufete y arranca con el nombre del
       * despacho, no con el del paciente (ver la ruta `vigia/request`). Es lo
       * único que dice de qué se trata el pedido.
       */
      pedidos: hilos.map((h) => ({
        asunto: h.subject,
        caso: h.case?.caseCode ?? null,
        prioridad: h.priority,
        pedidoHace: `${horasDesde(h.createdAt)} h`,
        ultimoMovimientoHace: h.lastEntryAt ? `${horasDesde(h.lastEntryAt)} h` : null,
      })),
    },
    sources: ['message_threads', 'cases'],
    count: hilos.length,
  };
}

// ─── 7 · Un caso, por su código ──────────────────────────────────────────────

/**
 * Todo lo esencial de UN caso. Se pide por CÓDIGO y nunca por nombre: si el
 * código no existe, no se busca por aproximación — se dice que no está.
 */
export async function resumenDeCaso(args: { caso: string }): Promise<ResultadoHerramienta> {
  const codigo = (args.caso ?? '').trim();
  if (!codigo) {
    return { data: { error: 'FALTA_EL_CODIGO' }, sources: [] };
  }

  const kase = await db.case.findFirst({
    where: { caseCode: { equals: codigo, mode: 'insensitive' }, deletedAt: null },
    select: {
      id: true, caseCode: true, status: true, caseType: true,
      accidentDate: true, createdAt: true, closedAt: true,
      intakeFormCompletedAt: true, intakeFormSentAt: true,
    },
  });
  if (!kase) {
    return {
      data: { error: 'NO_EXISTE', mensaje: `No hay ningún caso con el código ${codigo}.` },
      sources: ['cases'],
    };
  }

  const [citas, proxima, ultima, saldo] = await Promise.all([
    db.appointment.groupBy({ by: ['status'], where: { caseId: kase.id }, _count: true }),
    db.appointment.findFirst({
      where: { caseId: kase.id, scheduledFor: { gte: new Date() }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
      orderBy: { scheduledFor: 'asc' },
      select: { scheduledFor: true, type: true },
    }),
    db.appointment.findFirst({
      where: { caseId: kase.id, scheduledFor: { lt: new Date() }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
      orderBy: { scheduledFor: 'desc' },
      select: { scheduledFor: true, status: true },
    }),
    db.appointmentBilling.aggregate({
      _sum: { totalCost: true, amountPaid: true, balanceDue: true },
      where: { appointment: { caseId: kase.id } },
    }),
  ]);

  return {
    data: {
      caso: kase.caseCode,
      estado: kase.status,
      tipo: kase.caseType,
      fechaAccidente: iso(kase.accidentDate),
      abierto: iso(kase.createdAt),
      cerrado: iso(kase.closedAt),
      intakeFirmado: !!kase.intakeFormCompletedAt,
      intakeEnviado: iso(kase.intakeFormSentAt),
      citasPorEstado: Object.fromEntries(citas.map((g) => [g.status, g._count])),
      proximaCita: proxima ? { fecha: iso(proxima.scheduledFor), tipo: proxima.type } : null,
      ultimaCita: ultima ? { fecha: iso(ultima.scheduledFor), estado: ultima.status } : null,
      cargado: n(saldo._sum.totalCost),
      pagado: n(saldo._sum.amountPaid),
      saldo: n(saldo._sum.balanceDue),
    },
    sources: ['cases', 'appointments', 'appointment_billing'],
  };
}

// ─── El registro ─────────────────────────────────────────────────────────────

/**
 * El catálogo que se le ofrece al modelo.
 *
 * Ninguna recibe el alcance: CIFO ve la clínica entera y no hay filtro que
 * heredar. Por eso las firmas son más simples que las de Vigía — y por eso la
 * garantía tuvo que mudarse a "ningún nombre sale de acá".
 */
export const CIFO_TOOLS: readonly Herramienta<AlcanceClinica>[] = [
  {
    name: 'pulso_del_dia',
    description: 'Cómo viene el día: citas de hoy por estado, cuántos están en el edificio, cuántos faltan por llegar, no-shows, cobrado hoy, y cuántos SMS/correos y llamadas se hicieron hoy. Usala para la primera pregunta de panorama.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: () => pulsoDelDia(),
  },
  {
    name: 'cola_de_intake',
    description: 'Los pacientes que llegan SIN el formulario de admisión firmado, por día, con qué les falta y si ya se los contactó. Es la cola del panel de recepción. Devuelve códigos de caso, nunca nombres.',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'Cuántos días adelante mirar. Por defecto 5.' } },
      additionalProperties: false,
    },
    run: (_a: AlcanceClinica, args: { dias?: number }) => colaDeIntake(args),
  },
  {
    name: 'notas_sin_firmar',
    description: 'Cuántas notas clínicas debe cada provider: sin ninguna nota escrita, borradores, y la antigüedad de la más vieja. Ordenado por la más vieja. Es la única herramienta que devuelve nombres, y son de provider.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: () => notasSinFirmar(),
  },
  {
    name: 'atrasos_de_recepcion',
    description: 'Los tres atrasos del front office: referidos nuevos sin portal enviado, intake enviado sin respuesta del paciente, y confirmados que siguen sin cita. Mide tiempo TRANSCURRIDO, a diferencia de cola_de_intake que mide el que falta.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: () => atrasosDeRecepcion(),
  },
  {
    name: 'saldos_y_cobros',
    description: 'La plata: cargado, pagado y saldo pendiente de toda la clínica, lo cobrado hoy, y los diez casos que concentran más deuda (por código de caso).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: () => saldosYCobros(),
  },
  {
    name: 'pedidos_de_bufetes',
    description: 'Los pedidos que mandaron los bufetes por la mensajería: asunto, caso, prioridad y hace cuánto esperan. Es el trabajo que le entra a la clínica desde afuera.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: () => pedidosDeBufetes(),
  },
  {
    name: 'resumen_de_caso',
    description: 'Todo lo esencial de UN caso por su CÓDIGO (por ejemplo MVA-3419): estado, intake, citas por estado, próxima y última cita, y saldo. No busca por nombre de paciente: si te dan un nombre, pedí el código.',
    parameters: {
      type: 'object',
      properties: { caso: { type: 'string', description: 'El código del caso.' } },
      required: ['caso'],
      additionalProperties: false,
    },
    run: (_a: AlcanceClinica, args: { caso: string }) => resumenDeCaso(args),
  },
] as const;
