import { Prisma } from '@precision-medical/database';

/**
 * Qué visita DEBE tener nota, y en qué estado está.
 *
 * ─── Por qué este archivo existe ────────────────────────────────────────────
 *
 * El criterio vivía escrito a mano dentro de `/api/admin/pending-notes` y otra
 * vez, distinto, en el KPI de Mi Día. Dos definiciones de "pendiente" se separan
 * en el primer cambio y el doctor termina viendo un número y su admin otro sobre
 * los mismos datos. A partir de acá vive UNA sola vez y lo consumen las tres
 * pantallas.
 *
 * ─── La regla estructural: se listan VISITAS, no notas ──────────────────────
 *
 * La fila de `visit_notes` se crea en el PRIMER guardado. Un provider que
 * atendió y no escribió nada **no deja fila**, así que cualquier consulta que
 * arranque desde `visit_notes` es ciega justo al peor caso — medido en agosto de
 * 2026: 38 de 53 pendientes eran de ese tipo. Todo acá arranca desde
 * `appointment` y mira la nota por izquierda.
 */

/** Los tres estados que ve el admin, más el anulado que queda fuera del default. */
export type EstadoNota = 'none' | 'draft' | 'signed' | 'voided';

export const ESTADOS_PENDIENTES: EstadoNota[] = ['none', 'draft'];

/**
 * Una cita "califica" (debería tener nota) cuando NO se canceló, el paciente no
 * faltó, y efectivamente se atendió.
 *
 * Las citas futuras no cuentan: `checkedInAt` o un estado que ya avanzó son lo
 * que dice que el paciente estuvo. Sin esa condición la cola se llenaría con la
 * agenda de la semana que viene.
 */
export const CITA_CALIFICA: Prisma.AppointmentWhereInput = {
  status: { notIn: ['CANCELLED', 'NO_SHOW'] },
  OR: [
    { checkedInAt: { not: null } },
    { status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
  ],
};

/** La cita no tiene nota, o la tiene abierta. Es la definición de "pendiente". */
export const NOTA_PENDIENTE: Prisma.AppointmentWhereInput = {
  OR: [
    { visitNote: { is: null } },
    { visitNote: { status: 'DRAFT' } },
  ],
};

/** El `where` de la cola de pendientes, sin recortes de alcance. */
export function wherePendientes(): Prisma.AppointmentWhereInput {
  return { AND: [CITA_CALIFICA, NOTA_PENDIENTE] };
}

export interface FiltrosNotas {
  /** Estados a incluir. Vacío = los pendientes (`none` + `draft`). */
  estados?: EstadoNota[];
  providerId?: string;
  clinicId?: string;
  /** Rango sobre la fecha de la VISITA. */
  desde?: Date;
  hasta?: Date;
  /**
   * Antigüedad mínima en días. Se traduce a un tope sobre `scheduledFor`, no a
   * un cálculo por fila: así lo resuelve el índice y no una pasada completa.
   */
  minDias?: number;
  /** Texto libre: nombre del paciente o código de caso. */
  q?: string;
}

/** El `where` de un estado suelto. Se combinan con OR. */
function whereEstado(e: EstadoNota): Prisma.AppointmentWhereInput {
  if (e === 'none') return { visitNote: { is: null } };
  return { visitNote: { status: e === 'draft' ? 'DRAFT' : e === 'signed' ? 'SIGNED' : 'VOIDED' } };
}

/**
 * El `where` completo de la pantalla de supervisión.
 *
 * El buscador cubre nombre del paciente y código de caso — los dos con los que
 * llega la pregunta ("la nota de López", "el GM-3175"). El nombre se compara en
 * SQL, igual que en la lista de Pacientes: las columnas `firstName`/`lastName`
 * NO están cifradas (`dec()` se aplica al mostrar porque devuelve el original
 * cuando el valor no viene cifrado, no porque estas dos lo estén).
 */
export function whereNotas(f: FiltrosNotas): Prisma.AppointmentWhereInput {
  const estados = f.estados?.length ? f.estados : ESTADOS_PENDIENTES;
  const and: Prisma.AppointmentWhereInput[] = [
    CITA_CALIFICA,
    { OR: estados.map(whereEstado) },
  ];

  if (f.providerId) and.push({ providerId: f.providerId });
  if (f.clinicId)   and.push({ clinicId: f.clinicId });

  const rango: Prisma.DateTimeFilter = {};
  if (f.desde) rango.gte = f.desde;
  if (f.hasta) rango.lt = f.hasta;
  if (f.minDias && f.minDias > 0) {
    // "Más de N días" = la visita ocurrió ANTES del corte. Se compara contra el
    // inicio de hoy para que una visita de esta mañana dé 0 y no 0,3.
    const corte = inicioDeHoy();
    corte.setDate(corte.getDate() - f.minDias);
    rango.lte = rango.lte && rango.lte < corte ? rango.lte : corte;
  }
  if (Object.keys(rango).length) and.push({ scheduledFor: rango });

  const q = f.q?.trim();
  if (q) {
    const partes = q.split(/\s+/).filter(Boolean);
    const or: Prisma.AppointmentWhereInput[] = [
      { patient: { firstName: { contains: q, mode: 'insensitive' } } },
      { patient: { lastName:  { contains: q, mode: 'insensitive' } } },
      { case:    { caseCode:  { contains: q, mode: 'insensitive' } } },
    ];
    // "Juan Pérez" en las dos direcciones — se escribe tan seguido al revés que
    // sin esto el buscador falla justo con el nombre completo, que es como lo
    // tipea quien lo tiene delante. Mismo criterio que la lista de Pacientes.
    if (partes.length >= 2) {
      const [a] = partes, z = partes[partes.length - 1]!;
      or.push(
        { patient: { firstName: { contains: a!, mode: 'insensitive' }, lastName: { contains: z, mode: 'insensitive' } } },
        { patient: { firstName: { contains: z,  mode: 'insensitive' }, lastName: { contains: a!, mode: 'insensitive' } } },
      );
    }
    and.push({ OR: or });
  }

  return { AND: and };
}

/**
 * Los filtros leídos de la URL.
 *
 * Vive acá y no en la página porque la EXPORTACIÓN tiene que producir
 * exactamente las filas que se están viendo. Con dos parseos, el CSV terminaría
 * trayendo un recorte distinto al de la pantalla que lo pidió — y nadie lo
 * notaría hasta que alguien compare.
 *
 * Toma un getter en vez de un objeto para servir a los dos lados: la página
 * recibe `searchParams` como Record y la ruta tiene `URLSearchParams`.
 */
export function filtrosDesdeParams(get: (k: string) => string | undefined): FiltrosNotas {
  const validos: EstadoNota[] = ['none', 'draft', 'signed', 'voided'];
  const estados = (get('estado') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is EstadoNota => validos.includes(s as EstadoNota));

  const fecha = (v?: string): Date | undefined =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : undefined;

  // `hasta` es INCLUSIVO para quien lo escribe ("hasta el 31") y exclusivo para
  // la consulta, así que se corre un día. Sin esto el último día del rango se
  // pierde entero y nadie entiende por qué.
  const hasta = fecha(get('hasta'));
  if (hasta) hasta.setDate(hasta.getDate() + 1);

  return {
    estados: estados.length ? estados : ESTADOS_PENDIENTES,
    providerId: get('provider') || undefined,
    clinicId: get('clinica') || undefined,
    desde: fecha(get('desde')),
    hasta,
    minDias: Math.max(0, parseInt(get('antiguedad') ?? '0', 10) || 0),
    q: get('q') || undefined,
  };
}

/** Medianoche de hoy, hora local del servidor. */
export function inicioDeHoy(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Días completos desde la visita hasta el inicio de HOY. Nunca negativo. */
export function antiguedadEnDias(scheduledFor: Date): number {
  return Math.max(0, Math.floor((inicioDeHoy().getTime() - scheduledFor.getTime()) / 86_400_000));
}

/**
 * DÓNDE QUEDÓ la visita — el paso del flujo en el que se detuvo.
 *
 * Existe porque "Sin nota" a secas acusa al médico y esconde lo que de verdad
 * pasó. Medido el 2-sep-2026 sobre las 53 visitas que deben nota de los
 * providers reales (los que tienen ficha de empleado):
 *
 *                    sin nota   borrador   firmada
 *   llegoSinSala        20          —          —
 *   enSala               9          4          —
 *   atendida             6          8          —
 *   sinLlegada           2          2          2
 *
 * O sea que de las 37 sin nota, 31 no son un doctor olvidadizo: son flujos
 * abandonados a mitad de camino, y cada uno le habla a una persona distinta.
 * "Llegó y no pasó a sala" es un mensaje para recepción, no para el médico
 * (Erick, 2-sep-2026). Los 4 borradores `enSala` explican por qué la nota quedó
 * a medias, y las 2 firmadas `sinLlegada` son registro incompleto, no un
 * problema de la nota.
 *
 * Ninguna de estas es "no vino": ese caso lo excluye `CITA_CALIFICA`, y para él
 * el sistema ya tiene el desenlace NO_SHOW, que además cobra la penalidad. Un
 * campo de texto libre que dijera "no vino" competiría con ese estado y dejaría
 * la penalidad sin cobrar.
 */
export type EtapaVisita = 'sinLlegada' | 'llegoSinSala' | 'enSala' | 'atendida';

export function etapaDeLaVisita(a: {
  status: string;
  checkedInAt: Date | null;
  admittedAt: Date | null;
  doctorDoneAt: Date | null;
}): EtapaVisita {
  if (a.doctorDoneAt || a.status === 'COMPLETED') {
    // `COMPLETED` sin llegada registrada no es una visita completa: es un estado
    // que alguien puso —o que arrastró la migración— sin que el flujo ocurriera.
    return a.checkedInAt ? 'atendida' : 'sinLlegada';
  }
  if (a.admittedAt) return 'enSala';
  if (a.checkedInAt) return 'llegoSinSala';
  return 'sinLlegada';
}

/** El estado que ve el admin, derivado de la nota (o de su ausencia). */
export function estadoDeLaNota(status: string | null | undefined): EstadoNota {
  if (!status) return 'none';
  if (status === 'SIGNED') return 'signed';
  if (status === 'VOIDED') return 'voided';
  return 'draft';
}
