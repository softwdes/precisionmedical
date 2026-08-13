'use client';
import { localeApp } from '@/lib/fechas';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, MapPin, User, RefreshCw, Plus,
  LayoutList, Table2, CheckCircle2, XCircle, AlertCircle,
  Loader2, ChevronRight, FileText,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@precision/ui';
import { EmptyState } from '@/components/ui-phoenix';
import { AppointmentDialog } from '@/components/calendar/appointment-dialog';
import { AppointmentDetailPanel, type CalendarAppointment } from '@/components/calendar/appointment-detail-panel';
import { CaseVisitNotes } from '@/components/visit/case-visit-notes';
import type { CoverageDTO } from '@/lib/coverage';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * La cita trae la MISMA forma que consume el panel del calendario, mas los dos
 * campos que solo usa esta lista. Antes eran 8 campos planos y por eso no se
 * podia abrir el panel desde aca: mostraba el checklist del caso, el abogado y
 * el seguro, y sin esos datos abria vacio.
 */
type Appointment = CalendarAppointment & {
  checkedInAt: string | null;
  attendanceSignedAt: string | null;
};

interface Props {
  caseId: string;
  caseCode: string;
  patient: { firstName: string; lastName: string };
  specialty: { id: string; name: string; color: string; workflowType: string } | null;
  /**
   * Portal medico: el doctor ve el detalle de la cita pero NO cobra — misma
   * regla que en el calendario y en Day Admission.
   */
  hidePayments?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(localeApp(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString(localeApp(), { hour: '2-digit', minute: '2-digit' });
}
function getYearList(appointments: Appointment[]) {
  return [...new Set(appointments.map(a => new Date(a.scheduledFor).getFullYear()))].sort((a, b) => b - a);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status, labels }: { status: string; labels: Record<string, { label: string; colorClass: string; icon: React.ElementType }> }) {
  const cfg = labels[status] ?? { label: status, colorClass: 'bg-bg-2 text-text-2 border-border', icon: Calendar };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.colorClass}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function TimelineView({ appointments, statusLabels, typeLabels, emptyTitle, emptySubtitle, onOpen }: {
  appointments: Appointment[];
  statusLabels: Record<string, { label: string; colorClass: string; icon: React.ElementType }>;
  typeLabels: Record<string, string>;
  emptyTitle: string;
  emptySubtitle: string;
  onOpen: (a: Appointment) => void;
}) {
  if (appointments.length === 0) {
    return <EmptyState.Rich icon={Calendar} title={emptyTitle} subtitle={emptySubtitle} />;
  }
  const grouped: Record<string, Appointment[]> = {};
  for (const a of appointments) {
    const key = new Date(a.scheduledFor).toLocaleDateString(localeApp(), { month: 'long', year: 'numeric' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  }
  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([month, appts]) => (
        <div key={month}>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3 capitalize">{month}</div>
          <div className="space-y-2">
            {appts.map(a => {
              const isPast = new Date(a.scheduledFor) < new Date();
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpen(a)}
                  className={`group w-full text-left flex gap-4 items-start rounded-lg bg-bg-1 p-4 hover:bg-bg-2/40 transition-colors ${isPast ? 'opacity-70 hover:opacity-100' : ''}`}
                >
                  <div className="shrink-0 w-14 text-center">
                    <div className="text-[11px] text-text-muted uppercase font-semibold">
                      {new Date(a.scheduledFor).toLocaleDateString(localeApp(), { weekday: 'short' })}
                    </div>
                    <div className="text-2xl font-bold text-text-1 leading-none">
                      {new Date(a.scheduledFor).getDate()}
                    </div>
                  </div>
                  <div className={`w-0.5 self-stretch rounded-full ${isPast ? 'bg-border' : 'bg-brand/40'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-text-1 font-semibold text-sm">{typeLabels[a.type] ?? a.type}</span>
                      <StatusPill status={a.status} labels={statusLabels} />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-text-muted flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtTime(a.scheduledFor)} · {a.durationMinutes} min
                      </span>
                      {a.clinic && (
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{a.clinic.name}</span>
                      )}
                      {a.provider && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          Dr. {a.provider.firstName} {a.provider.lastName}
                          {a.provider.specialty && <span className="text-text-muted">· {a.provider.specialty}</span>}
                        </span>
                      )}
                    </div>
                    {a.notes && <div className="mt-1.5 text-[11px] text-text-2 italic line-clamp-2">{a.notes}</div>}
                    {a.checkedInAt && <div className="mt-1 text-[10px] text-emerald">✓ Check-in: {fmtTime(a.checkedInAt)}</div>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted shrink-0 self-center transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableView({ appointments, statusLabels, typeLabels, colHeaders, emptyTitle, emptySubtitle, onOpen }: {
  appointments: Appointment[];
  statusLabels: Record<string, { label: string; colorClass: string; icon: React.ElementType }>;
  typeLabels: Record<string, string>;
  colHeaders: string[];
  emptyTitle: string;
  emptySubtitle: string;
  onOpen: (a: Appointment) => void;
}) {
  if (appointments.length === 0) {
    return <EmptyState.Rich icon={Calendar} title={emptyTitle} subtitle={emptySubtitle} />;
  }
  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden rounded-lg bg-bg-1 divide-y divide-row-sep">
        {appointments.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpen(a)}
            className="w-full text-left px-4 py-3 flex flex-col gap-1 hover:bg-bg-2/40 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-text-1 font-semibold">
                {fmtDate(a.scheduledFor)} · {fmtTime(a.scheduledFor)}
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <StatusPill status={a.status} labels={statusLabels} />
                <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
              </span>
            </div>
            <span className="text-sm text-text-1">{typeLabels[a.type] ?? a.type}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {a.provider && (
                <span className="text-[11px] text-text-2 flex items-center gap-1">
                  <User className="w-3 h-3" />Dr. {a.provider.firstName} {a.provider.lastName}
                </span>
              )}
              {a.clinic && (
                <span className="text-[11px] text-text-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{a.clinic.name}
                </span>
              )}
              <span className="text-[11px] text-text-muted flex items-center gap-1">
                <Clock className="w-3 h-3" />{a.durationMinutes} min
              </span>
            </div>
          </button>
        ))}
      </div>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg bg-bg-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-row-sep bg-bg-2/50">
              {colHeaders.map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap${i === 0 ? ' sticky left-0 z-10 bg-bg-2' : i === colHeaders.length - 1 ? ' sticky right-0 z-10 bg-bg-2' : ''}`}
                >{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {appointments.map((a, i) => (
              <tr
                key={a.id}
                onClick={() => onOpen(a)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(a); } }}
                tabIndex={0}
                role="button"
                className={`cursor-pointer border-b border-row-sep hover:bg-white/[0.02] transition-colors ${i % 2 === 0 ? '' : 'bg-bg-2/20'}`}
              >
                <td className="sticky left-0 z-10 bg-bg-0 px-3 py-2.5 text-text-1 whitespace-nowrap font-mono text-xs">{fmtDate(a.scheduledFor)}</td>
                <td className="px-3 py-2.5 text-text-2 whitespace-nowrap font-mono text-xs">{fmtTime(a.scheduledFor)}</td>
                <td className="px-3 py-2.5 text-text-1 whitespace-nowrap">{typeLabels[a.type] ?? a.type}</td>
                <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">{a.clinic?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">
                  {a.provider ? `Dr. ${a.provider.firstName} ${a.provider.lastName}` : '—'}
                </td>
                <td className="px-3 py-2.5 text-text-muted whitespace-nowrap">{a.durationMinutes} min</td>
                <td className="sticky right-0 z-10 bg-bg-0 px-3 py-2.5 whitespace-nowrap"><StatusPill status={a.status} labels={statusLabels} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CitasTab({ caseId, caseCode, patient, specialty, hidePayments = false }: Props) {
  const t  = useTranslations('phoenix.caseTabs.citas');
  const tc = useTranslations('phoenix.common');
  /** El vocabulario de la nota clínica vive en `phoenix.doctor`, no acá. */
  const td = useTranslations('phoenix.doctor');

  const STATUS_CFG: Record<string, { label: string; colorClass: string; icon: React.ElementType }> = {
    SCHEDULED:   { label: t('statusScheduled'),   colorClass: 'bg-brand/10 text-brand-text border-brand/30',       icon: Calendar },
    CONFIRMED:   { label: t('statusConfirmed'),   colorClass: 'bg-emerald/10 text-emerald border-emerald/30', icon: CheckCircle2 },
    CHECKED_IN:  { label: t('statusCheckedIn'),   colorClass: 'bg-cyan/10 text-cyan border-cyan/30',          icon: CheckCircle2 },
    COMPLETED:   { label: t('statusCompleted'),   colorClass: 'bg-emerald/10 text-emerald border-emerald/30', icon: CheckCircle2 },
    CANCELLED:   { label: t('statusCancelled'),   colorClass: 'bg-rose/10 text-rose border-rose/30',           icon: XCircle },
    NO_SHOW:     { label: t('statusNoShow'),      colorClass: 'bg-amber/10 text-amber border-amber/30',       icon: AlertCircle },
    RESCHEDULED: { label: t('statusRescheduled'), colorClass: 'bg-violet/10 text-violet-text border-violet/30',    icon: RefreshCw },
  };

  const TYPE_LABELS: Record<string, string> = {
    INITIAL:      t('typeInitial'),
    FOLLOW_UP:    t('typeFollowUp'),
    PROCEDURE:    t('typeProcedure'),
    CONSULTATION: t('typeConsultation'),
    TELEHEALTH:   t('typeTelehealth'),
    OTHER:        t('typeOther'),
  };

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'timeline' | 'table'>('timeline');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  /** Cita abierta en el panel — el MISMO del calendario, sin "Ver caso": ya
   *  estamos dentro del caso, así que ese atajo no llevaría a ningún lado. */
  const [detalle, setDetalle] = useState<Appointment | null>(null);
  const [coverage, setCoverage] = useState<CoverageDTO | undefined>(undefined);

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(() => new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [dateTo,   setDateTo]   = useState(() => new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10));
  const [yearFilter, setYearFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/cases/${caseId}/appointments`);
      if (r.ok) {
        const data = await r.json() as { appointments?: Appointment[]; coverage?: CoverageDTO };
        const lista = data.appointments ?? [];
        setAppointments(lista);
        setCoverage(data.coverage);
        // Si el panel está abierto, seguir la fila recargada: tras editar o
        // reagendar la cita, el panel tiene que mostrar los datos nuevos.
        setDetalle((prev) => (prev ? lista.find((a) => a.id === prev.id) ?? null : null));
      }
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const years = getYearList(appointments);

  const filtered = appointments.filter(a => {
    const d = new Date(a.scheduledFor);
    if (yearFilter) return d.getFullYear() === parseInt(yearFilter);
    const from = dateFrom ? new Date(dateFrom) : null;
    const to   = dateTo   ? new Date(dateTo + 'T23:59:59') : null;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const diff = new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime();
    return view === 'timeline' ? -diff : diff;
  });

  const stats = {
    total:     appointments.length,
    completed: appointments.filter(a => a.status === 'COMPLETED').length,
    upcoming:  appointments.filter(a => new Date(a.scheduledFor) >= now && a.status !== 'CANCELLED').length,
  };

  const colHeaders = [t('colDate'), t('colTime'), t('colType'), t('colClinic'), t('colDoctor'), t('colDuration'), t('colStatus')];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t('statTotal'),     value: stats.total,     color: 'text-brand-text'   },
          { label: t('statCompleted'), value: stats.completed, color: 'text-emerald' },
          { label: t('statUpcoming'),  value: stats.upcoming,  color: 'text-cyan'    },
        ].map(k => (
          <div key={k.label} className="rounded-lg border border-border bg-bg-1 p-3 text-center">
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-border bg-bg-1 p-3 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md overflow-hidden border border-border bg-bg-2">
          {([
            { id: 'timeline', icon: LayoutList },
            { id: 'table',    icon: Table2 },
          ] as const).map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                view === v.id ? 'bg-brand text-white' : 'text-text-2 hover:text-text-1'
              }`}
            >
              <v.icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">Desde</label>
            <input
              type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setYearFilter(''); }}
              className="rounded-md bg-bg-2 border border-border px-2 py-1 text-xs text-text-1 outline-none focus:border-brand"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">Hasta</label>
            <input
              type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setYearFilter(''); }}
              className="rounded-md bg-bg-2 border border-border px-2 py-1 text-xs text-text-1 outline-none focus:border-brand"
            />
          </div>
          {years.length > 0 && (
            <select
              value={yearFilter} onChange={e => setYearFilter(e.target.value)}
              className="rounded-md bg-bg-2 border border-border px-2 py-1 text-xs text-text-1 outline-none focus:border-brand"
            >
              <option value="">{tc('selectYear')}</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <button
            onClick={() => { setYearFilter(''); const y = new Date().getFullYear(); setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`); }}
            className="p-1.5 rounded-md text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors"
            title={tc('resetFilters')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <Button size="sm" onClick={() => setScheduleOpen(true)} className="shrink-0">
          <Plus className="w-3.5 h-3.5 mr-1" />
          <span>{tc('newAppointment')}</span>
        </Button>

        <button
          onClick={load} disabled={loading}
          className="p-1.5 rounded-md text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors disabled:opacity-50"
          title={tc('reload')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-muted gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{tc('loading')}</span>
        </div>
      ) : view === 'timeline' ? (
        <TimelineView
          appointments={sorted} statusLabels={STATUS_CFG} typeLabels={TYPE_LABELS}
          emptyTitle={t('emptyTitle')} emptySubtitle={t('emptySubtitle')}
          onOpen={setDetalle}
        />
      ) : (
        <TableView
          appointments={sorted} statusLabels={STATUS_CFG} typeLabels={TYPE_LABELS}
          colHeaders={colHeaders} emptyTitle={t('emptyTitle')} emptySubtitle={t('emptySubtitle')}
          onOpen={setDetalle}
        />
      )}

      {/* Notas de las visitas — el archivo de lo que escribió el doctor.
          Va DESPUÉS de la lista y no dentro de cada fila: la fila entera ya abre
          el panel de la cita, y meterle un segundo blanco de clic adentro hace
          que una de las dos acciones se pierda. */}
      <div className="rounded-lg bg-bg-1 p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-violet" />
          <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">
            {td('visitNotes')}
          </h3>
        </div>
        <CaseVisitNotes caseId={caseId} />
      </div>

      <AppointmentDialog
        mode="case"
        open={scheduleOpen}
        onOpenChange={open => { setScheduleOpen(open); if (!open) load(); }}
        caseInfo={{ id: caseId, caseCode, patient, specialty }}
      />

      {/* Detalle de la cita — el MISMO panel del calendario. Sin `onOpenCase`:
          el boton "Ver caso" cuelga de ese callback, y aca ya estamos en el
          caso. Abre en Detalle, que es lo que se fue a buscar al hacer clic. */}
      {detalle && (
        <AppointmentDetailPanel
          appointment={detalle}
          initialTab="detail"
          coverage={coverage}
          hidePayments={hidePayments}
          onClose={() => setDetalle(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}
