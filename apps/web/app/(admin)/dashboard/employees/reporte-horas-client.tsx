'use client';

import * as React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Button, Badge, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, cn,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import {
  ChevronDown, ChevronRight, FileText, Download, RefreshCw,
  AlertTriangle, BarChart3, Clock, TrendingUp, Coffee,
  Calendar, CalendarOff, ChevronUp, ShieldCheck, Search, Check,
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

/** El tipo de `t`: estas funciones viven fuera de un componente y lo reciben. */
type Traducir = (k: string, p?: Record<string, string | number>) => string;

const PERIOD_OPTIONS = [
  { key: 'this_week',  i18n: 'periodThisWeek' },
  { key: 'last_week',  i18n: 'periodLastWeek' },
  { key: 'q1_current', i18n: 'periodQ1Current' },
  { key: 'q2_current', i18n: 'periodQ2Current' },
  { key: 'q1_last',    i18n: 'periodQ1Last' },
  { key: 'q2_last',    i18n: 'periodQ2Last' },
  { key: 'this_month', i18n: 'periodThisMonth' },
  { key: 'last_month', i18n: 'periodLastMonth' },
  { key: 'custom',     i18n: 'periodCustom' },
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

function fmtTime(iso: string | null, locale: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return iso; }
}

function fmtDateDisplay(d: string, locale: string): string {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short', weekday: 'short' });
  } catch { return d; }
}

function fmtDateShort(d: string, locale: string): string {
  try { return new Date(d + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short' }); }
  catch { return d; }
}

function fmtDateFull(d: string, locale: string): string {
  try { return new Date(d + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return d; }
}

function fmtWeekLabel(start: string, end: string, locale: string): string {
  return `${fmtDateShort(start, locale)} – ${fmtDateShort(end, locale)}`;
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

function exportExcel(data: ReportData, t: Traducir, locale: string): void {
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
      ${cell(e.employment_type === 'exempt' ? t('salaried') : t('hourly'))}
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
      ${cell(fmtTime(r.check_in, locale))}
      ${cell(fmtTime(r.check_out, locale))}
      ${cell(r.hours_worked ?? 0, 'Number')}
      ${cell(r.break_minutes, 'Number')}
      ${cell(r.status === 'on_time' ? t('onTime') : r.status === 'late' ? t('late', { min: r.late_minutes }) : t('absent'))}
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
  <Worksheet ss:Name="${t('sheetSummary')}">
    <Table>
      <Row>
        ${hdCell(t('employee'))}${hdCell(t('xlsCode'))}${hdCell(t('country'))}
        ${hdCell(t('type'))}${hdCell(t('xlsDaysWorked'))}
        ${hdCell(t('xlsRegularHours'))}${hdCell(t('xlsOvertimeHours'))}
        ${hdCell(t('xlsTotalHours'))}${hdCell(t('xlsBreaks'))}
      </Row>
      ${summaryRows}
      ${summaryTotalRow}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="${t('sheetDaily')}">
    <Table>
      <Row>
        ${hdCell(t('employee'))}${hdCell(t('xlsCode'))}${hdCell(t('colDate'))}
        ${hdCell(t('colClinic'))}${hdCell(t('colClockIn'))}${hdCell(t('colClockOut'))}
        ${hdCell(t('colHours'))}${hdCell(t('xlsBreakMin'))}${hdCell(t('colStatus'))}${hdCell(t('xlsLateMin'))}
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

function exportPDF(data: ReportData, t: Traducir, locale: string): void {
  const today = new Date().toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });

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
        <td style="padding:2px 8px 2px 28px">${fmtWeekLabel(w.weekStart, w.weekEnd, locale)}</td>
        <td></td><td></td>
        <td style="text-align:right">${fmtHours(w.regularHours)}${ot}</td>
        <td></td><td></td><td></td>
      </tr>`;
    }).join('');
    return `<tr style="${bg}border-bottom:1px solid #eee">
      <td style="padding:5px 8px">${e.full_name}<br><span style="font-size:8px;color:#888">${e.employee_code} · ${FLAGS[e.countryId] ?? ''}</span></td>
      <td style="padding:5px 8px;font-size:9px">${e.employment_type === 'exempt' ? t('salaried') : t('hourly')}</td>
      <td style="padding:5px 8px;text-align:right;color:#10B981;font-weight:600">${fmtHours(e.totalRegular)}</td>
      <td style="padding:5px 8px;text-align:right">${extraCell}</td>
      <td style="padding:5px 8px;text-align:right;font-weight:500">${fmtHours(e.totalHours)}</td>
      <td style="padding:5px 8px;text-align:right;color:#888">${fmtHours(e.totalBreaks)}</td>
      <td style="padding:5px 8px;text-align:right;color:#888">${e.totalDaysWorked}</td>
    </tr>${weekDetail}`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>${t('pdfTitle')}</title>
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
    <div><strong>${t('pdfHeading')}</strong></div>
    <div>${t('pdfRange', { desde: fmtDateFull(data.period.from, locale), hasta: fmtDateFull(data.period.to, locale) })}</div>
    <div style="color:#888">${t('pdfGenerated', { fecha: today })}</div>
  </div>
</div>
<div class="kpi-row">
  <div class="kpi-card" style="border-left:3px solid #10B981">
    <div class="lbl">${t('kpiRegular')}</div>
    <div class="val" style="color:#10B981">${fmtHours(data.summary.totalRegularHours)}</div>
    <div style="font-size:8px;color:#888">${t('kpiEmployees', { total: data.summary.totalEmployees })}</div>
  </div>
  <div class="kpi-card" style="border-left:3px solid #F43F5E">
    <div class="lbl">${t('kpiOvertime')}</div>
    <div class="val" style="color:#F43F5E">${fmtHours(data.summary.totalOvertimeHours)}</div>
    <div style="font-size:8px;color:#888">${t('kpiWithOvertime', { total: data.summary.employeesWithOvertime })}</div>
  </div>
  <div class="kpi-card" style="border-left:3px solid #6366F1">
    <div class="lbl">${t('kpiTotal')}</div>
    <div class="val" style="color:#6366F1">${fmtHours(data.summary.totalHours)}</div>
    <div style="font-size:8px;color:#888">${t('ofPeriod')}</div>
  </div>
  <div class="kpi-card" style="border-left:3px solid #F59E0B">
    <div class="lbl">${t('kpiBreaks')}</div>
    <div class="val" style="color:#F59E0B">${fmtHours(data.summary.totalBreakHours)}</div>
    <div style="font-size:8px;color:#888">${t('discounted')}</div>
  </div>
</div>
<table>
  <thead><tr>
    <th>${t('employee')}</th><th>${t('type')}</th>
    <th style="text-align:right">${t('colRegular')}</th>
    <th style="text-align:right">${t('colOvertime')}</th>
    <th style="text-align:right">${t('colTotal')}</th>
    <th style="text-align:right">${t('colBreaks')}</th>
    <th style="text-align:right">${t('colDays')}</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="note">
  ${t('pdfNote')}<br>
  ${t('pdfNote2')}
</div>
</body></html>`;

  const w = window.open('', '_blank', 'width=1200,height=800');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}

// ─── Employee Combobox ────────────────────────────────────────────────────────

function EmpCombobox({
  options,
  value,
  onChange,
}: {
  options: EmpOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations('hoursReport');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setSearch(''); }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const filtered = search.trim()
    ? options.filter((e) =>
        `${e.firstName} ${e.lastName} ${e.employeeCode}`
          .toLowerCase()
          .includes(search.toLowerCase().trim()),
      )
    : options;

  const selected = value ? options.find((e) => e.id === value) : null;

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger — same height/style as SelectTrigger */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'flex h-9 w-56 items-center justify-between gap-2 rounded border bg-surface px-3 py-2 text-small transition-colors',
          'hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand',
          open ? 'border-brand ring-2 ring-brand' : 'border-border',
        )}
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/15 text-[9px] font-bold text-brand-text shrink-0">
              {selected.firstName.charAt(0)}{selected.lastName.charAt(0)}
            </span>
            <span className="truncate text-text-1">
              {selected.firstName} {selected.lastName}
            </span>
          </span>
        ) : (
          <span className="text-text-muted truncate">{t('allEmployees')}</span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 text-text-muted shrink-0 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-lg border border-border bg-surface shadow-lg overflow-hidden">

          {/* Search input */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchEmployee')}
                className="w-full rounded-md border border-border bg-bg-0 pl-8 pr-3 py-1.5 text-xs text-text-1 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-colors"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto py-1">

            {/* "All employees" — only shown when not searching */}
            {!search && (
              <button
                type="button"
                onClick={() => select('')}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-bg-1 transition-colors',
                  !value ? 'text-brand-text font-medium' : 'text-text-2',
                )}
              >
                <span>{t('allEmployees')}</span>
                {!value && <Check className="h-3 w-3 text-brand-text" />}
              </button>
            )}

            {/* Filtered results */}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-text-muted">
                {search
                  ? t('noResultsFor', { texto: search })
                  : t('noEmployeesAvailable')}
              </p>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => select(e.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-bg-1',
                    value === e.id && 'bg-brand/5',
                  )}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-[9px] font-bold text-brand-text shrink-0">
                    {e.firstName.charAt(0)}{e.lastName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className={cn('truncate leading-tight', value === e.id ? 'font-semibold text-brand-text' : 'text-text-1')}>
                      {e.firstName} {e.lastName}
                    </p>
                    <p className="font-mono text-[10px] text-text-muted">{e.employeeCode}</p>
                  </div>
                  {value === e.id && <Check className="h-3 w-3 text-brand-text shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
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
  const t = useTranslations('hoursReport');
  const locale = useLocale();
  const pctGreen = Math.min(100, (week.regularHours / 40) * 100);
  const pctRed = isExempt ? 0 : (week.overtimeHours / 40) * 100;
  const hasOT = week.overtimeHours > 0 && !isExempt;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-2 font-medium">{fmtWeekLabel(week.weekStart, week.weekEnd, locale)}</span>
        <span className={cn('text-xs font-semibold font-mono', hasOT ? 'text-rose-text' : 'text-text-1')}>
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
        <span>{t('regularOf40', { horas: fmtHours(week.regularHours) })}</span>
        {hasOT && (
          <span className="text-rose-text font-medium">{t('overtimePlus', { horas: fmtHours(week.overtimeHours) })}</span>
        )}
        {isExempt && (
          <span className="italic">{t('salariedNoOvertime')}</span>
        )}
      </div>
    </div>
  );
}

// ─── Daily Detail (expanded row right panel) ──────────────────────────────────

function DailyDetail({ days, weekBlocks }: { days: DayRecord[]; weekBlocks: WeekBlock[] }) {
  const t = useTranslations('hoursReport');
  const locale = useLocale();
  // Build a set of dates that contribute to overtime
  const overtimeDates = new Set<string>();
  for (const week of weekBlocks) {
    if (week.overtimeHours > 0) {
      markOvertimeDays(week.days).forEach((d) => overtimeDates.add(d));
    }
  }

  if (days.length === 0) {
    return <p className="text-xs text-text-3 italic py-2">{t('noRecordsPeriod')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[10px] text-text-muted uppercase tracking-wider border-b border-border">
            <th className="text-left pb-1.5 pr-3">{t('colDate')}</th>
            <th className="text-left pb-1.5 pr-3">{t('colClinic')}</th>
            <th className="text-right pb-1.5 pr-3">{t('colClockIn')}</th>
            <th className="text-right pb-1.5 pr-3">{t('colClockOut')}</th>
            <th className="text-right pb-1.5 pr-3">{t('colHours')}</th>
            <th className="text-left pb-1.5">{t('colStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const isOT = overtimeDates.has(day.date);
            const statusBadge = day.status === 'on_time'
              ? <span className="inline-block rounded px-1.5 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-text">{t('onTime')}</span>
              : day.status === 'late'
                ? <span className="inline-block rounded px-1.5 py-0.5 text-[10px] bg-amber-500/10 text-amber-text">{t('late', { min: day.late_minutes })}</span>
                : <span className="inline-block rounded px-1.5 py-0.5 text-[10px] bg-rose-500/10 text-rose-text">{t('absent')}</span>;

            return (
              <tr key={day.id} className="border-b border-border/40 last:border-0">
                <td className="py-1.5 pr-3 text-text-2 whitespace-nowrap">{fmtDateDisplay(day.date, locale)}</td>
                <td className="py-1.5 pr-3 text-text-3 max-w-[120px] truncate">{day.clinic_name ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-text-2">{fmtTime(day.check_in, locale)}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-text-2">{fmtTime(day.check_out, locale)}</td>
                <td className={cn('py-1.5 pr-3 text-right font-mono font-medium', isOT ? 'text-rose-text' : 'text-emerald-text')}>
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
  const t = useTranslations('hoursReport');
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-tiny font-bold text-brand-text shrink-0">
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
            ? <Badge variant="info" className="text-[10px]">{t('salaried')}</Badge>
            : <Badge variant="warning" className="text-[10px]">{t('hourly')}</Badge>
          }
        </td>

        {/* Regulares */}
        <td className="px-4 py-3 w-[90px] text-right font-mono text-sm font-medium">
          <span className={emp.totalRegular > 0 ? 'text-emerald-text' : 'text-text-muted'}>
            {fmtHours(emp.totalRegular)}
          </span>
        </td>

        {/* Extras */}
        <td className="px-4 py-3 w-[90px] text-right font-mono text-sm">
          {isExempt
            ? <span className="text-text-muted italic text-xs">N/A</span>
            : hasOT
              ? <span className="text-rose-text font-semibold">{fmtHours(emp.totalOvertime)}</span>
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
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-3">{t('weekBreakdown')}</p>
                <div className="space-y-4">
                  {emp.weekBlocks.map((w, i) => (
                    <WeekBreakdown key={i} week={w} isExempt={isExempt} />
                  ))}
                  {emp.weekBlocks.length === 0 && (
                    <p className="text-xs text-text-3 italic">{t('noWeeks')}</p>
                  )}
                </div>
              </div>

              {/* Right: daily detail */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-3">{t('dailyDetail')}</p>
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
  const t = useTranslations('hoursReport');
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
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-text shrink-0">
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
            ? <Badge variant="info" className="text-[10px]">{t('salaried')}</Badge>
            : <Badge variant="warning" className="text-[10px]">{t('hourly')}</Badge>
          }
          <ChevronDown className={cn('h-4 w-4 text-text-muted transition-transform', expanded && 'rotate-180')} />
        </div>
      </div>

      {/* KPI mini-row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-[10px] text-text-muted uppercase tracking-wider">{t('labelRegular')}</p>
          <p className="text-sm font-semibold font-mono text-emerald-text">{fmtHours(emp.totalRegular)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-text-muted uppercase tracking-wider">{t('colOvertime')}</p>
          <p className={cn('text-sm font-semibold font-mono', hasOT ? 'text-rose-text' : 'text-text-muted')}>
            {isExempt ? <span className="italic text-xs">N/A</span> : hasOT ? fmtHours(emp.totalOvertime) : '—'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-text-muted uppercase tracking-wider">{t('colTotal')}</p>
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
            <span>{t('regularShort', { horas: fmtHours(emp.totalRegular) })}</span>
            {hasOT && <span className="text-rose-text">+{fmtHours(emp.totalOvertime)} extras</span>}
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border pt-3 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">{t('weekBreakdown')}</p>
            <div className="space-y-3">
              {emp.weekBlocks.map((w, i) => (
                <WeekBreakdown key={i} week={w} isExempt={isExempt} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">{t('dailyDetail')}</p>
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
  const t      = useTranslations('hoursReport');
  const tc     = useTranslations('common');
  const locale = useLocale();

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
  const [confirmExport, setConfirmExport] = useState<'pdf' | 'excel' | null>(null);

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
    if (!from || !to) { setError(t('errRange')); return; }
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
      if (!res.ok) { const body = await res.json() as { error?: string }; throw new Error(body.error ?? t('errGenerate')); }
      const data = await res.json() as ReportData;
      setReportData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errUnexpected'));
    } finally {
      setIsLoading(false);
    }
  }, [getDateRange, countryFilter, empTypeFilter, empFilter]);

  const { from: displayFrom, to: displayTo } = getDateRange();
  const periodOption = PERIOD_OPTIONS.find((p) => p.key === period);
  const periodLabel = periodOption ? t(periodOption.i18n) : '';
  const hasData = !!reportData;
  const employees = reportData?.employees ?? [];
  const summary = reportData?.summary;

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('title')}</h1>
          {hasData && (
            <p className="text-small text-text-3 mt-0.5">
              {periodOption?.key !== 'custom' ? periodLabel : `${displayFrom} → ${displayTo}`}
              {' · '}
              <span className="font-medium text-text-2">{t('kpiEmployees', { total: summary?.totalEmployees ?? 0 })}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {hasData && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmExport('pdf')}
                className="gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmExport('excel')}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Excel
              </Button>
            </>
          )}
          <Button onClick={() => void generate()} loading={isLoading} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {t('generate')}
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 items-end">
        {/* Period */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-text-muted">{t('period')}</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>{t(o.i18n)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom dates */}
        {period === 'custom' && (
          <>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">{t('from')}</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-38" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">{t('to')}</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-38" />
            </div>
          </>
        )}

        {/* Country */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-text-muted">{t('country')}</Label>
          <Select value={countryFilter} onValueChange={(v) => setCountryFilter(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('allCountries')}</SelectItem>
              <SelectItem value="US">🇺🇸 USA</SelectItem>
              <SelectItem value="BO">🇧🇴 Bolivia</SelectItem>
              <SelectItem value="PE">🇵🇪 Perú</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Employment type */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-text-muted">{t('type')}</Label>
          <Select value={empTypeFilter} onValueChange={(v) => setEmpTypeFilter(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t('all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('all')}</SelectItem>
              <SelectItem value="non_exempt">{t('typeHourly')}</SelectItem>
              <SelectItem value="exempt">{t('typeSalaried')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Employee combobox — searchable */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-text-muted">{t('employee')}</Label>
          <EmpCombobox
            options={initialEmployees}
            value={empFilter}
            onChange={(id) => setEmpFilter(id)}
          />
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-text">
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
            <p className="text-sm font-medium text-text-2">{t('emptyTitle')}</p>
            <p className="text-xs text-text-muted mt-1">{t('emptyHint')}</p>
          </div>
          <Button onClick={() => void generate()} className="mt-1">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            {t('generate')}
          </Button>
        </div>
      )}

      {/* ── Results ── */}
      {!isLoading && hasData && (
        <div className="space-y-5">

          {/* Incomplete records warning */}
          {(reportData!.incompleteCount ?? 0) > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-text shrink-0 mt-0.5" />
              <p className="text-sm text-amber-text">
                <span className="font-semibold">{t('incomplete', { total: reportData!.incompleteCount ?? 0 })}</span>
                {t('incompleteRest')}
                <span className="text-amber-text">{t('incompleteLink')}</span>
              </p>
            </div>
          )}

          {/* Overtime alert */}
          {summary!.employeesWithOvertime > 0 && (
            <div
              className="flex items-start gap-2.5 rounded-lg px-3.5 py-2.5"
              style={{ background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.18)' }}
            >
              <AlertTriangle className="h-4 w-4 text-rose-text shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-rose-text">
                  {t('overtimeAlert', { total: summary!.employeesWithOvertime })}
                </p>
                <p className="text-xs text-rose-text/80 mt-0.5">{t('overtimeAlertHint')}</p>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-surface p-4 border-l-4" style={{ borderLeftColor: '#10B981' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Clock className="h-3.5 w-3.5 text-emerald-text" />
                <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('kpiRegular')}</p>
              </div>
              <p className="text-2xl font-bold font-mono text-emerald-text">{fmtHours(summary!.totalRegularHours)}</p>
              <p className="text-xs text-text-muted mt-0.5">{t('kpiEmployees', { total: summary!.totalEmployees })}</p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 border-l-4" style={{ borderLeftColor: '#F43F5E' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-rose-text" />
                <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('kpiOvertime')}</p>
              </div>
              <p className={cn('text-2xl font-bold font-mono', summary!.totalOvertimeHours > 0 ? 'text-rose-text' : 'text-text-muted')}>
                {fmtHours(summary!.totalOvertimeHours)}
              </p>
              <p className={cn('text-xs mt-0.5', summary!.employeesWithOvertime > 0 ? 'text-rose-text' : 'text-text-muted')}>
                {summary!.employeesWithOvertime > 0 ? t('kpiWithOvertime', { total: summary!.employeesWithOvertime }) : t('kpiNoOvertime')}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 border-l-4" style={{ borderLeftColor: '#6366F1' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
                <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('kpiTotal')}</p>
              </div>
              <p className="text-2xl font-bold font-mono text-indigo-600">{fmtHours(summary!.totalHours)}</p>
              <p className="text-xs text-text-muted mt-0.5">{t('ofPeriod')}</p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 border-l-4" style={{ borderLeftColor: '#F59E0B' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Coffee className="h-3.5 w-3.5 text-amber-text" />
                <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('kpiBreaks')}</p>
              </div>
              <p className="text-2xl font-bold font-mono text-amber-text">{fmtHours(summary!.totalBreakHours)}</p>
              <p className="text-xs text-text-muted mt-0.5">{t('discounted')}</p>
            </div>
          </div>

          {/* Empty period */}
          {employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <CalendarOff className="h-10 w-10 text-text-muted" />
              <div>
                <p className="text-sm font-medium text-text-2">{t('noRecordsRange')}</p>
                <p className="text-xs text-text-muted mt-1">
                  {t('noPunchesBetween', { desde: displayFrom, hasta: displayTo })}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Table controls */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-muted">{t('withRecords', { total: employees.filter(e => e.totalDaysWorked > 0).length })}</p>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={expandAll} className="h-7 text-xs gap-1">
                    <ChevronDown className="h-3 w-3" /> {t('expandAll')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={collapseAll} className="h-7 text-xs gap-1">
                    <ChevronUp className="h-3 w-3" /> {t('collapseAll')}
                  </Button>
                </div>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block rounded-lg border border-border bg-surface overflow-hidden">
                <table className="w-full">
                  <thead className="border-b border-border bg-bg-0">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-text-muted">{t('employee')}</th>
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-text-muted w-[110px]">{t('type')}</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted w-[90px]">{t('colRegular')}</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted w-[90px]">{t('colOvertime')}</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted w-[90px]">{t('colTotal')}</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted w-[70px]">{t('colBreaks')}</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-text-muted w-[60px]">{t('colDays')}</th>
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

      {/* ── Confirm Export Dialog ── */}
      <Dialog open={!!confirmExport} onOpenChange={(open) => { if (!open) setConfirmExport(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full shrink-0',
                confirmExport === 'pdf' ? 'bg-indigo-500/10' : 'bg-emerald-500/10',
              )}>
                {confirmExport === 'pdf'
                  ? <FileText className="h-4.5 w-4.5 text-indigo-500" />
                  : <Download className="h-4.5 w-4.5 text-emerald-text" />
                }
              </div>
              {t('exportTitle', { formato: confirmExport === 'pdf' ? 'PDF' : 'Excel' })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Info pills */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-border/60 px-2.5 py-1 text-xs text-text-2">
                <ShieldCheck className="h-3 w-3 text-brand-text" />
                {t('confidential')}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-border/60 px-2.5 py-1 text-xs text-text-2">
                {t('kpiEmployees', { total: summary?.totalEmployees ?? 0 })} · {fmtHours(summary?.totalHours ?? 0)}
              </span>
            </div>

            <p className="text-sm text-text-2 leading-relaxed">
              {t('exportIntro')}{' '}
              <span className="font-semibold text-text-1">
                {fmtDateShort(displayFrom, locale)} – {fmtDateShort(displayTo, locale)}
              </span>
              {' '}{t('exportAs')}{' '}
              <span className="font-semibold text-text-1">
                {confirmExport === 'pdf' ? t('exportPdfLabel') : t('exportExcelLabel')}
              </span>.
            </p>

            {confirmExport === 'pdf' && (
              <p className="text-xs text-text-muted bg-border/30 rounded-lg px-3 py-2">
                {t('exportPdfHint')}
              </p>
            )}
            {confirmExport === 'excel' && (
              <p className="text-xs text-text-muted bg-border/30 rounded-lg px-3 py-2">
                {t('exportExcelHint')}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmExport(null)}>
              {tc('cancel')}
            </Button>
            <Button
              className={cn(
                'gap-1.5',
                confirmExport === 'pdf'
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white',
              )}
              onClick={() => {
                if (!reportData) return;
                if (confirmExport === 'pdf') exportPDF(reportData, t, locale);
                else exportExcel(reportData, t, locale);
                setConfirmExport(null);
              }}
            >
              {confirmExport === 'pdf'
                ? <><FileText className="h-3.5 w-3.5" /> {t('openPdf')}</>
                : <><Download className="h-3.5 w-3.5" /> {t('downloadExcel')}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
