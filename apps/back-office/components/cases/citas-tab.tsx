'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, MapPin, User, RefreshCw, Plus,
  LayoutList, Table2, CheckCircle2, XCircle, AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@precision/ui';
import { EmptyState } from '@/components/ui-phoenix';
import { AppointmentDialog } from '@/components/calendar/appointment-dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Appointment {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  type: string;
  status: string;
  notes: string | null;
  checkedInAt: string | null;
  attendanceSignedAt: string | null;
  clinic: { id: string; name: string } | null;
  provider: { id: string; firstName: string; lastName: string; specialty: string | null } | null;
}

interface Props {
  caseId: string;
  caseCode: string;
  patient: {
    firstName: string;
    lastName: string;
  };
  specialty: { id: string; name: string; color: string; workflowType: string } | null;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; colorClass: string; icon: React.ElementType }> = {
  SCHEDULED:    { label: 'Programada',  colorClass: 'bg-brand/10 text-brand border-brand/30',     icon: Calendar },
  CONFIRMED:    { label: 'Confirmada',  colorClass: 'bg-emerald/10 text-emerald border-emerald/30', icon: CheckCircle2 },
  CHECKED_IN:   { label: 'Check-in',   colorClass: 'bg-cyan/10 text-cyan border-cyan/30',          icon: CheckCircle2 },
  COMPLETED:    { label: 'Completada', colorClass: 'bg-emerald/10 text-emerald border-emerald/30', icon: CheckCircle2 },
  CANCELLED:    { label: 'Cancelada',  colorClass: 'bg-rose/10 text-rose border-rose/30',           icon: XCircle },
  NO_SHOW:      { label: 'No asistió', colorClass: 'bg-amber/10 text-amber border-amber/30',       icon: AlertCircle },
  RESCHEDULED:  { label: 'Reagendada', colorClass: 'bg-violet/10 text-violet border-violet/30',    icon: RefreshCw },
};

const TYPE_LABELS: Record<string, string> = {
  INITIAL:     'Inicial',
  FOLLOW_UP:   'Seguimiento',
  PROCEDURE:   'Procedimiento',
  CONSULTATION: 'Consulta',
  TELEHEALTH:  'Telesalud',
  OTHER:       'Otro',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('es-US', { hour: '2-digit', minute: '2-digit' });
}

function getYearList(appointments: Appointment[]) {
  const years = [...new Set(appointments.map(a => new Date(a.scheduledFor).getFullYear()))].sort((a, b) => b - a);
  return years;
}

// ─── Sub: Status pill ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, colorClass: 'bg-bg-2 text-text-2 border-border', icon: Calendar };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.colorClass}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Sub: Timeline view ───────────────────────────────────────────────────────

function TimelineView({ appointments }: { appointments: Appointment[] }) {
  if (appointments.length === 0) {
    return (
      <EmptyState.Rich
        icon={Calendar}
        title="No se encontraron citas"
        subtitle="No hay citas en el rango seleccionado."
      />
    );
  }

  // Group by month
  const grouped: Record<string, Appointment[]> = {};
  for (const a of appointments) {
    const key = new Date(a.scheduledFor).toLocaleDateString('es-US', { month: 'long', year: 'numeric' });
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
              const cfg = STATUS_CFG[a.status] ?? { label: a.status, colorClass: 'bg-bg-2 text-text-2 border-border', icon: Calendar };
              const Icon = cfg.icon;
              const isPast = new Date(a.scheduledFor) < new Date();
              return (
                <div key={a.id} className={`flex gap-4 items-start rounded-lg border border-border bg-bg-1 p-4 ${isPast ? 'opacity-70' : ''}`}>
                  {/* Date column */}
                  <div className="shrink-0 w-14 text-center">
                    <div className="text-[11px] text-text-muted uppercase font-semibold">
                      {new Date(a.scheduledFor).toLocaleDateString('es-US', { weekday: 'short' })}
                    </div>
                    <div className="text-2xl font-bold text-text-1 leading-none">
                      {new Date(a.scheduledFor).getDate()}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className={`w-0.5 self-stretch rounded-full ${isPast ? 'bg-border' : 'bg-brand/40'}`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-text-1 font-semibold text-sm">
                        {TYPE_LABELS[a.type] ?? a.type}
                      </span>
                      <StatusPill status={a.status} />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-text-muted flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtTime(a.scheduledFor)} · {a.durationMinutes} min
                      </span>
                      {a.clinic && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {a.clinic.name}
                        </span>
                      )}
                      {a.provider && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          Dr. {a.provider.firstName} {a.provider.lastName}
                          {a.provider.specialty && <span className="text-text-muted">· {a.provider.specialty}</span>}
                        </span>
                      )}
                    </div>
                    {a.notes && (
                      <div className="mt-1.5 text-[11px] text-text-2 italic line-clamp-2">{a.notes}</div>
                    )}
                    {a.checkedInAt && (
                      <div className="mt-1 text-[10px] text-emerald">✓ Check-in: {fmtTime(a.checkedInAt)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sub: Table view ──────────────────────────────────────────────────────────

function TableView({ appointments }: { appointments: Appointment[] }) {
  if (appointments.length === 0) {
    return (
      <EmptyState.Rich
        icon={Calendar}
        title="No se encontraron citas"
        subtitle="No hay citas en el rango seleccionado."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-2/50">
            {['Fecha', 'Hora', 'Tipo', 'Clínica', 'Médico', 'Duración', 'Estado'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {appointments.map((a, i) => (
            <tr key={a.id} className={`border-b border-border/40 hover:bg-white/[0.02] transition-colors ${i % 2 === 0 ? '' : 'bg-bg-2/20'}`}>
              <td className="px-3 py-2.5 text-text-1 whitespace-nowrap font-mono text-xs">{fmtDate(a.scheduledFor)}</td>
              <td className="px-3 py-2.5 text-text-2 whitespace-nowrap font-mono text-xs">{fmtTime(a.scheduledFor)}</td>
              <td className="px-3 py-2.5 text-text-1 whitespace-nowrap">{TYPE_LABELS[a.type] ?? a.type}</td>
              <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">{a.clinic?.name ?? '—'}</td>
              <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">
                {a.provider ? `Dr. ${a.provider.firstName} ${a.provider.lastName}` : '—'}
              </td>
              <td className="px-3 py-2.5 text-text-muted whitespace-nowrap">{a.durationMinutes} min</td>
              <td className="px-3 py-2.5 whitespace-nowrap"><StatusPill status={a.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CitasTab({ caseId, caseCode, patient, specialty }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'timeline' | 'table'>('timeline');
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Date filters
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(now.getFullYear(), 0, 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date(now.getFullYear(), 11, 31);
    return d.toISOString().slice(0, 10);
  });
  const [yearFilter, setYearFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/cases/${caseId}/appointments`);
      if (r.ok) {
        const data = await r.json();
        setAppointments(data.appointments ?? []);
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
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  // Sort: timeline = desc (most recent first), table = asc
  const sorted = [...filtered].sort((a, b) => {
    const diff = new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime();
    return view === 'timeline' ? -diff : diff;
  });

  const stats = {
    total: appointments.length,
    completed: appointments.filter(a => a.status === 'COMPLETED').length,
    upcoming: appointments.filter(a => new Date(a.scheduledFor) >= now && a.status !== 'CANCELLED').length,
  };

  return (
    <div className="space-y-4">
      {/* KPIs rápidos */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total citas', value: stats.total, color: 'text-brand' },
          { label: 'Completadas', value: stats.completed, color: 'text-emerald' },
          { label: 'Próximas', value: stats.upcoming, color: 'text-cyan' },
        ].map(k => (
          <div key={k.label} className="rounded-lg border border-border bg-bg-1 p-3 text-center">
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Controls bar */}
      <div className="rounded-lg border border-border bg-bg-1 p-3 flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-md overflow-hidden border border-border bg-bg-2">
          {([
            { id: 'timeline', label: 'Línea de tiempo', icon: LayoutList },
            { id: 'table',    label: 'Tabla',           icon: Table2 },
          ] as const).map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                view === v.id
                  ? 'bg-brand text-white'
                  : 'text-text-2 hover:text-text-1'
              }`}
            >
              <v.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>

        {/* Date filters */}
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setYearFilter(''); }}
              className="rounded-md bg-bg-2 border border-border px-2 py-1 text-xs text-text-1 outline-none focus:border-brand"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setYearFilter(''); }}
              className="rounded-md bg-bg-2 border border-border px-2 py-1 text-xs text-text-1 outline-none focus:border-brand"
            />
          </div>
          {years.length > 0 && (
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
              className="rounded-md bg-bg-2 border border-border px-2 py-1 text-xs text-text-1 outline-none focus:border-brand"
            >
              <option value="">Año</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <button
            onClick={() => { setYearFilter(''); const y = new Date().getFullYear(); setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`); }}
            className="p-1.5 rounded-md text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors"
            title="Resetear filtros"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Nueva cita */}
        <Button size="sm" onClick={() => setScheduleOpen(true)} className="shrink-0">
          <Plus className="w-3.5 h-3.5 mr-1" />
          <span>Nueva cita</span>
        </Button>

        {/* Refresh */}
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded-md text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors disabled:opacity-50"
          title="Recargar"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-muted gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Cargando citas…</span>
        </div>
      ) : view === 'timeline' ? (
        <TimelineView appointments={sorted} />
      ) : (
        <TableView appointments={sorted} />
      )}

      {/* Modal nueva cita */}
      <AppointmentDialog
        mode="case"
        open={scheduleOpen}
        onOpenChange={open => { setScheduleOpen(open); if (!open) load(); }}
        caseInfo={{ id: caseId, caseCode, patient, specialty }}
      />
    </div>
  );
}
