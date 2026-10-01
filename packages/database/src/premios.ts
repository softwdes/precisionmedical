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

export type GoalKind = 'CATEGORY' | 'CALLS' | 'USAGE' | 'METRIC';

/**
 * Lo que el sistema cuenta SOLO (Erick, 2026-09-29: las metas salen del
 * sistema, nadie registra a mano). La definición exacta de cada una está en
 * `prisma/sql/20260929c-premios-automaticas.sql`; todas cuentan resultados o
 * pacientes distintos, no clics.
 */
export type MetricKey =
  | 'APPTS_BOOKED' | 'NEW_CASES' | 'SAVED_APPTS' | 'REACTIVATIONS' | 'MEMBERSHIPS' | 'MEMBERSHIPS_NEW'
  | 'SMS_PATIENTS' | 'FORM_LINKS' | 'CHECKINS' | 'DOCUMENTS' | 'CONFIRMATIONS'
  // De provider (2026-09-30): ver prisma/sql/20260930-premios-metricas-provider.sql.
  | 'NOTES_SIGNED' | 'CONSULTS_DONE' | 'LAB_ORDERS';

/**
 * El catálogo de métricas: nombre en los dos idiomas (se copia a la meta al
 * elegirla) y el peso en puntos.
 *
 * Los pesos son por ESFUERZO y VALOR de cada acción, no por lo fácil que es
 * repetirla: traer una membresía o reactivar a alguien vale más que mandar un
 * link. Los puntos NO deciden la plata (la deciden las metas); se muestran en
 * el caballo y en el tablero. `comingSoon`: se muestra, pero todavía no se
 * puede elegir como meta (las membresías esperan el sistema de membresías).
 */
export const METRICAS: Record<MetricKey, { es: string; en: string; points: number; comingSoon?: boolean }> = {
  MEMBERSHIPS:     { es: 'Membresías',              en: 'Memberships',            points: 10, comingSoon: true },
  MEMBERSHIPS_NEW: { es: 'Membresías nuevas',       en: 'New memberships',        points: 0,  comingSoon: true },
  REACTIVATIONS:   { es: 'Reactivaciones',          en: 'Reactivations',          points: 6 },
  NEW_CASES:       { es: 'Pacientes nuevos',        en: 'New patients',           points: 5 },
  SAVED_APPTS:     { es: 'Citas salvadas',          en: 'Saved appointments',     points: 3 },
  APPTS_BOOKED:    { es: 'Citas agendadas',         en: 'Appointments booked',    points: 2 },
  CHECKINS:        { es: 'Check-ins',               en: 'Check-ins',              points: 2 },
  SMS_PATIENTS:    { es: 'SMS a pacientes',         en: 'Patients texted',        points: 1 },
  FORM_LINKS:      { es: 'Links de formulario',     en: 'Form links sent',        points: 1 },
  DOCUMENTS:       { es: 'Documentos subidos',      en: 'Documents uploaded',     points: 1 },
  CONFIRMATIONS:   { es: 'Citas confirmadas',       en: 'Appointments confirmed', points: 0.5 },
  // De provider. Una nota firmada o una consulta terminada pesa como una cita
  // salvada: es el trabajo central del rol, no un trámite.
  NOTES_SIGNED:    { es: 'Notas firmadas',          en: 'Notes signed',           points: 3 },
  CONSULTS_DONE:   { es: 'Consultas terminadas',    en: 'Visits completed',       points: 3 },
  LAB_ORDERS:      { es: 'Órdenes de laboratorio',  en: 'Lab orders',             points: 2 },
};

/** Puntos que el sistema da solo, con los pesos de `METRICAS`. */
export function puntosAutomaticos(metrics: Partial<Record<MetricKey, number>> | undefined): number {
  if (!metrics) return 0;
  let total = 0;
  for (const [k, v] of Object.entries(metrics) as Array<[MetricKey, number]>) {
    const def = METRICAS[k];
    // Las métricas "próximamente" todavía no suman: tampoco en puntos.
    if (!def || def.comingSoon) continue;
    total += (v ?? 0) * def.points;
  }
  return Math.round(total * 10) / 10;
}

export interface RewardGoal {
  id: string;
  sortOrder: number;
  kind: GoalKind;
  categoryCode: string | null;
  /** Con kind METRIC: qué métrica cuenta. */
  metric?: MetricKey | null;
  /** A qué rol aplica. `null` = a todos. */
  roleKey?: string | null;
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
  metrics?: Partial<Record<MetricKey, number>>;
}

/** ¿Esta meta le toca a este participante? Sin rol en la meta, le toca a todos. */
export function metaAplica(goal: Pick<RewardGoal, 'roleKey'>, roleKey: string | null | undefined): boolean {
  return !goal.roleKey || goal.roleKey === (roleKey ?? null);
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
  roleKey: string | null;
  /** Solo las metas que le tocan (por rol), en el orden del mes. */
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
  if (goal.kind === 'METRIC') return goal.metric ? (row.metrics?.[goal.metric] ?? 0) : 0;
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
 *
 * Metas por rol: cada uno se mide solo contra las metas que le tocan, y su
 * avance es cumplidas ÷ las SUYAS. La parte es la misma para todos. La manager
 * cobra con el avance del staff sumado (metas cumplidas ÷ metas posibles), que
 * con roles de distinta cantidad de metas es el promedio justo: pesa cada meta,
 * no cada persona.
 */
export function calcularPeriodo(input: {
  poolAmount: number | string;
  goals: RewardGoal[];
  participants: Array<{ userId: string; kind: 'STAFF' | 'MANAGER'; roleKey?: string | null }>;
  progress: ProgressRow[];
}): PeriodResult {
  const poolCents = aCentavos(input.poolAmount);
  const goals = [...input.goals].sort((a, b) => a.sortOrder - b.sortOrder);
  const n = input.participants.length;
  const porUsuario = new Map(input.progress.map((r) => [r.userId, r]));

  const base = input.participants.map((p) => {
    const row = porUsuario.get(p.userId);
    const suyas = goals.filter((g) => metaAplica(g, p.roleKey));
    const res = suyas.map((g) => {
      const actual = avanceDeMeta(g, row);
      return { goalId: g.id, actual, target: g.target, hit: actual >= g.target };
    });
    return {
      p, row, res,
      total: suyas.length,
      hits: res.filter((r) => r.hit).length,
      points: (row?.entries ?? []).reduce((s, e) => s + e.points, 0) + puntosAutomaticos(row?.metrics),
    };
  });

  const staff = base.filter((b) => b.p.kind === 'STAFF');
  const staffHits = staff.reduce((s, b) => s + b.hits, 0);
  const staffTotal = staff.reduce((s, b) => s + b.total, 0);

  const participants: ParticipantResult[] = base.map((b) => {
    let payoutCents = 0;
    let progress = 0;
    if (n > 0) {
      if (b.p.kind === 'STAFF') {
        if (b.total > 0) {
          progress = b.hits / b.total;
          payoutCents = redondearFraccion(poolCents * b.hits, n * b.total);
        }
      } else if (staffTotal > 0) {
        progress = staffHits / staffTotal;
        payoutCents = redondearFraccion(poolCents * staffHits, n * staffTotal);
      }
    }
    return {
      userId: b.p.userId,
      kind: b.p.kind,
      roleKey: b.p.roleKey ?? null,
      goals: b.res,
      goalsHit: b.hits,
      goalsTotal: b.total,
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
 * Las metas con las que abre un mes cuando no hay uno anterior para copiar.
 * Todas automáticas (Erick, 2026-09-29): los objetivos de Recepción que aprobó,
 * más el uso del sistema. Las membresías quedan "próximamente".
 *
 * Referencia de septiembre (1 al 29, medido): Pamela 133 citas, 41 casos, 29
 * salvadas, 27 reactivaciones, 72 SMS, 30 links; Reagin 60 / 21 / 9 / 15 / 34 / 14.
 */
const metaAuto = (sortOrder: number, metric: MetricKey, target: number): Omit<RewardGoal, 'id'> => ({
  sortOrder, kind: 'METRIC', categoryCode: null, metric, roleKey: null, onlyNew: false, target,
  labelEs: METRICAS[metric].es, labelEn: METRICAS[metric].en,
});
export const METAS_POR_DEFECTO: Array<Omit<RewardGoal, 'id'>> = [
  metaAuto(1, 'APPTS_BOOKED', 40),
  metaAuto(2, 'NEW_CASES', 10),
  metaAuto(3, 'SAVED_APPTS', 5),
  metaAuto(4, 'REACTIVATIONS', 2),
  metaAuto(5, 'SMS_PATIENTS', 20),
  metaAuto(6, 'FORM_LINKS', 10),
  { sortOrder: 7, kind: 'USAGE', categoryCode: null, metric: null, roleKey: null, onlyNew: false, target: 80, labelEs: 'Uso del sistema', labelEn: 'System usage' },
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
