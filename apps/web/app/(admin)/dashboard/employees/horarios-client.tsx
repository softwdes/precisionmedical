'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@precision/ui';
import { ChevronLeft, ChevronRight, Plus, Calendar, AlertCircle, X, Pencil } from 'lucide-react';

// ─── Select styles — CSS vars don't reach native <option> dropdowns ──────────
const SEL_CLS = 'w-full rounded-[8px] border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-brand/50 min-h-[44px]';
const SEL_STYLE: React.CSSProperties = { backgroundColor: '#161D31', color: '#F5F7FB' };
const OPT_STYLE: React.CSSProperties = { backgroundColor: '#161D31', color: '#F5F7FB' };

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmpSummary {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  type: string;
  status: string;
}

interface ScheduleEntry {
  employee: { id: string; name: string; initials: string; color: string; employeeType: string };
  schedule: {
    id: string;
    schedule_type: string;
    start_time: string;
    end_time: string;
    days_of_week: number[];
    clinic_name: string;
  } | null;
  exceptions: { id: string; date: string; exception_type: string; reason: string | null }[];
}

interface InitialScheduleData {
  employeeId:   string;
  employeeName: string;
  scheduleType: 'full_time' | 'part_time';
  clinic:       string;
  days:         number[];
  startTime:    string;
  endTime:      string;
}

const CLINICS = ['Provo','Pleasant Grove','Spanish Fork','West Valley','South Murray','Bolivia','Perú'];

const DAY_ABBR  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const DAY_NUMS  = [1,2,3,4,5,6,7];
const DAY_SHORT = ['L','M','X','J','V','S','D'];

const EXC_CONFIG: Record<string, { label: string; color: string }> = {
  vacation: { label: 'Vacación',  color: '#F43F5E' },
  absence:  { label: 'Ausencia',  color: '#F43F5E' },
  holiday:  { label: 'Feriado',   color: '#8B5CF6' },
  special:  { label: 'Especial',  color: '#8B5CF6' },
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${monday.toLocaleDateString('es', opts)} – ${sunday.toLocaleDateString('es', opts)}`;
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

function formatTime(t: string): string {
  return t.slice(0, 5);
}

// ─── Mes / Día helpers ────────────────────────────────────────────────────────

function getMonthWeekStarts(monthStart: Date): Date[] {
  const weeks: Date[] = [];
  const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  let d = getMondayOfWeek(new Date(monthStart.getFullYear(), monthStart.getMonth(), 1));
  while (d <= lastDay) {
    weeks.push(new Date(d));
    d = new Date(d);
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

function getMonthCalendarDays(monthStart: Date): (Date | null)[] {
  const year  = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month + 1, 0);
  const startDow  = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Mon = 0
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function formatDayLabel(d: Date): string {
  const s = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMonthLabel(d: Date): string {
  const s = d.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDayShort(d: Date): string {
  return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="grid border-b border-white/[0.05]" style={{ gridTemplateColumns: '136px repeat(7,1fr)' }}>
      <div className="p-2 flex items-center gap-2">
        <div className="h-[26px] w-[26px] rounded-full bg-white/[0.07] animate-pulse shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="h-2 w-20 rounded bg-white/[0.07] animate-pulse" />
          <div className="h-1.5 w-12 rounded bg-white/[0.05] animate-pulse" />
        </div>
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="border-l border-white/[0.05] p-1.5">
          <div className="h-5 w-full rounded-[5px] bg-white/[0.05] animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function MobileSkeletonCard() {
  return (
    <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.02] p-[10px_12px] mb-2 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-full bg-white/[0.07]" />
        <div className="flex-1 space-y-1">
          <div className="h-2.5 w-28 rounded bg-white/[0.07]" />
          <div className="h-2 w-16 rounded bg-white/[0.05]" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-[3px] bg-white/[0.05]" />
        ))}
      </div>
    </div>
  );
}

function SkeletonDayRow() {
  return (
    <div className="grid border-b border-white/[0.05]" style={{ gridTemplateColumns: '180px 1fr 130px' }}>
      <div className="p-3 flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-white/[0.07] animate-pulse shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="h-2 w-24 rounded bg-white/[0.07] animate-pulse" />
          <div className="h-1.5 w-16 rounded bg-white/[0.05] animate-pulse" />
        </div>
      </div>
      <div className="border-l border-white/[0.05] p-3">
        <div className="h-4 w-28 rounded bg-white/[0.05] animate-pulse" />
      </div>
      <div className="border-l border-white/[0.05] p-3">
        <div className="h-4 w-16 rounded bg-white/[0.05] animate-pulse" />
      </div>
    </div>
  );
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────

function AssignModal({
  employees,
  preEmployeeId,
  initialData,
  onClose,
  onSaved,
}: {
  employees: EmpSummary[];
  preEmployeeId?: string;
  initialData?: InitialScheduleData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initialData;
  const today = toISODate(new Date());
  const [empId, setEmpId]           = useState(initialData?.employeeId ?? preEmployeeId ?? '');
  const [schedType, setSchedType]   = useState<'full_time' | 'part_time'>(initialData?.scheduleType ?? 'full_time');
  const [clinic, setClinic]         = useState(initialData?.clinic ?? 'Provo');
  const [days, setDays]             = useState<number[]>(initialData?.days ?? [1,2,3,4,5]);
  const [startTime, setStartTime]   = useState(initialData?.startTime ?? '08:00');
  const [endTime, setEndTime]       = useState(initialData?.endTime ?? '17:00');
  const [validFrom, setValidFrom]   = useState(today);
  const [validUntil, setValidUntil] = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  const handleTypeChange = (t: 'full_time' | 'part_time') => {
    setSchedType(t);
    if (t === 'full_time') { setDays([1,2,3,4,5]); setStartTime('08:00'); setEndTime('17:00'); }
    else                   { setDays([1,3,5]);       setStartTime('08:00'); setEndTime('13:00'); }
  };

  const toggleDay = (d: number) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a,b) => a-b));
  };

  const canSave = empId && startTime && endTime && days.length > 0 && validFrom;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true); setError('');
    try {
      const emp = employees.find(e => e.id === empId);
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: empId, schedule_type: schedType, start_time: startTime, end_time: endTime, days_of_week: days, clinic_name: clinic, valid_from: validFrom, valid_until: validUntil || undefined }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Error'); }
      onSaved();
      const subtitle = `${emp ? emp.firstName + ' ' + emp.lastName : ''} · ${schedType === 'full_time' ? 'Full time' : 'Part time'} · ${clinic}`;
      window.dispatchEvent(new CustomEvent('horarios:saved', {
        detail: { title: isEdit ? 'Horario actualizado' : 'Horario asignado', subtitle },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const formContent = (
    <div className="space-y-4">
      {/* Empleado */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">Empleado *</label>
        {isEdit ? (
          <p className="flex items-center text-[13px] font-semibold text-text-1 bg-white/[0.03] border border-border rounded-[8px] px-3 py-2 min-h-[44px]">
            {initialData.employeeName}
          </p>
        ) : (
          <select value={empId} onChange={e => setEmpId(e.target.value)} className={SEL_CLS} style={SEL_STYLE}>
            <option value="" style={OPT_STYLE}>Seleccionar empleado…</option>
            {employees.filter(e => e.status === 'ACTIVE').map(e => (
              <option key={e.id} value={e.id} style={OPT_STYLE}>{e.firstName} {e.lastName} — {e.employeeCode}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tipo + Clínica */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">Tipo *</label>
          <select value={schedType} onChange={e => handleTypeChange(e.target.value as 'full_time' | 'part_time')} className={SEL_CLS} style={SEL_STYLE}>
            <option value="full_time" style={OPT_STYLE}>Full time</option>
            <option value="part_time" style={OPT_STYLE}>Part time</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">Clínica *</label>
          <select value={clinic} onChange={e => setClinic(e.target.value)} className={SEL_CLS} style={SEL_STYLE}>
            {CLINICS.map(c => <option key={c} value={c} style={OPT_STYLE}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Días */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">Días de trabajo *</label>
        <div className="grid grid-cols-7 gap-1.5">
          {DAY_NUMS.map((d, i) => {
            const active = days.includes(d);
            return (
              <button key={d} type="button" onClick={() => toggleDay(d)}
                className={cn('aspect-square rounded-[6px] text-[12px] font-semibold transition-all min-h-[44px] border',
                  active ? 'text-white border-transparent' : 'bg-white/[0.03] border-white/[0.08] text-text-muted opacity-50 hover:opacity-80')}
                style={active ? { background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' } : {}}>
                {DAY_SHORT[i]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Horario */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">Hora entrada *</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
            className="w-full rounded-[8px] border border-border bg-white/[0.04] px-3 py-2 text-[13px] text-text-1 focus:outline-none focus:border-brand/50 min-h-[44px]" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">Hora salida *</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
            className="w-full rounded-[8px] border border-border bg-white/[0.04] px-3 py-2 text-[13px] text-text-1 focus:outline-none focus:border-brand/50 min-h-[44px]" />
        </div>
      </div>

      {/* Vigencia */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">Vigente desde *</label>
          <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
            className="w-full rounded-[8px] border border-border bg-white/[0.04] px-3 py-2 text-[13px] text-text-1 focus:outline-none focus:border-brand/50 min-h-[44px]" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">Vigente hasta</label>
          <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
            placeholder="Sin fecha de fin"
            className="w-full rounded-[8px] border border-border bg-white/[0.04] px-3 py-2 text-[13px] text-text-1 focus:outline-none focus:border-brand/50 min-h-[44px]" />
        </div>
      </div>

      {error && <p className="text-[12px] text-rose">{error}</p>}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <button type="button" onClick={onClose}
          className="rounded-[9px] border border-border bg-white/[0.04] py-2.5 text-[13px] font-semibold text-text-2 hover:bg-white/[0.07] transition-colors min-h-[44px]">
          Cancelar
        </button>
        <button type="button" onClick={handleSave} disabled={!canSave || saving}
          className="rounded-[9px] py-2.5 text-[13px] font-semibold text-white transition-all disabled:opacity-40 min-h-[44px]"
          style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar horario'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop modal */}
      <div className="hidden md:flex fixed inset-0 z-50 items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-bg-1 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[15px] font-bold text-text-1">{isEdit ? 'Editar horario' : 'Asignar horario'}</h2>
            <button onClick={onClose} className="text-text-3 hover:text-text-1 transition-colors"><X className="h-4 w-4" /></button>
          </div>
          {formContent}
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="absolute bottom-0 left-0 right-0 rounded-t-[20px] bg-bg-1 border-t border-border max-h-[88vh] overflow-y-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mt-2 mb-4" />
          <div className="px-5 pb-2">
            <h2 className="text-[15px] font-bold text-text-1 mb-5">{isEdit ? 'Editar horario' : 'Asignar horario'}</h2>
            {formContent}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Exception Modal ──────────────────────────────────────────────────────────

function ExceptionModal({
  employees,
  preEmployeeId,
  preEmployeeName,
  preDate,
  onClose,
  onSaved,
}: {
  employees: EmpSummary[];
  preEmployeeId?: string;
  preEmployeeName?: string;
  preDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [empId, setEmpId]           = useState(preEmployeeId ?? '');
  const [date, setDate]             = useState(preDate ?? toISODate(new Date()));
  const [rangeType, setRangeType]   = useState<'single' | 'range'>('single');
  const [dateEnd, setDateEnd]       = useState('');
  const [excType, setExcType]       = useState<'vacation' | 'absence' | 'holiday' | 'special'>('vacation');
  const [reason, setReason]         = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  const canSave = empId && date && (rangeType === 'single' || (dateEnd && dateEnd >= date));

  const handleRangeToggle = (t: 'single' | 'range') => {
    setRangeType(t);
    if (t === 'single') setDateEnd('');
    if (t === 'range' && !dateEnd) {
      const d = new Date(date);
      d.setDate(d.getDate() + 1);
      setDateEnd(toISODate(d));
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true); setError('');
    try {
      const body: Record<string, unknown> = {
        employee_id: empId, exception_type: excType,
        date, reason: reason || undefined,
      };
      if (rangeType === 'range' && dateEnd) body.date_end = dateEnd;
      const res = await fetch('/api/schedules/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Error'); }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally { setSaving(false); }
  };

  const EXC_TYPES = ['vacation','absence','holiday','special'] as const;
  const fromHeader = !preEmployeeId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-1 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-bold text-text-1">Registrar excepción</h2>
          <button onClick={onClose} className="text-text-3 hover:text-text-1 transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1">Empleado *</label>
            {fromHeader ? (
              <select value={empId} onChange={e => setEmpId(e.target.value)} className={SEL_CLS} style={SEL_STYLE}>
                <option value="" style={OPT_STYLE}>Seleccionar empleado…</option>
                {employees.filter(e => e.status === 'ACTIVE').map(e => (
                  <option key={e.id} value={e.id} style={OPT_STYLE}>{e.firstName} {e.lastName} — {e.employeeCode}</option>
                ))}
              </select>
            ) : (
              <p className="text-[13px] font-semibold text-text-1 bg-white/[0.03] border border-border rounded-[8px] px-3 py-2">{preEmployeeName}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3">
                {rangeType === 'single' ? 'Fecha *' : 'Fecha inicio *'}
              </label>
              <div className="flex rounded-[7px] border border-white/[0.08] bg-white/[0.03] p-[2px] gap-0.5">
                {(['single','range'] as const).map(t => (
                  <button key={t} type="button" onClick={() => handleRangeToggle(t)}
                    className={cn('rounded-[5px] px-2.5 py-1 text-[11px] font-semibold transition-all',
                      rangeType === t ? 'bg-brand/10 text-brand' : 'text-text-3 hover:text-text-2')}>
                    {t === 'single' ? 'Un día' : 'Varios días'}
                  </button>
                ))}
              </div>
            </div>
            {fromHeader ? (
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded-[8px] border border-border bg-white/[0.04] px-3 py-2 text-[13px] text-text-1 focus:outline-none focus:border-brand/50 min-h-[44px]" />
            ) : (
              <p className="text-[13px] font-mono text-text-2 bg-white/[0.03] border border-border rounded-[8px] px-3 py-2">{date}</p>
            )}
            {rangeType === 'range' && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1">Fecha fin *</label>
                <input type="date" value={dateEnd} min={date} onChange={e => setDateEnd(e.target.value)}
                  className="w-full rounded-[8px] border border-border bg-white/[0.04] px-3 py-2 text-[13px] text-text-1 focus:outline-none focus:border-brand/50 min-h-[44px]" />
                {dateEnd && dateEnd >= date && (
                  <p className="text-[11px] text-text-muted mt-1">
                    {Math.round((new Date(dateEnd).getTime() - new Date(date).getTime()) / 86400000) + 1} día(s)
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-2">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {EXC_TYPES.map(t => (
                <button key={t} type="button" onClick={() => setExcType(t)}
                  className={cn('rounded-[8px] border py-2 text-[12px] font-semibold transition-all min-h-[44px]',
                    excType === t ? 'border-brand/40 bg-brand/10 text-brand' : 'border-border bg-white/[0.03] text-text-3 hover:text-text-2')}>
                  {EXC_CONFIG[t]?.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-3 mb-1">Motivo (opcional)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              className="w-full rounded-[8px] border border-border bg-white/[0.04] px-3 py-2 text-[13px] text-text-1 focus:outline-none focus:border-brand/50 resize-none" />
          </div>

          {error && <p className="text-[12px] text-rose">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onClose}
              className="rounded-[9px] border border-border bg-white/[0.04] py-2.5 text-[13px] font-semibold text-text-2 hover:bg-white/[0.07] min-h-[44px]">Cancelar</button>
            <button type="button" onClick={handleSave} disabled={!canSave || saving}
              className="rounded-[9px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-40 min-h-[44px]"
              style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
              {saving ? 'Guardando…' : 'Guardar excepción'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

function SuccessToast({ detail, title, onClose }: { detail: string; title: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex items-start gap-3 rounded-[14px] border border-brand/25 bg-bg-1 p-4 shadow-2xl max-w-[320px] animate-fade-in">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: 'rgba(99,102,241,0.15)' }}>
        <Calendar className="h-4 w-4" style={{ color: '#6366F1' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-text-1">{title}</p>
        <p className="text-[11.5px] text-text-3 mt-0.5 truncate">{detail}</p>
        <p className="text-[10.5px] text-emerald mt-0.5">Semana actualizada</p>
      </div>
      <button onClick={onClose} className="text-text-muted hover:text-text-2 mt-0.5"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function ScheduleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 mt-3 px-1">
      {[
        { label: 'Full time',           color: '#10B981', rgb: '16,185,129' },
        { label: 'Part time',           color: '#F59E0B', rgb: '245,158,11' },
        { label: 'Vacación / Ausencia', color: '#F43F5E', rgb: '244,63,94' },
        { label: 'Turno especial',      color: '#8B5CF6', rgb: '139,92,246' },
      ].map(({ label, color, rgb }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="h-[10px] w-[10px] rounded-[3px]"
            style={{ background: `rgba(${rgb},0.15)`, border: `1px solid rgba(${rgb},0.35)` }} />
          <span className="text-[11px] text-text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HorariosClient({ initialEmployees }: { initialEmployees: EmpSummary[] }) {
  // ── Existing state ──────────────────────────────────────────────────────────
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const [clinicFilter, setClinicFilter]          = useState('');
  const [schedules, setSchedules]                = useState<ScheduleEntry[]>([]);
  const [loading, setLoading]                    = useState(true);
  const [error, setError]                        = useState('');
  const [showAssign, setShowAssign]              = useState(false);
  const [preEmployee, setPreEmployee]            = useState<string | undefined>();
  const [editTarget, setEditTarget]              = useState<ScheduleEntry | null>(null);
  const [showExc, setShowExc]                    = useState(false);
  const [excModal, setExcModal]                  = useState<{ employeeId: string; name: string; date: string } | null>(null);
  const [toast, setToast]                        = useState('');
  const [toastTitle, setToastTitle]              = useState('Horario asignado');

  // ── New view state ──────────────────────────────────────────────────────────
  const [view, setView]                 = useState<'Semana' | 'Día' | 'Mes'>('Semana');

  // Día
  const [currentDay, setCurrentDay]     = useState(() => new Date());
  const [daySchedules, setDaySchedules] = useState<ScheduleEntry[]>([]);
  const [loadingDay, setLoadingDay]     = useState(false);

  // Mes
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const [monthWeeks, setMonthWeeks]     = useState<Map<string, ScheduleEntry[]>>(new Map());
  const [loadingMonth, setLoadingMonth] = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const weekDates = getWeekDates(currentWeekStart);
  const weekLabel = getWeekLabel(currentWeekStart);
  const todayStr  = toISODate(new Date());

  // ── Fetch: Semana ────────────────────────────────────────────────────────────
  const fetchSchedules = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ week_start: toISODate(currentWeekStart) });
      if (clinicFilter) qs.set('clinic_name', clinicFilter);
      const res = await fetch(`/api/schedules?${qs}`);
      if (!res.ok) throw new Error('Error al cargar horarios');
      setSchedules(await res.json() as ScheduleEntry[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoading(false); }
  }, [currentWeekStart, clinicFilter]);

  // ── Fetch: Día ────────────────────────────────────────────────────────────
  const fetchDaySchedules = useCallback(async () => {
    setLoadingDay(true); setError('');
    try {
      const weekStart = getMondayOfWeek(currentDay);
      const qs = new URLSearchParams({ week_start: toISODate(weekStart) });
      if (clinicFilter) qs.set('clinic_name', clinicFilter);
      const res = await fetch(`/api/schedules?${qs}`);
      if (!res.ok) throw new Error('Error al cargar horarios');
      setDaySchedules(await res.json() as ScheduleEntry[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoadingDay(false); }
  }, [currentDay, clinicFilter]);

  // ── Fetch: Mes ────────────────────────────────────────────────────────────
  const fetchMonthSchedules = useCallback(async () => {
    setLoadingMonth(true); setError('');
    try {
      const weeks = getMonthWeekStarts(currentMonth);
      const results = await Promise.all(weeks.map(async (ws) => {
        const qs = new URLSearchParams({ week_start: toISODate(ws) });
        if (clinicFilter) qs.set('clinic_name', clinicFilter);
        const res = await fetch(`/api/schedules?${qs}`);
        const data = res.ok ? await res.json() as ScheduleEntry[] : [];
        return [toISODate(ws), data] as [string, ScheduleEntry[]];
      }));
      setMonthWeeks(new Map(results));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoadingMonth(false); }
  }, [currentMonth, clinicFilter]);

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => { void fetchSchedules(); }, [fetchSchedules]);
  useEffect(() => { if (view === 'Día') void fetchDaySchedules(); }, [view, fetchDaySchedules]);
  useEffect(() => { if (view === 'Mes') void fetchMonthSchedules(); }, [view, fetchMonthSchedules]);

  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as CustomEvent<{ title: string; subtitle: string }>;
      setToastTitle(evt.detail?.title ?? 'Horario guardado');
      setToast(evt.detail?.subtitle ?? '');
    };
    window.addEventListener('horarios:saved', handler);
    return () => window.removeEventListener('horarios:saved', handler);
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const prevWeek  = () => { const d = new Date(currentWeekStart); d.setDate(d.getDate() - 7); setCurrentWeekStart(d); };
  const nextWeek  = () => { const d = new Date(currentWeekStart); d.setDate(d.getDate() + 7); setCurrentWeekStart(d); };
  const prevDay   = () => { const d = new Date(currentDay);  d.setDate(d.getDate() - 1); setCurrentDay(d); };
  const nextDay   = () => { const d = new Date(currentDay);  d.setDate(d.getDate() + 1); setCurrentDay(d); };
  const prevMonth = () => { const d = new Date(currentMonth); d.setMonth(d.getMonth() - 1); setCurrentMonth(d); };
  const nextMonth = () => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + 1); setCurrentMonth(d); };

  const openAssign = (empId?: string) => { setPreEmployee(empId); setShowAssign(true); };
  const openEdit   = (entry: ScheduleEntry) => setEditTarget(entry);

  const onSaved = () => {
    setShowAssign(false); setEditTarget(null); setExcModal(null);
    if (view === 'Día')  void fetchDaySchedules();
    else if (view === 'Mes') void fetchMonthSchedules();
    else void fetchSchedules();
  };

  // ── Cell content helper ───────────────────────────────────────────────────────
  const getCellContent = (entry: ScheduleEntry, date: Date) => {
    const dateStr = toISODate(date);
    const dayNum  = date.getDay() === 0 ? 7 : date.getDay();
    const exc = entry.exceptions.find(e => e.date === dateStr);
    const cfg = exc ? EXC_CONFIG[exc.exception_type] : null;
    if (exc && cfg) return { type: 'exception' as const, label: cfg.label, color: cfg.color };
    if (entry.schedule?.days_of_week.includes(dayNum)) {
      return {
        type: 'work' as const,
        label: `${formatTime(entry.schedule.start_time)}–${formatTime(entry.schedule.end_time)}`,
        color: entry.schedule.schedule_type === 'full_time' ? '#10B981' : '#F59E0B',
      };
    }
    return { type: 'off' as const };
  };

  const employeesWithSchedule = schedules.filter(s => s.schedule !== null).length;

  // ── Subtitle helper ───────────────────────────────────────────────────────────
  const subtitle =
    view === 'Semana' ? `Semana ${weekLabel} · ${employeesWithSchedule} empleados` :
    view === 'Día'    ? formatDayLabel(currentDay) :
    `${formatMonthLabel(currentMonth)} · ${initialEmployees.length} empleados`;

  // ── Navigation pill helper ────────────────────────────────────────────────────
  const navPill = (
    view === 'Semana' ? (
      <div className="flex items-center gap-1 rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-2 py-1">
        <button onClick={prevWeek} className="flex h-7 w-7 items-center justify-center rounded text-text-3 hover:text-text-1 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-1 text-[12px] font-[500] text-text-2 whitespace-nowrap">{weekLabel}</span>
        <button onClick={nextWeek} className="flex h-7 w-7 items-center justify-center rounded text-text-3 hover:text-text-1 transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    ) : view === 'Día' ? (
      <div className="flex items-center gap-1 rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-2 py-1">
        <button onClick={prevDay} className="flex h-7 w-7 items-center justify-center rounded text-text-3 hover:text-text-1 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-1 text-[12px] font-[500] text-text-2 whitespace-nowrap">{formatDayShort(currentDay)}</span>
        <button onClick={nextDay} className="flex h-7 w-7 items-center justify-center rounded text-text-3 hover:text-text-1 transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-1 rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-2 py-1">
        <button onClick={prevMonth} className="flex h-7 w-7 items-center justify-center rounded text-text-3 hover:text-text-1 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-1 text-[12px] font-[500] text-text-2 whitespace-nowrap">{formatMonthLabel(currentMonth)}</span>
        <button onClick={nextMonth} className="flex h-7 w-7 items-center justify-center rounded text-text-3 hover:text-text-1 transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    )
  );

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 pb-28">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-[15px] font-[500] text-text-1">Horarios de trabajo</h2>
          <p className="text-[12px] text-text-3 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">

          {/* Navigation pill */}
          {navPill}

          {/* View switcher */}
          <div className="flex rounded-[8px] border border-white/[0.08] bg-white/[0.03] p-[3px] gap-0.5">
            {(['Semana', 'Día', 'Mes'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-[6px] px-2.5 py-1 text-[11px] font-semibold transition-all',
                  v === view ? 'bg-brand/10 text-brand' : 'text-text-3 hover:text-text-2',
                )}>
                {v}
              </button>
            ))}
          </div>

          {/* Clinic filter */}
          <select
            value={clinicFilter}
            onChange={e => setClinicFilter(e.target.value)}
            className="rounded-[8px] border border-white/[0.08] px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-brand/40 min-h-[44px] sm:min-h-0"
            style={SEL_STYLE}>
            <option value="" style={OPT_STYLE}>Todas las clínicas</option>
            {CLINICS.map(c => <option key={c} value={c} style={OPT_STYLE}>{c}</option>)}
          </select>

          {/* Assign button */}
          <button
            onClick={() => openAssign()}
            className="flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold text-white transition-all hover:-translate-y-px min-h-[44px] sm:min-h-0"
            style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
            <Plus className="h-3.5 w-3.5" />
            Asignar horario
          </button>

          {/* Exception button */}
          <button
            onClick={() => setShowExc(true)}
            className="flex items-center gap-1.5 rounded-[9px] border border-border bg-white/[0.04] px-3 py-2 text-[12.5px] font-semibold text-text-2 transition-all hover:border-brand/25 hover:bg-brand/[0.07] hover:-translate-y-px min-h-[44px] sm:min-h-0">
            <Plus className="h-3.5 w-3.5" />
            Registrar excepción
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-rose/25 bg-rose/[0.07] px-4 py-3">
          <AlertCircle className="h-4 w-4 text-rose shrink-0" />
          <span className="text-[13px] text-rose flex-1">{error}</span>
          <button
            onClick={() => {
              if (view === 'Día') void fetchDaySchedules();
              else if (view === 'Mes') void fetchMonthSchedules();
              else void fetchSchedules();
            }}
            className="text-[12px] font-semibold text-rose hover:text-rose/80 underline">
            Reintentar
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          VISTA SEMANA
      ════════════════════════════════════════════════════ */}
      {view === 'Semana' && (
        <>
          {/* Desktop grid (≥ 768px) */}
          <div className="hidden md:block">
            <div className="rounded-[12px] border border-white/[0.07] overflow-hidden overflow-x-auto">
              <div style={{ minWidth: 620 }}>
                {/* Header row */}
                <div className="grid border-b border-white/[0.07] bg-white/[0.02]" style={{ gridTemplateColumns: '136px repeat(7,1fr)' }}>
                  <div className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Empleado</div>
                  {weekDates.map((d, i) => {
                    const isToday   = toISODate(d) === todayStr;
                    const isWeekend = i >= 5;
                    return (
                      <div key={i} className={cn('border-l border-white/[0.07] px-1.5 py-2 text-center', isWeekend && 'opacity-40')}>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted">{DAY_ABBR[i]}</div>
                        <div className={cn('text-[13px] font-[500] mt-0.5', isToday ? 'text-brand' : 'text-text-2')}>{d.getDate()}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Rows */}
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : schedules.length === 0
                    ? (
                      <div className="py-16 flex flex-col items-center gap-3">
                        <Calendar className="h-8 w-8 text-text-muted" />
                        <p className="text-[14px] font-semibold text-text-2">Sin horarios asignados</p>
                        <p className="text-[12px] text-text-3">Asigna el primer horario para comenzar a visualizar la semana</p>
                        <button onClick={() => openAssign()}
                          className="mt-1 flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-semibold text-white"
                          style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
                          <Plus className="h-3.5 w-3.5" />Asignar horario
                        </button>
                      </div>
                    )
                    : schedules.map((entry) => (
                      <div key={entry.employee.id}
                        className="grid border-b border-white/[0.05] last:border-0 min-h-[44px]"
                        style={{ gridTemplateColumns: '136px repeat(7,1fr)' }}>
                        {/* Employee col */}
                        <div className="group flex items-center gap-2 px-[10px] py-2">
                          <div className="h-[26px] w-[26px] shrink-0 rounded-full flex items-center justify-center text-[9px] font-[500] text-white"
                            style={{ background: entry.employee.color }}>
                            {entry.employee.initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-[500] text-text-1 truncate leading-tight">{entry.employee.name}</p>
                            <p className="text-[9px] mt-0.5"
                              style={{ color: entry.schedule?.schedule_type === 'full_time' ? '#10B981' : entry.schedule ? '#F59E0B' : '#6B7592' }}>
                              {entry.schedule?.schedule_type === 'full_time' ? 'Full time' : entry.schedule?.schedule_type === 'part_time' ? 'Part time' : 'Sin horario'}
                            </p>
                          </div>
                          {entry.schedule && (
                            <button onClick={() => openEdit(entry)} title="Editar horario"
                              className="shrink-0 opacity-0 group-hover:opacity-100 flex h-[18px] w-[18px] items-center justify-center rounded transition-all hover:bg-white/[0.10]"
                              style={{ color: '#818CF8' }}>
                              <Pencil size={9} />
                            </button>
                          )}
                        </div>
                        {/* Day cells */}
                        {weekDates.map((date, di) => {
                          const cell       = getCellContent(entry, date);
                          const isWeekend  = di >= 5;
                          if (cell.type === 'exception' || cell.type === 'work') {
                            return (
                              <div key={di} className={cn('border-l border-white/[0.05] p-[3px] flex items-center', isWeekend && 'opacity-40')}>
                                <button
                                  onClick={() => cell.type === 'work' && setExcModal({ employeeId: entry.employee.id, name: entry.employee.name, date: toISODate(date) })}
                                  className="w-full rounded-[5px] px-[4px] py-[3px] text-[9px] text-center transition-all hover:brightness-110"
                                  style={{
                                    background: `rgba(${cell.type === 'exception' ? (cell.color === '#F43F5E' ? '244,63,94' : '139,92,246') : (cell.color === '#10B981' ? '16,185,129' : '245,158,11')},0.10)`,
                                    border: `1px solid rgba(${cell.type === 'exception' ? (cell.color === '#F43F5E' ? '244,63,94' : '139,92,246') : (cell.color === '#10B981' ? '16,185,129' : '245,158,11')},0.25)`,
                                    color: cell.color,
                                  }}>
                                  {cell.label}
                                </button>
                              </div>
                            );
                          }
                          if (cell.type === 'off') {
                            return (
                              <div key={di} className={cn('border-l border-white/[0.05] p-[3px] flex items-center bg-white/[0.01]', isWeekend && 'opacity-30')}>
                                <span className="w-full text-center text-[9px] text-text-muted opacity-30">—</span>
                              </div>
                            );
                          }
                          return (
                            <div key={di} className="border-l border-white/[0.05] p-[3px] flex items-center">
                              <button onClick={() => openAssign(entry.employee.id)} title="Sin horario asignado"
                                className="w-full h-full min-h-[32px] rounded-[5px] border border-dashed border-white/10 hover:border-brand/30 hover:bg-brand/[0.04] transition-colors" />
                            </div>
                          );
                        })}
                      </div>
                    ))
                }
              </div>
            </div>
            {!loading && schedules.length > 0 && <ScheduleLegend />}
          </div>

          {/* Mobile cards (< 768px) */}
          <div className="md:hidden">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => <MobileSkeletonCard key={i} />)
              : schedules.length === 0
                ? (
                  <div className="flex flex-col items-center gap-3 py-16">
                    <Calendar className="h-8 w-8 text-text-muted" />
                    <p className="text-[14px] font-semibold text-text-2">Sin horarios asignados</p>
                    <p className="text-[12px] text-text-3 text-center">Asigna el primer horario para comenzar</p>
                    <button onClick={() => openAssign()}
                      className="mt-1 flex items-center gap-1.5 rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-white w-full justify-center"
                      style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
                      <Plus className="h-3.5 w-3.5" />Asignar horario
                    </button>
                  </div>
                )
                : schedules.map((entry) => {
                  const excBadge = entry.exceptions.length > 0
                    ? entry.exceptions.map(e => EXC_CONFIG[e.exception_type]?.label ?? e.exception_type).join(', ')
                    : null;
                  return (
                    <div key={entry.employee.id}
                      className="relative rounded-[10px] border border-white/[0.07] bg-white/[0.02] p-[10px_12px] mb-2">
                      {excBadge && (
                        <span className="absolute top-2 right-2 rounded-full border border-rose/30 bg-rose/[0.12] px-2 py-0.5 text-[10px] font-semibold text-rose">{excBadge}</span>
                      )}
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-[500] text-white"
                          style={{ background: entry.employee.color }}>
                          {entry.employee.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-[500] text-text-1 truncate">{entry.employee.name}</p>
                          <p className="text-[10px] font-mono"
                            style={{ color: entry.schedule?.schedule_type === 'full_time' ? '#10B981' : entry.schedule ? '#F59E0B' : '#6B7592' }}>
                            {entry.schedule ? `${formatTime(entry.schedule.start_time)}–${formatTime(entry.schedule.end_time)}` : 'Sin horario'}
                          </p>
                        </div>
                        {entry.schedule && (
                          <button onClick={() => openEdit(entry)} title="Editar horario"
                            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-[6px] border border-white/[0.08] bg-white/[0.03] transition-colors hover:bg-brand/[0.08] hover:border-brand/25"
                            style={{ color: '#818CF8' }}>
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {weekDates.map((date, di) => {
                          const cell    = getCellContent(entry, date);
                          const isToday = toISODate(date) === todayStr;
                          if (cell.type === 'exception') {
                            const initial = cell.color === '#F43F5E' ? 'V' : 'E';
                            return <div key={di}
                              className={cn('aspect-square rounded-[3px] flex items-center justify-center text-[9px] font-bold', isToday && 'ring-1 ring-brand')}
                              style={{ background: `rgba(${cell.color === '#F43F5E' ? '244,63,94' : '139,92,246'},0.15)`, color: cell.color }}>{initial}</div>;
                          }
                          if (cell.type === 'work') {
                            return <div key={di}
                              className={cn('aspect-square rounded-[3px]', isToday && 'ring-1 ring-brand')}
                              style={{ background: `rgba(${cell.color === '#10B981' ? '16,185,129' : '245,158,11'},0.18)` }} />;
                          }
                          return <div key={di} className={cn('aspect-square rounded-[3px] bg-white/[0.03] opacity-40', isToday && 'ring-1 ring-brand')} />;
                        })}
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════
          VISTA DÍA
      ════════════════════════════════════════════════════ */}
      {view === 'Día' && (
        <>
          {/* Desktop */}
          <div className="hidden md:block">
            <div className="rounded-[12px] border border-white/[0.07] overflow-hidden">
              {/* Header row */}
              <div className="grid border-b border-white/[0.07] bg-white/[0.02]"
                style={{ gridTemplateColumns: '180px 1fr 130px' }}>
                <div className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Empleado</div>
                <div className="border-l border-white/[0.07] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Horario</div>
                <div className="border-l border-white/[0.07] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Estado</div>
              </div>

              {loadingDay
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonDayRow key={i} />)
                : daySchedules.length === 0
                  ? (
                    <div className="py-16 flex flex-col items-center gap-3">
                      <Calendar className="h-8 w-8 text-text-muted" />
                      <p className="text-[14px] font-semibold text-text-2">Sin horarios asignados</p>
                      <button onClick={() => openAssign()}
                        className="mt-1 flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
                        <Plus className="h-3.5 w-3.5" />Asignar horario
                      </button>
                    </div>
                  )
                  : daySchedules.map((entry) => {
                    const cell = getCellContent(entry, currentDay);
                    return (
                      <div key={entry.employee.id}
                        className="grid border-b border-white/[0.05] last:border-0 min-h-[48px]"
                        style={{ gridTemplateColumns: '180px 1fr 130px' }}>
                        {/* Empleado */}
                        <div className="flex items-center gap-2.5 px-3 py-2">
                          <div className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-[500] text-white"
                            style={{ background: entry.employee.color }}>
                            {entry.employee.initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-[500] text-text-1 truncate">{entry.employee.name}</p>
                            <p className="text-[10px] text-text-muted">{entry.employee.employeeType}</p>
                          </div>
                        </div>
                        {/* Horario */}
                        <div className="border-l border-white/[0.05] flex items-center px-3 py-2">
                          {cell.type === 'work' && (
                            <span className="text-[13px] font-mono font-[500]" style={{ color: cell.color }}>{cell.label}</span>
                          )}
                          {cell.type === 'exception' && (
                            <span className="text-[12px] font-semibold" style={{ color: cell.color }}>{cell.label}</span>
                          )}
                          {cell.type === 'off' && (
                            <span className="text-[12px] text-text-muted opacity-40">—</span>
                          )}
                        </div>
                        {/* Estado */}
                        <div className="border-l border-white/[0.05] flex items-center px-3 py-2">
                          {cell.type === 'work' && (
                            <button
                              onClick={() => setExcModal({ employeeId: entry.employee.id, name: entry.employee.name, date: toISODate(currentDay) })}
                              title="Registrar excepción"
                              className="flex items-center gap-1.5 text-[11px] text-text-3 hover:text-brand transition-colors">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald shrink-0" />
                              Activo
                            </button>
                          )}
                          {cell.type === 'exception' && (
                            <span className="flex items-center gap-1.5 text-[11px]" style={{ color: cell.color }}>
                              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: cell.color }} />
                              Excepción
                            </span>
                          )}
                          {cell.type === 'off' && (
                            <span className="text-[11px] text-text-muted opacity-40">Libre</span>
                          )}
                        </div>
                      </div>
                    );
                  })
              }
            </div>
            {!loadingDay && daySchedules.length > 0 && <ScheduleLegend />}
          </div>

          {/* Mobile */}
          <div className="md:hidden">
            {loadingDay
              ? Array.from({ length: 4 }).map((_, i) => <MobileSkeletonCard key={i} />)
              : daySchedules.length === 0
                ? (
                  <div className="flex flex-col items-center gap-3 py-16">
                    <Calendar className="h-8 w-8 text-text-muted" />
                    <p className="text-[14px] font-semibold text-text-2">Sin horarios asignados</p>
                    <button onClick={() => openAssign()}
                      className="mt-1 flex items-center gap-1.5 rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-white w-full justify-center"
                      style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
                      <Plus className="h-3.5 w-3.5" />Asignar horario
                    </button>
                  </div>
                )
                : daySchedules.map((entry) => {
                  const cell = getCellContent(entry, currentDay);
                  return (
                    <div key={entry.employee.id}
                      className="flex items-center gap-3 rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 mb-2">
                      <div className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[10px] font-[500] text-white"
                        style={{ background: entry.employee.color }}>
                        {entry.employee.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-[500] text-text-1 truncate">{entry.employee.name}</p>
                        <p className="text-[11px] font-mono mt-0.5"
                          style={{ color: cell.type === 'work' ? cell.color : cell.type === 'exception' ? cell.color : '#6B7592' }}>
                          {cell.type === 'work' ? cell.label : cell.type === 'exception' ? cell.label : 'Libre'}
                        </p>
                      </div>
                      {cell.type === 'work' && (
                        <button
                          onClick={() => setExcModal({ employeeId: entry.employee.id, name: entry.employee.name, date: toISODate(currentDay) })}
                          className="shrink-0 text-[10px] text-text-muted border border-white/[0.08] rounded-[6px] px-2 py-1 hover:border-rose/30 hover:text-rose transition-colors">
                          Exc.
                        </button>
                      )}
                    </div>
                  );
                })
            }
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════
          VISTA MES
      ════════════════════════════════════════════════════ */}
      {view === 'Mes' && (
        <div>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_ABBR.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold uppercase tracking-wider text-text-muted py-1.5">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {loadingMonth ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="rounded-[8px] bg-white/[0.03] animate-pulse" style={{ minHeight: 56 }} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {getMonthCalendarDays(currentMonth).map((day, i) => {
                if (!day) return <div key={i} />;

                const dateStr         = toISODate(day);
                const isToday         = dateStr === todayStr;
                const isCurrentMonth  = day.getMonth() === currentMonth.getMonth();
                const weekKey         = toISODate(getMondayOfWeek(day));
                const entries         = monthWeeks.get(weekKey) ?? [];
                const workingCount    = entries.filter(e => getCellContent(e, day).type === 'work').length;
                const exceptionCount  = entries.filter(e => getCellContent(e, day).type === 'exception').length;

                return (
                  <button
                    key={i}
                    onClick={() => { setCurrentDay(day); setView('Día'); }}
                    title={`Ver ${formatDayShort(day)}`}
                    className={cn(
                      'relative flex flex-col items-start justify-start rounded-[8px] p-1.5 border transition-all hover:border-brand/30 hover:bg-brand/[0.05] text-left',
                      isToday
                        ? 'border-brand/40 bg-brand/[0.08]'
                        : 'border-white/[0.05] bg-white/[0.02]',
                      !isCurrentMonth && 'opacity-25 pointer-events-none',
                    )}
                    style={{ minHeight: 56 }}>
                    <span className={cn('text-[12px] font-[500] leading-none', isToday ? 'text-brand' : 'text-text-2')}>
                      {day.getDate()}
                    </span>
                    <div className="mt-1 flex flex-col gap-0.5 w-full">
                      {workingCount > 0 && (
                        <span className="text-[10px] font-semibold leading-none" style={{ color: '#10B981' }}>
                          ●{workingCount}
                        </span>
                      )}
                      {exceptionCount > 0 && (
                        <span className="text-[10px] font-semibold leading-none" style={{ color: '#F43F5E' }}>
                          !{exceptionCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Month legend */}
          {!loadingMonth && (
            <div className="flex flex-wrap items-center gap-4 mt-3 px-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold" style={{ color: '#10B981' }}>●4</span>
                <span className="text-[11px] text-text-muted">Empleados trabajando</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold" style={{ color: '#F43F5E' }}>!1</span>
                <span className="text-[11px] text-text-muted">Con excepción</span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[11px] text-text-muted italic">Clic en un día → ver detalle</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {showAssign && (
        <AssignModal
          employees={initialEmployees}
          preEmployeeId={preEmployee}
          onClose={() => setShowAssign(false)}
          onSaved={onSaved}
        />
      )}

      {editTarget?.schedule && (
        <AssignModal
          employees={initialEmployees}
          initialData={{
            employeeId:   editTarget.employee.id,
            employeeName: editTarget.employee.name,
            scheduleType: editTarget.schedule.schedule_type as 'full_time' | 'part_time',
            clinic:       editTarget.schedule.clinic_name,
            days:         editTarget.schedule.days_of_week,
            startTime:    editTarget.schedule.start_time,
            endTime:      editTarget.schedule.end_time,
          }}
          onClose={() => setEditTarget(null)}
          onSaved={onSaved}
        />
      )}

      {showExc && (
        <ExceptionModal
          employees={initialEmployees}
          onClose={() => setShowExc(false)}
          onSaved={onSaved}
        />
      )}

      {excModal && (
        <ExceptionModal
          employees={initialEmployees}
          preEmployeeId={excModal.employeeId}
          preEmployeeName={excModal.name}
          preDate={excModal.date}
          onClose={() => setExcModal(null)}
          onSaved={onSaved}
        />
      )}

      {/* ── Toast ── */}
      {toast && <SuccessToast detail={toast} title={toastTitle} onClose={() => setToast('')} />}
    </div>
  );
}
