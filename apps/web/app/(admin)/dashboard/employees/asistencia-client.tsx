'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Button, Badge, cn,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import {
  UserCheck, Coffee, Clock, UserX, RefreshCw, Pencil,
  FileText, Download, ChevronLeft, ChevronRight, AlertTriangle, MapPin,
} from 'lucide-react';
import dynamic from 'next/dynamic';

const AttendanceMap = dynamic(
  () => import('@/components/attendance/AttendanceMap').then(m => ({ default: m.AttendanceMap })),
  { ssr: false, loading: () => <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>Cargando mapa...</div> },
);

// ─── Constants ───────────────────────────────────────────────────────────────

const CLINICS = [
  'Provo Clinic', 'Pleasant Grove Clinic', 'Spanish Fork Clinic',
  'West Valley Clinic', 'South Murray Clinic', 'Bolivia', 'Perú',
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface TodayRow {
  employee_id: string; firstName: string; lastName: string; employeeCode: string;
  record_id: string | null; check_in: string | null; check_out: string | null;
  break_start: string | null; break_end: string | null; clinic_name: string | null;
  hours_worked: number | null; break_minutes: number;
  status: 'on_time' | 'late' | 'absent' | null; late_minutes: number;
  check_in_lat: number | null; check_in_lng: number | null;
  check_out_lat: number | null; check_out_lng: number | null;
}

interface HistoryRow {
  id: string; date: string; employee_id: string;
  firstName: string; lastName: string; employeeCode: string;
  check_in: string | null; check_out: string | null;
  clinic_name: string; hours_worked: number | null;
  break_minutes: number; status: string; late_minutes: number; notes: string | null;
  check_in_lat: number | null; check_in_lng: number | null;
  check_out_lat: number | null; check_out_lng: number | null;
}

interface MapTarget {
  recordId: string; employeeName: string; date: string;
  checkIn:  { lat: number; lng: number } | null;
  checkOut: { lat: number; lng: number } | null;
}

interface EmployeeOption { id: string; firstName: string; lastName: string; employeeCode: string; }

interface CorrectionTarget {
  id: string; date: string; employee_id: string;
  firstName: string; lastName: string;
  check_in: string | null; check_out: string | null;
  clinic_name: string | null; status: string | null;
  late_minutes: number; notes: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(f: string, l: string) { return `${f[0] ?? ''}${l[0] ?? ''}`.toUpperCase(); }

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtHours(h: number | null | undefined): string {
  if (h == null) return '—';
  const hours = Math.floor(h);
  const mins  = Math.round((h - hours) * 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function elapsed(iso: string, breakMins = 0): string {
  const ms = Math.max(0, Date.now() - new Date(iso).getTime() - breakMins * 60000);
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function toLocalTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function toISOFromLocalTime(dateStr: string, timeStr: string): string {
  if (!timeStr) return '';
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m] = timeStr.split(':').map(Number);
  return new Date(y!, mo! - 1, d!, h!, m!, 0).toISOString();
}

function rowState(row: TodayRow): 'working' | 'break' | 'done' | 'absent' {
  if (row.check_out) return 'done';
  if (row.check_in && row.break_start && !row.break_end) return 'break';
  if (row.check_in) return 'working';
  return 'absent';
}

function todayStr() { return new Date().toISOString().split('T')[0]!; }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0]!;
}

// ─── Skeletons ───────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[0,1,2,3].map(i => (
        <div key={i} className="rounded-xl border border-border bg-surface p-4 animate-pulse">
          <div className="h-7 w-12 rounded bg-text-muted/20 mb-2" />
          <div className="h-3 w-20 rounded bg-text-muted/20" />
        </div>
      ))}
    </div>
  );
}

function PillSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {[80,120,96].map(w => (
        <div key={w} style={{ width: w }} className="h-8 rounded-full bg-text-muted/10 animate-pulse" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {[0,1,2,3,4].map(i => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border animate-pulse">
          <div className="h-7 w-7 rounded-full bg-text-muted/20 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-text-muted/20" />
            <div className="h-2.5 w-20 rounded bg-text-muted/10" />
          </div>
          <div className="h-5 w-16 rounded-full bg-text-muted/20 hidden sm:block" />
          <div className="h-5 w-12 rounded bg-text-muted/20 hidden md:block" />
        </div>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AsistenciaClient() {
  const [view, setView] = useState<'hoy' | 'historial'>('hoy');

  // ── Hoy state ──────────────────────────────────────────────────────────────
  const [todayRows, setTodayRows] = useState<TodayRow[]>([]);
  const [allEmployees, setAllEmployees] = useState<EmployeeOption[]>([]);
  const [loadingToday, setLoadingToday] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  // ── Historial state ────────────────────────────────────────────────────────
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState(daysAgo(7));
  const [filterDateTo, setFilterDateTo] = useState(todayStr());
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClinic, setFilterClinic] = useState('');

  // ── Correction modal ───────────────────────────────────────────────────────
  const [correction, setCorrection] = useState<CorrectionTarget | null>(null);
  const [corrClinic, setCorrClinic] = useState('');
  const [corrCheckIn, setCorrCheckIn] = useState('');
  const [corrCheckOut, setCorrCheckOut] = useState('');
  const [corrStatus, setCorrStatus] = useState<'on_time'|'late'|'absent'>('on_time');
  const [corrLate, setCorrLate] = useState('0');
  const [corrNotes, setCorrNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Map modal ──────────────────────────────────────────────────────────────
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(null);
  const [mapWaypoints, setMapWaypoints] = useState<Array<{ lat: number; lng: number; recorded_at: string }>>([]);
  const [loadingWaypoints, setLoadingWaypoints] = useState(false);

  // ── Live ticker (every 60s) ────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch today ────────────────────────────────────────────────────────────
  const fetchToday = useCallback(async (silent = false) => {
    if (!silent) setLoadingToday(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/attendance/today');
      if (!res.ok) return;
      const json = await res.json() as { rows: TodayRow[]; allEmployees: EmployeeOption[] };
      setTodayRows(json.rows);
      setAllEmployees(json.allEmployees);
      setLastUpdated(new Date());
    } finally {
      setLoadingToday(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchToday();
    const id = setInterval(() => void fetchToday(true), 60000);
    return () => clearInterval(id);
  }, [fetchToday]);

  // ── Fetch history ──────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams({ page: String(historyPage), limit: '20' });
      if (filterEmployee) params.set('employee_id', filterEmployee);
      if (filterDateFrom) params.set('date_from', filterDateFrom);
      if (filterDateTo)   params.set('date_to', filterDateTo);
      if (filterStatus)   params.set('status', filterStatus);
      if (filterClinic)   params.set('clinic_name', filterClinic);
      const res = await fetch(`/api/attendance/history?${params}`);
      if (!res.ok) return;
      const json = await res.json() as { rows: HistoryRow[]; total: number; totalPages: number };
      setHistoryRows(json.rows);
      setHistoryTotal(json.total);
      setHistoryTotalPages(json.totalPages);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyPage, filterEmployee, filterDateFrom, filterDateTo, filterStatus, filterClinic]);

  useEffect(() => {
    if (view === 'historial') void fetchHistory();
  }, [view, fetchHistory]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let presentes = 0, enBreak = 0, tardanzas = 0, sinFichar = 0;
    for (const r of todayRows) {
      const s = rowState(r);
      if (s === 'working') presentes++;
      else if (s === 'break') enBreak++;
      else if (s === 'absent') sinFichar++;
      if (r.status === 'late' && r.check_in) tardanzas++;
    }
    return { presentes, enBreak, tardanzas, sinFichar };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayRows, tick]);

  // ── Working pills ──────────────────────────────────────────────────────────
  const workingNow = useMemo(() => todayRows.filter(r => rowState(r) === 'working' || rowState(r) === 'break'), [todayRows]);

  // ── Open correction modal ──────────────────────────────────────────────────
  function openCorrection(record: TodayRow | HistoryRow) {
    const date = 'date' in record ? record.date : todayStr();
    const id = ('record_id' in record ? record.record_id : null) ?? ('id' in record ? record.id : '');
    if (!id) return;
    const target: CorrectionTarget = {
      id,
      date,
      employee_id: record.employee_id,
      firstName: record.firstName,
      lastName: record.lastName,
      check_in: record.check_in,
      check_out: record.check_out,
      clinic_name: record.clinic_name ?? '',
      status: record.status ?? 'on_time',
      late_minutes: record.late_minutes ?? 0,
      notes: 'notes' in record ? (record.notes ?? '') : '',
    };
    setCorrection(target);
    setCorrClinic(target.clinic_name ?? '');
    setCorrCheckIn(toLocalTime(target.check_in));
    setCorrCheckOut(toLocalTime(target.check_out));
    setCorrStatus((target.status as 'on_time'|'late'|'absent') ?? 'on_time');
    setCorrLate(String(target.late_minutes ?? 0));
    setCorrNotes(target.notes ?? '');
  }

  async function saveCorrection() {
    if (!correction) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        clinic_name: corrClinic,
        status: corrStatus,
        late_minutes: corrStatus === 'late' ? parseInt(corrLate) : 0,
        notes: corrNotes,
      };
      if (corrCheckIn)  body.check_in  = toISOFromLocalTime(correction.date, corrCheckIn);
      if (corrCheckOut) body.check_out = toISOFromLocalTime(correction.date, corrCheckOut);

      const res = await fetch(`/api/attendance/${correction.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Error al guardar');
      setCorrection(null);
      if (view === 'hoy') void fetchToday(true);
      else void fetchHistory();
    } finally {
      setSaving(false);
    }
  }

  // ── Open map modal ─────────────────────────────────────────────────────────
  async function openMap(row: TodayRow | HistoryRow) {
    const recordId = ('record_id' in row ? row.record_id : null) ?? ('id' in row ? row.id : null);
    if (!recordId) return;
    const date = 'date' in row ? row.date : todayStr();
    setMapTarget({
      recordId,
      employeeName: `${row.firstName} ${row.lastName}`,
      date,
      checkIn:  row.check_in_lat  && row.check_in_lng  ? { lat: row.check_in_lat,  lng: row.check_in_lng  } : null,
      checkOut: row.check_out_lat && row.check_out_lng ? { lat: row.check_out_lat, lng: row.check_out_lng } : null,
    });
    setMapWaypoints([]);
    setLoadingWaypoints(true);
    try {
      const res = await fetch(`/api/attendance/${recordId}/waypoints`);
      if (res.ok) setMapWaypoints(await res.json() as typeof mapWaypoints);
    } finally {
      setLoadingWaypoints(false);
    }
  }

  // ── Export CSV ─────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ['Fecha','Empleado','Código','Clínica','Entrada','Salida','Horas','Estado'];
    const rows = historyRows.map(r => [
      fmtDate(r.date),
      `${r.firstName} ${r.lastName}`,
      r.employeeCode,
      r.clinic_name,
      fmtTime(r.check_in),
      fmtTime(r.check_out),
      fmtHours(r.hours_worked),
      r.status === 'on_time' ? 'A tiempo' : r.status === 'late' ? `Tardanza ${r.late_minutes}min` : 'Ausente',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `asistencia-${filterDateFrom ?? 'historial'}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Export PDF ─────────────────────────────────────────────────────────────
  function exportPDF() {
    const rows = historyRows.map(r => `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td>${r.firstName} ${r.lastName}<br/><span style="font-size:10px;color:#888">${r.employeeCode}</span></td>
        <td>${r.clinic_name}</td>
        <td>${fmtTime(r.check_in)}</td>
        <td>${fmtTime(r.check_out)}</td>
        <td>${fmtHours(r.hours_worked)}</td>
        <td style="color:${r.status==='late'?'#dc2626':r.status==='absent'?'#9ca3af':'#16a34a'}">
          ${r.status==='on_time'?'A tiempo':r.status==='late'?`Tardanza ${r.late_minutes}m`:'Ausente'}
        </td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Reporte de Asistencia</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}
h1{margin:0;font-size:18px}.sub{color:#666;font-size:11px;margin:4px 0 20px}
table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;border-bottom:2px solid #e5e7eb;padding:6px 5px;font-size:10px;text-transform:uppercase;color:#666}
td{padding:5px;border-bottom:1px solid #f0f0f0}@media print{body{padding:0}}</style></head><body>
<h1>Reporte de Asistencia — Precision Medical</h1>
<p class="sub">${filterDateFrom ?? ''} al ${filterDateTo ?? ''} · Generado ${new Date().toLocaleDateString('es-ES')}</p>
<table><thead><tr><th>Fecha</th><th>Empleado</th><th>Clínica</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Estado</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }

  // ── Today header date ──────────────────────────────────────────────────────
  const todayHeader = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const totalActive = todayRows.filter(r => rowState(r) !== 'absent').length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 py-2">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-medium text-text-1 capitalize">
            {view === 'hoy'
              ? <>{todayHeader} · <span className="text-text-muted">{totalActive} empleados</span></>
              : 'Registros de asistencia'
            }
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-refresh indicator */}
          {view === 'hoy' && (
            <div className="flex items-center gap-1.5 mr-2">
              <span
                className="inline-block w-2 h-2 rounded-full bg-emerald-500"
                style={{ boxShadow: '0 0 5px rgba(16,185,129,0.6)', animation: refreshing ? 'pulse 1s infinite' : 'pulse 2s infinite' }}
              />
              <span className="text-[11px] text-text-muted">En vivo</span>
              {lastUpdated && (
                <span className="text-[10px] text-text-muted/60">
                  · hace {Math.floor((Date.now() - lastUpdated.getTime()) / 60000)}m
                </span>
              )}
            </div>
          )}

          {/* Historial export */}
          {view === 'historial' && (
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={exportPDF} className="gap-1.5 h-8 text-xs">
                <FileText className="h-3.5 w-3.5" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 h-8 text-xs">
                <Download className="h-3.5 w-3.5" /> Excel
              </Button>
            </div>
          )}

          {/* View toggle */}
          <div className="flex rounded-lg border border-border bg-surface overflow-hidden">
            {(['hoy','historial'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-[12px] font-medium transition-colors',
                  view === v ? 'bg-indigo-500/15 text-indigo-400' : 'text-text-muted hover:text-text-2'
                )}
              >
                {v === 'hoy' ? 'Hoy' : 'Historial'}
              </button>
            ))}
          </div>

          {/* Manual refresh */}
          {view === 'hoy' && (
            <button
              onClick={() => void fetchToday(true)}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-2 hover:bg-surface transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            </button>
          )}
        </div>
      </div>

      {/* ═══════════ HOY VIEW ═══════════ */}
      {view === 'hoy' && (
        <>
          {/* KPI cards */}
          {loadingToday ? <KpiSkeleton /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: UserCheck, label: 'Presentes',   value: kpis.presentes,  color: '#10B981', dim: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.20)' },
                { icon: Coffee,    label: 'En break',     value: kpis.enBreak,    color: '#F59E0B', dim: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.20)' },
                { icon: Clock,     label: 'Tardanzas',    value: kpis.tardanzas,  color: '#F43F5E', dim: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.20)' },
                { icon: UserX,     label: 'Sin fichar',   value: kpis.sinFichar,  color: 'var(--color-text-muted)', dim: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)' },
              ].map(({ icon: Icon, label, value, color, dim, border }) => (
                <div key={label} className="rounded-xl p-4 flex flex-col gap-1.5" style={{ background: dim, border: `1px solid ${border}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold" style={{ color }}>{value}</span>
                    <Icon size={16} style={{ color, opacity: 0.7 }} />
                  </div>
                  <span className="text-[11px] text-text-muted uppercase tracking-wider">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Who's Working pills */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 5px rgba(16,185,129,0.7)' }} />
                <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Trabajando ahora</span>
              </div>
              <span className="text-[11px] text-text-muted">{workingNow.length} activos</span>
            </div>

            {loadingToday ? <PillSkeleton /> : workingNow.length === 0 ? (
              <p className="text-[12px] text-text-muted text-center py-4">Nadie fichado en este momento</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {workingNow.map(r => {
                  const onBreak = rowState(r) === 'break';
                  return (
                    <div
                      key={r.employee_id}
                      className="flex items-center gap-2 rounded-full px-2.5 py-1"
                      style={{
                        background: onBreak ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
                        border: `1px solid ${onBreak ? 'rgba(245,158,11,0.22)' : 'rgba(16,185,129,0.22)'}`,
                      }}
                    >
                      <div
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
                      >
                        {initials(r.firstName, r.lastName)}
                      </div>
                      <div>
                        <p className="text-[11px] font-medium leading-none" style={{ color: onBreak ? '#F59E0B' : '#10B981' }}>
                          {r.firstName} {r.lastName}
                        </p>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          {onBreak
                            ? `Break ${r.break_start ? elapsed(r.break_start) : '—'}`
                            : `${r.check_in ? elapsed(r.check_in, r.break_minutes) : '—'} · ${r.clinic_name ?? '—'}`
                          }
                        </p>
                      </div>
                      {onBreak && (
                        <span className="text-[9px] font-semibold rounded px-1 py-0.5" style={{ background: 'rgba(245,158,11,0.18)', color: '#F59E0B' }}>Break</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Today table — Desktop */}
          {loadingToday ? <TableSkeleton /> : (
            <>
              {/* Desktop */}
              <div className="hidden md:block rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-surface/60">
                      <TableHead className="text-[11px] uppercase tracking-wider text-text-muted pl-4">Empleado</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-text-muted">Clínica</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-text-muted">Entrada</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-text-muted">Salida</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-text-muted">Horas</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-text-muted">Estado</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todayRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-text-muted text-sm">
                          Sin empleados activos hoy
                        </TableCell>
                      </TableRow>
                    ) : todayRows.map(r => {
                      const state = rowState(r);
                      const leftColor = state === 'working' ? '#10B981' : state === 'break' ? '#F59E0B' : 'transparent';
                      return (
                        <TableRow
                          key={r.employee_id}
                          className="border-b border-border transition-colors hover:bg-surface/40"
                          style={{
                            borderLeft: `3px solid ${leftColor}`,
                            opacity: state === 'done' ? 0.65 : 1,
                          }}
                        >
                          <TableCell className="pl-3">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
                              >
                                {initials(r.firstName, r.lastName)}
                              </div>
                              <div>
                                <p className="text-[13px] font-medium text-text-1 leading-none">{r.firstName} {r.lastName}</p>
                                <p className="text-[10px] text-text-muted mt-0.5">{r.employeeCode}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-[13px] text-text-2">{r.clinic_name ?? '—'}</TableCell>
                          <TableCell className="text-[13px] text-text-2 font-mono">{fmtTime(r.check_in)}</TableCell>
                          <TableCell className="text-[13px] text-text-2 font-mono">{fmtTime(r.check_out)}</TableCell>
                          <TableCell className="text-[13px] font-mono" style={{ color: state === 'working' ? '#10B981' : 'var(--color-text-2)' }}>
                            {state === 'working' && r.check_in
                              ? elapsed(r.check_in, r.break_minutes)
                              : state === 'break' && r.check_in
                                ? elapsed(r.check_in, r.break_minutes)
                                : fmtHours(r.hours_worked)
                            }
                          </TableCell>
                          <TableCell>
                            <TodayBadge row={r} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {r.record_id && (
                                <button onClick={() => openCorrection(r)} className="p-1 rounded text-text-muted hover:text-text-2 hover:bg-surface transition-colors">
                                  <Pencil size={13} />
                                </button>
                              )}
                              {r.record_id && (
                                (r.check_in_lat ?? r.check_out_lat) ? (
                                  <button onClick={() => void openMap(r)} className="p-1 rounded hover:bg-surface transition-colors" title="Ver ubicación" style={{ color: '#818CF8' }}>
                                    <MapPin size={13} />
                                  </button>
                                ) : (
                                  <span className="p-1 rounded cursor-default" title="Sin datos de ubicación" style={{ color: 'var(--color-text-muted)', opacity: 0.35 }}>
                                    <MapPin size={13} />
                                  </span>
                                )
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {todayRows.length === 0 ? (
                  <p className="text-center py-12 text-sm text-text-muted">Sin empleados activos hoy</p>
                ) : todayRows.map(r => {
                  const state = rowState(r);
                  const leftColor = state === 'working' ? '#10B981' : state === 'break' ? '#F59E0B' : 'transparent';
                  return (
                    <div
                      key={r.employee_id}
                      className="rounded-xl border border-border bg-surface p-3.5"
                      style={{ borderLeft: `3px solid ${leftColor}`, opacity: state === 'done' ? 0.65 : 1 }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                            {initials(r.firstName, r.lastName)}
                          </div>
                          <div>
                            <p className="text-[13px] font-medium text-text-1">{r.firstName} {r.lastName}</p>
                            <p className="text-[10px] text-text-muted">{r.employeeCode}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <TodayBadge row={r} />
                          {r.record_id && (
                            <button onClick={() => openCorrection(r)} className="p-1 rounded text-text-muted">
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                        <span className="text-text-muted">Clínica <span className="text-text-2">{r.clinic_name ?? '—'}</span></span>
                        <span className="text-text-muted">Horas <span className="font-mono text-text-2" style={{ color: state === 'working' ? '#10B981' : undefined }}>
                          {state === 'working' && r.check_in ? elapsed(r.check_in, r.break_minutes) : fmtHours(r.hours_worked)}
                        </span></span>
                        <span className="text-text-muted">Entrada <span className="font-mono text-text-2">{fmtTime(r.check_in)}</span></span>
                        <span className="text-text-muted">Salida <span className="font-mono text-text-2">{fmtTime(r.check_out)}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════ HISTORIAL VIEW ═══════════ */}
      {view === 'historial' && (
        <>
          {/* Filters */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2 sm:items-center">
            <Select value={filterEmployee} onValueChange={v => { setFilterEmployee(v); setHistoryPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-full sm:w-[190px]"><SelectValue placeholder="Todos los empleados" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos los empleados</SelectItem>
                {allEmployees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="date"
              value={filterDateFrom}
              onChange={e => { setFilterDateFrom(e.target.value); setHistoryPage(1); }}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text-2 w-full sm:w-auto"
            />
            <input
              type="date"
              value={filterDateTo}
              onChange={e => { setFilterDateTo(e.target.value); setHistoryPage(1); }}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text-2 w-full sm:w-auto"
            />

            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setHistoryPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-full sm:w-[140px]"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos los estados</SelectItem>
                <SelectItem value="on_time">A tiempo</SelectItem>
                <SelectItem value="late">Tardanza</SelectItem>
                <SelectItem value="absent">Ausente</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterClinic} onValueChange={v => { setFilterClinic(v); setHistoryPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-full sm:w-[160px]"><SelectValue placeholder="Todas las clínicas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas las clínicas</SelectItem>
                {CLINICS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button size="sm" onClick={() => void fetchHistory()} className="h-8 text-xs px-3">Aplicar</Button>
            <button
              onClick={() => { setFilterEmployee(''); setFilterDateFrom(daysAgo(7)); setFilterDateTo(todayStr()); setFilterStatus(''); setFilterClinic(''); setHistoryPage(1); }}
              className="text-xs text-text-muted hover:text-text-2 transition-colors px-1"
            >
              Limpiar
            </button>

            <span className="col-span-2 sm:ml-auto text-[11px] text-text-muted">
              {historyTotal} registro{historyTotal !== 1 ? 's' : ''}
            </span>
          </div>

          {/* History table — Desktop */}
          {loadingHistory ? <TableSkeleton /> : (
            <>
              <div className="hidden md:block rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-surface/60">
                      {['Fecha','Empleado','Clínica','Entrada','Salida','Horas','Estado',''].map(h => (
                        <TableHead key={h} className="text-[11px] uppercase tracking-wider text-text-muted pl-4">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-text-muted text-sm">
                          Sin registros para los filtros seleccionados
                        </TableCell>
                      </TableRow>
                    ) : historyRows.map(r => (
                      <TableRow key={r.id} className="border-b border-border hover:bg-surface/40 transition-colors">
                        <TableCell className="text-[12px] text-text-2 pl-4">{fmtDate(r.date)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                              {initials(r.firstName, r.lastName)}
                            </div>
                            <div>
                              <p className="text-[12px] font-medium text-text-1 leading-none">{r.firstName} {r.lastName}</p>
                              <p className="text-[10px] text-text-muted">{r.employeeCode}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-[12px] text-text-2">{r.clinic_name}</TableCell>
                        <TableCell className="text-[12px] font-mono text-text-2">{fmtTime(r.check_in)}</TableCell>
                        <TableCell className="text-[12px] font-mono text-text-2">{fmtTime(r.check_out)}</TableCell>
                        <TableCell className="text-[12px] font-mono text-text-2">{fmtHours(r.hours_worked)}</TableCell>
                        <TableCell><HistoryBadge row={r} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openCorrection(r)} className="p-1 rounded text-text-muted hover:text-text-2 hover:bg-surface transition-colors">
                              <Pencil size={13} />
                            </button>
                            {(r.check_in_lat ?? r.check_out_lat) ? (
                              <button onClick={() => void openMap(r)} className="p-1 rounded hover:bg-surface transition-colors" title="Ver ubicación" style={{ color: '#818CF8' }}>
                                <MapPin size={13} />
                              </button>
                            ) : (
                              <span className="p-1 rounded cursor-default" title="Sin datos de ubicación" style={{ color: 'var(--color-text-muted)', opacity: 0.35 }}>
                                <MapPin size={13} />
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile history cards */}
              <div className="md:hidden space-y-2">
                {historyRows.length === 0 ? (
                  <p className="text-center py-12 text-sm text-text-muted">Sin registros para los filtros seleccionados</p>
                ) : historyRows.map(r => (
                  <div key={r.id} className="rounded-xl border border-border bg-surface p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-medium text-text-1">{r.firstName} {r.lastName}</p>
                        <p className="text-[10px] text-text-muted">{fmtDate(r.date)} · {r.clinic_name}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <HistoryBadge row={r} />
                        <button onClick={() => openCorrection(r)} className="p-1 rounded text-text-muted"><Pencil size={12} /></button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-x-3 text-[11px]">
                      <span className="text-text-muted">Entrada <span className="font-mono text-text-2">{fmtTime(r.check_in)}</span></span>
                      <span className="text-text-muted">Salida <span className="font-mono text-text-2">{fmtTime(r.check_out)}</span></span>
                      <span className="text-text-muted">Horas <span className="font-mono text-text-2">{fmtHours(r.hours_worked)}</span></span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between text-[12px] text-text-muted pt-1">
                  <span>Mostrando {(historyPage - 1) * 20 + 1}–{Math.min(historyPage * 20, historyTotal)} de {historyTotal}</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)} className="h-7 px-2 text-xs gap-1">
                      <ChevronLeft className="h-3 w-3" /> Anterior
                    </Button>
                    <Button variant="outline" size="sm" disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage(p => p + 1)} className="h-7 px-2 text-xs gap-1">
                      Siguiente <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════ MAP MODAL ═══════════ */}
      <Dialog open={!!mapTarget} onOpenChange={open => { if (!open) setMapTarget(null); }}>
        <DialogContent className="max-w-2xl w-full">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <MapPin size={15} className="text-indigo-400" />
              Ubicación del registro
            </DialogTitle>
            {mapTarget && (
              <p className="text-[12px] text-text-muted mt-1">
                {mapTarget.employeeName} · {fmtDate(mapTarget.date)}
              </p>
            )}
          </DialogHeader>

          {mapTarget && (
            <div className="space-y-3">
              {/* Map */}
              <div style={{ height: 340, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                {loadingWaypoints ? (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                    Cargando...
                  </div>
                ) : !mapTarget.checkIn && !mapTarget.checkOut && mapWaypoints.length === 0 ? (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <MapPin size={24} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Sin datos de ubicación para este registro</p>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.6 }}>El empleado puede tener la ubicación desactivada</p>
                  </div>
                ) : (
                  <AttendanceMap
                    key={mapTarget.recordId}
                    checkIn={mapTarget.checkIn}
                    checkOut={mapTarget.checkOut}
                    waypoints={mapWaypoints}
                  />
                )}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-text-muted px-1">
                {mapTarget.checkIn && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                    <span>Entrada {mapTarget.checkIn ? `(${mapTarget.checkIn.lat.toFixed(4)}, ${mapTarget.checkIn.lng.toFixed(4)})` : ''}</span>
                  </div>
                )}
                {mapTarget.checkOut && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
                    <span>Salida {mapTarget.checkOut ? `(${mapTarget.checkOut.lat.toFixed(4)}, ${mapTarget.checkOut.lng.toFixed(4)})` : ''}</span>
                  </div>
                )}
                {mapWaypoints.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-indigo-500 shrink-0" />
                    <span>{mapWaypoints.length} punto{mapWaypoints.length !== 1 ? 's' : ''} de ruta</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMapTarget(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ CORRECTION MODAL ═══════════ */}
      <Dialog open={!!correction} onOpenChange={open => { if (!open) setCorrection(null); }}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Corregir registro</DialogTitle>
            {correction && (
              <p className="text-[12px] text-text-muted mt-1">
                {correction.firstName} {correction.lastName} · {fmtDate(correction.date)}
              </p>
            )}
          </DialogHeader>

          {correction && (
            <div className="space-y-4 py-2">
              {/* Clinic */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-text-2">Clínica</label>
                <Select value={corrClinic} onValueChange={setCorrClinic}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Seleccionar clínica" /></SelectTrigger>
                  <SelectContent>
                    {CLINICS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-text-2">Hora entrada</label>
                  <input
                    type="time"
                    value={corrCheckIn}
                    onChange={e => setCorrCheckIn(e.target.value)}
                    className="w-full h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-text-1"
                    placeholder="HH:MM"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-text-2">Hora salida</label>
                  <input
                    type="time"
                    value={corrCheckOut}
                    onChange={e => setCorrCheckOut(e.target.value)}
                    className="w-full h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-text-1"
                    placeholder="HH:MM"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-text-2">Estado</label>
                <div className="flex rounded-lg border border-border bg-surface overflow-hidden">
                  {(['on_time','late','absent'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setCorrStatus(s)}
                      className={cn(
                        'flex-1 py-2 text-[12px] font-medium transition-colors',
                        corrStatus === s
                          ? s === 'on_time' ? 'bg-emerald-500/15 text-emerald-400'
                            : s === 'late' ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-surface/80 text-text-muted'
                          : 'text-text-muted hover:text-text-2'
                      )}
                    >
                      {s === 'on_time' ? 'A tiempo' : s === 'late' ? 'Tardanza' : 'Ausente'}
                    </button>
                  ))}
                </div>
                {corrStatus === 'late' && (
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-[12px] text-text-muted shrink-0">Minutos de tardanza</label>
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={corrLate}
                      onChange={e => setCorrLate(e.target.value)}
                      className="w-20 h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-text-1 text-center"
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-text-2">Notas</label>
                <textarea
                  value={corrNotes}
                  onChange={e => setCorrNotes(e.target.value)}
                  rows={2}
                  placeholder="Motivo de la corrección..."
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-text-1 resize-none"
                />
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/8 border border-amber-500/15 px-3 py-2.5">
                <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-text-muted italic">
                  Los cambios quedan registrados con tu usuario y fecha de modificación.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCorrection(null)}>Cancelar</Button>
            <Button size="sm" onClick={() => void saveCorrection()} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar corrección'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Status badges ────────────────────────────────────────────────────────────

function TodayBadge({ row }: { row: TodayRow }) {
  const state = rowState(row);
  if (state === 'done')    return <Badge className="text-[10px] px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 border-indigo-500/20">Completado</Badge>;
  if (state === 'break')   return <Badge className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border-amber-500/20">Break</Badge>;
  if (state === 'working') {
    if (row.status === 'late') return <Badge className="text-[10px] px-1.5 py-0.5 bg-rose-500/15 text-rose-400 border-rose-500/20">Tardanza {row.late_minutes}m</Badge>;
    return <Badge className="text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/20">Presente</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">Sin fichar</Badge>;
}

function HistoryBadge({ row }: { row: HistoryRow }) {
  if (row.status === 'late')    return <Badge className="text-[10px] px-1.5 py-0.5 bg-rose-500/15 text-rose-400 border-rose-500/20">Tardanza {row.late_minutes}m</Badge>;
  if (row.status === 'absent')  return <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">Ausente</Badge>;
  if (row.check_out)            return <Badge className="text-[10px] px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 border-indigo-500/20">Completado</Badge>;
  if (row.check_in)             return <Badge className="text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/20">Presente</Badge>;
  return <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">Sin fichar</Badge>;
}
