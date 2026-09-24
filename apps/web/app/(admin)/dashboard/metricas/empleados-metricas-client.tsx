'use client';

/**
 * Métricas → tab Empleados — productividad por empleado.
 *
 * Qué hizo cada quien en Clinic: tiempo de uso activo, llamadas, SMS (enviados
 * y cuántos llegaron) y las acciones agrupadas por ÁREA de trabajo — pacientes,
 * casos, citas, admisión, clínico, cobros, portal, bufetes, mensajería,
 * catálogos, seguimiento, Vigía y anulaciones. Las áreas cubren el 100% del
 * trabajo registrado; una columna por acción suelta llegaba al 34%.
 *
 * Filtro Hoy / Ayer / 7 días / Este mes / Rango libre (días de America/Denver,
 * el hoy de la clínica). Click en una fila → el reporte de esa persona: en qué
 * módulos pasó el tiempo y el desglose acción por acción.
 *
 * La data viene de api.metrics.employeeActivity (fn `employee_metrics` en la
 * DB del back-office: AuditLog atribuido + CallLog + user_activity).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@precision/ui';
import {
  Activity, Clock, Download, Loader2, Phone, MessageSquare,
  UserPlus, CalendarDays, DollarSign, Undo2, X, Table2, Trophy,
} from 'lucide-react';
import { api } from '@/lib/trpc/client';
import {
  KpiCard, Num, PeriodFilter, denverDay, fmtMinutes, presetRange, type Preset,
} from './metricas-shared';
// La Carrera vive en `packages/ui`: la comparten este tab y `/carrera` del
// back-office, que la abre a toda la clínica.
import { CarreraClient, carreraLabels } from '@precision/ui';

// ─── Types (espejo de EmployeeActivityRow del router) ────────────────────────

/** Grupo de trabajo — sale de `users.crew` del proyecto Admin. */
type Crew = 'CLINIC' | 'DEV' | 'COMMS';

/**
 * Los grupos, en el orden en que se muestran.
 *
 * `all` primero porque el default es ver a todos: el filtro está para poder
 * comparar peras con peras, no para esconder gente.
 */
const CREW_FILTERS: Array<'all' | Crew> = ['all', 'CLINIC', 'DEV', 'COMMS'];

interface EmployeeRow {
  userId: string;
  name: string;
  role: string;
  /** Grupo de trabajo. `null` = todavía no se le asignó. */
  crew: Crew | null;
  activeMinutes: number;
  callsMade: number;
  callsAnswered: number;
  smsSent: number;
  smsDelivered: number;
  callsDurationSeconds: number;
  /** Números de portada (los KPI de arriba). */
  patientsCreated: number;
  casesCreated: number;
  appointmentsCreated: number;
  payments: number;
  voids: number;
  /** Acciones de staff del período. */
  totalActions: number;
  /** Acciones agrupadas por área — las columnas de la tabla. */
  families: Record<string, number>;
  /** Minutos por módulo. Suma `activeMinutes` (±1 por redondeo): el minuto a
   *  caballo entre dos pantallas vale 0.5 en cada una, así que estos valores
   *  traen UN DECIMAL. Antes se sumaba entero a las dos y el desglose daba
   *  hasta 25% más que el total. */
  minutesByModule: Record<string, number>;
  /** La pantalla donde pasó más tiempo. La calcula el router para que la pista
   *  la lea igual acá que en los caballitos del back-office. */
  topModule: { module: string; minutes: number } | null;
  byAction: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function totalOf(r: EmployeeRow): number {
  return r.activeMinutes + r.callsMade + r.callsAnswered + r.smsSent + r.totalActions;
}

const ROLE_KEYS = new Set([
  'SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'EMPLOYEE', 'FRONT_DESK', 'DOCTOR', 'PROVIDER',
]);

/**
 * Las acciones del audit log que tienen nombre propio en el diccionario
 * (`metrics.actions.*`). Lo que no esté acá se muestra prettificado: es
 * preferible ver el código crudo a inventarle una traducción.
 */
const ACTION_KEYS = new Set([
  'CREATE_PATIENT',
  'UPDATE_PATIENT',
  'CREATE_CASE_FROM_CALL',
  'UPDATE_CASE',
  'CREATE_APPOINTMENT',
  'SCHEDULE_FIRST_APPOINTMENT',
  'CONFIRM_APPOINTMENT',
  'CONFIRM_FIRST_APPOINTMENT',
  'CHECK_IN',
  'ADMIT_TO_ROOM',
  'TRIAGE_VITALS_SAVED',
  'TRIAGE_VITALS_CORRECTED',
  'CREATE_LAB_ORDER',
  'ADD_LAB_ORDER',
  'UPLOAD_LAB_RESULT',
  'CHARGE_CASH_SERVICE',
  'DISPENSE_BRACE',
  'REGISTER_BILLING_PAYMENT',
  'CANCEL_BILLING_PAYMENT',
  'CHECKOUT_APPOINTMENT',
  'REOPEN_APPOINTMENT',
  'DOCTOR_DONE_WITH_PATIENT',
  'SIGN_VISIT_NOTE',
  'CREATE_VISIT_NOTE',
  'SEND_PORTAL_LINK',
  'INSERT_CASE_NOTE',
  'ANSWER_INBOUND_CALL',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'UPDATE_MEDICAL_HISTORY',
  'UPDATE_APPOINTMENT',
  'MESSAGE_THREAD_CREATED',
  'MESSAGE_ENTRY_REPLY',
  'MESSAGE_ENTRY_NOTE',
  'MESSAGE_THREAD_SEALED',
  'MESSAGE_THREAD_DELETED',
  'MESSAGING_VIEWED_OTHER_INBOX',
  'MESSAGE_TEMPLATE_CREATED',
  'VIEW_MESSAGE_ATTACHMENT',
  'VOID_CASH_SERVICE',
  'VOID_BRACE',
  'VOID_LAB_ORDER',
  'DELETE_LAB_ORDER',
  'SET_CASE_COVERAGE',
  'VERIFY_PIP',
  'STAFF_PHOTO_UPLOAD',
  'DOCTOR_VIEW_AS',
  'SEGUIMIENTO_CALL_LOGGED',
  'SEGUIMIENTO_EMAIL_LOGGED',
  'SEGUIMIENTO_NOTE_ADDED',
  'SEGUIMIENTO_PAYMENT_LOGGED',
  'SEGUIMIENTO_ESCALATED',
]);



// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Columnas de la tabla.
 *
 * Antes había una por acción suelta y entre todas cubrían el 34% del trabajo:
 * los otros dos tercios (bufetes, envíos de portal, edición de casos, Vigía)
 * solo se veían abriendo el detalle. Ahora son ÁREAS, que cubren el 100% y
 * además coinciden con el tiempo por módulo — la misma fila dice dónde estuvo
 * la persona y qué hizo ahí.
 *
 * `voids` va en ámbar al final: no es producción, es retrabajo. `access`
 * (logins, "ver como doctor") queda solo en el detalle: es rastro, no trabajo.
 */
const CALL_COLUMNS: Array<{ key: 'callsMade' | 'callsAnswered' | 'smsSent' }> = [
  { key: 'callsMade' }, { key: 'callsAnswered' }, { key: 'smsSent' },
];

/**
 * `label` es lo que se ve; `full` el nombre completo, que va en el `title` de
 * la celda. Se abrevia porque el ancho de la tabla lo fijan los ENCABEZADOS y
 * no los datos —los números son de 1 a 3 dígitos—, así que con 14 áreas la
 * tabla pedía 1560px y obligaba a scroll horizontal en cualquier portátil.
 * Acortar el rótulo no es esconder: el nombre completo está en el tooltip, en
 * el detalle de la persona y en el CSV.
 */
/**
 * El rótulo corto vive en `metrics.areasShort` y el completo en
 * `metrics.areas`. Se abrevia porque el ancho de la tabla lo fijan los
 * ENCABEZADOS y no los datos; el nombre completo va en el `title`, en el
 * detalle de la persona y en el CSV.
 */
const FAMILY_COLUMNS: Array<{ key: string; tone?: 'warn' }> = [
  { key: 'patients' }, { key: 'cases' }, { key: 'appointments' },
  { key: 'admission' }, { key: 'clinical' }, { key: 'charges' },
  { key: 'portal' }, { key: 'externals' }, { key: 'messages' },
  { key: 'catalogs' }, { key: 'followup' }, { key: 'ai' },
  { key: 'otros' }, { key: 'voids', tone: 'warn' },
];

/** Módulos — espejo de `lib/activity-modules.ts` del back-office. El nombre
 *  de cada uno vive en `metrics.modules`. */
const MODULE_KEYS = [
  'dashboard', 'patients', 'calendar', 'admission', 'billing', 'edson',
  'intake', 'messages', 'externals', 'settings', 'doctor', 'attorney',
  'vigia', 'other',
];

export function EmpleadosMetricasClient() {
  /**
   * Solo para la Carrera. El resto de este tab tiene las strings en duro y
   * quedó así de antes — deuda propia, no de este cambio. La pista SÍ pasa por
   * i18n porque el mismo componente lo usa el back-office, que es bilingüe:
   * cuando tenía los textos adentro, cambiar a inglés no cambiaba nada.
   */
  const tCarrera = useTranslations('phoenix.carrera');
  const t = useTranslations('metrics');

  /** Nombre legible de una acción; lo no mapeado se prettifica. */
  const esLlamada = (k: string): boolean => CALL_COLUMNS.some(c => c.key === k);
  const colShort = (k: string): string => t(esLlamada(k) ? `callsShort.${k}` : `areasShort.${k}`);
  const colFull  = (k: string): string => t(esLlamada(k) ? `calls.${k}` : `areas.${k}`);

  const actionLabel = (a: string): string =>
    ACTION_KEYS.has(a) ? t(`actions.${a}`) : a.replaceAll('_', ' ').toLowerCase();

  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(() => denverDay());
  const [to, setTo] = useState(() => denverDay());
  const [onlyActive, setOnlyActive] = useState(true);
  const [crew, setCrew] = useState<'all' | Crew>('all');
  const [detail, setDetail] = useState<EmployeeRow | null>(null);
  const [view, setView] = useState<'tabla' | 'carrera'>('tabla');
  const [live, setLive] = useState(false);

  const validRange = !!from && !!to && from <= to;
  // El modo en vivo solo con "Hoy": en un rango pasado no hay nada que avanzar.
  // 30s y no menos — el latido marca MINUTOS, así que refrescar más seguido
  // gastaría consultas sin mover ninguna barra.
  const canGoLive = preset === 'today';
  const liveOn = live && canGoLive && view === 'carrera';
  const query = api.metrics.employeeActivity.useQuery(
    { from, to },
    {
      enabled: validRange,
      staleTime: liveOn ? 0 : 30_000,
      refetchInterval: liveOn ? 30_000 : false,
    },
  );
  const rows = (query.data?.employees ?? null) as EmployeeRow[] | null;

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p);
    if (p !== 'today') setLive(false); // sin "Hoy" no hay carrera en vivo
    const r = presetRange(p);
    if (r) { setFrom(r.from); setTo(r.to); }
  }, []);

  // Cerrar el desglose con Escape
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetail(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  const visible = useMemo(
    () => (rows ?? []).filter((r) =>
      (!onlyActive || totalOf(r) > 0) &&
      (crew === 'all' || r.crew === crew)),
    [rows, onlyActive, crew],
  );

  /**
   * Grupo activo, para el pie del KPI de tiempo.
   *
   * El total de arriba es una SUMA DE PERSONAS y hasta ahora no decía sobre
   * quiénes: medido el 2026-09-10, el 81.6% de todo el tiempo del sistema son
   * las cuatro cuentas de devs, así que "Todos" mostraba ~112 horas donde la
   * clínica había trabajado ~21. Los caballitos del back-office abrían
   * filtrados y este tab no, y de ahí venía la sensación de que uno de los dos
   * sumaba mal. El número no estaba mal: le faltaba decir de quién era.
   */
  const crewLabel = crew === 'all' ? t('allGroups') : t(`crewsShort.${crew}`);

  /**
   * Los KPI de portada salen de `visible`, no de `rows`.
   *
   * Antes sumaban a TODOS, así que "41 citas creadas" eran en su mayoría
   * pruebas de los devs presentadas como producción de la clínica. Cambiarlo a
   * `visible` no altera nada cuando el único filtro activo es "Solo con
   * actividad" —quien no hizo nada suma cero—, pero hace que el filtro de grupo
   * mande en el número de arriba, que es el que la gente lee.
   */
  const totals = useMemo(() => {
    const base = { activeMinutes: 0, callsMade: 0, smsSent: 0, smsDelivered: 0, patientsCreated: 0, appointmentsCreated: 0, payments: 0, voids: 0 };
    for (const r of visible) {
      base.activeMinutes += r.activeMinutes;
      base.callsMade += r.callsMade;
      base.smsSent += r.smsSent;
      base.smsDelivered += r.smsDelivered;
      base.patientsCreated += r.patientsCreated;
      base.appointmentsCreated += r.appointmentsCreated;
      base.payments += r.payments;
      base.voids += r.voids;
    }
    return base;
  }, [visible]);

  const exportCsv = useCallback(() => {
    if (!visible.length) return;
    // El CSV se arma de las MISMAS listas que la tabla: si mañana se agrega una
    // familia, sale en los dos lados sin que nadie tenga que acordarse.
    const header = [
      'empleado', 'rol', 'grupo', 'minutos_activos', 'acciones',
      ...CALL_COLUMNS.map(c => c.key),
      ...FAMILY_COLUMNS.map(c => c.key),
      ...MODULE_KEYS.map(m => `min_${m}`),
    ].join(',');
    const lines = visible.map((r) => [
      `"${r.name.replaceAll('"', '""')}"`, r.role, r.crew ?? '', r.activeMinutes, r.totalActions,
      ...CALL_COLUMNS.map(c => r[c.key] ?? 0),
      ...FAMILY_COLUMNS.map(c => r.families?.[c.key] ?? 0),
      ...MODULE_KEYS.map(m => r.minutesByModule?.[m] ?? 0),
    ].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // El grupo va en el nombre: un CSV filtrado que se llama igual que el
    // completo es el que después alguien presenta como si fuera todo.
    a.download = `metricas-empleados${crew === 'all' ? '' : `-${crew.toLowerCase()}`}_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [visible, from, to, crew]);

  return (
    <div className="p-6 space-y-6">

      {/* KPIs del período. Sin "Contestadas": ese conteo son las ENTRANTES
          atendidas, y desde el 2026-08-05 Twilio las desvía a otro número, así
          que la tarjeta era un cero permanente para todos. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* "Horas-hombre" y el grupo, explícitos: es la suma de N personas, no
            el tiempo de una jornada. Sin eso, el mismo día se leía como 112h
            acá y 21h en los caballitos de la clínica. */}
        <KpiCard icon={Clock}        label="Tiempo activo"   value={fmtMinutes(totals.activeMinutes)}
          sub={`horas-hombre · ${visible.length} ${visible.length === 1 ? 'persona' : 'personas'} · ${crewLabel}`}
          color="bg-emerald/10 text-emerald" />
        <KpiCard icon={Phone}        label="Llamadas hechas" value={totals.callsMade}                 color="bg-brand/10 text-brand-text" />
        {/* Enviados arriba y entregados abajo, no un total suelto: "mando 40
            SMS" no dice nada si 30 rebotaron. La brecha entre los dos numeros
            es lo que delata a quien escribe a numeros malos. */}
        <KpiCard icon={MessageSquare} label="SMS enviados"    value={totals.smsSent}
          sub={totals.smsSent > 0 ? `${totals.smsDelivered} entregados` : undefined}
          color="bg-cyan/10 text-cyan" />
        <KpiCard icon={UserPlus}     label="Pacientes nuevos" value={totals.patientsCreated}          color="bg-violet/10 text-violet-text" />
        <KpiCard icon={CalendarDays} label="Citas creadas"   value={totals.appointmentsCreated}       color="bg-rose/10 text-rose" />
        <KpiCard icon={DollarSign}   label="Pagos"           value={totals.payments}                  color="bg-emerald/10 text-emerald" />
        {/* Retrabajo: lo que alguien tuvo que deshacer. Ámbar = mirar, no celebrar. */}
        <KpiCard icon={Undo2}        label="Anulaciones"     value={totals.voids}                     color="bg-amber/10 text-amber"
          sub={totals.voids > 0 ? 'servicios, labs o pagos deshechos' : undefined} />
      </div>

      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-3">
        <PeriodFilter preset={preset} from={from} to={to} onPreset={applyPreset} onFrom={setFrom} onTo={setTo} />

        <label className="flex items-center gap-2 text-xs text-text-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
            className="accent-[var(--brand,#6366F1)]"
          />
          Solo con actividad
        </label>

        {/* Grupo de trabajo. Rankear devs contra recepción no compara nada:
            el dev prueba módulos enteros y su tasa es alta por definición. */}
        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5">
          {CREW_FILTERS.map((k) => (
            <button
              key={k}
              onClick={() => setCrew(k)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                crew === k ? 'bg-brand text-white' : 'text-text-3 hover:text-text-1',
              )}
            >
              {t(`crews.${k}`)}
              {k !== 'all' && (
                <span className={cn('ml-1.5 tabular-nums', crew === k ? 'text-white/70' : 'text-text-3/70')}>
                  {(rows ?? []).filter((r) => r.crew === k && (!onlyActive || totalOf(r) > 0)).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Tabla o carrera: la misma data contada de dos formas. */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5">
            {([['tabla', 'viewTable', Table2], ['carrera', 'viewRace', Trophy]] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  view === k ? 'bg-brand text-white' : 'text-text-3 hover:text-text-1',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
          {query.isFetching && <Loader2 className="w-4 h-4 text-text-3 animate-spin" />}
          <button
            onClick={exportCsv}
            disabled={!visible.length}
            className="flex items-center gap-1.5 text-xs font-medium bg-surface border border-border rounded-lg px-3 py-1.5 text-text-2 hover:text-text-1 hover:border-brand/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {view === 'carrera' ? (
        <CarreraClient
          labels={carreraLabels(tCarrera)}
          rows={visible}
          live={liveOn}
          canGoLive={canGoLive}
          onToggleLive={() => setLive((v) => !v)}
        />
      ) : (
      <>
      {/* Tabla por empleado */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {query.isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-6 h-6 text-text-3 mx-auto animate-spin" />
          </div>
        ) : query.error ? (
          <div className="p-12 text-center">
            <Activity className="w-8 h-8 text-text-3 mx-auto mb-3" />
            <p className="text-sm text-text-3">{t('errLoad')}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-8 h-8 text-text-3 mx-auto mb-3" />
            <p className="text-sm text-text-3">
              Sin actividad registrada en este período. Los datos se acumulan a medida que el equipo usa Clinic.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3 sticky left-0 bg-surface-2 z-10">{t('employee')}</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">{t('active')}</th>
                  <th
                    title={t('totalActionsHint')}
                    className="px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3 whitespace-nowrap"
                  >
                    Acc.
                  </th>
                  {[...CALL_COLUMNS, ...FAMILY_COLUMNS].map((c) => (
                    <th
                      key={c.key}
                      title={colFull(c.key)}
                      className="px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3 whitespace-nowrap cursor-help"
                    >
                      {colShort(c.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((r) => (
                  <tr
                    key={r.userId}
                    onClick={() => setDetail(r)}
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 sticky left-0 bg-surface z-10">
                      <div className="min-w-[130px] max-w-[190px]">
                        <div className="font-medium text-text-1 text-[12.5px]">{r.name}</div>
                        <div className="text-[10px] text-text-3 uppercase tracking-wider">
                          {ROLE_KEYS.has(r.role) ? t(`roles.${r.role}`) : r.role}
                          {r.crew && <span className="text-text-3/60"> · {t(`crewsShort.${r.crew}`)}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <span className={cn('font-mono tabular-nums text-[12px]', r.activeMinutes > 0 ? 'text-emerald' : 'text-text-3')}>
                        {fmtMinutes(r.activeMinutes)}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right text-[12px]">
                      <span className={cn('font-mono tabular-nums font-semibold', r.totalActions > 0 ? 'text-text-1' : 'text-text-3')}>
                        {r.totalActions}
                      </span>
                    </td>
                    {CALL_COLUMNS.map((c) => (
                      <td key={c.key} className="px-2 py-3 text-right text-[12px]">
                        <Num value={r[c.key] ?? 0} />
                      </td>
                    ))}
                    {FAMILY_COLUMNS.map((c) => {
                      const v = r.families?.[c.key] ?? 0;
                      return (
                        <td key={c.key} className="px-2 py-3 text-right text-[12px]">
                          {c.tone === 'warn' && v > 0
                            ? <span className="font-mono tabular-nums text-amber">{v}</span>
                            : <Num value={v} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {visible.length > 0 && (
        <p className="text-[11px] text-text-3 text-right">
          {visible.length} de {rows?.length ?? 0} empleados · {from} → {to}
        </p>
      )}
      </>
      )}

      {/* Desglose por empleado */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-surface p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-text-1">{detail.name}</h3>
                <p className="text-xs text-text-3 mt-0.5">Actividad del {from} al {to}</p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-white/[0.05] transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-surface-2 border border-border p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-3">Activo</div>
                <div className="text-lg font-bold text-emerald mt-0.5 tabular-nums">{fmtMinutes(detail.activeMinutes)}</div>
              </div>
              <div className="rounded-lg bg-surface-2 border border-border p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-3">Llam. hechas</div>
                <div className="text-lg font-bold text-brand-text mt-0.5 tabular-nums">{detail.callsMade}</div>
              </div>
            </div>

            {/*
              En qué módulos se fue el tiempo.

              Las barras van sobre el TOTAL de la persona, no sobre su módulo
              más grande. Antes eran relativas al mayor, así que la primera
              siempre llegaba al 100% y un 3h junto a un 3h10m se veían casi
              iguales: la barra comparaba los módulos entre sí y no decía qué
              fracción de la jornada era cada uno.

              Recién se puede: hasta el 2026-09-10 el desglose sumaba hasta 25%
              más que el total (ver el .sql del reparto fraccionado), así que un
              porcentaje sobre el total habría dado 125% repartido.
            */}
            {Object.keys(detail.minutesByModule ?? {}).length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald" />
                    Tiempo por módulo
                  </span>
                  {/* El total, para que las partes tengan contra qué leerse. */}
                  <span className="font-mono tabular-nums text-text-2 normal-case tracking-normal">
                    {fmtMinutes(detail.activeMinutes)}
                  </span>
                </div>
                <div className="space-y-1">
                  {Object.entries(detail.minutesByModule)
                    .sort(([, a], [, b]) => b - a)
                    .map(([mod, mins]) => {
                      const pct = detail.activeMinutes > 0
                        ? Math.min(100, Math.round((mins / detail.activeMinutes) * 100))
                        : 0;
                      return (
                        <div key={mod} className="flex items-center gap-2">
                          <span className="text-[11px] text-text-2 w-28 shrink-0 truncate">
                            {MODULE_KEYS.includes(mod) ? t(`modules.${mod}`) : mod}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-text-1 tabular-nums w-12 text-right shrink-0">
                            {fmtMinutes(mins)}
                          </span>
                          <span className="font-mono text-[10px] text-text-3 tabular-nums w-9 text-right shrink-0">
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                </div>
                {detail.minutesByModule.other > 0 && (
                  <p className="text-[10px] text-text-3 mt-1.5">
                    &quot;Sin módulo&quot; son minutos anteriores al 27 de agosto, cuando todavía
                    no se registraba en qué pantalla estaba la persona.
                  </p>
                )}
              </div>
            )}

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-brand-text" />
                Desglose de acciones
              </div>
              {Object.keys(detail.byAction).length === 0 ? (
                <p className="text-xs text-text-3 italic">
                  Sin acciones registradas en el período — solo tiempo activo o llamadas.
                </p>
              ) : (
                <div className="space-y-1">
                  {Object.entries(detail.byAction)
                    .sort(([, a], [, b]) => b - a)
                    .map(([action, count]) => (
                      <div key={action} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 border border-border px-3 py-1.5">
                        <span className="text-[12px] text-text-2 truncate">{actionLabel(action)}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[9px] text-text-3 bg-surface border border-border rounded px-1.5 py-0.5">{action}</span>
                          <span className="font-mono text-sm text-text-1 tabular-nums">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
