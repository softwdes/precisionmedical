'use client';

import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Input, Label, Card, CardContent,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  PillToggle,
} from '@precision/ui';
import {
  Download, Printer, DollarSign, Users, TrendingUp, Calendar,
  Filter, Building2, MapPin, Star,
} from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type ReportOutput = inferRouterOutputs<AppRouter>['employees']['getReport'];
type Department   = inferRouterOutputs<AppRouter>['departments']['list'][number];

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', BOB: 'Bs', PEN: 'S/' };
const CURRENCY_COLOR:  Record<string, string> = {
  USD: 'text-emerald-500',
  BOB: 'text-amber-400',
  PEN: 'text-violet-400',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAmount(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] ?? '';
  return `${sym} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ymdToday(): string {
  return new Date().toISOString().split('T')[0]!;
}

function ymdMonthStart(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]!;
}

function ymdMonthEnd(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0]!;
}

type RangePreset = 'thisMonth' | 'lastMonth' | 'quarter' | 'year' | 'allTime' | 'custom';

function computeRange(preset: RangePreset): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case 'thisMonth':  return { from: ymdMonthStart(now), to: ymdMonthEnd(now) };
    case 'lastMonth': {
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: ymdMonthStart(last), to: ymdMonthEnd(last) };
    }
    case 'quarter': {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { from: ymdMonthStart(start), to: ymdMonthEnd(now) };
    }
    case 'year':      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    case 'allTime':   return { from: '2020-01-01', to: ymdToday() };
    default:          return { from: ymdMonthStart(now), to: ymdMonthEnd(now) };
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EmployeesReportClient({
  departments,
}: {
  departments: Department[];
}): React.ReactElement {
  const t      = useTranslations();
  const locale = useLocale();

  const [rangePreset, setRangePreset] = useState<RangePreset>('thisMonth');
  const initialRange = computeRange('thisMonth');
  const [from, setFrom]                 = useState(initialRange.from);
  const [to,   setTo]                   = useState(initialRange.to);
  const [departmentId, setDepartmentId] = useState<string>('');
  const [country,      setCountry]      = useState<string>('');

  const onPresetChange = (preset: RangePreset): void => {
    setRangePreset(preset);
    if (preset !== 'custom') {
      const r = computeRange(preset);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  // Print CSS scoped to this component
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-employees-report-print', '');
    style.textContent = `
      @media print {
        @page { size: A4; margin: 14mm 12mm; }
        body { background: white !important; }
        aside.fixed { display: none !important; }
        div.border-b > nav.flex { display: none !important; }
        .app-shell { grid-template-columns: 1fr !important; }
        main { padding: 0 !important; }
        .rounded-lg, [class*="rounded-"] { break-inside: avoid; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  const { data: report, isLoading } = trpc.employees.getReport.useQuery({
    from,
    to,
    departmentId: departmentId || undefined,
    country:      country || undefined,
  });

  const fmtDate = (d: string | null | undefined): string =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const fmtMonth = (ym: string): string => {
    const [y, m] = ym.split('-');
    if (!y || !m) return ym;
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { month: 'short', year: '2-digit' });
  };

  const printTimestamp = useMemo(() => new Date().toLocaleString(locale === 'en' ? 'en-US' : 'es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }), [locale]);

  const filtersSummary = useMemo(() => {
    const parts: string[] = [];
    if (departmentId) {
      const dept = departments.find(d => d.id === departmentId);
      if (dept) parts.push(`Departamento: ${dept.name}`);
    }
    if (country) parts.push(`País: ${country}`);
    return parts.length > 0 ? parts.join(' · ') : 'Sin filtros adicionales';
  }, [departmentId, country, departments]);

  // CSV export
  const exportCSV = (): void => {
    if (!report) return;
    const headers = ['Empleado','Bono','Moneda','Razón','Fecha pago'];
    const csv = [
      headers.join(','),
      ...report.bonuses.map(b => [
        `"${b.employeeName.replace(/"/g, '""')}"`,
        b.amount,
        b.currency,
        `"${(b.reason ?? '').replace(/"/g, '""')}"`,
        b.paidDate ?? '',
      ].join(',')),
    ].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `empleados-payroll-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-5 print:p-4 print:space-y-3">
      {/* Print-only branded header */}
      <div className="hidden print:block border-b-2 border-brand pb-3 mb-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-tiny tracking-widest uppercase text-brand font-bold">Precision Medical</p>
            <h1 className="text-2xl font-bold text-text-1 mt-1">{t('employees.reportTitle')}</h1>
            <p className="text-small text-text-3">{t('employees.reportSubtitle')}</p>
          </div>
          <div className="text-right text-tiny text-text-3">
            <p><strong className="text-text-2">{t('employees.from')}:</strong> {fmtDate(from)}</p>
            <p><strong className="text-text-2">{t('employees.to')}:</strong> {fmtDate(to)}</p>
            <p className="mt-1 text-text-muted">Generado: {printTimestamp}</p>
          </div>
        </div>
        <p className="text-tiny text-text-3 mt-2 italic">{filtersSummary}</p>
      </div>

      {/* Screen header */}
      <div className="flex items-start justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h2 className="text-lg font-bold text-text-1">{t('employees.reportTitle')}</h2>
          <p className="text-small text-text-3">{t('employees.reportSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!report || report.bonuses.length === 0}>
            <Download className="h-3.5 w-3.5" />
            {t('employees.exportCSV')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            {t('employees.print')}
          </Button>
        </div>
      </div>

      {/* Range pills */}
      <div className="flex flex-wrap gap-2 items-center print:hidden">
        <PillToggle<RangePreset>
          options={[
            { value: 'thisMonth',  label: t('employees.rangeThisMonth') },
            { value: 'lastMonth',  label: t('employees.rangeLastMonth') },
            { value: 'quarter',    label: t('employees.rangeQuarter') },
            { value: 'year',       label: t('employees.rangeYear') },
            { value: 'allTime',    label: t('employees.rangeAllTime') },
            { value: 'custom',     label: t('employees.rangeCustom') },
          ]}
          value={rangePreset}
          onChange={onPresetChange}
        />
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-text-3" />
            <span className="text-small font-semibold text-text-2">{t('employees.filters')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-tiny">{t('employees.from')}</Label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setRangePreset('custom'); }} />
            </div>
            <div className="space-y-1">
              <Label className="text-tiny">{t('employees.to')}</Label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setRangePreset('custom'); }} />
            </div>
            <div className="space-y-1">
              <Label className="text-tiny">Departamento</Label>
              <Select value={departmentId || 'ALL'} onValueChange={(v) => setDepartmentId(v === 'ALL' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('employees.allDepartments')}</SelectItem>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name as string}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-tiny">País</Label>
              <Select value={country || 'ALL'} onValueChange={(v) => setCountry(v === 'ALL' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('employees.allCountries')}</SelectItem>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="BO">Bolivia</SelectItem>
                  <SelectItem value="PE">Peru</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Body */}
      {isLoading ? (
        <div className="py-12 text-center text-small text-text-3">Cargando reporte...</div>
      ) : !report || report.totalPayments === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <DollarSign className="h-12 w-12 mx-auto text-text-muted mb-3" />
            <p className="text-text-2 font-medium">{t('employees.noDataReport')}</p>
            <p className="text-tiny text-text-3 mt-1">{fmtDate(from)} → {fmtDate(to)}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {report.kpisByCurrency.map(k => (
              <Card key={k.currency}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-7 w-7 rounded-lg bg-border/40 flex items-center justify-center ${CURRENCY_COLOR[k.currency] ?? 'text-text-2'}`}>
                      <DollarSign className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-tiny font-bold text-text-2">{k.currency}</span>
                  </div>
                  <p className="text-tiny text-text-3">{t('employees.kpiTotal')}</p>
                  <p className={`text-xl font-bold font-mono ${CURRENCY_COLOR[k.currency] ?? 'text-text-1'}`}>
                    {fmtAmount(k.total, k.currency)}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border/50 text-tiny">
                    <span className="text-text-3"><Users className="inline h-3 w-3 mr-1" />{k.employeeCount}</span>
                    <span className="text-text-3"><Calendar className="inline h-3 w-3 mr-1" />{k.count}</span>
                    {k.bonuses > 0 && (
                      <span className="text-emerald-500"><Star className="inline h-3 w-3 mr-0.5" />{fmtAmount(k.bonuses, k.currency)}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-7 w-7 rounded-lg bg-brand/15 text-brand flex items-center justify-center">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-tiny font-bold text-text-2">Total</span>
                </div>
                <p className="text-tiny text-text-3">{t('employees.kpiPayments')}</p>
                <p className="text-xl font-bold font-mono text-text-1">{report.totalPayments}</p>
                <div className="flex gap-3 mt-2 pt-2 border-t border-border/50 text-tiny text-text-3">
                  {fmtDate(from)} → {fmtDate(to)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tendencia mensual */}
          <Card className="print:break-inside-avoid">
            <CardContent className="p-4">
              <h3 className="text-small font-semibold text-text-1 mb-3">{t('employees.monthlyTrend')}</h3>
              <MonthlyTrendChart data={report.monthlyTrend} fmtMonth={fmtMonth} />
            </CardContent>
          </Card>

          {/* By country + By department */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:break-inside-avoid">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-small font-semibold text-text-1 mb-3 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-text-3" />
                  {t('employees.byCountry')}
                </h3>
                {report.byCountry.length === 0 ? (
                  <p className="text-tiny text-text-muted">—</p>
                ) : (
                  <div className="space-y-3">
                    {report.byCountry.map(c => (
                      <div key={c.country} className="border-b border-border/40 pb-2 last:border-0">
                        <p className="text-small text-text-2 mb-1">{c.country}</p>
                        <div className="flex flex-wrap gap-2 text-tiny font-mono">
                          {Object.entries(c.totals).map(([cur, amt]) => (
                            <span key={cur} className={CURRENCY_COLOR[cur] ?? 'text-text-2'}>
                              {fmtAmount(amt as number, cur)} {cur}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="text-small font-semibold text-text-1 mb-3 flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-text-3" />
                  {t('employees.byDepartment')}
                </h3>
                {report.byDepartment.length === 0 ? (
                  <p className="text-tiny text-text-muted">—</p>
                ) : (
                  <div className="space-y-3">
                    {report.byDepartment.map((d, i) => (
                      <div key={i} className="border-b border-border/40 pb-2 last:border-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-small text-text-2">{d.name}</p>
                          <span className="text-tiny text-text-3">{d.count} pagos</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-tiny font-mono">
                          {Object.entries(d.totals).map(([cur, amt]) => (
                            <span key={cur} className={CURRENCY_COLOR[cur] ?? 'text-text-2'}>
                              {fmtAmount(amt as number, cur)} {cur}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabla de bonos */}
          <Card className="print:break-before-page">
            <CardContent className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-small font-semibold text-text-1 flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 text-emerald-500" />
                  {t('employees.bonusesTitle')} ({report.bonuses.length})
                </h3>
              </div>
              {report.bonuses.length === 0 ? (
                <p className="text-tiny text-text-muted text-center py-8">{t('employees.noBonuses')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Razón</TableHead>
                        <TableHead>Fecha pago</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.bonuses.map(b => (
                        <TableRow key={b.id}>
                          <TableCell className="text-small font-medium text-text-1">{b.employeeName}</TableCell>
                          <TableCell className={`text-right text-small font-mono ${CURRENCY_COLOR[b.currency] ?? 'text-text-1'}`}>
                            {fmtAmount(b.amount, b.currency)} {b.currency}
                          </TableCell>
                          <TableCell className="text-small text-text-2 max-w-xs truncate" title={b.reason}>{b.reason}</TableCell>
                          <TableCell className="text-small text-text-2">{fmtDate(b.paidDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Monthly Trend Chart (SVG inline) ────────────────────────────────────────

function MonthlyTrendChart({
  data,
  fmtMonth,
}: {
  data: ReportOutput['monthlyTrend'];
  fmtMonth: (ym: string) => string;
}) {
  const maxValue = Math.max(1, ...data.flatMap(d => [d.USD, d.BOB, d.PEN]));
  const barWidth = 100 / data.length;
  return (
    <div className="space-y-2">
      <div className="flex items-end h-40 gap-1 border-b border-border pb-1 px-1">
        {data.map((d, i) => {
          const hUSD = (d.USD / maxValue) * 100;
          const hBOB = (d.BOB / maxValue) * 100;
          const hPEN = (d.PEN / maxValue) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-px" style={{ minWidth: `${barWidth}%` }} title={`${d.month}\nUSD: ${d.USD}\nBOB: ${d.BOB}\nPEN: ${d.PEN}`}>
              <div className="w-full flex items-end justify-center gap-px h-full">
                {d.USD > 0 && <div className="flex-1 bg-emerald-500/70 hover:bg-emerald-500 transition-colors rounded-t-sm" style={{ height: `${hUSD}%` }} />}
                {d.BOB > 0 && <div className="flex-1 bg-amber-400/70 hover:bg-amber-400 transition-colors rounded-t-sm" style={{ height: `${hBOB}%` }} />}
                {d.PEN > 0 && <div className="flex-1 bg-violet-400/70 hover:bg-violet-400 transition-colors rounded-t-sm" style={{ height: `${hPEN}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-tiny text-text-3" style={{ minWidth: `${barWidth}%` }}>
            {fmtMonth(d.month)}
          </div>
        ))}
      </div>
      <div className="flex gap-4 pt-2 text-tiny">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500/70" /> USD</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-amber-400/70" /> BOB</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-violet-400/70" /> PEN</span>
      </div>
    </div>
  );
}
