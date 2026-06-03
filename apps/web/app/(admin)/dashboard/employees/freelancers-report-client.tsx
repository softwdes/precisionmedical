'use client';

import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label, Card, CardContent,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  PillToggle,
} from '@precision/ui';
import {
  Download, Printer, DollarSign, Users, TrendingUp, Calendar,
  Filter, Briefcase, MapPin,
} from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type ListOutput     = inferRouterOutputs<AppRouter>['freelancers']['list'];
type FreelancerItem = ListOutput['items'][number];
type ReportOutput   = inferRouterOutputs<AppRouter>['freelancers']['getReport'];

const MODALIDAD_VARIANT: Record<string, 'info' | 'secondary' | 'success'> = {
  POR_HORA:     'info',
  POR_SERVICIO: 'secondary',
  CONTRATISTA:  'success',
};

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
    case 'thisMonth':
      return { from: ymdMonthStart(now), to: ymdMonthEnd(now) };
    case 'lastMonth': {
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: ymdMonthStart(last), to: ymdMonthEnd(last) };
    }
    case 'quarter': {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { from: ymdMonthStart(start), to: ymdMonthEnd(now) };
    }
    case 'year':
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    case 'allTime':
      return { from: '2020-01-01', to: ymdToday() };
    default:
      return { from: ymdMonthStart(now), to: ymdMonthEnd(now) };
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function FreelancersReportClient({
  allFreelancers,
}: {
  allFreelancers: FreelancerItem[];
}): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();

  const [rangePreset, setRangePreset] = useState<RangePreset>('thisMonth');
  const initialRange = computeRange('thisMonth');
  const [from, setFrom]           = useState(initialRange.from);
  const [to,   setTo]             = useState(initialRange.to);
  const [modalidad,    setModalidad]    = useState<string>('');
  const [moneda,       setMoneda]       = useState<string>('');
  const [pais,         setPais]         = useState<string>('');
  const [freelancerId, setFreelancerId] = useState<string>('');

  const onPresetChange = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset !== 'custom') {
      const r = computeRange(preset);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  // Inyecta print CSS global solo mientras el reporte está montado
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-freelancer-report-print', '');
    style.textContent = `
      @media print {
        @page { size: A4; margin: 14mm 12mm; }
        body { background: white !important; }
        aside, nav[aria-label="Tabs"], .module-tabs-bar { display: none !important; }
        /* sidebar admin */
        aside.fixed { display: none !important; }
        /* module-tabs (nav inside border-b div) */
        div.border-b > nav.flex { display: none !important; }
        /* full-width main content */
        .app-shell { grid-template-columns: 1fr !important; }
        main { padding: 0 !important; }
        /* avoid awkward breaks inside cards/tables */
        .rounded-lg, [class*="rounded-"] { break-inside: avoid; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  const { data: report, isLoading } = trpc.freelancers.getReport.useQuery({
    from,
    to,
    modalidad:    (modalidad as 'POR_HORA' | 'POR_SERVICIO' | 'CONTRATISTA' | undefined) || undefined,
    moneda:       (moneda    as 'USD' | 'BOB' | 'PEN' | undefined) || undefined,
    pais:         pais || undefined,
    freelancerId: freelancerId || undefined,
  });

  const paisOptions = useMemo(() => {
    const set = new Set<string>();
    allFreelancers.forEach(f => set.add(f.pais as string));
    return Array.from(set).sort();
  }, [allFreelancers]);

  const selectedFreelancer = freelancerId
    ? allFreelancers.find(f => f.id === freelancerId)
    : null;

  const fmtDate = (d: string | null | undefined): string =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const fmtMonth = (ym: string): string => {
    const [y, m] = ym.split('-');
    if (!y || !m) return ym;
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { month: 'short', year: '2-digit' });
  };

  // ─── CSV export ──────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!report) return;
    const rows = report.rawPayments;
    const headers = [
      'Freelancer','Pais','Modalidad','Descripcion','Horas','Tarifa/hr','Monto','Moneda','Fecha Servicio','Fecha Pago',
    ];
    const csv = [
      headers.join(','),
      ...rows.map(p => [
        `"${p.freelancerNombre.replace(/"/g, '""')}"`,
        `"${p.pais}"`,
        p.modalidad,
        `"${(p.descripcion ?? '').replace(/"/g, '""')}"`,
        p.horas ?? '',
        p.tarifaHora ?? '',
        p.monto,
        p.moneda,
        p.fechaServicio,
        p.fechaPago,
      ].join(',')),
    ].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freelancers-pagos-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Resumen legible de filtros activos (para print)
  const filtersSummary = useMemo(() => {
    const parts: string[] = [];
    if (freelancerId && selectedFreelancer) parts.push(`Freelancer: ${selectedFreelancer.nombre as string}`);
    if (modalidad) parts.push(`Modalidad: ${t(`freelancers.modalidades.${modalidad}` as Parameters<typeof t>[0])}`);
    if (moneda)    parts.push(`Moneda: ${moneda}`);
    if (pais)      parts.push(`País: ${pais}`);
    return parts.length > 0 ? parts.join(' · ') : 'Sin filtros adicionales';
  }, [freelancerId, selectedFreelancer, modalidad, moneda, pais, t]);

  const printTimestamp = useMemo(() => {
    const d = new Date();
    return d.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }, [locale]);

  return (
    <div className="p-6 space-y-5 print:p-4 print:space-y-3">
      {/* ─── Print-only branded header ───────────────────────────── */}
      <div className="hidden print:block border-b-2 border-brand pb-3 mb-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-tiny tracking-widest uppercase text-brand font-bold">Precision Medical</p>
            <h1 className="text-2xl font-bold text-text-1 mt-1">{t('freelancers.reportTitle')}</h1>
            <p className="text-small text-text-3">{t('freelancers.reportSubtitle')}</p>
          </div>
          <div className="text-right text-tiny text-text-3">
            <p><strong className="text-text-2">{t('freelancers.from')}:</strong> {fmtDate(from)}</p>
            <p><strong className="text-text-2">{t('freelancers.to')}:</strong> {fmtDate(to)}</p>
            <p className="mt-1 text-text-muted">Generado: {printTimestamp}</p>
          </div>
        </div>
        <p className="text-tiny text-text-3 mt-2 italic">{filtersSummary}</p>
      </div>

      {/* ─── Screen header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h2 className="text-lg font-bold text-text-1">{t('freelancers.reportTitle')}</h2>
          <p className="text-small text-text-3">{t('freelancers.reportSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!report || report.rawPayments.length === 0}>
            <Download className="h-3.5 w-3.5" />
            {t('freelancers.exportCSV')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            {t('freelancers.print')}
          </Button>
        </div>
      </div>

      {/* ─── Range presets (pills) ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center print:hidden">
        <PillToggle<RangePreset>
          options={[
            { value: 'thisMonth',  label: t('freelancers.rangeThisMonth') },
            { value: 'lastMonth',  label: t('freelancers.rangeLastMonth') },
            { value: 'quarter',    label: t('freelancers.rangeQuarter') },
            { value: 'year',       label: t('freelancers.rangeYear') },
            { value: 'allTime',    label: t('freelancers.rangeAllTime') },
            { value: 'custom',     label: t('freelancers.rangeCustom') },
          ]}
          value={rangePreset}
          onChange={onPresetChange}
        />
      </div>

      {/* ─── Filters ───────────────────────────────────────────────── */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-text-3" />
            <span className="text-small font-semibold text-text-2">{t('freelancers.filters')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-tiny">{t('freelancers.from')}</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => { setFrom(e.target.value); setRangePreset('custom'); }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-tiny">{t('freelancers.to')}</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => { setTo(e.target.value); setRangePreset('custom'); }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-tiny">{t('freelancers.freelancer')}</Label>
              <Select value={freelancerId || 'ALL'} onValueChange={(v) => setFreelancerId(v === 'ALL' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('freelancers.todosFreelancers')}</SelectItem>
                  {allFreelancers.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nombre as string}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-tiny">{t('freelancers.modalidad')}</Label>
              <Select value={modalidad || 'ALL'} onValueChange={(v) => setModalidad(v === 'ALL' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('freelancers.allModalidades')}</SelectItem>
                  <SelectItem value="POR_HORA">{t('freelancers.modalidades.POR_HORA')}</SelectItem>
                  <SelectItem value="POR_SERVICIO">{t('freelancers.modalidades.POR_SERVICIO')}</SelectItem>
                  <SelectItem value="CONTRATISTA">{t('freelancers.modalidades.CONTRATISTA')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-tiny">{t('freelancers.moneda')}</Label>
              <Select value={moneda || 'ALL'} onValueChange={(v) => setMoneda(v === 'ALL' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('freelancers.todasMonedas')}</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="BOB">BOB</SelectItem>
                  <SelectItem value="PEN">PEN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-tiny">{t('freelancers.pais')}</Label>
              <Select value={pais || 'ALL'} onValueChange={(v) => setPais(v === 'ALL' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('freelancers.todosPaises')}</SelectItem>
                  {paisOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── KPIs por moneda ───────────────────────────────────────── */}
      {isLoading ? (
        <div className="py-12 text-center text-small text-text-3">Cargando reporte...</div>
      ) : !report || report.totalPayments === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <DollarSign className="h-12 w-12 mx-auto text-text-muted mb-3" />
            <p className="text-text-2 font-medium">{t('freelancers.noData')}</p>
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
                  <p className="text-tiny text-text-3">{t('freelancers.kpiTotal')}</p>
                  <p className={`text-xl font-bold font-mono ${CURRENCY_COLOR[k.currency] ?? 'text-text-1'}`}>
                    {fmtAmount(k.total, k.currency)}
                  </p>
                  <div className="flex gap-3 mt-2 pt-2 border-t border-border/50 text-tiny">
                    <span className="text-text-3"><Users className="inline h-3 w-3 mr-1" />{k.freelancerCount}</span>
                    <span className="text-text-3"><Calendar className="inline h-3 w-3 mr-1" />{k.count} {t('freelancers.kpiPagos').toLowerCase()}</span>
                    <span className="text-text-muted">~{fmtAmount(k.average, k.currency)}</span>
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
                <p className="text-tiny text-text-3">{t('freelancers.kpiPagos')}</p>
                <p className="text-xl font-bold font-mono text-text-1">{report.totalPayments}</p>
                <div className="flex gap-3 mt-2 pt-2 border-t border-border/50 text-tiny text-text-3">
                  {fmtDate(from)} → {fmtDate(to)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Perfil individual cuando se filtra a 1 freelancer ─── */}
          {selectedFreelancer && (
            <Card className="border-brand/40 bg-brand/[0.03]">
              <CardContent className="p-5">
                <div className="flex items-center gap-4 mb-3">
                  <div className="h-12 w-12 rounded-full bg-brand/20 text-brand font-bold flex items-center justify-center">
                    {(selectedFreelancer.nombre as string).slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-text-1">{selectedFreelancer.nombre as string}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={MODALIDAD_VARIANT[selectedFreelancer.modalidad as string] ?? 'secondary'}>
                        {t(`freelancers.modalidades.${selectedFreelancer.modalidad as string}` as Parameters<typeof t>[0])}
                      </Badge>
                      <span className="text-tiny text-text-3"><MapPin className="inline h-3 w-3" /> {selectedFreelancer.pais as string}</span>
                      <span className="text-tiny text-text-3">· {selectedFreelancer.moneda as string}</span>
                    </div>
                  </div>
                </div>
                <p className="text-tiny text-text-3">{t('freelancers.individualProfile')}</p>
              </CardContent>
            </Card>
          )}

          {/* ─── Tendencia mensual (SVG bar chart por moneda) ──────── */}
          <Card className="print:break-inside-avoid">
            <CardContent className="p-4">
              <h3 className="text-small font-semibold text-text-1 mb-3">{t('freelancers.monthlyTrend')}</h3>
              <MonthlyTrendChart data={report.monthlyTrend} fmtMonth={fmtMonth} />
            </CardContent>
          </Card>

          {/* ─── Layout 2 columnas: modalidad + top freelancers ───── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:break-inside-avoid">
            {/* Por modalidad */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-small font-semibold text-text-1 mb-3 flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-text-3" />
                  {t('freelancers.byModalidad')}
                </h3>
                {report.byModalidad.length === 0 ? (
                  <p className="text-tiny text-text-muted">—</p>
                ) : (
                  <div className="space-y-3">
                    {report.byModalidad.map(m => (
                      <div key={m.modalidad}>
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant={MODALIDAD_VARIANT[m.modalidad] ?? 'secondary'}>
                            {t(`freelancers.modalidades.${m.modalidad}` as Parameters<typeof t>[0])}
                          </Badge>
                          <span className="text-tiny text-text-3">{m.count} pagos</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-tiny font-mono">
                          {Object.entries(m.totals).map(([cur, amt]) => (
                            <span key={cur} className={CURRENCY_COLOR[cur] ?? 'text-text-2'}>
                              {fmtAmount(amt as number, cur)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top freelancers */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-small font-semibold text-text-1 mb-3 flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-text-3" />
                  {t('freelancers.topFreelancers')}
                </h3>
                {report.topFreelancers.length === 0 ? (
                  <p className="text-tiny text-text-muted">—</p>
                ) : (
                  <TopFreelancersBars data={report.topFreelancers} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Resumen por freelancer ─────────────────────────── */}
          {!freelancerId && (
            <Card className="print:break-before-page">
              <CardContent className="p-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-small font-semibold text-text-1">{t('freelancers.summaryByFreelancer')}</h3>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('freelancers.nombre')}</TableHead>
                        <TableHead>{t('freelancers.modalidad')}</TableHead>
                        <TableHead className="text-right">{t('freelancers.kpiPagos')}</TableHead>
                        <TableHead className="text-right">{t('freelancers.totalPagado')}</TableHead>
                        <TableHead>{t('freelancers.ultimoPago')}</TableHead>
                        <TableHead className="text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.byFreelancer.map(f => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium text-text-1">{f.nombre}</TableCell>
                          <TableCell>
                            <Badge variant={MODALIDAD_VARIANT[f.modalidad] ?? 'secondary'}>
                              {t(`freelancers.modalidades.${f.modalidad}` as Parameters<typeof t>[0])}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-small text-text-2">{f.count}</TableCell>
                          <TableCell className={`text-right text-small font-mono ${CURRENCY_COLOR[f.moneda] ?? 'text-text-1'}`}>
                            {fmtAmount(f.total, f.moneda)}
                          </TableCell>
                          <TableCell className="text-small text-text-2">{fmtDate(f.lastPago)}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => setFreelancerId(f.id)}>
                              Ver detalle
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Pagos detallados ──────────────────────────────── */}
          <Card className="print:break-before-page">
            <CardContent className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-small font-semibold text-text-1">{t('freelancers.detailedPayments')}</h3>
                {report.totalPayments > 500 && (
                  <span className="text-tiny text-amber-500">{t('freelancers.showingMax')}</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('freelancers.fechaPago')}</TableHead>
                      <TableHead>{t('freelancers.nombre')}</TableHead>
                      <TableHead>{t('freelancers.descripcion')}</TableHead>
                      <TableHead>{t('freelancers.modalidad')}</TableHead>
                      <TableHead className="text-right">{t('freelancers.monto')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rawPayments.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="text-small text-text-2 whitespace-nowrap">{fmtDate(p.fechaPago)}</TableCell>
                        <TableCell className="text-small text-text-1">{p.freelancerNombre}</TableCell>
                        <TableCell className="text-small text-text-2 max-w-xs truncate" title={p.descripcion}>{p.descripcion}</TableCell>
                        <TableCell>
                          <Badge variant={MODALIDAD_VARIANT[p.modalidad] ?? 'secondary'}>
                            {t(`freelancers.modalidades.${p.modalidad}` as Parameters<typeof t>[0])}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right text-small font-mono ${CURRENCY_COLOR[p.moneda] ?? 'text-text-1'}`}>
                          {fmtAmount(p.monto, p.moneda)}
                          {p.modalidad === 'POR_HORA' && p.horas != null && (
                            <span className="block text-tiny text-text-muted">{p.horas}h × ${p.tarifaHora ?? 0}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Monthly Trend Chart (SVG inline, no deps) ──────────────────────────────

function MonthlyTrendChart({
  data,
  fmtMonth,
}: {
  data: ReportOutput['monthlyTrend'];
  fmtMonth: (ym: string) => string;
}) {
  const maxValue = Math.max(
    1,
    ...data.flatMap(d => [d.USD, d.BOB, d.PEN]),
  );
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

// ─── Top Freelancers horizontal bars ─────────────────────────────────────────

function TopFreelancersBars({ data }: { data: ReportOutput['topFreelancers'] }) {
  const max = Math.max(1, ...data.map(d => d.total));
  return (
    <div className="space-y-2.5">
      {data.map(f => {
        const pct = (f.total / max) * 100;
        return (
          <div key={f.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-small text-text-2 truncate max-w-[60%]">{f.nombre}</span>
              <span className={`text-tiny font-mono ${CURRENCY_COLOR[f.moneda] ?? 'text-text-2'}`}>{fmtAmount(f.total, f.moneda)}</span>
            </div>
            <div className="h-1.5 bg-border/40 rounded-pill overflow-hidden">
              <div className="h-full bg-brand rounded-pill transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
