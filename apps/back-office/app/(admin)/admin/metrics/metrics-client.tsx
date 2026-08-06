'use client';

/**
 * Métricas por empleado — B.29+ (supervisión del admin).
 *
 * Qué hizo cada quien y cuándo: tiempo activo en la app, llamadas hechas y
 * contestadas, pacientes/casos/citas creados, check-ins, triajes, labs,
 * servicios, férulas, pagos, salidas y cierres del doctor. Filtro por día /
 * ayer / 7 días / mes / rango libre (días de America/Denver, el hoy de la
 * clínica). Click en la fila → desglose completo de acciones del empleado.
 *
 * La data la arma /api/admin/metrics/employees (AuditLog + CallLog +
 * user_activity, ver Fases 1 y 2).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, Download, Phone, PhoneIncoming, RefreshCw, UserPlus, CalendarDays, DollarSign } from 'lucide-react';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@precision/ui';
import {
  PageHeader,
  KpiCard,
  FilterPill,
  DataTable,
  TableFooter,
  EmptyState,
  PersonAvatar,
  TagPill,
  Skeleton,
} from '@/components/ui-phoenix';

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

type Preset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'custom';

/** Día actual (o desplazado) en America/Denver como YYYY-MM-DD. */
function denverDay(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

function fmtMinutes(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Actividad total de una fila — decide si el empleado "hizo algo" en el rango. */
function totalOf(r: EmployeeRow): number {
  return r.activeMinutes + r.callsMade + r.callsAnswered +
    Object.values(r.byAction).reduce((a, b) => a + b, 0);
}

/** Celda numérica: los ceros se atenúan para que lo hecho salte a la vista. */
function Num({ value }: { value: number }) {
  return value > 0
    ? <span className="font-mono">{value}</span>
    : <span className="font-mono text-text-muted/40">0</span>;
}

/** "Nombre Apellido Más" → props que espera PersonAvatar. */
function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = name.split(' ');
  return { firstName, lastName: rest.join(' ') };
}

export function MetricsClient() {
  const t = useTranslations('phoenix.metrics');

  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(() => denverDay());
  const [to, setTo] = useState(() => denverDay());
  const [rows, setRows] = useState<EmployeeRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [onlyActive, setOnlyActive] = useState(true);
  const [detail, setDetail] = useState<EmployeeRow | null>(null);

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p);
    const today = denverDay();
    if (p === 'today')     { setFrom(today); setTo(today); }
    if (p === 'yesterday') { const y = denverDay(-1); setFrom(y); setTo(y); }
    if (p === 'last7')     { setFrom(denverDay(-6)); setTo(today); }
    if (p === 'thisMonth') { setFrom(`${today.slice(0, 8)}01`); setTo(today); }
    // custom: deja from/to como estén y muestra los inputs
  }, []);

  useEffect(() => {
    if (!from || !to || from > to) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/admin/metrics/employees?from=${from}&to=${to}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { employees: EmployeeRow[] }) => {
        if (!cancelled) setRows(data.employees);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  const visible = useMemo(
    () => (rows ?? []).filter((r) => !onlyActive || totalOf(r) > 0),
    [rows, onlyActive],
  );

  const totals = useMemo(() => {
    const base = {
      activeMinutes: 0, callsMade: 0, callsAnswered: 0,
      patientsCreated: 0, casesCreated: 0, appointmentsCreated: 0, payments: 0,
    };
    for (const r of rows ?? []) {
      base.activeMinutes += r.activeMinutes;
      base.callsMade += r.callsMade;
      base.callsAnswered += r.callsAnswered;
      base.patientsCreated += r.patientsCreated;
      base.casesCreated += r.casesCreated;
      base.appointmentsCreated += r.appointmentsCreated;
      base.payments += r.payments;
    }
    return base;
  }, [rows]);

  // Desglose del detalle: nombre legible para las acciones conocidas, la clave
  // cruda prettificada para el resto — nunca se oculta una acción.
  const actionLabel = useCallback((action: string): string => {
    const KNOWN: Record<string, string> = {
      CREATE_PATIENT: t('actCreatePatient'),
      UPDATE_PATIENT: t('actUpdatePatient'),
      CREATE_CASE_FROM_CALL: t('actCreateCase'),
      UPDATE_CASE: t('actUpdateCase'),
      CREATE_APPOINTMENT: t('actCreateAppointment'),
      SCHEDULE_FIRST_APPOINTMENT: t('actScheduleFirst'),
      CONFIRM_APPOINTMENT: t('actConfirmAppointment'),
      CONFIRM_FIRST_APPOINTMENT: t('actConfirmAppointment'),
      CHECK_IN: t('actCheckIn'),
      ADMIT_TO_ROOM: t('actAdmit'),
      TRIAGE_VITALS_SAVED: t('actTriage'),
      TRIAGE_VITALS_CORRECTED: t('actTriageCorrected'),
      CREATE_LAB_ORDER: t('actLabOrder'),
      ADD_LAB_ORDER: t('actLabOrder'),
      UPLOAD_LAB_RESULT: t('actLabResult'),
      CHARGE_CASH_SERVICE: t('actCashService'),
      DISPENSE_BRACE: t('actBrace'),
      REGISTER_BILLING_PAYMENT: t('actPayment'),
      CANCEL_BILLING_PAYMENT: t('actPaymentCancel'),
      CHECKOUT_APPOINTMENT: t('actCheckout'),
      REOPEN_APPOINTMENT: t('actReopen'),
      DOCTOR_DONE_WITH_PATIENT: t('actDoctorDone'),
      SIGN_VISIT_NOTE: t('actSignNote'),
      CREATE_VISIT_NOTE: t('actCreateNote'),
      SEND_PORTAL_LINK: t('actSendPortal'),
      INSERT_CASE_NOTE: t('actCaseNote'),
      ANSWER_INBOUND_CALL: t('actAnswerCall'),
    };
    return KNOWN[action] ?? action.replaceAll('_', ' ').toLowerCase();
  }, [t]);

  const exportCsv = useCallback(() => {
    if (!rows) return;
    const cols = [
      'name', 'role', 'activeMinutes', 'callsMade', 'callsAnswered',
      'patientsCreated', 'casesCreated', 'appointmentsCreated', 'checkIns',
      'triages', 'labs', 'cashServices', 'braces', 'payments', 'checkouts',
      'doctorDone', 'notesSigned',
    ] as const;
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
  }, [rows, visible, from, to]);

  const columns: Array<{ key: keyof EmployeeRow; labelKey: string }> = [
    { key: 'callsMade',           labelKey: 'colCallsMade' },
    { key: 'callsAnswered',       labelKey: 'colCallsAnswered' },
    { key: 'patientsCreated',     labelKey: 'colPatients' },
    { key: 'casesCreated',        labelKey: 'colCases' },
    { key: 'appointmentsCreated', labelKey: 'colAppointments' },
    { key: 'checkIns',            labelKey: 'colCheckIns' },
    { key: 'triages',             labelKey: 'colTriages' },
    { key: 'labs',                labelKey: 'colLabs' },
    { key: 'cashServices',        labelKey: 'colServices' },
    { key: 'braces',              labelKey: 'colBraces' },
    { key: 'payments',            labelKey: 'colPayments' },
    { key: 'checkouts',           labelKey: 'colCheckouts' },
    { key: 'doctorDone',          labelKey: 'colDoctorDone' },
    { key: 'notesSigned',         labelKey: 'colNotesSigned' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={
          <Button variant="outline" onClick={exportCsv} disabled={!rows || visible.length === 0} className="w-full sm:w-auto">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {t('exportCsv')}
          </Button>
        }
      />

      {/* KPIs del período */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard compact label={t('kpiActiveTime')} value={fmtMinutes(totals.activeMinutes)} color="text-emerald" icon={Activity} iconBg="bg-emerald/10" iconColor="text-emerald" />
        <KpiCard compact label={t('kpiCallsMade')} value={totals.callsMade} color="text-brand" icon={Phone} iconBg="bg-brand/10" iconColor="text-brand" />
        <KpiCard compact label={t('kpiCallsAnswered')} value={totals.callsAnswered} color="text-cyan" icon={PhoneIncoming} iconBg="bg-cyan/10" iconColor="text-cyan" />
        <KpiCard compact label={t('kpiPatients')} value={totals.patientsCreated} color="text-text-1" icon={UserPlus} />
        <KpiCard compact label={t('kpiAppointments')} value={totals.appointmentsCreated} color="text-text-1" icon={CalendarDays} />
        <KpiCard compact label={t('kpiPayments')} value={totals.payments} color="text-amber" icon={DollarSign} iconBg="bg-amber/10" iconColor="text-amber" />
      </div>

      {/* Filtro de período */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterPill active={preset === 'today'} onClick={() => applyPreset('today')} label={t('presetToday')} />
        <FilterPill active={preset === 'yesterday'} onClick={() => applyPreset('yesterday')} label={t('presetYesterday')} />
        <FilterPill active={preset === 'last7'} onClick={() => applyPreset('last7')} label={t('presetLast7')} />
        <FilterPill active={preset === 'thisMonth'} onClick={() => applyPreset('thisMonth')} label={t('presetThisMonth')} />
        <FilterPill active={preset === 'custom'} onClick={() => applyPreset('custom')} label={t('presetCustom')} />
        {preset === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[150px] text-xs" />
            <span className="text-text-muted text-xs">→</span>
            <Input type="date" value={to} min={from} max={denverDay()} onChange={(e) => setTo(e.target.value)} className="h-8 w-[150px] text-xs" />
          </div>
        )}
        <div className="ml-auto">
          <FilterPill
            active={onlyActive}
            onClick={() => setOnlyActive((v) => !v)}
            label={t('onlyWithActivity')}
            count={rows ? visible.length : undefined}
          />
        </div>
      </div>

      {/* Tabla por empleado */}
      {loading && !rows ? (
        <Skeleton className="h-[420px] w-full" />
      ) : error ? (
        <EmptyState.Rich icon={RefreshCw} title={t('errorTitle')} subtitle={t('errorDesc')} />
      ) : visible.length === 0 ? (
        <EmptyState.Rich icon={Activity} title={t('emptyTitle')} subtitle={t('emptyDesc')} />
      ) : (
        <DataTable.Card>
          <DataTable.Scroll>
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <DataTable.Table>
                <DataTable.Head>
                  <DataTable.Th sticky="left">{t('colEmployee')}</DataTable.Th>
                  <DataTable.Th align="right">{t('colActive')}</DataTable.Th>
                  {columns.map((c) => (
                    <DataTable.Th key={c.key} align="right">{t(c.labelKey)}</DataTable.Th>
                  ))}
                </DataTable.Head>
                <tbody>
                  {visible.map((r) => (
                    <DataTable.Row key={r.userId} onClick={() => setDetail(r)}>
                      <DataTable.Td sticky="left">
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <PersonAvatar {...splitName(r.name)} size={6} />
                          <div className="min-w-0">
                            <div className="text-sm text-text-1 truncate">{r.name}</div>
                            <div className="text-[10px] text-text-muted uppercase tracking-wider">{r.role}</div>
                          </div>
                        </div>
                      </DataTable.Td>
                      <DataTable.Td align="right">
                        <span className={r.activeMinutes > 0 ? 'font-mono text-emerald' : 'font-mono text-text-muted/40'}>
                          {fmtMinutes(r.activeMinutes)}
                        </span>
                      </DataTable.Td>
                      {columns.map((c) => (
                        <DataTable.Td key={c.key} align="right">
                          <Num value={r[c.key] as number} />
                        </DataTable.Td>
                      ))}
                    </DataTable.Row>
                  ))}
                </tbody>
              </DataTable.Table>
            </div>
          </DataTable.Scroll>
          <TableFooter
            left={t('footerCount', { shown: visible.length, total: rows?.length ?? 0 })}
            right={`${from} → ${to}`}
          />
        </DataTable.Card>
      )}

      {/* Desglose por empleado */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail && <PersonAvatar {...splitName(detail.name)} size={8} />}
              {detail?.name}
            </DialogTitle>
            <DialogDescription>
              {t('detailDesc', { from, to })}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('kpiActiveTime')}</div>
                  <div className="text-lg font-bold text-emerald mt-0.5">{fmtMinutes(detail.activeMinutes)}</div>
                </div>
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('kpiCallsMade')}</div>
                  <div className="text-lg font-bold text-brand mt-0.5">{detail.callsMade}</div>
                </div>
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('kpiCallsAnswered')}</div>
                  <div className="text-lg font-bold text-cyan mt-0.5">{detail.callsAnswered}</div>
                </div>
              </div>

              <div>
                <div className="text-text-1 font-semibold text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand" />
                  {t('detailActions')}
                </div>
                {Object.keys(detail.byAction).length === 0 ? (
                  <p className="text-[11px] italic text-text-muted">{t('detailNoActions')}</p>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(detail.byAction)
                      .sort(([, a], [, b]) => b - a)
                      .map(([action, count]) => (
                        <div key={action} className="flex items-center justify-between gap-3 rounded-md bg-bg-2/40 border border-border/40 px-3 py-1.5">
                          <span className="text-[12.5px] text-text-2 truncate">{actionLabel(action)}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <TagPill label={action} colorClass="bg-bg-2 text-text-muted border border-border" mono compact />
                            <span className="font-mono text-sm text-text-1">{count}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
