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
import { cn } from '@precision/ui';
import {
  Activity, Clock, Download, Loader2, Phone, MessageSquare,
  UserPlus, CalendarDays, DollarSign, Undo2, X, Table2, Trophy,
} from 'lucide-react';
import { api } from '@/lib/trpc/client';
import {
  KpiCard, Num, PeriodFilter, denverDay, fmtMinutes, presetRange, type Preset,
} from './metricas-shared';
import { CarreraClient } from './carrera-client';

// ─── Types (espejo de EmployeeActivityRow del router) ────────────────────────

interface EmployeeRow {
  userId: string;
  name: string;
  role: string;
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
  /** Minutos por módulo. Puede sumar MÁS que activeMinutes: un minuto a caballo
   *  entre dos pantallas cuenta en las dos. Es un reparto, no una partición. */
  minutesByModule: Record<string, number>;
  byAction: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function totalOf(r: EmployeeRow): number {
  return r.activeMinutes + r.callsMade + r.callsAnswered + r.smsSent + r.totalActions;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Súper Admin', ADMIN: 'Admin', CONTADOR: 'Contador',
  EMPLOYEE: 'Empleado', FRONT_DESK: 'Recepción', DOCTOR: 'Provider',
  PROVIDER: 'Proveedor',
};

/** Nombre legible de cada acción del audit log; lo no mapeado se prettifica. */
const ACTION_LABELS: Record<string, string> = {
  CREATE_PATIENT: 'Pacientes creados',
  UPDATE_PATIENT: 'Pacientes editados',
  CREATE_CASE_FROM_CALL: 'Casos creados',
  UPDATE_CASE: 'Casos editados',
  CREATE_APPOINTMENT: 'Citas creadas',
  SCHEDULE_FIRST_APPOINTMENT: 'Primera cita agendada',
  CONFIRM_APPOINTMENT: 'Citas confirmadas',
  CONFIRM_FIRST_APPOINTMENT: 'Citas confirmadas',
  CHECK_IN: 'Check-ins',
  ADMIT_TO_ROOM: 'Admisiones a sala',
  TRIAGE_VITALS_SAVED: 'Triajes',
  TRIAGE_VITALS_CORRECTED: 'Triajes corregidos',
  CREATE_LAB_ORDER: 'Órdenes de laboratorio',
  ADD_LAB_ORDER: 'Órdenes de laboratorio',
  UPLOAD_LAB_RESULT: 'Resultados de lab subidos',
  CHARGE_CASH_SERVICE: 'Servicios cobrados',
  DISPENSE_BRACE: 'Férulas entregadas',
  REGISTER_BILLING_PAYMENT: 'Pagos registrados',
  CANCEL_BILLING_PAYMENT: 'Pagos anulados',
  CHECKOUT_APPOINTMENT: 'Salidas del paciente',
  REOPEN_APPOINTMENT: 'Citas reabiertas',
  DOCTOR_DONE_WITH_PATIENT: 'Consultas terminadas (doctor)',
  SIGN_VISIT_NOTE: 'Notas firmadas',
  CREATE_VISIT_NOTE: 'Notas clínicas creadas',
  SEND_PORTAL_LINK: 'Links de portal enviados',
  INSERT_CASE_NOTE: 'Notas de caso',
  ANSWER_INBOUND_CALL: 'Entrantes reclamadas',
  LOGIN_SUCCESS: 'Inicios de sesión',
  LOGIN_FAILED: 'Intentos de sesión fallidos',
  UPDATE_MEDICAL_HISTORY: 'Historial médico actualizado',
  UPDATE_APPOINTMENT: 'Citas editadas',
  MESSAGE_THREAD_CREATED: 'Hilos de mensaje creados',
  MESSAGE_ENTRY_REPLY: 'Respuestas enviadas',
  MESSAGE_ENTRY_NOTE: 'Notas internas',
  MESSAGE_THREAD_SEALED: 'Hilos sellados',
  MESSAGE_THREAD_DELETED: 'Hilos eliminados',
  MESSAGING_VIEWED_OTHER_INBOX: 'Bandejas ajenas consultadas',
  MESSAGE_TEMPLATE_CREATED: 'Plantillas de mensaje creadas',
  VIEW_MESSAGE_ATTACHMENT: 'Adjuntos abiertos',
  VOID_CASH_SERVICE: 'Servicios anulados',
  VOID_BRACE: 'Férulas anuladas',
  VOID_LAB_ORDER: 'Órdenes de lab anuladas',
  DELETE_LAB_ORDER: 'Órdenes de lab eliminadas',
  SET_CASE_COVERAGE: 'Cobertura definida',
  VERIFY_PIP: 'PIP verificado',
  STAFF_PHOTO_UPLOAD: 'Fotos subidas',
  DOCTOR_VIEW_AS: 'Portal de doctor consultado',
  SEGUIMIENTO_CALL_LOGGED: 'Seguimientos por llamada',
  SEGUIMIENTO_EMAIL_LOGGED: 'Seguimientos por email',
  SEGUIMIENTO_NOTE_ADDED: 'Notas de seguimiento',
  SEGUIMIENTO_PAYMENT_LOGGED: 'Pagos de seguimiento',
  SEGUIMIENTO_ESCALATED: 'Seguimientos escalados',
};

const actionLabel = (a: string): string =>
  ACTION_LABELS[a] ?? a.replaceAll('_', ' ').toLowerCase();

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
const CALL_COLUMNS: Array<{ key: 'callsMade' | 'callsAnswered' | 'smsSent'; label: string }> = [
  { key: 'callsMade',     label: 'Llam.' },
  { key: 'callsAnswered', label: 'Contest.' },
  { key: 'smsSent',       label: 'SMS' },
];

const FAMILY_COLUMNS: Array<{ key: string; label: string; tone?: 'warn' }> = [
  { key: 'patients',     label: 'Pacientes' },
  { key: 'cases',        label: 'Casos' },
  { key: 'appointments', label: 'Citas' },
  { key: 'admission',    label: 'Admisión' },
  { key: 'clinical',     label: 'Clínico' },
  { key: 'charges',      label: 'Cobros' },
  { key: 'portal',       label: 'Portal' },
  { key: 'externals',    label: 'Bufetes' },
  { key: 'messages',     label: 'Mensajes' },
  { key: 'catalogs',     label: 'Catálogos' },
  { key: 'followup',     label: 'Seguim.' },
  { key: 'ai',           label: 'Vigía' },
  { key: 'otros',        label: 'Otros' },
  { key: 'voids',        label: 'Anulaciones', tone: 'warn' },
];

/** Etiquetas de módulo — espejo de `lib/activity-modules.ts` del back-office. */
const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', patients: 'Pacientes', calendar: 'Calendario',
  admission: 'Admisión', billing: 'Facturación', edson: 'Bandeja Edson',
  intake: 'Intake', messages: 'Mensajería', externals: 'Bufetes',
  settings: 'Configuración', doctor: 'Portal Médico', attorney: 'Portal Legal',
  vigia: 'Vigía (IA)', other: 'Sin módulo',
};

export function EmpleadosMetricasClient() {
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(() => denverDay());
  const [to, setTo] = useState(() => denverDay());
  const [onlyActive, setOnlyActive] = useState(true);
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
    () => (rows ?? []).filter((r) => !onlyActive || totalOf(r) > 0),
    [rows, onlyActive],
  );

  const totals = useMemo(() => {
    const base = { activeMinutes: 0, callsMade: 0, smsSent: 0, smsDelivered: 0, patientsCreated: 0, appointmentsCreated: 0, payments: 0, voids: 0 };
    for (const r of rows ?? []) {
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
  }, [rows]);

  const exportCsv = useCallback(() => {
    if (!visible.length) return;
    // El CSV se arma de las MISMAS listas que la tabla: si mañana se agrega una
    // familia, sale en los dos lados sin que nadie tenga que acordarse.
    const header = [
      'empleado', 'rol', 'minutos_activos', 'acciones',
      ...CALL_COLUMNS.map(c => c.key),
      ...FAMILY_COLUMNS.map(c => c.key),
      ...Object.keys(MODULE_LABELS).map(m => `min_${m}`),
    ].join(',');
    const lines = visible.map((r) => [
      `"${r.name.replaceAll('"', '""')}"`, r.role, r.activeMinutes, r.totalActions,
      ...CALL_COLUMNS.map(c => r[c.key] ?? 0),
      ...FAMILY_COLUMNS.map(c => r.families?.[c.key] ?? 0),
      ...Object.keys(MODULE_LABELS).map(m => r.minutesByModule?.[m] ?? 0),
    ].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `metricas-empleados_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [visible, from, to]);

  return (
    <div className="p-6 space-y-6">

      {/* KPIs del período. Sin "Contestadas": ese conteo son las ENTRANTES
          atendidas, y desde el 2026-08-05 Twilio las desvía a otro número, así
          que la tarjeta era un cero permanente para todos. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Clock}        label="Tiempo activo"   value={fmtMinutes(totals.activeMinutes)} color="bg-emerald/10 text-emerald" />
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

        <div className="ml-auto flex items-center gap-2">
          {/* Tabla o carrera: la misma data contada de dos formas. */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5">
            {([['tabla', 'Tabla', Table2], ['carrera', 'Carrera', Trophy]] as const).map(([k, label, Icon]) => (
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
            <p className="text-sm text-text-3">No se pudieron cargar las métricas. Cambia el período o recarga la página.</p>
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
            <table className="w-full text-sm min-w-[1560px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3 sticky left-0 bg-surface-2 z-10">Empleado</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Activo</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Acciones</th>
                  {[...CALL_COLUMNS, ...FAMILY_COLUMNS].map((c) => (
                    <th key={c.key} className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">{c.label}</th>
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
                      <div className="min-w-[160px]">
                        <div className="font-medium text-text-1 text-[12.5px]">{r.name}</div>
                        <div className="text-[10px] text-text-3 uppercase tracking-wider">{ROLE_LABELS[r.role] ?? r.role}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn('font-mono tabular-nums text-[12px]', r.activeMinutes > 0 ? 'text-emerald' : 'text-text-3')}>
                        {fmtMinutes(r.activeMinutes)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-[12px]">
                      <span className={cn('font-mono tabular-nums font-semibold', r.totalActions > 0 ? 'text-text-1' : 'text-text-3')}>
                        {r.totalActions}
                      </span>
                    </td>
                    {CALL_COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-3 text-right text-[12px]">
                        <Num value={r[c.key] ?? 0} />
                      </td>
                    ))}
                    {FAMILY_COLUMNS.map((c) => {
                      const v = r.families?.[c.key] ?? 0;
                      return (
                        <td key={c.key} className="px-3 py-3 text-right text-[12px]">
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

            {/* En qué módulos se fue el tiempo. Barras y no números sueltos:
                lo que importa es la proporción, no el minuto exacto. */}
            {Object.keys(detail.minutesByModule ?? {}).length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald" />
                  Tiempo por módulo
                </div>
                <div className="space-y-1">
                  {Object.entries(detail.minutesByModule)
                    .sort(([, a], [, b]) => b - a)
                    .map(([mod, mins]) => {
                      const top = Math.max(...Object.values(detail.minutesByModule));
                      return (
                        <div key={mod} className="flex items-center gap-2">
                          <span className="text-[11px] text-text-2 w-28 shrink-0 truncate">
                            {MODULE_LABELS[mod] ?? mod}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald"
                              style={{ width: `${top > 0 ? Math.round((mins / top) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-text-1 tabular-nums w-12 text-right shrink-0">
                            {fmtMinutes(mins)}
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
