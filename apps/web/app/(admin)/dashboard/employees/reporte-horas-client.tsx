'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  Button, Badge, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, cn,
} from '@precision/ui';
import {
  ChevronDown, ChevronRight, FileText, Download, RefreshCw,
  AlertTriangle, BarChart3, Clock, TrendingUp, Coffee,
  Calendar, CalendarOff, ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayRecord {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  hours_worked: number | null;
  break_minutes: number;
  clinic_name: string | null;
  status: string;
  late_minutes: number;
}

interface WeekBlock {
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  days: DayRecord[];
}

interface EmployeeReport {
  id: string;
  firstName: string;
  lastName: string;
  full_name: string;
  employee_code: string;
  employment_type: 'exempt' | 'non_exempt';
  countryId: string;
  country: { code: string; name: string } | null;
  totalRegular: number;
  totalOvertime: number;
  totalHours: number;
  totalBreaks: number;
  totalDaysWorked: number;
  weekBlocks: WeekBlock[];
  dailyRecords: DayRecord[];
}

interface ReportData {
  period: { from: string; to: string };
  summary: {
    totalRegularHours: number;
    totalOvertimeHours: number;
    totalHours: number;
    totalBreakHours: number;
    totalEmployees: number;
    employeesWithOvertime: number;
  };
  employees: EmployeeReport[];
  incompleteCount: number;
}

type EmpOption = { id: string; firstName: string; lastName: string; employeeCode: string };

// ─── Constants & Helpers ─────────────────────────────────────────────────────

const FLAGS: Record<string, string> = { US: '🇺🇸', BO: '🇧🇴', PE: '🇵🇪' };

const PERIOD_OPTIONS = [
  { key: 'this_week',  label: 'Esta semana' },
  { key: 'last_week',  label: 'Semana pasada' },
  { key: 'q1_current', label: 'Quincena actual (1–15)' },
  { key: 'q2_current', label: 'Quincena actual (16–fin)' },
  { key: 'q1_last',    label: 'Quincena pasada (1–15)' },
  { key: 'q2_last',    label: 'Quincena pasada (16–fin)' },
  { key: 'this_month', label: 'Este mes' },
  { key: 'last_month', label: 'Mes pasado' },
  { key: 'custom',     label: 'Rango personalizado' },
];

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function lastDayOfMonth(y: number, m: number): number { return new Date(y, m + 1, 0).getDate(); }

function getMondayOf(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
  return r;
}

function fmtISO(d: Date): string { return d.toISOString().split('T')[0]!; }

function getPeriodDates(key: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  switch (key) {
    case 'this_week': {
      const mon = getMondayOf(now);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: fmtISO(mon), to: fmtISO(sun) };
    }
    case 'last_week': {
      const mon = getMondayOf(now); mon.setDate(mon.getDate() - 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: fmtISO(mon), to: fmtISO(sun) };
    }
    case 'q1_current':
      return { from: `${y}-${pad2(m + 1)}-01`, to: `${y}-${pad2(m + 1)}-15` };
    case 'q2_current':
      return { from: `${y}-${pad2(m + 1)}-16`, to: `${y}-${pad2(m + 1)}-${pad2(lastDayOfMonth(y, m))}` };
    case 'q1_last': {
      const lm = m === 0 ? 11 : m - 1; const ly = m === 0 ? y - 1 : y;
      return { from: `${ly}-${pad2(lm + 1)}-01`, to: `${ly}-${pad2(lm + 1)}-15` };
    }
    case 'q2_last': {
      const lm = m === 0 ? 11 : m - 1; const ly = m === 0 ? y - 1 : y;
      return { from: `${ly}-${pad2(lm + 1)}-16`, to: `${ly}-${pad2(lm + 1)}-${pad2(lastDayOfMonth(ly, lm))}` };
    }
    case 'this_month':
      return { from: `${y}-${pad2(m + 1)}-01`, to: `${y}-${pad2(m + 1)}-${pad2(lastDayOfMonth(y, m))}` };
    case 'last_month': {
      const lm = m === 0 ? 11 : m - 1; const ly = m === 0 ? y - 1 : y;
      return { from: `${ly}-${pad2(lm + 1)}-01`, to: `${ly}-${pad2(lm + 1)}-${pad2(lastDayOfMonth(ly, lm))}` };
    }
    default:
      return { from: '', to: '' };
  }
}

function fmtHours(h: number): string { return `${h.toFixed(2)}h`; }

function fmtTime(t: string | null): string {
  if (!t) return '—';
  try { return new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return t; }
}

function fmtDateDisplay(d: string): string {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', weekday: 'short' });
  } catch { return d; }
}

function fmtDateShort(d: string): string {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }); }
  catch { return d; }
}

function fmtDateFull(d: string): string {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return d; }
}

function fmtWeekLabel(start: string, end: string): string {
  return `${fmtDateShort(start)} – ${fmtDateShort(end)}`;
}

// Mark which days contribute to overtime within a week
function markOvertimeDays(days: DayRecord[]): Set<string> {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const result = new Set<string>();
  let running = 0;
  for (const day of sorted) {
    const hours = day.hours_worked ?? 0;
    if (running >= 40 || (running < 40 && running + hours > 40)) {
      result.add(day.date);
    }
    running += hours;
  }
  return result;
}

// ─── Excel Export (SpreadsheetML — no external dependency) ───────────────────

function exportExcel(data: ReportData): void {
  const esc = (s: string | number | null | undefined) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const cell = (val: string | number | null | undefined, type: 'String' | 'Number' = 'String', style?: string) => {
    const v = val ?? '';
    const t = typeof v === 'number' && type === 'Number' ? 'Number' : 'String';
    const styleAttr = style ? ` ss:StyleID="${style}"` : '';
    return `<Cell${styleAttr}><Data ss:Type="${t}">${esc(v)}</Data></Cell>`;
  };

  const hdCell = (val: string) => cell(val, 'String', 'header');
  const boldCell = (val: string | number | null | undefined, type: 'String' | 'Number' = 'String') =>
    cell(val, type, 'bold');

  // Sheet 1 — Resumen
  const summaryRows = data.employees.map((e) => {
    const style = e.totalOvertime > 0 ? 'overtime' : '';
    const styleAttr = style ? ` ss:StyleID="${style}"` : '';
    return `<Row${styleAttr}>
      ${cell(e.full_name)}
      ${cell(e.employee_code)}
      ${cell(FLAGS[e.countryId] ?? '' + ' ' + (e.country?.name ?? e.countryId))}
      ${cell(e.employment_type === 'exempt' ? 'Asalariado' : 'Por hora')}
      ${cell(e.totalDaysWorked, 'Number')}
      ${cell(e.totalRegular, 'Number')}
      ${cell(e.employment_type === 'exempt' ? 'N/A' : String(e.totalOvertime))}
      ${cell(e.totalHours, 'Number')}
      ${cell(e.totalBreaks, 'Number')}
    </Row>`;
  }).join('');

  const summaryTotalRow = `<Row ss:StyleID="bold">
    ${boldCell('TOTAL')}
    ${boldCell('')}
    ${boldCell('')}
    ${boldCell('')}
    ${boldCell('')}
    ${boldCell(data.summary.totalRegularHours, 'Number')}
    ${boldCell(data.summary.totalOvertimeHours, 'Number')}
    ${boldCell(data.summary.totalHours, 'Number')}
    ${boldCell(data.summary.totalBreakHours, 'Number')}
  </Row>`;

  // Sheet 2 — Detalle diario
  const detailRows = data.employees.flatMap((e) =>
    e.dailyRecords.map((r) => `<Row>
      ${cell(e.full_name)}
      ${cell(e.employee_code)}
      ${cell(r.date)}
      ${cell(r.clinic_name ?? '—')}
      ${cell(fmtTime(r.check_in))}
      ${cell(fmtTime(r.check_out))}
      ${cell(r.hours_worked ?? 0, 'Number')}
      ${cell(r.break_minutes, 'Number')}
      ${cell(r.status === 'on_time' ? 'A tiempo' : r.status === 'late' ? `Tardanza ${r.late_minutes}m` : 'Ausente')}
      ${cell(r.late_minutes, 'Number')}
    </Row>`)
  ).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="9"/>
      <Interior ss:Color="#6366F1" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center"/>
    </Style>
    <Style ss:ID="bold">
      <Font ss:Bold="1"/>
    </Style>
    <Style ss:ID="overtime">
      <Interior ss:Color="#FFF1F2" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Resumen">
    <Table>
      <Row>
        ${hdCell('Empleado')}${hdCell('Código')}${hdCell('País')}
        ${hdCell('Tipo')}${hdCell('Días trabajados')}
        ${hdCell('Horas regulares')}${hdCell('Horas extras')}
        ${hdCell('Total horas')}${hdCell('Breaks (h)')}
      </Row>
      ${summaryRows}
      ${summaryTotalRow}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Detalle diario">
    <Table>
      <Row>
        ${hdCell('Empleado')}${hdCell('Código')}${hdCell('Fecha')}
        ${hdCell('Clínica')}${hdCell('Entrada')}${hdCell('Salida')}
        ${hdCell('Horas')}${hdCell('Break (min)')}${hdCell('Estado')}${hdCell('Tardanza (min)')}
      </Row>
      ${detailRows}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte-horas-${data.period.from}-${data.period.to}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

function exportPDF(data: ReportData): void {
  const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

  const rows = data.employees.map((e) => {
    const bg = e.totalOvertime > 0 ? 'background:rgba(244,63,94,0.06);' : '';
    const extraCell = e.employment_type === 'exempt'
      ? '<em style="color:#888">N/A</em>'
      : e.totalOvertime > 0
        ? `<span style="color:#F43F5E;font-weight:600">${fmtHours(e.totalOvertime)}</span>`
        : '—';
    const weekDetail = e.weekBlocks.map((w) => {
      const ot = w.overtimeHours > 0 ? `<span style="color:#F43F5E"> +${fmtHours(w.overtimeHours)} OT</span>` : '';
      return `<tr style="font-size:8px;color:#666">
        <td style="padding:2px 8px 2px 28px">${fmtWeekLabel(w.weekStart, w.weekEnd)}</td>
        <td></td><td></td>
        <td style="text-align:right">${fmtHours(w.regularHours)}${ot}</td>
        <td></td><td></td><td></td>
      </tr>`;
    }).join('');
    return `<tr style="${bg}border-bottom:1px solid #eee">
      <td style="padding:5px 8px">${e.full_name}<br><span style="font-size:8px;color:#888">${e.employee_code} · ${FLAGS[e.countryId] ?? ''}</span></td>
      <td style="padding:5px 8px;font-size:9px">${e.employment_type === 'exempt' ? 'Asalariado' : 'Por hora'}</td>
      <td style="padding:5px 8px;text-align:right;color:#10B981;font-weight:600">${fmtHours(e.totalRegular)}</td>
      <td style="padding:5px 8px;text-align:right">${extraCell}</td>
      <td style="padding:5px 8px;text-align:right;font-weight:500">${fmtHours(e.totalHours)}</td>
      <td style="padding:5px 8px;text-align:right;color:#888">${fmtHours(e.totalBreaks)}</td>
      <td style="padding:5px 8px;text-align:right;color:#888">${e.totalDaysWorked}</td>
    </tr>${weekDetail}`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Reporte de Horas</title>
<style>
  @page { margin: 18mm 14mm; size: A4 landscape; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #111; margin: 0; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 14px; }
  .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .kpi-card { border: 1px solid #ddd; border-radius: 4px; padding: 8px 10px; }
  .kpi-card .val { font-size: 16px; font-weight: 700; }
  .kpi-card .lbl { font-size: 8px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th { background: #6366F1; color: #fff; padding: 5px 8px; text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .5px; }
  .note { margin-top: 20px; font-size: 8px; color: #666; border-top: 1px solid #eee; padding-top: 8px; }
</style>
</head>
<body>
<div class="page-header">
  <div><strong style="font-size:12px">PM · Precision Medical</strong></div>
  <div style="text-align:right">
    <div><strong>Reporte de Horas — Nómina</strong></div>
    <div>Del ${fmtDateFull(data.period.from)} al ${fmtDateFull(data.period.to)}</div>
    <div style="color:#888">Generado el ${today}</div>
  </div>
</div>
<div class="kpi-row">
  <div class="kpi-card" style="border-left:3px solid #10B981">
    <div class="lbl">Horas regulares</div>
    <div class="val" style="color:#10B981">${fmtHours(data.summary.totalRegularHours)}</div>
    <div style="font-size:8px;color:#888">${data.summary.totalEmployees} empleados</div>
  </div>
  <div class="kpi-card" style="border-left:3px solid #F43F5E">
    <div class="lbl">Horas extras</div>
    <div class="val" style="color:#F43F5E">${fmtHours(data.summary.totalOvertimeHours)}</div>
    <div style="font-size:8px;color:#888">${data.summary.employeesWithOvertime} con overtime</div>
  </div>
  <div class="kpi-card" style="border-left:3px solid #6366F1">
    <div class="lbl">Total horas</div>
    <div class="val" style="color:#6366F1">${fmtHours(data.summary.totalHours)}</div>
    <div style="font-size:8px;color:#888">del período</div>
  </div>
  <div class="kpi-card" style="border-left:3px solid #F59E0B">
    <div class="lbl">Breaks no pagados</div>
    <div class="val" style="color:#F59E0B">${fmtHours(data.summary.totalBreakHours)}</div>
    <div style="font-size:8px;color:#888">descontados</div>
  </div>
</div>
<table>
  <thead><tr>
    <th>Empleado</th><th>Tipo</th>
    <th style="text-align:right">Regulares</th>
    <th style="text-align:right">Extras</th>
    <th style="text-align:right">Total</th>
    <th style="text-align:right">Breaks</th>
    <th style="text-align:right">Días</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="note">
  * Horas extras calculadas sobre 40h/semana según FLSA (empleados Non-exempt, EEUU Utah).<br>
  Bolivia y Perú: horas sobre 40h/semana para referencia contable — la tarifa local la aplica contabilidad externamente.
</div>
</body></html>`;

  const w = window.open('', '_blank', 'width=1200,height=800');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-border/60', className)} />;
}

function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
      <SkeletonPulse className="h-3 w-24" />
      <SkeletonPulse className="h-7 w-20" />
      <SkeletonPulse className="h-3 w-16" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
      <SkeletonPulse className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <SkeletonPulse className="h-3 w-40" />
        <SkeletonPulse className="h-2.5 w-24" />
      </div>
      <SkeletonPulse className="h-3 w-12" />
      <SkeletonPulse className="h-3 w-12" />
      <SkeletonPulse className="h-3 w-12" />
    </div>
  );
}

// ─── Week Breakdown (expanded row left panel) ─────────────────────────────────

function WeekBreakdown({ week, isExempt }: { week: WeekBlock; isExempt: boolean }) {
  const pctGreen = Math.min(100, (week.regularHours / 40) * 100);
  const pctRed = isExempt ? 0 : (week.overtimeHours / 40) * 100;
  const hasOT = week.overtimeHours > 0 && !isExempt;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-2 font-medium">{fmtWeekLabel(week.weekStart, week.weekEnd)}</span>
        <span className={cn('text-xs font-semibold font-mono', hasOT ? 'text-rose-500' : 'text-text-1')}>
          {fmtHours(week.totalHours)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 rounded-full bg-border/60 overflow-visible">
        {/* Green regular portion */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
          style={{ width: `${Math.min(pctGreen, 100)}%` }}
        />
        {/* Red overtime overflow */}
        {hasOT && pctRed > 0 && (
          <div
            className="absolute inset-y-0 rounded-full bg-rose-500"
            style={{ left: '100%', width: `${pctRed}%`, minWidth: '4px' }}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-text-3">
        <span>{fmtHours(week.regularHours)} regulares / 40h</span>
        {hasOT && (
          <span className="text-rose-500 font-medium">+{fmtHours(week.overtimeHours)} extras</span>
        )}
        {isExempt && (
          <span className="italic">Asalariado — sin overtime</span>
        )}
      </div>
    </div>
  );
}

// ─── Daily Detail (expanded row right panel) ──────────────────────────────────

function DailyDetail({ days, weekBlocks }: { days: DayRecord[]; weekBlocks: WeekBlock[] }) {
  // Build a set of dates that contribute to overtime
  const overtimeDates = new Set<string>();
  for (const week of weekBlocks) {
    if (week.overtimeHours > 0) {
      markOvertimeDays(week.days).forEach((d) => overtimeDates.add(d));
    }
  }

  if (days.length === 0) {
    return <p className="text-xs text-text-3 italic py-2">Sin registros en este período</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
            <th className="text-left pb-1.5 pr-3">Fecha</th>
            <th className="text-left pb-1.5 pr-3">Clínica</th>
            <th className="text-right pb-1.5 pr-3">Entrada</th>
            <th className="text-right pb-1.5 pr-3">Salida</th>
            <th className="text-right pb-1.5 pr-3">Horas</th>
            <th className="text-left pb-1.5">Estado</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const isOT = overtimeDates.has(day.date);
            const statusBadge = day.status === 'on_time'
              ? <span className="inline-block rounded px-1.5 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-600">A tiempo</span>
              : day.status === 'late'
                ? <span className="inline-block rounded px-1.5 py-0.5 text-[10px] bg-amber-500/10 text-amber-600">Tardanza {day.late_minutes}m</span>
                : <span className="inline-block rounded px-1.5 py-0.5 text-[10px] bg-rose-500/10 text-rose-600">Ausente</span>;

            return (
              <tr key={day.id} className="border-b border-border/40 last:border-0">
                <td className="py-1.5 pr-3 text-text-2 whitespace-nowrap">{fmtDateDisplay(day.date)}</td>
                <td className="py-1.5 pr-3 text-text-3 max-w-[120px] truncate">{day.clinic_name ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-text-2">{fmtTime(day.check_in)}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-text-2">{fmtTime(day.check_out)}</td>
                <td className={cn('py-1.5 pr-3 text-right font-mono font-medium', isOT ? 'text-rose-500' : 'text-emerald-600')}>
                  {day.hours_worked != null ? fmtHours(day.hours_worked) : '—'}
                </td>
                <td className="py-1.5">{statusBadge}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Employee Table Row (Desktop) ─────────────────────────────────────────────

function EmployeeRow({
  emp,
  expanded,
  onToggle,
}: {
  emp: EmployeeReport;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasOT = emp.totalOvertime > 0 && emp.employment_type !== 'exempt';
  const isExempt = emp.employment_type === 'exempt';

  return (
    <>
      <tr
        className={cn(
          'border-b border-border cursor-pointer hover:bg-surface/60 transition-colors',
          hasOT && 'border-l-[3px] border-l-rose-500',
          !hasOT && 'border-l-[3px] border-l-transparent',
        )}
        style={hasOT ? { background: 'rgba(244,63,94,0.025)' } : undefined}
        onClick={onToggle}
      >
        {/* Employee */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-tiny font-bold text-brand shrink-0">
              {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium text-text-1 leading-tight">{emp.full_name}</p>
              <p className="text-[11px] text-text-muted">
                <span className="font-mono">{emp.employee_code}</span>
                {' · '}
                {FLAGS[emp.countryId] ?? emp.countryId}
              </p>
            </div>
          </div>
        </td>

        {/* Tipo */}
        <td className="px-4 py-3 w-[110px]">
          {isExempt
            ? <Badge variant="info" className="text-[10px]">Asalariado</Badge>
            : <Badge variant="warning" className="text-[10px]">Por hora</Badge>
          }
        </td>

        {/* Regulares */}
        <td className="px-4 py-3 w-[90px] text-right font-mono text-sm font-medium">
          <span className={emp.totalRegular > 0 ? 'text-emerald-600' : 'text-text-muted'}>
            {fmtHours(emp.totalRegular)}
          </span>
        </td>

        {/* Extras */}
        <td className="px-4 py-3 w-[90px] text-right font-mono text-sm">
          {isExempt
            ? <span className="text-text-muted italic text-xs">N/A</span>
            : hasOT
              ? <span className="text-rose-500 font-semibold">{fmtHours(emp.totalOvertime)}</span>
              : <span className="text-text-muted">—</span>
          }
        </td>

        {/* Total */}
        <td className="px-4 py-3 w-[90px] text-right font-mono text-sm font-medium text-text-1">
          {fmtHours(emp.totalHours)}
        </td>

        {/* Breaks */}
        <td className="px-4 py-3 w-[70px] text-right font-mono text-xs text-text-muted">
          {fmtHours(emp.totalBreaks)}
        </td>

        {/* Días */}
        <td className="px-4 py-3 w-[60px] text-right text-xs text-text-muted">
          {emp.totalDaysWorked}
        </td>

        {/* Expand toggle */}
        <td className="px-3 py-3 w-[36px] text-right">
          <ChevronDown className={cn('h-4 w-4 text-text-muted transition-transform', expanded && 'rotate-180')} />
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-bg-0 border-b border-border px-4 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: week breakdown */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-3">Breakdown por semana</p>
                <div className="space-y-4">
                  {emp.weekBlocks.map((w, i) => (
                    <WeekBreakdown key={i} week={w} isExempt={isExempt} />
                  ))}
                  {emp.weekBlocks.length === 0 && (
                    <p className="text-xs text-text-3 italic">Sin semanas con registros</p>
                  )}
                </div>
              </div>

              {/* Right: daily detail */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-3">Detalle diario</p>
                <DailyDetail days={emp.dailyRecords} weekBlocks={emp.weekBlocks} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Employee Mobile Card ─────────────────────────────────────────────────────

function EmployeeMobileCard({
  emp,
  expanded,
  onToggle,
}: {
  emp: EmployeeReport;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasOT = emp.totalOvertime > 0 && emp.employment_type !== 'exempt';
  const isExempt = emp.employment_type === 'exempt';
  const pctGreen = Math.min(100, (emp.totalRegular / Math.max(emp.totalHours, 40)) * 100);
  const pctRed = isExempt ? 0 : (emp.totalOvertime / Math.max(emp.totalHours, 40)) * 100;

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface p-4 space-y-3 cursor-pointer',
        hasOT && 'border-l-4 border-l-rose-500',
      )}
      style={hasOT ? { background: 'rgba(244,63,94,0.025)' } : undefined}
      onClick={onToggle}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand shrink-0">
            {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-text-1 leading-tight">{emp.full_name}</p>
            <p className="text-[11px] text-text-muted">
              <span className="font-mono">{emp.employee_code}</span> · {FLAGS[emp.countryId] ?? emp.countryId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isExempt
            ? <Badge variant="info" className="text-[10px]">Asalariado</Badge>
            : <Badge variant="warning" className="text-[10px]">Por hora</Badge>
          }
          <ChevronDown className={cn('h-4 w-4 text-text-muted transition-transform', expanded && 'rotate-180')} />
        </div>
      </div>

      {/* KPI mini-row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Regular</p>
          <p className="text-sm font-semibold font-mono text-emerald-600">{fmtHours(emp.totalRegular)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Extras</p>
          <p className={cn('text-sm font-semibold font-mono', hasOT ? 'text-rose-500' : 'text-text-muted')}>
            {isExempt ? <span className="italic text-xs">N/A</span> : hasOT ? fmtHours(emp.totalOvertime) : '—'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Total</p>
          <p className="text-sm font-semibold font-mono text-text-1">{fmtHours(emp.totalHours)}</p>
        </div>
      </div>

      {/* Progress bar (only for non-exempt) */}
      {!isExempt && (
        <div className="space-y-1">
          <div className="relative h-2 rounded-full bg-border/60 overflow-visible">
            <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${pctGreen}%` }} />
            {hasOT && pctRed > 0 && (
              <div className="absolute inset-y-0 rounded-full bg-rose-500" style={{ left: '100%', width: `${pctRed}%`, minWidth: '4px' }} />
            )}
          </div>
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>{fmtHours(emp.totalRegular)} regulares</span>
            {hasOT && <span className="text-rose-500">+{fmtHours(emp.totalOvertime)} extras</span>}
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border pt-3 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Breakdown por semana</p>
            <div className="space-y-3">
              {emp.weekBlocks.map((w, i) => (
                <WeekBreakdown key={i} week={w} isExempt={isExempt} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Detalle diario</p>
            <DailyDetail days={emp.dailyRecords} weekBlocks={emp.weekBlocks} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReporteHorasClient({
  initialEmployees,
}: {
  initialEmployees: EmpOption[];
}) {
  const [period, setPeriod] = useState('this_week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [empTypeFilter, setEmpTypeFilter] = useState('');
  const [empFilter, setEmpFilter] = useState('');

  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!reportData) return;
    setExpandedIds(new Set(reportData.employees.map((e) => e.id)));
  }, [reportData]);

  const collapseAll = useCallback(() => setExpandedIds(new Set()), []);

  const getDateRange = useCallback(() => {
    if (period === 'custom') return { from: customFrom, to: customTo };
    return getPeriodDates(period);
  }, [period, customFrom, customTo]);

  const generate = useCallback(async () => {
    const { from, to } = getDateRange();
    if (!from || !to) { setError('Selecciona un rango de fechas válido'); return; }
    setIsLoading(true);
    setError(null);
    setReportData(null);
    setExpandedIds(new Set());

    try {
      const params = new URLSearchParams({ from_date: from, to_date: to });
      if (countryFilter) params.set('country_id', countryFilter);
      if (empTypeFilter) params.set('employment_type', empTypeFilter);
      if (empFilter) params.set('employee_id', empFilter);

      const res = await fetch(`/api/reports/hours?${params.toString()}`);
      if (!res.ok) { const body = await res.json() as { error?: string }; throw new Error(body.error ?? 'Error al generar el reporte'); }
      const data = await res.json() as ReportData;
      setReportData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setIsLoading(false);
    }
  }, [getDateRange, countryFilter, empTypeFilter, empFilter]);

  const { from: displayFrom, to: displayTo } = getDateRange();
  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)?.label ?? '';
  const hasData = !!reportData;
  const employees = reportData?.employees ?? [];
  const summary = reportData?.summary;

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">Reporte de horas</h1>
          {hasData && (
            <p className="text-small text-text-3 mt-0.5">
              {periodLabel !== 'Rango personalizado' ? periodLabel : `${displayFrom} → ${displayTo}`}
              {' · '}
              <span className="font-medium text-text-2">{summary?.totalEmployees ?? 0} empleados</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {hasData && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportPDF(reportData!)}
                className="gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportExcel(reportData!)}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Excel
              </Button>
            </>
          )}
          <Button onClick={() => void generate()} loading={isLoading} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Generar reporte
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 items-end">
        {/* Period */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-text-muted">Período</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom dates */}
        {period === 'custom' && (
          <>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">Desde</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-38" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">Hasta</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-38" />
            </div>
          </>
        )}

        {/* Country */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-text-muted">País</Label>
          <Select value={countryFilter} onValueChange={(v) => setCountryFilter(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los países</SelectItem>
              <SelectItem value="US">🇺🇸 EEUU</SelectItem>
              <SelectItem value="BO">🇧🇴 Bolivia</SelectItem>
              <SelectItem value="PE">🇵🇪 Perú</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Employment type */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-text-muted">Tipo</Label>
          <Select value={empTypeFilter} onValueChange={(v) => setEmpTypeFilter(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="non_exempt">Por hora (Non-exempt)</SelectItem>
              <SelectItem value="exempt">Asalariado (Exempt)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Employee */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-text-muted">Empleado</Label>
          <Select value={empFilter} onValueChange={(v) => setEmpFilter(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Todos los empleados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los empleados</SelectItem>
              {initialEmployees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                  <span className="ml-1 text-text-muted font-mono text-[10px]">({e.employeeCode})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Loading skeletons ── */}
      {isLoading && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <KpiSkeleton key={i} />)}
          </div>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            {[0, 1, 2, 3, 4].map((i) => <RowSkeleton key={i} />)}
          </div>
        </div>
      )}

      {/* ── Empty state (initial) ── */}
      {!isLoading && !hasData && !error && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-border/40">
            <BarChart3 className="h-8 w-8 text-text-muted" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-2">Selecciona un período y genera el reporte</p>
            <p className="text-xs text-text-muted mt-1">Los datos se calcularán desde attendance_records</p>
          </div>
          <Button onClick={() => void generate()} className="mt-1">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Generar reporte
          </Button>
        </div>
      )}

      {/* ── Results ── */}
      {!isLoading && hasData && (
        <div className="space-y-5">

          {/* Incomplete records warning */}
          {(reportData!.incompleteCount ?? 0) > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                <span className="font-semibold">{reportData!.incompleteCount} registros incompletos</span>
                {' '}no incluidos (sin hora de salida).{' '}
                <span className="text-amber-600">Ve a Asistencia para corregirlos.</span>
              </p>
            </div>
          )}

          {/* Overtime alert */}
          {summary!.employeesWithOvertime > 0 && (
            <div
              className="flex items-start gap-2.5 rounded-lg px-3.5 py-2.5"
              style={{ background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.18)' }}
            >
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-rose-600">
                  {summary!.employeesWithOvertime} empleado{summary!.employeesWithOvertime !== 1 ? 's' : ''} {summary!.employeesWithOvertime !== 1 ? 'tienen' : 'tiene'} horas extras este período
                </p>
                <p className="text-xs text-rose-500/80 mt-0.5">Revisa el detalle antes de procesar la nómina</p>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-surface p-4 border-l-4" style={{ borderLeftColor: '#10B981' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Clock className="h-3.5 w-3.5 text-emerald-500" />
                <p className="text-[10px] uppercase tracking-wider text-text-muted">Horas regulares</p>
              </div>
              <p className="text-2xl font-bold font-mono text-emerald-600">{fmtHours(summary!.totalRegularHours)}</p>
              <p className="text-xs text-text-muted mt-0.5">{summary!.totalEmployees} empleados</p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 border-l-4" style={{ borderLeftColor: '#F43F5E' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-rose-500" />
                <p className="text-[10px] uppercase tracking-wider text-text-muted">Horas extras</p>
              </div>
              <p className={cn('text-2xl font-bold font-mono', summary!.totalOvertimeHours > 0 ? 'text-rose-500' : 'text-text-muted')}>
                {fmtHours(summary!.totalOvertimeHours)}
              </p>
              <p className={cn('text-xs mt-0.5', summary!.employeesWithOvertime > 0 ? 'text-rose-400' : 'text-text-muted')}>
                {summary!.employeesWithOvertime > 0 ? `${summary!.employeesWithOvertime} con overtime` : 'sin overtime'}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 border-l-4" style={{ borderLeftColor: '#6366F1' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
                <p className="text-[10px] uppercase tracking-wider text-text-muted">Total horas</p>
              </div>
              <p className="text-2xl font-bold font-mono text-indigo-600">{fmtHours(summary!.totalHours)}</p>
              <p className="text-xs text-text-muted mt-0.5">del período</p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 border-l-4" style={{ borderLeftColor: '#F59E0B' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Coffee className="h-3.5 w-3.5 text-amber-500" />
                <p className="text-[10px] uppercase tracking-wider text-text-muted">Breaks no pagados</p>
              </div>
              <p className="text-2xl font-bold font-mono text-amber-600">{fmtHours(summary!.totalBreakHours)}</p>
              <p className="text-xs text-text-muted mt-0.5">descontados</p>
            </div>
          </div>

          {/* Empty period */}
          {employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <CalendarOff className="h-10 w-10 text-text-muted" />
              <div>
                <p className="text-sm font-medium text-text-2">Sin registros para este período</p>
                <p className="text-xs text-text-muted mt-1">
                  No hay fichajes registrados entre {displayFrom} y {displayTo}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Table controls */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-muted">{employees.filter(e => e.totalDaysWorked > 0).length} empleados con registros</p>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={expandAll} className="h-7 text-xs gap-1">
                    <ChevronDown className="h-3 w-3" /> Expandir todo
                  </Button>
                  <Button variant="outline" size="sm" onClick={collapseAll} className="h-7 text-xs gap-1">
                    <ChevronUp className="h-3 w-3" /> Colapsar todo
                  </Button>
                </div>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block rounded-lg border border-border bg-surface overflow-hidden">
                <table className="w-full">
                  <thead className="border-b border-border bg-bg-0">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-text-muted">Empleado</th>
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-text-muted w-[110px]">Tipo</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted w-[90px]">Regulares</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted w-[90px]">Extras</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted w-[90px]">Total</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted w-[70px]">Breaks</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted w-[60px]">Días</th>
                      <th className="w-[36px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <EmployeeRow
                        key={emp.id}
                        emp={emp}
                        expanded={expandedIds.has(emp.id)}
                        onToggle={() => toggleRow(emp.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {employees.map((emp) => (
                  <EmployeeMobileCard
                    key={emp.id}
                    emp={emp}
                    expanded={expandedIds.has(emp.id)}
                    onToggle={() => toggleRow(emp.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
