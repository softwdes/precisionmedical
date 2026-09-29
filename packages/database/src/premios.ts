/**
 * Premios del Staff — el cálculo del pago.
 *
 * Lo usan las DOS apps: el back-office ("Mis premios") y el Admin (Tablero y
 * Cierre). Los conteos crudos salen de la función SQL `reward_progress`
 * (`prisma/sql/20260929-premios.sql`); acá se decide qué meta se cumplió y
 * cuánto cobra cada uno. Así las dos pantallas y la planilla dan siempre el
 * mismo número.
 *
 * Sin Prisma a propósito: es un módulo puro para que lo pueda importar un
 * componente de cliente (`@precision-medical/database/premios`).
 *
 * Reglas (Erick, 2026-09-28):
 *   · parte = bolsa ÷ participantes; la manager cuenta como una más.
 *   · staff:   cobra = parte × metas cumplidas ÷ metas del mes.
 *   · manager: cobra = parte × avance promedio del staff.
 *   · No llegar a una meta no descuenta nada: esa meta no suma.
 *   · Los puntos NO deciden la plata.
 *
 * La plata se calcula en CENTAVOS enteros y sobre la fracción exacta
 * (bolsa × metas ÷ (participantes × metas del mes)), redondeando una sola vez
 * con el medio centavo hacia arriba. Redondear la parte primero y multiplicar
 * después hace que $750 ÷ 7 no cierre.
 */

export type RewardSource =
  | 'PERSONAL_REFERRAL' | 'CONVERTED_AT_DESK' | 'REACTIVATION' | 'SAVED_CANCELLATION'
  | 'MARKETING_WALKIN' | 'ATTORNEY_MVA' | 'EXTERNAL_REFERRAL' | 'ONLINE_BOOKING';

/** Las 4 fuentes que dan puntos, en el orden en que las muestra el diálogo. */
export const FUENTES_QUE_SUMAN: readonly RewardSource[] = [
  'PERSONAL_REFERRAL', 'CONVERTED_AT_DESK', 'REACTIVATION', 'SAVED_CANCELLATION',
];
/** Las 4 que se registran igual y valen 0. */
export const FUENTES_QUE_NO_SUMAN: readonly RewardSource[] = [
  'MARKETING_WALKIN', 'ATTORNEY_MVA', 'EXTERNAL_REFERRAL', 'ONLINE_BOOKING',
];
export const FUENTES: readonly RewardSource[] = [...FUENTES_QUE_SUMAN, ...FUENTES_QUE_NO_SUMAN];

/**
 * Uso del sistema: la fórmula diaria vive en la función SQL. Estas constantes
 * son para MOSTRARLA; si cambian, cambiar también `reward_progress`.
 */
export const USO_MINUTOS_POR_PUNTO = 10;
export const USO_ACCIONES_POR_PUNTO = 5;
export const USO_TOPE_DIARIO = 10;

export interface RewardCategory {
  code: string;
  nameEs: string;
  nameEn: string;
  pointsNew: number;
  pointsExisting: number;
  tracksSource: boolean;
  requiresPatient: boolean;
}

/**
 * Puntos de un registro, al momento de registrarlo. Se guardan en la fila: si
 * después cambia la tabla de puntos, lo ya trabajado no se mueve.
 */
export function puntosDelRegistro(
  cat: Pick<RewardCategory, 'pointsNew' | 'pointsExisting' | 'tracksSource'>,
  isNewPatient: boolean | null,
  source: RewardSource | null,
): number {
  // Una fuente que no suma deja el registro en 0, aunque se guarde igual.
  if (cat.tracksSource && (!source || !FUENTES_QUE_SUMAN.includes(source))) return 0;
  return isNewPatient ? cat.pointsNew : cat.pointsExisting;
}

export type GoalKind = 'CATEGORY' | 'CALLS' | 'USAGE';

export interface RewardGoal {
  id: string;
  sortOrder: number;
  kind: GoalKind;
  categoryCode: string | null;
  onlyNew: boolean;
  target: number;
  labelEs: string;
  labelEn: string;
}

/** Una fila de `reward_progress`. */
export interface ProgressRow {
  userId: string;
  entries: Array<{ categoryCode: string; verified: number; verifiedNew: number; points: number }>;
  pending: number;
  calls: number;
  usagePoints: number;
  usageDays: number;
}

export interface GoalResult {
  goalId: string;
  actual: number;
  target: number;
  hit: boolean;
}

export interface ParticipantResult {
  userId: string;
  kind: 'STAFF' | 'MANAGER';
  goals: GoalResult[];
  goalsHit: number;
  goalsTotal: number;
  /** 0..1. Staff: sus metas. Manager: el promedio del staff. */
  progress: number;
  points: number;
  pending: number;
  usagePoints: number;
  payoutCents: number;
}

export interface PeriodResult {
  shareCents: number;
  poolCents: number;
  paidCents: number;
  returnedCents: number;
  /** Suma de metas cumplidas del staff y el total posible: la base de la manager. */
  staffHits: number;
  staffTotal: number;
  participants: ParticipantResult[];
}

/** Cuánto lleva una persona en una meta. */
export function avanceDeMeta(goal: RewardGoal, row: ProgressRow | undefined): number {
  if (!row) return 0;
  if (goal.kind === 'CALLS') return row.calls;
  if (goal.kind === 'USAGE') return row.usagePoints;
  const e = row.entries.find((x) => x.categoryCode === goal.categoryCode);
  if (!e) return 0;
  return goal.onlyNew ? e.verifiedNew : e.verified;
}

/** Medio centavo hacia arriba, sobre una fracción exacta num/den (enteros ≥ 0). */
function redondearFraccion(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.floor((2 * num + den) / (2 * den));
}

export function aCentavos(monto: number | string): number {
  return Math.round(Number(monto) * 100);
}

/**
 * El mes completo: metas de cada uno, avance y pago.
 *
 * `participants` trae a TODOS (staff y manager). Si no hay nadie de staff, la
 * manager queda en 0: no hay equipo del que sacar un promedio.
 */
export function calcularPeriodo(input: {
  poolAmount: number | string;
  goals: RewardGoal[];
  participants: Array<{ userId: string; kind: 'STAFF' | 'MANAGER' }>;
  progress: ProgressRow[];
}): PeriodResult {
  const poolCents = aCentavos(input.poolAmount);
  const goals = [...input.goals].sort((a, b) => a.sortOrder - b.sortOrder);
  const n = input.participants.length;
  const total = goals.length;
  const porUsuario = new Map(input.progress.map((r) => [r.userId, r]));

  const base = input.participants.map((p) => {
    const row = porUsuario.get(p.userId);
    const res = goals.map((g) => {
      const actual = avanceDeMeta(g, row);
      return { goalId: g.id, actual, target: g.target, hit: actual >= g.target };
    });
    return {
      p, row, res,
      hits: res.filter((r) => r.hit).length,
      points: (row?.entries ?? []).reduce((s, e) => s + e.points, 0),
    };
  });

  const staff = base.filter((b) => b.p.kind === 'STAFF');
  const staffHits = staff.reduce((s, b) => s + b.hits, 0);
  const staffTotal = staff.length * total;

  const participants: ParticipantResult[] = base.map((b) => {
    let payoutCents = 0;
    let progress = 0;
    if (n > 0 && total > 0) {
      if (b.p.kind === 'STAFF') {
        progress = b.hits / total;
        payoutCents = redondearFraccion(poolCents * b.hits, n * total);
      } else if (staffTotal > 0) {
        progress = staffHits / staffTotal;
        payoutCents = redondearFraccion(poolCents * staffHits, n * staffTotal);
      }
    }
    return {
      userId: b.p.userId,
      kind: b.p.kind,
      goals: b.res,
      goalsHit: b.hits,
      goalsTotal: total,
      progress,
      points: b.points,
      pending: b.row?.pending ?? 0,
      usagePoints: b.row?.usagePoints ?? 0,
      payoutCents,
    };
  });

  const paidCents = participants.reduce((s, p) => s + p.payoutCents, 0);
  return {
    shareCents: n > 0 ? redondearFraccion(poolCents, n) : 0,
    poolCents,
    paidCents,
    returnedCents: poolCents - paidCents,
    staffHits,
    staffTotal,
    participants,
  };
}

/**
 * Las 8 metas con las que abre un mes cuando no hay uno anterior para copiar:
 * la hoja "Personal Monthly Goals" del Excel + la Carrera. La 7ª todavía no
 * está decidida (Llamadas o Suplementos); va Suplementos porque `call_logs`
 * está vacía (medido el 2026-09-29) y una meta de llamadas no se podría cumplir.
 * El Admin la cambia al abrir el mes.
 */
export const METAS_POR_DEFECTO: Array<Omit<RewardGoal, 'id'>> = [
  { sortOrder: 1, kind: 'CATEGORY', categoryCode: 'C01', onlyNew: true,  target: 2,  labelEs: 'Membresías nuevas', labelEn: 'New memberships' },
  { sortOrder: 2, kind: 'CATEGORY', categoryCode: 'C01', onlyNew: false, target: 3,  labelEs: 'Membresías total',  labelEn: 'Total memberships' },
  { sortOrder: 3, kind: 'CATEGORY', categoryCode: 'C06', onlyNew: false, target: 5,  labelEs: 'Reseñas',           labelEn: 'Reviews' },
  { sortOrder: 4, kind: 'CATEGORY', categoryCode: 'C04', onlyNew: false, target: 4,  labelEs: 'Citas salvadas',    labelEn: 'Cancellation saves' },
  { sortOrder: 5, kind: 'CATEGORY', categoryCode: 'C05', onlyNew: false, target: 3,  labelEs: 'Reactivaciones',    labelEn: 'Reactivations' },
  { sortOrder: 6, kind: 'CATEGORY', categoryCode: 'C07', onlyNew: false, target: 5,  labelEs: 'Ventas de suplementos', labelEn: 'Supplement sales' },
  { sortOrder: 7, kind: 'CATEGORY', categoryCode: 'C09', onlyNew: false, target: 1,  labelEs: 'Bug resuelto',      labelEn: 'Resolved bug' },
  { sortOrder: 8, kind: 'USAGE',    categoryCode: null,  onlyNew: false, target: 80, labelEs: 'Uso del sistema',   labelEn: 'System usage' },
];

/** Primer día del mes de la clínica para una fecha (YYYY-MM-01). */
export function mesDe(fecha: Date, zona = 'America/Denver'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit' }).formatToParts(fecha);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  return `${y}-${m}-01`;
}

// ─── Verificación: lo declarado contra lo que el sistema tiene ───────────────

/** Una fila de `reward_evidence` (`prisma/sql/20260929b-premios-evidencia.sql`). */
export interface RewardEvidence {
  entryId: string;
  duplicates: number;
  apptsOnDay: Array<{ status: string; clinic: string | null }>;
  membership: { plan: string; start: string | null; inLastCut: boolean } | null;
  patientCreatedAt: string | null;
  referralSource: string | null;
  firstVisit: { at: string; bySelf: boolean } | null;
  apptsCreatedBySelf: number;
  reschedulesBySelf: number;
  cancelledInMonth: number;
  lastVisitBefore: string | null;
  servicesOnDay: Array<{ name: string; by: string | null }>;
}

export type Tono = 'ok' | 'warn' | 'bad' | 'info';
export interface Senal { tone: Tono; key: string; params?: Record<string, string | number> }
export type Veredicto = 'match' | 'review' | 'mismatch' | 'noData';

/** Meses sin venir a partir de los cuales una vuelta cuenta como reactivación. */
export const MESES_PARA_REACTIVACION = 3;

/** Las columnas `timestamp` vuelven sin zona: son UTC. */
function utc(ts: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`);
}

/**
 * Qué dice el sistema de un registro pendiente. NO aprueba ni rechaza: arma
 * señales para que el Admin decida con datos. Las claves se traducen en la
 * pantalla (`rewards.evidence.*`), porque el servidor no sabe el idioma.
 *
 * Solo mira lo que el sistema de verdad registra. Reseñas, bugs, ventas de la
 * tienda, eventos, trabajo LM e inventario no dejan rastro en la base: ahí la
 * señal es "sin dato" y se pide comprobante.
 */
export function evaluarEvidencia(
  entry: { categoryCode: string; patientId: string | null; occurredOn: string },
  ev: RewardEvidence | null,
  mes: string,
): { verdict: Veredicto; signals: Senal[] } {
  const s: Senal[] = [];
  if (!ev) return { verdict: 'noData', signals: [{ tone: 'info', key: 'unavailable' }] };
  const inicioMes = utc(`${mes.slice(0, 7)}-01T00:00:00`);
  const dia = (ts: string) => utc(ts).toISOString().slice(0, 10);
  const enElMes = (ts: string) => dia(ts).slice(0, 7) === mes.slice(0, 7);

  if (ev.duplicates > 0) s.push({ tone: 'bad', key: 'duplicate', params: { n: ev.duplicates } });

  if (entry.patientId) {
    if (ev.apptsOnDay.length) {
      const a = ev.apptsOnDay[0]!;
      s.push({ tone: 'ok', key: 'apptOnDay', params: { status: a.status, clinic: a.clinic ?? '—' } });
    } else {
      s.push({ tone: 'warn', key: 'noApptOnDay' });
    }
  }

  switch (entry.categoryCode) {
    case 'C01': {
      const m = ev.membership;
      if (!m) s.push({ tone: 'warn', key: 'noMembership' });
      else if (m.start && enElMes(m.start)) s.push({ tone: 'ok', key: 'membershipNew', params: { plan: m.plan, date: dia(m.start) } });
      else s.push({ tone: 'warn', key: 'membershipOld', params: { plan: m.plan, date: m.start ? dia(m.start) : '—' } });
      break;
    }
    case 'C02': {
      if (!ev.firstVisit) s.push({ tone: 'warn', key: 'noVisits' });
      else if (enElMes(ev.firstVisit.at)) s.push({ tone: 'ok', key: 'firstVisitInMonth', params: { date: dia(ev.firstVisit.at) } });
      else s.push({ tone: 'bad', key: 'notNewPatient', params: { date: dia(ev.firstVisit.at) } });
      break;
    }
    case 'C03': {
      if (ev.patientCreatedAt && enElMes(ev.patientCreatedAt)) s.push({ tone: 'ok', key: 'createdInMonth', params: { date: dia(ev.patientCreatedAt) } });
      else if (ev.patientCreatedAt) s.push({ tone: 'warn', key: 'createdBefore', params: { date: dia(ev.patientCreatedAt) } });
      if (ev.referralSource) s.push({ tone: 'info', key: 'referralSource', params: { source: ev.referralSource } });
      if (ev.firstVisit?.bySelf) s.push({ tone: 'ok', key: 'firstApptBySelf' });
      break;
    }
    case 'C04': {
      if (ev.reschedulesBySelf > 0) s.push({ tone: 'ok', key: 'rescheduledBySelf', params: { n: ev.reschedulesBySelf } });
      else s.push({ tone: 'bad', key: 'noReschedule' });
      if (ev.cancelledInMonth > 0) s.push({ tone: 'warn', key: 'cancelledAnyway', params: { n: ev.cancelledInMonth } });
      break;
    }
    case 'C05': {
      if (!ev.lastVisitBefore) {
        s.push({ tone: 'warn', key: 'noPrevVisit' });
      } else {
        const ult = utc(ev.lastVisitBefore);
        const meses = (inicioMes.getUTCFullYear() - ult.getUTCFullYear()) * 12 + (inicioMes.getUTCMonth() - ult.getUTCMonth());
        s.push({
          tone: meses >= MESES_PARA_REACTIVACION ? 'ok' : 'bad',
          key: meses >= MESES_PARA_REACTIVACION ? 'dormant' : 'notDormant',
          params: { months: meses, date: dia(ev.lastVisitBefore), min: MESES_PARA_REACTIVACION },
        });
      }
      s.push(ev.apptsCreatedBySelf > 0
        ? { tone: 'ok', key: 'apptBySelf', params: { n: ev.apptsCreatedBySelf } }
        : { tone: 'warn', key: 'noApptBySelf' });
      break;
    }
    case 'C07': {
      if (ev.servicesOnDay.length) {
        s.push({ tone: 'info', key: 'chargedOnDay', params: { list: ev.servicesOnDay.map((x) => x.name).slice(0, 4).join(', ') } });
      } else {
        s.push({ tone: 'warn', key: 'noChargeOnDay' });
      }
      break;
    }
    default:
      s.push({ tone: 'info', key: 'noSystemData' });
  }

  const hay = (t: Tono) => s.some((x) => x.tone === t);
  const verdict: Veredicto = hay('bad') ? 'mismatch'
    : hay('warn') ? 'review'
    : hay('ok') ? 'match'
    : 'noData';
  return { verdict, signals: s };
}
