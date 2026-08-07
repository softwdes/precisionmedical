'use client';

/**
 * Métricas → tab Empleados — productividad por empleado.
 *
 * Qué hizo cada quien en Clinic: tiempo de uso activo, llamadas hechas y
 * contestadas, pacientes/casos/citas creados, check-ins, triajes, labs,
 * servicios, férulas, pagos, salidas y cierres del doctor. Filtro Hoy / Ayer /
 * 7 días / Este mes / Rango libre (días de America/Denver, el hoy de la
 * clínica). Click en una fila → desglose completo de acciones.
 *
 * La data viene de api.metrics.employeeActivity (fn `employee_metrics` en la
 * DB del back-office: AuditLog atribuido + CallLog + user_activity).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@precision/ui';
import {
  Activity, Clock, Download, Loader2, Phone, PhoneIncoming,
  UserPlus, CalendarDays, DollarSign, X,
} from 'lucide-react';
import { api } from '@/lib/trpc/client';
import {
  KpiCard, Num, PeriodFilter, denverDay, fmtMinutes, presetRange, type Preset,
} from './metricas-shared';

// ─── Types (espejo de EmployeeActivityRow del router) ────────────────────────

interface EmployeeRow {
  userId: string;
  name: string;
  role: string;
  activeMinutes: number;
  callsMade: number;
  callsAnswered: number;
  callsDurationSeconds: number;
  patientsCreated: number;
  casesCreated: number;
  appointmentsCreated: number;
  checkIns: number;
  triages: number;
  labs: number;
  cashServices: number;
  braces: number;
  payments: number;
  checkouts: number;
  doctorDone: number;
  notesSigned: number;
  byAction: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function totalOf(r: EmployeeRow): number {
  return r.activeMinutes + r.callsMade + r.callsAnswered +
    Object.values(r.byAction).reduce((a, b) => a + b, 0);
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Súper Admin', ADMIN: 'Admin', CONTADOR: 'Contador',
  EMPLOYEE: 'Empleado', FRONT_DESK: 'Recepción', DOCTOR: 'Doctor',
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
};

const actionLabel = (a: string): string =>
  ACTION_LABELS[a] ?? a.replaceAll('_', ' ').toLowerCase();

// ─── Main ────────────────────────────────────────────────────────────────────

const COLUMNS: Array<{ key: keyof EmployeeRow; label: string }> = [
  { key: 'callsMade',           label: 'Llam.' },
  { key: 'callsAnswered',       label: 'Contest.' },
  { key: 'patientsCreated',     label: 'Pacientes' },
  { key: 'casesCreated',        label: 'Casos' },
  { key: 'appointmentsCreated', label: 'Citas' },
  { key: 'checkIns',            label: 'Check-ins' },
  { key: 'triages',             label: 'Triajes' },
  { key: 'labs',                label: 'Labs' },
  { key: 'cashServices',        label: 'Servicios' },
  { key: 'braces',              label: 'Férulas' },
  { key: 'payments',            label: 'Pagos' },
  { key: 'checkouts',           label: 'Salidas' },
  { key: 'doctorDone',          label: 'Dr. terminó' },
  { key: 'notesSigned',         label: 'Notas firm.' },
];

export function EmpleadosMetricasClient() {
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(() => denverDay());
  const [to, setTo] = useState(() => denverDay());
  const [onlyActive, setOnlyActive] = useState(true);
  const [detail, setDetail] = useState<EmployeeRow | null>(null);

  const validRange = !!from && !!to && from <= to;
  const query = api.metrics.employeeActivity.useQuery(
    { from, to },
    { enabled: validRange, staleTime: 30_000 },
  );
  const rows = (query.data?.employees ?? null) as EmployeeRow[] | null;

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p);
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
    const base = { activeMinutes: 0, callsMade: 0, callsAnswered: 0, patientsCreated: 0, appointmentsCreated: 0, payments: 0 };
    for (const r of rows ?? []) {
      base.activeMinutes += r.activeMinutes;
      base.callsMade += r.callsMade;
      base.callsAnswered += r.callsAnswered;
      base.patientsCreated += r.patientsCreated;
      base.appointmentsCreated += r.appointmentsCreated;
      base.payments += r.payments;
    }
    return base;
  }, [rows]);

  const exportCsv = useCallback(() => {
    if (!visible.length) return;
    const cols = ['name', 'role', 'activeMinutes', 'callsMade', 'callsAnswered', ...COLUMNS.slice(2).map(c => c.key)] as Array<keyof EmployeeRow>;
    const header = cols.join(',');
    const lines = visible.map((r) =>
      cols.map((c) => {
        const v = r[c];
        return typeof v === 'string' ? `"${v.replaceAll('"', '""')}"` : String(v);
      }).join(','),
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `metricas-empleados_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [visible, from, to]);

  return (
    <div className="p-6 space-y-6">

      {/* KPIs del período */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Clock}        label="Tiempo activo"   value={fmtMinutes(totals.activeMinutes)} color="bg-emerald/10 text-emerald" />
        <KpiCard icon={Phone}        label="Llamadas hechas" value={totals.callsMade}                 color="bg-brand/10 text-brand" />
        <KpiCard icon={PhoneIncoming} label="Contestadas"    value={totals.callsAnswered}             color="bg-cyan/10 text-cyan" />
        <KpiCard icon={UserPlus}     label="Pacientes nuevos" value={totals.patientsCreated}          color="bg-violet/10 text-violet" />
        <KpiCard icon={CalendarDays} label="Citas creadas"   value={totals.appointmentsCreated}       color="bg-rose/10 text-rose" />
        <KpiCard icon={DollarSign}   label="Pagos"           value={totals.payments}                  color="bg-amber/10 text-amber" />
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
            <table className="w-full text-sm min-w-[1200px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3 sticky left-0 bg-surface-2 z-10">Empleado</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Activo</th>
                  {COLUMNS.map((c) => (
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
                      <span className={cn('font-mono tabular-nums text-[12px]', r.activeMinutes > 0 ? 'text-emerald' : 'text-text-3/40')}>
                        {fmtMinutes(r.activeMinutes)}
                      </span>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-3 text-right text-[12px]">
                        <Num value={r[c.key] as number} />
                      </td>
                    ))}
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
                <div className="text-lg font-bold text-brand mt-0.5 tabular-nums">{detail.callsMade}</div>
              </div>
              <div className="rounded-lg bg-surface-2 border border-border p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-3">Contestadas</div>
                <div className="text-lg font-bold text-cyan mt-0.5 tabular-nums">{detail.callsAnswered}</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-brand" />
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
