import { db, type Prisma } from '@precision-medical/database';
import type { SessionLawyer } from '@/lib/get-session-lawyer';
import {
  lawyerCaseFilter, ACTIVE_STATUSES, CLOSED_STATUSES,
} from '@/lib/attorney-portal';
import { ZONA_CLINICA } from '@/lib/fechas';
import { colaDeAtencion, DIAS_MESETA } from './queue';

/**
 * Vigía · las herramientas que puede usar el modelo.
 *
 * Dos reglas que gobiernan TODO este archivo:
 *
 * 1. **El alcance no se pide, se hereda.** Cada función recibe la sesión y arma
 *    su `where` con `lawyerCaseFilter()` adentro. Ninguna acepta un `firmId` ni
 *    nada que amplíe lo que se ve: si el modelo inventara un identificador de
 *    otro despacho, la consulta igual devuelve cero. No hay SQL libre a
 *    propósito — una herramienta que ejecute consultas arbitrarias es la misma
 *    cosa que darle la clínica entera a quien sepa preguntar.
 *
 * 2. **Los nombres de paciente son la EXCEPCIÓN, no la regla.** Todo se
 *    identifica por CÓDIGO DE CASO y ninguna herramienta devuelve nombres…
 *    salvo `buscar_paciente`, que existe porque el abogado piensa en personas,
 *    no en códigos (Erick, 2026-08-26).
 *
 *    Eso tiene un costo declarado: cuando se busca por nombre, ese nombre viaja
 *    al proveedor del modelo — en la pregunta y en la respuesta. No hay forma de
 *    buscar por nombre sin mandarlo. **Depende del BAA con OpenAI**, que estaba
 *    en trámite cuando esto se escribió.
 *
 *    Las otras cinco herramientas siguen sin devolver un solo nombre, así que el
 *    único camino por el que sale PHI identificable es ése, y es fácil de
 *    encontrar y de apagar: se borra la herramienta del registro y listo.
 *
 * Si alguien agrega una herramienta acá, la primera regla no se negocia. La
 * segunda es fácil de romper sin querer: basta un `select` que incluya
 * `patient`.
 */

/** Cada herramienta devuelve esto: el dato y de dónde salió. */
export interface ToolResult {
  data: unknown;
  /** Tablas que se leyeron — la UI las muestra como "fuente". */
  sources: string[];
  /** Filas consideradas, para el pie de la respuesta. */
  count?: number;
}

const MAX_ROWS = 25;

/** Decimal de Prisma → número. */
function n(v: unknown): number {
  return v == null ? 0 : Number(v);
}

/** `YYYY-MM-DD` en la zona de la clínica, no en la del servidor. */
function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function rangoDeHoy(): { desde: Date; hasta: Date } {
  const hoy = iso(new Date())!;
  const [y, m, d] = hoy.split('-').map(Number);
  const tentativo = Date.UTC(y!, m! - 1, d!, 12, 0, 0);
  const horaLocal = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: ZONA_CLINICA, hour12: false, hour: '2-digit' })
      .formatToParts(new Date(tentativo)).find((p) => p.type === 'hour')?.value ?? '12',
  );
  const desde = new Date(Date.UTC(y!, m! - 1, d!, 12 - horaLocal, 0, 0));
  return { desde, hasta: new Date(desde.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Resuelve un código de caso DENTRO del alcance.
 *
 * Devuelve null cuando no existe o cuando existe pero es de otro despacho — a
 * propósito no se distinguen los dos casos: decir "existe pero no podés verlo"
 * ya es filtrar información sobre los casos ajenos.
 */
async function casoEnAlcance(lawyer: SessionLawyer, caseCode: string): Promise<{ id: string; caseCode: string } | null> {
  return db.case.findFirst({
    where: { AND: [lawyerCaseFilter(lawyer), { caseCode: { equals: caseCode.trim(), mode: 'insensitive' } }] },
    select: { id: true, caseCode: true },
  });
}

// ─── 1 · Métricas del despacho ───────────────────────────────────────────────

export async function metricasDelBufete(lawyer: SessionLawyer): Promise<ToolResult> {
  const scope = lawyerCaseFilter(lawyer);
  const { desde, hasta } = rangoDeHoy();

  const [activos, cerrados, firmasPendientes, citasHoy, saldo] = await Promise.all([
    db.case.count({ where: { ...scope, status: { in: ACTIVE_STATUSES as unknown as never[] } } }),
    db.case.count({ where: { ...scope, status: { in: CLOSED_STATUSES as unknown as never[] } } }),
    db.case.count({
      where: { ...scope, signatureExempt: false, lienSignatures: { none: { signerType: 'ATTORNEY' } } },
    }),
    db.appointment.count({
      where: { case: scope, scheduledFor: { gte: desde, lt: hasta }, status: { not: 'CANCELLED' } },
    }),
    db.appointmentBilling.aggregate({
      _sum: { balanceDue: true },
      where: { appointment: { case: scope } },
    }),
  ]);

  return {
    data: {
      casosActivos: activos,
      casosCerrados: cerrados,
      firmasDeAbogadoPendientes: firmasPendientes,
      citasHoy,
      saldoPendienteTotal: n(saldo._sum.balanceDue),
    },
    sources: ['cases', 'appointments', 'appointment_billing', 'lien_signatures'],
  };
}

// ─── 2 · Buscar casos ────────────────────────────────────────────────────────

export async function buscarCasos(
  lawyer: SessionLawyer,
  args: { estado?: string; conFirmaPendiente?: boolean; limite?: number },
): Promise<ToolResult> {
  const scope = lawyerCaseFilter(lawyer);
  const where: Record<string, unknown> = { ...scope };

  if (args.estado === 'activos') where.status = { in: ACTIVE_STATUSES as unknown as never[] };
  else if (args.estado === 'cerrados') where.status = { in: CLOSED_STATUSES as unknown as never[] };

  if (args.conFirmaPendiente) {
    where.signatureExempt = false;
    where.lienSignatures = { none: { signerType: 'ATTORNEY' } };
  }

  // El TOTAL va aparte de las filas, siempre.
  // Sin esto el modelo lee 25 filas y contesta "tenés 25 casos" cuando hay 91:
  // no está mintiendo, está contando lo único que le dimos. Cualquier
  // herramienta que recorte tiene que decir cuánto recortó.
  const [total, rows] = await Promise.all([
    db.case.count({ where }),
    db.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(args.limite ?? MAX_ROWS, MAX_ROWS),
      select: {
        caseCode: true, status: true, caseType: true, accidentDate: true, createdAt: true,
        signatureExempt: true,
        lienSignatures: { where: { signerType: 'ATTORNEY' }, select: { id: true }, take: 1 },
      },
    }),
  ]);

  return {
    data: {
      totalQueCumplen: total,
      mostrando: rows.length,
      ...(total > rows.length ? { aviso: `Hay ${total} en total; estos son los ${rows.length} más recientes.` } : {}),
      casos: rows.map((c) => ({
        caso: c.caseCode,
        estado: c.status,
        tipo: c.caseType,
        fechaAccidente: iso(c.accidentDate),
        abierto: iso(c.createdAt),
        firmadoPorAbogado: c.lienSignatures.length > 0,
        exentoDeFirma: c.signatureExempt,
      })),
    },
    sources: ['cases', 'lien_signatures'],
    count: total,
  };
}

// ─── 3 · Resumen de un caso ──────────────────────────────────────────────────

export async function resumenDeCaso(lawyer: SessionLawyer, args: { caso: string }): Promise<ToolResult> {
  const target = await casoEnAlcance(lawyer, args.caso);
  if (!target) {
    return { data: { error: 'FUERA_DE_ALCANCE', mensaje: 'Ese caso no está en el alcance de esta sesión.' }, sources: ['cases'] };
  }

  const [caso, citas, ultima, saldo] = await Promise.all([
    db.case.findUnique({
      where: { id: target.id },
      select: {
        caseCode: true, status: true, caseType: true, accidentDate: true, createdAt: true,
        signatureExempt: true,
        lienSignatures: { select: { signerType: true, signedAt: true } },
      },
    }),
    db.appointment.groupBy({
      by: ['status'],
      where: { caseId: target.id },
      _count: true,
    }),
    db.appointment.findFirst({
      where: { caseId: target.id, status: { not: 'CANCELLED' } },
      orderBy: { scheduledFor: 'desc' },
      select: { scheduledFor: true, type: true, status: true },
    }),
    db.appointmentBilling.aggregate({
      _sum: { totalCost: true, amountPaid: true, balanceDue: true },
      where: { appointment: { caseId: target.id } },
    }),
  ]);

  const porEstado: Record<string, number> = {};
  for (const g of citas) porEstado[g.status] = g._count;

  const diasDesdeUltima = ultima
    ? Math.floor((Date.now() - ultima.scheduledFor.getTime()) / 86_400_000)
    : null;

  return {
    data: {
      caso: caso?.caseCode,
      estado: caso?.status,
      tipo: caso?.caseType,
      fechaAccidente: iso(caso?.accidentDate),
      abierto: iso(caso?.createdAt),
      citasPorEstado: porEstado,
      ultimaCita: ultima ? { fecha: iso(ultima.scheduledFor), tipo: ultima.type, estado: ultima.status } : null,
      diasDesdeLaUltimaCita: diasDesdeUltima,
      firmas: (caso?.lienSignatures ?? []).map((s) => ({ quien: s.signerType, fecha: iso(s.signedAt) })),
      exentoDeFirma: caso?.signatureExempt,
      cargado: n(saldo._sum.totalCost),
      pagado: n(saldo._sum.amountPaid),
      saldo: n(saldo._sum.balanceDue),
    },
    sources: ['cases', 'appointments', 'lien_signatures', 'appointment_billing'],
  };
}

// ─── 4 · Facturación de un caso ──────────────────────────────────────────────

export async function facturacionDeCaso(lawyer: SessionLawyer, args: { caso: string }): Promise<ToolResult> {
  const target = await casoEnAlcance(lawyer, args.caso);
  if (!target) {
    return { data: { error: 'FUERA_DE_ALCANCE', mensaje: 'Ese caso no está en el alcance de esta sesión.' }, sources: ['cases'] };
  }

  const filas = await db.appointmentBilling.findMany({
    where: { appointment: { caseId: target.id } },
    orderBy: { createdAt: 'asc' },
    take: 60,
    select: {
      serviceCode: true, serviceDescription: true,
      totalCost: true, amountPaid: true, balanceDue: true,
      appointment: { select: { scheduledFor: true, type: true } },
    },
  });

  const total = filas.reduce((a, f) => a + n(f.totalCost), 0);
  const pagado = filas.reduce((a, f) => a + n(f.amountPaid), 0);
  const saldo = filas.reduce((a, f) => a + n(f.balanceDue), 0);

  return {
    data: {
      caso: target.caseCode,
      cargado: total, pagado, saldo,
      renglones: filas.map((f) => ({
        fecha: iso(f.appointment?.scheduledFor),
        tipoDeCita: f.appointment?.type ?? null,
        codigo: f.serviceCode,
        descripcion: f.serviceDescription,
        cargo: n(f.totalCost),
        pagado: n(f.amountPaid),
        saldo: n(f.balanceDue),
      })),
    },
    sources: ['appointment_billing', 'appointments'],
    count: filas.length,
  };
}

// ─── 5 · Liens sin firmar ────────────────────────────────────────────────────

export async function liensPendientes(lawyer: SessionLawyer): Promise<ToolResult> {
  const scope = lawyerCaseFilter(lawyer);

  // Anotado: sacar el objeto de la llamada hace que TS ensanche `signerType` a
  // `string` y deje de encajar con el enum de Prisma.
  const where: Prisma.CaseWhereInput = {
    ...scope, signatureExempt: false, lienSignatures: { none: { signerType: 'ATTORNEY' } },
  };

  const [total, rows] = await Promise.all([
    db.case.count({ where }),
    db.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      select: {
        caseCode: true, status: true, createdAt: true,
        // La del paciente sí importa: un lien donde el paciente ya firmó y el
        // abogado no es exactamente lo que este portal existe para destrabar.
        lienSignatures: { where: { signerType: 'PATIENT' }, select: { signedAt: true }, take: 1 },
      },
    }),
  ]);

  return {
    data: {
      totalPendientes: total,
      mostrando: rows.length,
      ...(total > rows.length ? { aviso: `Faltan firmar ${total} en total; estos son los ${rows.length} más recientes.` } : {}),
      casos: rows.map((c) => ({
        caso: c.caseCode,
        estado: c.status,
        abierto: iso(c.createdAt),
        pacienteYaFirmo: c.lienSignatures.length > 0,
        pacienteFirmoEl: iso(c.lienSignatures[0]?.signedAt),
        enLiquidacion: (CLOSED_STATUSES as readonly string[]).includes(c.status),
      })),
    },
    sources: ['cases', 'lien_signatures'],
    count: total,
  };
}

// ─── 6 · Casos frenados ──────────────────────────────────────────────────────

/**
 * La cola de "necesita atención", por REGLAS nuestras.
 *
 * Esto no lo decide el modelo: el criterio de qué está frenado es del negocio y
 * tiene que dar el mismo número acá, en el board y en el aviso nocturno. El
 * modelo solo lo redacta.
 */
export async function casosFrenados(lawyer: SessionLawyer, args?: { diasSinCita?: number }): Promise<ToolResult> {
  const { total, filas } = await colaDeAtencion(lawyer, {
    diasSinCita: args?.diasSinCita,
    limite: MAX_ROWS,
  });

  return {
    data: {
      // Los dos relojes, explícitos: el modelo repite el criterio cuando le
      // preguntan "¿por qué está frenado?", y con uno solo contestaba que era
      // por las citas incluso en las filas que son por el lien.
      criterio: {
        tratamiento: `${args?.diasSinCita ?? DIAS_MESETA} días sin cita nueva`,
        lien: 'caso ya cerrado y sin la firma del abogado en el lien',
      },
      totalFrenados: total,
      mostrando: filas.length,
      ...(total > filas.length
        ? { aviso: `Hay ${total} en total; estos son los ${filas.length} más urgentes.` }
        : {}),
      // Se le saca el `caseId`: el modelo trabaja con CÓDIGOS. El id interno lo
      // usa la pantalla para armar el link, de este lado.
      // Se le saca el `caseId` Y el `paciente`: el modelo trabaja con CÓDIGOS.
      // El nombre es para la pantalla; el id lo usa el link, de este lado.
      casos: filas.map(({ caseId: _id, prioridad: _p, paciente: _pac, ...resto }) => resto),
    },
    sources: ['cases', 'appointments', 'lien_signatures'],
    count: total,
  };
}

// ─── 7 · Buscar por paciente ─────────────────────────────────────────────────

/**
 * Los casos de una persona, buscando por su nombre.
 *
 * Cada palabra tiene que aparecer en el nombre O en el apellido: así "Juan
 * Pérez" encuentra a Juan Pérez sin traer a todos los Juan ni a todos los Pérez,
 * y "Perez Juan" funciona igual — el abogado no tiene por qué saber en qué orden
 * los cargamos.
 *
 * El alcance manda igual que siempre: se buscan PACIENTES DE SUS CASOS, no
 * pacientes de la clínica. Un apellido común no puede convertirse en un padrón.
 */
export async function buscarPaciente(lawyer: SessionLawyer, args: { nombre: string }): Promise<ToolResult> {
  const q = (args.nombre ?? '').trim();
  if (q.length < 2) {
    return { data: { error: 'NOMBRE_MUY_CORTO', mensaje: 'Hacen falta al menos dos letras.' }, sources: [] };
  }

  const palabras = q.split(/\s+/).filter(Boolean).slice(0, 4);
  const porPalabra: Prisma.CaseWhereInput[] = palabras.map((palabra) => ({
    patient: {
      OR: [
        { firstName: { contains: palabra, mode: 'insensitive' } },
        { lastName:  { contains: palabra, mode: 'insensitive' } },
      ],
    },
  }));

  const where: Prisma.CaseWhereInput = { AND: [lawyerCaseFilter(lawyer), ...porPalabra] };

  const [total, rows] = await Promise.all([
    db.case.count({ where }),
    db.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        caseCode: true, status: true, caseType: true, accidentDate: true, createdAt: true,
        signatureExempt: true,
        patient: { select: { firstName: true, lastName: true } },
        lienSignatures: { where: { signerType: 'ATTORNEY' }, select: { id: true }, take: 1 },
      },
    }),
  ]);

  return {
    data: {
      buscado: q,
      totalQueCoinciden: total,
      mostrando: rows.length,
      ...(total > rows.length ? { aviso: `Hay ${total} coincidencias; estas son las ${rows.length} más recientes.` } : {}),
      casos: rows.map((c) => ({
        paciente: `${c.patient?.firstName ?? ''} ${c.patient?.lastName ?? ''}`.trim() || null,
        caso: c.caseCode,
        estado: c.status,
        tipo: c.caseType,
        fechaAccidente: iso(c.accidentDate),
        abierto: iso(c.createdAt),
        firmadoPorAbogado: c.lienSignatures.length > 0,
        exentoDeFirma: c.signatureExempt,
      })),
    },
    sources: ['cases', 'patients'],
    count: total,
  };
}

// ─── Registro ────────────────────────────────────────────────────────────────

/**
 * El catálogo que se le ofrece al modelo.
 *
 * `parameters` es JSON Schema. Los nombres van en español porque las preguntas
 * y las respuestas son en español: al modelo le cuesta menos elegir bien cuando
 * el vocabulario de las herramientas es el mismo que el de la pregunta.
 */
export const VIGIA_TOOLS = [
  {
    name: 'buscar_paciente',
    description: 'Encuentra los casos de un paciente por su NOMBRE o apellido. Usala SIEMPRE que la pregunta mencione a una persona, aunque sea solo un apellido o una sola palabra que parezca un nombre propio ("los casos de Peterson", "¿qué tiene Maria?"). Es la única herramienta que busca por nombre. Devuelve el nombre del paciente junto a cada caso.',
    parameters: {
      type: 'object',
      properties: { nombre: { type: 'string', description: 'Nombre, apellido o los dos.' } },
      required: ['nombre'],
      additionalProperties: false,
    },
    run: (l: SessionLawyer, a: { nombre: string }) => buscarPaciente(l, a),
  },
  {
    name: 'metricas_del_bufete',
    description: 'Números generales del despacho: casos activos, cerrados, firmas de abogado pendientes, citas de hoy y saldo total pendiente. Usar para preguntas de panorama.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: (l: SessionLawyer) => metricasDelBufete(l),
  },
  {
    name: 'buscar_casos',
    description: 'Lista casos del despacho con su estado, tipo, fecha de accidente y si tienen la firma del abogado. Devuelve como mucho 25. NO busca por nombre de paciente ni acepta un nombre como filtro: para eso está buscar_paciente.',
    parameters: {
      type: 'object',
      properties: {
        estado: { type: 'string', enum: ['activos', 'cerrados'], description: 'Filtra por grupo de estado.' },
        conFirmaPendiente: { type: 'boolean', description: 'Solo los que esperan la firma del abogado.' },
        limite: { type: 'number', description: 'Máximo de filas, tope 25.' },
      },
      additionalProperties: false,
    },
    run: (l: SessionLawyer, a: Record<string, never>) => buscarCasos(l, a),
  },
  {
    name: 'resumen_de_caso',
    description: 'Todo lo esencial de UN caso por su código: estado, citas por estado, última cita, días sin movimiento, firmas y saldo.',
    parameters: {
      type: 'object',
      properties: { caso: { type: 'string', description: 'Código del caso, por ejemplo 2026-0142.' } },
      required: ['caso'],
      additionalProperties: false,
    },
    run: (l: SessionLawyer, a: { caso: string }) => resumenDeCaso(l, a),
  },
  {
    name: 'facturacion_de_caso',
    description: 'El desglose de cargos de un caso, renglón por renglón, con fecha de la cita, código de servicio, cargo, pagado y saldo.',
    parameters: {
      type: 'object',
      properties: { caso: { type: 'string', description: 'Código del caso.' } },
      required: ['caso'],
      additionalProperties: false,
    },
    run: (l: SessionLawyer, a: { caso: string }) => facturacionDeCaso(l, a),
  },
  {
    name: 'liens_pendientes',
    description: 'Casos que esperan la firma del abogado en el lien, indicando si el paciente ya firmó y si el caso ya está cerrado o en liquidación.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: (l: SessionLawyer) => liensPendientes(l),
  },
  {
    name: 'casos_frenados',
    description: 'Casos que necesitan atención, con el motivo: tratamiento sin movimiento, sin ninguna cita, o el lien sin firmar en un caso QUE YA CERRÓ. Ordenados por urgencia. No incluye los liens sin firmar de casos abiertos: para esos está liens_pendientes.',
    parameters: {
      type: 'object',
      properties: { diasSinCita: { type: 'number', description: 'Cuántos días sin cita cuentan como frenado. Por defecto 21.' } },
      additionalProperties: false,
    },
    run: (l: SessionLawyer, a: { diasSinCita?: number }) => casosFrenados(l, a),
  },
] as const;

export type VigiaToolName = (typeof VIGIA_TOOLS)[number]['name'];

/** Ejecuta una herramienta por nombre. Un nombre desconocido no revienta: se le avisa al modelo. */
export async function ejecutarHerramienta(
  lawyer: SessionLawyer,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = VIGIA_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return { data: { error: 'HERRAMIENTA_DESCONOCIDA', name }, sources: [] };
  }
  // El `as never` es por el union de firmas del registro; cada `run` valida lo suyo.
  return (tool.run as (l: SessionLawyer, a: unknown) => Promise<ToolResult>)(lawyer, args as never);
}
