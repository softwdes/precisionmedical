'use client';

import * as React from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Card, CardContent,
} from '@precision/ui';
import { Plus, ArrowLeftRight, Eye, TrendingUp, DollarSign, Pencil, RotateCcw, Trash2, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type FxList    = inferRouterOutputs<AppRouter>['fx']['list'];
type FxSummary = inferRouterOutputs<AppRouter>['fx']['getSummary'];
type Wallet    = inferRouterOutputs<AppRouter>['wallets']['list'][number];

type WalletSnap = { id: string; name: string; currency: string } | null;
type FxOp = {
  id:            string;
  amountFrom:    number;
  amountTo:      number;
  rate:          unknown;
  fee:           unknown;
  exchangeHouse: string | null;
  notes:         string | null;
  receiptUrl:    string | null;
  performedAt:   string;
  reversedById:  string | null;
  fromWalletId:  string;
  toWalletId:    string;
  fromWallet:    WalletSnap;
  toWallet:      WalletSnap;
};

// ─── Constants ───────────────────────────────────────────────

const FLAGS: Record<string, string> = { USD: '🇺🇸', BOB: '🇧🇴', PEN: '🇵🇪' };

const PAIR_OPTIONS = [
  { value: 'USD-BOB', from: 'USD', to: 'BOB' },
  { value: 'USD-PEN', from: 'USD', to: 'PEN' },
  { value: 'BOB-USD', from: 'BOB', to: 'USD' },
  { value: 'PEN-USD', from: 'PEN', to: 'USD' },
  { value: 'BOB-PEN', from: 'BOB', to: 'PEN' },
  { value: 'PEN-BOB', from: 'PEN', to: 'BOB' },
];

// ─── Helpers ─────────────────────────────────────────────────

function fmtAmount(n: number, cur: string): string {
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (cur === 'BOB') return `Bs ${v}`;
  if (cur === 'PEN') return `S/ ${v}`;
  return `$${v}`;
}

function fmtDateTime(s: string): string {
  const d   = new Date(s);
  const mon = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  const h   = String(d.getHours()).padStart(2, '0');
  const mi  = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${d.getFullYear()} · ${h}:${mi}`;
}

function fmtPeriodLabel(iso: string, locale: string): string {
  const [y, m] = iso.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  const s = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pairLabel(from: string, to: string): string {
  return `${FLAGS[from] ?? ''} ${from} → ${FLAGS[to] ?? ''} ${to}`;
}

/** Escapa texto libre antes de inyectarlo en el HTML de impresión (PDF). */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Devuelve YYYY-MM-DD para el HTML date input en la zona LOCAL del usuario.
 * Evita el bug de `toISOString().slice(0,10)` que devuelve UTC y puede
 * mostrar un dia distinto al esperado segun la hora local.
 */
function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Convierte un string YYYY-MM-DD (del HTML date input) a Date local a las 12:00
 * (mediodia). Evita el off-by-one bug que ocurre con `new Date("YYYY-MM-DD")`
 * que interpreta como UTC midnight y cae en el dia anterior en zonas horarias
 * negativas (Utah es UTC-6/-7).
 */
function parseDateInputLocal(s: string): Date {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function curOf(wallet: unknown): string {
  return (wallet as { currency: string } | null)?.currency ?? '';
}

function walletOf(wallet: unknown): { id: string; name: string; currency: string } | null {
  return wallet as { id: string; name: string; currency: string } | null;
}

// ─── Empty state ─────────────────────────────────────────────

function EmptyState({ onNew, t }: { onNew: () => void; t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="text-center py-16 px-4 flex flex-col items-center gap-3">
      <ArrowLeftRight className="h-10 w-10 text-text-muted" />
      <p className="text-sm font-medium text-text-2">{t('fx.noOpsTitle')}</p>
      <p className="text-small text-text-3">{t('fx.noOpsSubtitle')}</p>
      <Button onClick={onNew} className="mt-1">
        <Plus className="h-4 w-4" />
        {t('fx.addNew')}
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

export function FxClient({
  initial, wallets, initialSummary, initialHouses,
}: {
  initial:        FxList;
  wallets:        Wallet[];
  initialSummary: FxSummary;
  initialHouses:  string[];
}): React.ReactElement {
  const t      = useTranslations();
  const locale = useLocale();

  const now           = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [period,      setPeriod]      = useState(currentPeriod);
  const [pairFilter,  setPairFilter]  = useState('');
  const [houseFilter, setHouseFilter] = useState('');
  const [page,        setPage]        = useState(1);
  const [showCreate,  setShowCreate]  = useState(false);
  const [detailOp,    setDetailOp]    = useState<FxOp | null>(null);
  const [editOp,      setEditOp]      = useState<FxOp | null>(null);
  const [reverseOp,   setReverseOp]   = useState<FxOp | null>(null);

  const periodOptions = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = d.toISOString().slice(0, 7);
      return { value: v, label: fmtPeriodLabel(v, locale) };
    }),
  [locale]);

  // 'ALL' = ver todas las operaciones (sin filtro de mes). El backend devuelve
  // todo cuando period es undefined.
  const periodFilter = period === 'ALL' ? undefined : period;

  // ── Queries
  const { data, refetch } = trpc.fx.list.useQuery(
    { page, pageSize: 25, period: periodFilter, exchangeHouse: houseFilter || undefined },
    { initialData: initial },
  );

  const { data: summary, refetch: refetchSummary } = trpc.fx.getSummary.useQuery(
    { period: currentPeriod },
    { initialData: initialSummary },
  );

  const { data: houses } = trpc.fx.getExchangeHouses.useQuery(undefined, {
    initialData: initialHouses,
  });

  const refetchAll = () => { void refetch(); void refetchSummary(); };

  const utils = trpc.useUtils();

  // ── Client-side pair filter
  const selectedPair = PAIR_OPTIONS.find(p => p.value === pairFilter);
  const allItems     = (data?.items ?? []) as unknown as FxOp[];

  const items = useMemo(() => {
    if (!selectedPair) return allItems;
    return allItems.filter(op => {
      const fw = curOf(op.fromWallet);
      const tw = curOf(op.toWallet);
      return fw === selectedPair.from && tw === selectedPair.to;
    });
  }, [allItems, selectedPair]);

  // ── Avg rates per pair (for rate colour coding)
  const avgRates = useMemo(() => {
    const acc: Record<string, { sum: number; n: number }> = {};
    for (const op of allItems) {
      const k = `${curOf(op.fromWallet)}-${curOf(op.toWallet)}`;
      if (!acc[k]) acc[k] = { sum: 0, n: 0 };
      acc[k]!.sum += Number(op.rate);
      acc[k]!.n   += 1;
    }
    return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.sum / v.n]));
  }, [allItems]);

  useEffect(() => { setPage(1); }, [period, pairFilter, houseFilter]);

  // ── Export: trae TODAS las filas del filtro actual (todas las páginas, no
  // solo la visible). Importante cuando "Todos los meses" está seleccionado.
  const gatherRows = async (): Promise<FxOp[]> => {
    const out: FxOp[] = [];
    for (let pg = 1; pg <= 50; pg++) {  // tope de seguridad: 50 páginas × 100 = 5000 ops
      const res   = await utils.fx.list.fetch({ page: pg, pageSize: 100, period: periodFilter, exchangeHouse: houseFilter || undefined });
      out.push(...((res?.items ?? []) as unknown as FxOp[]));
      if (pg >= (res?.totalPages ?? 1)) break;
    }
    if (selectedPair) {
      return out.filter(op => curOf(op.fromWallet) === selectedPair.from && curOf(op.toWallet) === selectedPair.to);
    }
    return out;
  };

  const periodLabel = period === 'ALL' ? t('fx.allMonths') : fmtPeriodLabel(period, locale);

  // ── Export Excel (CSV con BOM, abre en Excel) ──
  const handleExportCSV = async () => {
    const rows = await gatherRows();
    if (rows.length === 0) { toast.error(t('fx.noOps')); return; }
    const headers = ['Fecha', 'Par', 'Monto origen', 'Tasa', 'Monto destino', 'Casa de cambio', 'Notas', 'Estado'];
    const body = rows.map(op => {
      const fw = walletOf(op.fromWallet);
      const tw = walletOf(op.toWallet);
      return [
        fmtDateTime(op.performedAt),
        `${fw?.currency ?? '?'} → ${tw?.currency ?? '?'}`,
        fw ? `${fmtAmount(Number(op.amountFrom), fw.currency)} ${fw.currency}` : '—',
        Number(op.rate).toFixed(4),
        tw ? `${fmtAmount(Number(op.amountTo), tw.currency)} ${tw.currency}` : '—',
        op.exchangeHouse ?? '',
        op.notes ?? '',
        op.reversedById ? 'Reversada' : '',
      ];
    });
    const csv = [headers, ...body].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const [y, m] = period.split('-');
    a.href = url; a.download = period === 'ALL' ? 'divisas-todas.csv' : `divisas-${m}-${y}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Export PDF (ventana de impresión) ──
  const handleExportPDF = async () => {
    const rows = await gatherRows();
    if (rows.length === 0) { toast.error(t('fx.noOps')); return; }
    // KPIs calculados desde las filas exportadas para que coincidan con la tabla
    // impresa en cualquier período (incl. "Todos los meses"). Las tasas son la
    // última operación conocida (referencia global).
    const opCount        = rows.length;
    const totalConverted = rows.reduce((s, op) => s + Number(op.amountFrom), 0);
    const body = rows.map(op => {
      const fw = walletOf(op.fromWallet);
      const tw = walletOf(op.toWallet);
      return `<tr${op.reversedById ? ' style="opacity:.55"' : ''}>
        <td>${esc(fmtDateTime(op.performedAt))}</td>
        <td>${esc(`${fw?.currency ?? '?'} → ${tw?.currency ?? '?'}`)}</td>
        <td style="text-align:right;font-family:monospace">${esc(fw ? `${fmtAmount(Number(op.amountFrom), fw.currency)} ${fw.currency}` : '—')}</td>
        <td style="text-align:right;font-family:monospace">${Number(op.rate).toFixed(4)}</td>
        <td style="text-align:right;font-family:monospace;color:#10B981">${esc(tw ? `${fmtAmount(Number(op.amountTo), tw.currency)} ${tw.currency}` : '—')}</td>
        <td>${esc(op.exchangeHouse ?? '—')}</td>
        <td>${op.reversedById ? 'Reversada' : ''}</td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>FX / Divisas ${esc(periodLabel)}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{margin:0;font-size:20px}
.sub{color:#666;font-size:12px;margin:4px 0 20px}.kpis{display:flex;gap:12px;margin-bottom:20px}
.kpi{background:#f3f4f6;padding:10px 14px;border-radius:8px;flex:1}.kpi-l{font-size:10px;color:#666;text-transform:uppercase}
.kpi-v{font-size:17px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;border-bottom:2px solid #e5e7eb;padding:7px 5px;font-size:10px;text-transform:uppercase;color:#666}
td{padding:6px 5px;border-bottom:1px solid #f0f0f0}@media print{body{padding:0}}</style></head><body>
<h1>FX / Divisas — Precision Medical</h1>
<p class="sub">${esc(periodLabel)} · Generado ${new Date().toLocaleDateString('es-ES')}</p>
<div class="kpis">
  <div class="kpi"><div class="kpi-l">Operaciones</div><div class="kpi-v">${opCount}</div></div>
  <div class="kpi"><div class="kpi-l">Total convertido (USD eq.)</div><div class="kpi-v">$${totalConverted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
  <div class="kpi"><div class="kpi-l">Tasa USD→BOB</div><div class="kpi-v">${summary?.lastRateUsdBob != null ? Number(summary.lastRateUsdBob).toFixed(2) : '—'}</div></div>
  <div class="kpi"><div class="kpi-l">Tasa USD→PEN</div><div class="kpi-v">${summary?.lastRateUsdPen != null ? Number(summary.lastRateUsdPen).toFixed(2) : '—'}</div></div>
</div>
<table><thead><tr><th>Fecha</th><th>Par</th><th style="text-align:right">Monto origen</th><th style="text-align:right">Tasa</th><th style="text-align:right">Monto destino</th><th>Casa de cambio</th><th>Estado</th></tr></thead>
<tbody>${body}</tbody></table></body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  };

  return (
    <div className="px-3 py-4 sm:p-6 space-y-4">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('fx.title')}</h1>
          <p className="text-small text-text-3">{t('fx.subtitle')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { void handleExportPDF(); }} className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => { void handleExportCSV(); }} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t('fx.addNew')}
          </Button>
        </div>
      </div>

      {/* ── KPI cards: 2×2 on tablet, 1-col on mobile < 480px, 4-col on desktop ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

        {/* Operaciones del mes */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(99,102,241,0.06)' }}>
                <ArrowLeftRight className="h-4 w-4" style={{ color: '#6366F1' }} />
              </div>
              <div className="min-w-0">
                <p className="text-tiny text-text-3 uppercase tracking-wide leading-tight">{t('fx.operations')}</p>
                <p className="text-lg font-bold text-text-1 leading-tight mt-0.5">{summary?.opCount ?? 0}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{t('fx.thisMonth')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total convertido */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(245,158,11,0.06)' }}>
                <TrendingUp className="h-4 w-4" style={{ color: '#F59E0B' }} />
              </div>
              <div className="min-w-0">
                <p className="text-tiny text-text-3 uppercase tracking-wide leading-tight">{t('fx.totalConverted')}</p>
                <p className="text-lg font-bold text-text-1 leading-tight mt-0.5 truncate">
                  ${Number(summary?.totalConverted ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">{t('fx.usdEquiv')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasa USD→BOB */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(6,182,212,0.06)' }}>
                <DollarSign className="h-4 w-4" style={{ color: '#06B6D4' }} />
              </div>
              <div className="min-w-0">
                <p className="text-tiny text-text-3 uppercase tracking-wide leading-tight">{t('fx.rateUsdBob')}</p>
                <p className="text-lg font-bold font-mono leading-tight mt-0.5" style={{ color: '#06B6D4' }}>
                  {summary?.lastRateUsdBob != null ? Number(summary.lastRateUsdBob).toFixed(2) : '—'}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">{t('fx.lastOp')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasa USD→PEN */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(139,92,246,0.06)' }}>
                <DollarSign className="h-4 w-4" style={{ color: '#8B5CF6' }} />
              </div>
              <div className="min-w-0">
                <p className="text-tiny text-text-3 uppercase tracking-wide leading-tight">{t('fx.rateUsdPen')}</p>
                <p className="text-lg font-bold font-mono leading-tight mt-0.5" style={{ color: '#8B5CF6' }}>
                  {summary?.lastRateUsdPen != null ? Number(summary.lastRateUsdPen).toFixed(2) : '—'}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">{t('fx.lastOp')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ── */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:flex-wrap">
        <Select value={pairFilter} onValueChange={v => setPairFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="min-h-[38px] w-full sm:w-44">
            <SelectValue placeholder={t('fx.allPairs')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('fx.allPairs')}</SelectItem>
            {PAIR_OPTIONS.map(p => (
              <SelectItem key={p.value} value={p.value}>{pairLabel(p.from, p.to)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="min-h-[38px] w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('fx.allMonths')}</SelectItem>
            {periodOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={houseFilter} onValueChange={v => setHouseFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="min-h-[38px] w-full sm:w-44">
            <SelectValue placeholder={t('fx.allHouses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('fx.allHouses')}</SelectItem>
            {(houses ?? []).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
          </SelectContent>
        </Select>

        <p className="text-small text-text-3 col-span-2 sm:col-span-1 sm:ml-auto">
          {items.length} {t('fx.opCount')}
        </p>
      </div>

      {/* ── Table / card list ── */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">

        {/* Mobile cards */}
        <div className="md:hidden">
          {items.length === 0
            ? <EmptyState onNew={() => setShowCreate(true)} t={t} />
            : (
              <div className="divide-y divide-border">
                {items.map(op => {
                  const fw = walletOf(op.fromWallet);
                  const tw = walletOf(op.toWallet);
                  return (
                    <div
                      key={op.id}
                      className="hover:bg-surface-hover transition-colors"
                      style={{ borderRadius: 12, margin: 8, border: '1px solid var(--color-border)', padding: 14 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-text-1">
                          {fw ? `${FLAGS[fw.currency] ?? ''} ${fw.currency}` : '?'} → {tw ? `${FLAGS[tw.currency] ?? ''} ${tw.currency}` : '?'}
                        </span>
                        <span className="text-[11px] text-text-muted font-mono">
                          {fmtDateTime(op.performedAt as string).split(' · ')[0]}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="text-sm font-mono text-text-2">
                          {fw ? `${fmtAmount(Number(op.amountFrom), fw.currency)} ${fw.currency}` : '—'}
                        </span>
                        <span className="text-text-muted text-xs">×</span>
                        <span className="text-sm font-mono text-text-3">{Number(op.rate).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm font-bold font-mono" style={{ color: '#10B981' }}>
                          = {tw ? `${fmtAmount(Number(op.amountTo), tw.currency)} ${tw.currency}` : '—'}
                        </span>
                        <RowActions
                          op={op}
                          onDetail={() => setDetailOp(op)}
                          onEdit={() => setEditOp(op)}
                          onReverse={() => setReverseOp(op)}
                          t={t}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          {items.length === 0
            ? <EmptyState onNew={() => setShowCreate(true)} t={t} />
            : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ minWidth: 150 }}>{t('fx.pair')}</TableHead>
                    <TableHead className="text-right" style={{ minWidth: 145 }}>{t('fx.originAmount')}</TableHead>
                    <TableHead className="text-right" style={{ minWidth: 80 }}>{t('fx.rate')}</TableHead>
                    <TableHead className="text-right" style={{ minWidth: 145 }}>{t('fx.destAmount')}</TableHead>
                    <TableHead style={{ minWidth: 130 }}>{t('fx.exchangeHouse')}</TableHead>
                    <TableHead style={{ minWidth: 165 }}>{t('fx.performedAt')}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(op => {
                    const fw   = walletOf(op.fromWallet);
                    const tw   = walletOf(op.toWallet);
                    const rate = Number(op.rate);
                    const pairKey = fw && tw ? `${fw.currency}-${tw.currency}` : '';
                    const avg  = avgRates[pairKey];
                    const pct  = avg ? ((rate - avg) / avg) * 100 : 0;
                    const rateClr = avg
                      ? Math.abs(pct) >= 20 ? '#F43F5E'
                      : Math.abs(pct) >= 5  ? '#F59E0B'
                      : undefined
                      : undefined;

                    return (
                      <TableRow key={op.id}>
                        <TableCell>
                          <span className="text-small font-medium text-text-1">
                            {fw ? `${FLAGS[fw.currency] ?? ''} ${fw.currency}` : '—'} → {tw ? `${FLAGS[tw.currency] ?? ''} ${tw.currency}` : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-small text-text-2">
                          {fw ? `${fmtAmount(Number(op.amountFrom), fw.currency)} ${fw.currency}` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-small" style={{ color: rateClr }}>
                          {rate.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-small" style={{ color: '#10B981' }}>
                          {tw ? fmtAmount(Number(op.amountTo), tw.currency) : '—'}
                        </TableCell>
                        <TableCell className="text-small text-text-3">
                          {(op.exchangeHouse as string | null) ?? '—'}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-text-muted whitespace-nowrap">
                          {fmtDateTime(op.performedAt as string)}
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            op={op}
                            onDetail={() => setDetailOp(op)}
                            onEdit={() => setEditOp(op)}
                            onReverse={() => setReverseOp(op)}
                            t={t}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          }
        </div>
      </div>

      {/* Pagination */}
      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-small text-text-3">{t('employees.page')} {page} {t('employees.of')} {data?.totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
            <Button variant="outline" size="sm" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateFxModal
          wallets={wallets}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refetchAll(); }}
        />
      )}

      {detailOp && (
        <DetailModal op={detailOp} onClose={() => setDetailOp(null)} t={t} />
      )}

      {editOp && (
        <EditFxModal
          op={editOp}
          onClose={() => setEditOp(null)}
          onSaved={() => { setEditOp(null); refetchAll(); }}
          t={t}
        />
      )}

      {reverseOp && (
        <ReverseDialog
          op={reverseOp}
          onClose={() => setReverseOp(null)}
          onReversed={() => { setReverseOp(null); refetchAll(); }}
          t={t}
        />
      )}

    </div>
  );
}

// ─── Row action buttons (Eye · Pencil · RotateCcw) ───────────────

function RowActions({
  op, onDetail, onEdit, onReverse, t,
}: {
  op:        FxOp;
  onDetail:  () => void;
  onEdit:    () => void;
  onReverse: () => void;
  t:         ReturnType<typeof useTranslations>;
}) {
  const isReversed = !!op.reversedById;
  const btn = 'p-1.5 rounded transition-colors';

  return (
    <div className="flex items-center gap-0.5 justify-end">
      <button onClick={onDetail} className={`${btn} text-text-muted hover:text-brand hover:bg-surface-hover`} title={t('fx.viewDetail')}>
        <Eye className="h-3.5 w-3.5" />
      </button>
      <button onClick={onEdit} className={`${btn} text-text-muted hover:text-amber-500 hover:bg-amber-500/10`} title={t('fx.editOp')}>
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onReverse}
        className={`${btn} ${isReversed ? 'text-rose-400 hover:text-rose-600 hover:bg-rose-500/10' : 'text-text-muted hover:text-rose-500 hover:bg-rose-500/10'}`}
        title={isReversed ? t('fx.deleteRecord') : t('fx.reverseOp')}
      >
        {isReversed ? <Trash2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ─── Edit Metadata Modal ─────────────────────────────────────────

function EditFxModal({
  op, onClose, onSaved, t,
}: {
  op:      FxOp;
  onClose: () => void;
  onSaved: () => void;
  t:       ReturnType<typeof useTranslations>;
}) {
  const [exchangeHouse, setExchangeHouse] = useState(op.exchangeHouse ?? '');
  const [receiptUrl,    setReceiptUrl]    = useState((op.receiptUrl as string) ?? '');
  const [notes,         setNotes]         = useState((op.notes as string) ?? '');
  // Fecha de cambio — pre-llenada con el valor actual en zona local del usuario
  const [performedAt,   setPerformedAt]   = useState(() => toLocalDateInput(new Date(op.performedAt)));

  const fw = walletOf(op.fromWallet);
  const tw = walletOf(op.toWallet);

  const update = trpc.fx.update.useMutation({
    onSuccess: () => { toast.success(t('fx.updated')); onSaved(); },
    onError:   (e) => toast.error(e.message),
  });

  return (
    <FxSheetModal onClose={onClose} title={t('fx.editOp')}>
      <div className="overflow-y-auto flex-1 min-h-0">
        <div className="p-5 space-y-4">

          {/* Read-only pair info */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-text-2"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}>
            <span className="font-semibold">
              {fw ? `${FLAGS[fw.currency] ?? ''} ${fw.currency}` : '?'} → {tw ? `${FLAGS[tw.currency] ?? ''} ${tw.currency}` : '?'}
            </span>
            <span className="ml-auto font-mono text-text-3">{Number(op.rate).toFixed(4)}</span>
          </div>

          <div className="space-y-1">
            <Label>Fecha de cambio</Label>
            <Input
              type="date"
              value={performedAt}
              onChange={e => setPerformedAt(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>{t('fx.exchangeHouse')}</Label>
            <Input value={exchangeHouse} onChange={e => setExchangeHouse(e.target.value)} placeholder="Ej. Casa de cambio X" />
          </div>

          <div className="space-y-1">
            <Label>{t('fx.receiptUrl')}</Label>
            <Input value={receiptUrl} onChange={e => setReceiptUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div className="space-y-1">
            <Label>{t('fx.notes')}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder={t('fx.notesPlaceholder')} />
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-border flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          className="flex-1"
          disabled={update.isPending}
          onClick={() => update.mutate({
            id: op.id,
            exchangeHouse: exchangeHouse || null,
            receiptUrl:    receiptUrl    || null,
            notes:         notes         || null,
            performedAt:   parseDateInputLocal(performedAt),
          })}
        >
          {update.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </FxSheetModal>
  );
}

// ─── Reverse Confirmation Dialog ─────────────────────────────────

function ReverseDialog({
  op, onClose, onReversed, t,
}: {
  op:         FxOp;
  onClose:    () => void;
  onReversed: () => void;
  t:          ReturnType<typeof useTranslations>;
}) {
  const fw = walletOf(op.fromWallet);
  const tw = walletOf(op.toWallet);

  const reverse = trpc.fx.reverse.useMutation({
    onSuccess: () => { toast.success(t('fx.reversed')); onReversed(); },
    onError:   (e) => toast.error(e.message),
  });

  const del = trpc.fx.delete.useMutation({
    onSuccess: () => { toast.success(t('fx.deleted')); onReversed(); },
    onError:   (e) => toast.error(e.message),
  });

  const isReversed = !!op.reversedById;
  const busy = reverse.isPending || del.isPending;

  return (
    <FxSheetModal onClose={onClose} title={isReversed ? t('fx.deleteRecord') : t('fx.reverseOp')}>
      <div className="p-5 space-y-4 flex-1">
        <div className="rounded-lg p-3.5 space-y-1"
          style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)' }}>
          <p className="text-sm font-semibold text-rose-500">{t('fx.reverseWarning')}</p>
          <p className="text-small text-text-3">
            {isReversed ? t('fx.deleteExplain') : t('fx.reverseExplain')}
          </p>
        </div>

        <div className="rounded-lg p-3 text-sm text-text-2"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}>
          <p className="font-semibold mb-1">
            {fw ? `${FLAGS[fw.currency] ?? ''} ${fw.currency}` : '?'} → {tw ? `${FLAGS[tw.currency] ?? ''} ${tw.currency}` : '?'}
          </p>
          <p className="font-mono text-text-3">
            {fw ? fmtAmount(Number(op.amountFrom), fw.currency) : '—'} × {Number(op.rate).toFixed(4)} = {tw ? fmtAmount(Number(op.amountTo), tw.currency) : '—'}
          </p>
        </div>
      </div>

      <div className="p-4 border-t border-border space-y-2">
        {isReversed ? (
          /* Already reversed — only show hard delete */
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white border-0"
              disabled={busy}
              onClick={() => del.mutate({ id: op.id })}
            >
              {del.isPending ? t('common.processing') : t('fx.deleteRecord')}
            </Button>
          </div>
        ) : (
          /* Not yet reversed — show reverse + delete options */
          <>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
              <Button
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white border-0"
                disabled={busy}
                onClick={() => reverse.mutate({ id: op.id })}
              >
                {reverse.isPending ? t('common.processing') : t('fx.reverseButton')}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 border-t border-border/50" />
              <span className="text-[10px] text-text-muted uppercase tracking-wide">{t('common.or')}</span>
              <div className="flex-1 border-t border-border/50" />
            </div>

            <Button
              variant="outline"
              className="w-full text-rose-500 border-rose-500/30 hover:bg-rose-500/10 hover:border-rose-500/60"
              disabled={busy}
              onClick={() => del.mutate({ id: op.id })}
            >
              {del.isPending ? t('common.processing') : t('fx.deleteRecord')}
            </Button>
          </>
        )}
      </div>
    </FxSheetModal>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────

function DetailModal({
  op, onClose, t,
}: {
  op: FxOp;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const fw = walletOf(op.fromWallet);
  const tw = walletOf(op.toWallet);

  return (
    <FxSheetModal onClose={onClose} title={t('fx.detail')}>
      <div className="space-y-4 p-5">
        {/* Pair visual */}
        <div className="flex items-center justify-center gap-4 py-3"
          style={{ background: 'rgba(99,102,241,0.05)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.15)' }}>
          <div className="text-center">
            <p className="text-2xl">{fw ? FLAGS[fw.currency] : ''}</p>
            <p className="text-sm font-bold text-text-1 mt-0.5">{fw?.currency ?? '—'}</p>
          </div>
          <ArrowLeftRight className="h-5 w-5 shrink-0" style={{ color: '#6366F1' }} />
          <div className="text-center">
            <p className="text-2xl">{tw ? FLAGS[tw.currency] : ''}</p>
            <p className="text-sm font-bold text-text-1 mt-0.5">{tw?.currency ?? '—'}</p>
          </div>
        </div>

        {/* Amounts */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}>
            <p className="text-[10px] text-text-muted uppercase tracking-wide">{t('fx.origin')}</p>
            <p className="font-mono font-bold text-base text-text-1">
              {fw ? fmtAmount(Number(op.amountFrom), fw.currency) : '—'}
            </p>
            <p className="text-[11px] text-text-muted">{fw?.currency}</p>
          </div>
          <div className="space-y-1 p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.20)' }}>
            <p className="text-[10px] text-text-muted uppercase tracking-wide">{t('fx.destination')}</p>
            <p className="font-mono font-bold text-base" style={{ color: '#10B981' }}>
              {tw ? fmtAmount(Number(op.amountTo), tw.currency) : '—'}
            </p>
            <p className="text-[11px] text-text-muted">{tw?.currency}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="space-y-2.5">
          <Row label={t('fx.rate')}         value={Number(op.rate).toFixed(4)} mono />
          {Number(op.fee) > 0 && (
            <Row label={t('fx.fee')}        value={fmtAmount(Number(op.fee), fw?.currency ?? 'USD')} mono />
          )}
          {op.exchangeHouse && (
            <Row label={t('fx.exchangeHouse')} value={op.exchangeHouse as string} />
          )}
          <Row label={t('fx.performedAt')} value={fmtDateTime(op.performedAt as string)} mono />
          {op.notes && (
            <Row label={t('fx.notes')} value={op.notes as string} />
          )}
        </div>

        <Button variant="outline" className="w-full" onClick={onClose}>{t('common.close')}</Button>
      </div>
    </FxSheetModal>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-small text-text-3 shrink-0">{label}</span>
      <span className={`text-small text-text-1 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Create FX Modal ──────────────────────────────────────────

function CreateFxModal({
  wallets, onClose, onCreated,
}: {
  wallets:   Wallet[];
  onClose:   () => void;
  onCreated: () => void;
}): React.ReactElement {
  const t = useTranslations();

  const [fromWalletId,  setFromWalletId]  = useState('');
  const [toWalletId,    setToWalletId]    = useState('');
  const [montoOrigen,   setMontoOrigen]   = useState('');
  const [tasa,          setTasa]          = useState('');
  const [commission,    setCommission]    = useState('');
  const [exchangeHouse, setExchangeHouse] = useState('');
  const [receiptUrl,    setReceiptUrl]    = useState('');
  const [notes,         setNotes]         = useState('');
  // Fecha de cambio — default hoy en zona local del usuario
  const [performedAt,   setPerformedAt]   = useState(() => toLocalDateInput(new Date()));

  const fromWallet  = wallets.find(w => w.id === fromWalletId) ?? null;
  const toWallet    = wallets.find(w => w.id === toWalletId)   ?? null;
  const fromCur     = fromWallet?.currency ?? '';
  const toCur       = toWallet?.currency   ?? '';
  const sameCur     = !!fromWalletId && !!toWalletId && fromCur === toCur;
  const bothOk      = !!fromWalletId && !!toWalletId && !sameCur;

  const montoNum    = parseFloat(montoOrigen) || 0;
  const tasaNum     = parseFloat(tasa)        || 0;
  const destNum     = montoNum * tasaNum;

  // Last rate query
  const { data: lastRate } = trpc.fx.getLastRate.useQuery(
    { from: fromCur, to: toCur },
    { enabled: bothOk },
  );

  // Pre-fill tasa when pair changes
  const prevFromCur = useRef('');
  const prevToCur   = useRef('');
  useEffect(() => {
    if (lastRate?.rate != null && (fromCur !== prevFromCur.current || toCur !== prevToCur.current)) {
      setTasa(String(lastRate.rate));
      prevFromCur.current = fromCur;
      prevToCur.current   = toCur;
    }
  }, [lastRate?.rate, fromCur, toCur]);

  // Tasa warning
  const avg30d      = lastRate?.avg30d ?? 0;
  const warningPct  = avg30d > 0 && tasaNum > 0 ? ((tasaNum - avg30d) / avg30d) * 100 : 0;
  const showWarning = avg30d > 0 && tasaNum > 0 && Math.abs(warningPct) >= 10;

  const create = trpc.fx.create.useMutation({
    onSuccess: () => {
      toast.success(`${t('fx.created')}: ${fmtAmount(montoNum, fromCur)} ${fromCur} → ${fmtAmount(destNum, toCur)} ${toCur}`);
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  const isValid = bothOk && montoNum > 0 && tasaNum > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    create.mutate({
      fromWalletId,
      toWalletId,
      amountFrom:   montoNum,
      amountTo:     destNum,
      rate:         tasaNum,
      fee:          parseFloat(commission) || 0,
      exchangeHouse: exchangeHouse || undefined,
      receiptUrl:    receiptUrl    || undefined,
      notes:         notes         || undefined,
      performedAt:   parseDateInputLocal(performedAt),
    });
  };

  const flagName = (w: Wallet | null) => w ? `${FLAGS[w.currency] ?? ''} ${w.currency} · ${w.name}` : '';

  return (
    <FxSheetModal onClose={onClose} title={t('fx.createOp')}>
      <div className="overflow-y-auto flex-1 min-h-0">
        <div className="p-5 space-y-5">

          {/* ── SECTION A: Currency pair selector ── */}
          <div style={{
            background:   'rgba(99,102,241,0.06)',
            border:       '1px solid rgba(99,102,241,0.18)',
            borderRadius: 12,
            padding:      14,
          }}>
            {/* Desktop: 3-col grid  |  Mobile: stacked */}
            <div className="flex flex-col sm:grid sm:gap-2.5 sm:items-end"
              style={{ gridTemplateColumns: '1fr auto 1fr' }}>

              {/* Wallet origen */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('fx.walletOrigen')}</p>
                <Select value={fromWalletId} onValueChange={v => { setFromWalletId(v); setTasa(''); }}>
                  <SelectTrigger className="min-h-[44px] w-full">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.map(w => (
                      <SelectItem key={w.id} value={w.id}>{flagName(w)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ⇄ icon */}
              <div className="flex items-center justify-center my-2 sm:my-0 sm:mt-5">
                <ArrowLeftRight className="h-5 w-5 sm:rotate-0 rotate-90" style={{ color: '#6366F1' }} />
              </div>

              {/* Wallet destino */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('fx.walletDestino')}</p>
                <Select value={toWalletId} onValueChange={v => { setToWalletId(v); setTasa(''); }}>
                  <SelectTrigger className="min-h-[44px] w-full">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.map(w => (
                      <SelectItem key={w.id} value={w.id}>{flagName(w)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Same currency error */}
            {sameCur && (
              <p className="text-[11px] text-rose mt-2">{t('fx.sameWalletError')}</p>
            )}

            {/* Last rate info box */}
            {bothOk && lastRate && (
              <div className="mt-3 px-3 py-2 rounded-lg text-[11px]"
                style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.20)', color: '#06B6D4' }}>
                {t('fx.lastRateFor')} {FLAGS[fromCur]} {fromCur}→{FLAGS[toCur]} {toCur}:{' '}
                <strong>{lastRate.rate.toFixed(4)}</strong>
                {' · '}
                {lastRate.daysAgo === 0 ? 'hoy' : `hace ${lastRate.daysAgo} días`}
              </div>
            )}
          </div>

          {/* ── SECTION B: Amount calculation ── */}
          <div>
            <div className="flex flex-col gap-3 sm:grid sm:gap-3"
              style={{ gridTemplateColumns: '1fr 100px 1fr' }}>

              {/* Monto origen */}
              <div className="space-y-1.5">
                <Label className="text-[12px]">{t('fx.amountFrom')} *</Label>
                <div className="relative">
                  <Input
                    type="number" min="0.01" step="0.01" placeholder="0.00"
                    className="min-h-[44px] pr-14"
                    style={{ fontSize: 14 }}
                    value={montoOrigen}
                    onChange={e => setMontoOrigen(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-text-muted pointer-events-none">
                    {fromCur || '—'}
                  </span>
                </div>
              </div>

              {/* Tasa */}
              <div className="space-y-1.5">
                <Label className="text-[12px] flex items-center gap-1">
                  <span className="text-text-muted">×</span> {t('fx.rate')} *
                </Label>
                <Input
                  type="number" min="0.0001" step="0.0001" placeholder="0.0000"
                  className="min-h-[44px]"
                  style={{ fontSize: 14 }}
                  value={tasa}
                  onChange={e => setTasa(e.target.value)}
                />
              </div>

              {/* Monto destino (read-only) */}
              <div className="space-y-1.5">
                <Label className="text-[12px]">{t('fx.amountTo')}</Label>
                <div className="relative">
                  <Input
                    readOnly
                    value={destNum > 0 ? destNum.toFixed(2) : ''}
                    placeholder="0.00"
                    className="min-h-[44px] pr-14 cursor-default"
                    style={{
                      fontSize: 14,
                      background: 'rgba(16,185,129,0.04)',
                      border:     '1px solid rgba(16,185,129,0.30)',
                      color:      '#10B981',
                    }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono pointer-events-none"
                    style={{ color: '#10B981' }}>
                    {toCur || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── SECTION C: Tasa warning ── */}
            {showWarning && (
              <div className="mt-2.5 px-3 py-2 rounded-lg text-[11px]"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }}>
                ⚠ La tasa ingresada es {Math.abs(warningPct).toFixed(1)}%{' '}
                {warningPct > 0 ? 'mayor' : 'menor'} al promedio reciente ({avg30d.toFixed(4)})
              </div>
            )}
          </div>

          {/* ── SECTION D: Additional fields ── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Fecha de cambio *</Label>
              <Input
                type="date"
                className="min-h-[44px]" style={{ fontSize: 14 }}
                value={performedAt}
                onChange={e => setPerformedAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">{t('fx.fee')} ({t('common.optional')})</Label>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                className="min-h-[44px]" style={{ fontSize: 14 }}
                value={commission}
                onChange={e => setCommission(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">{t('fx.exchangeHouse')} ({t('common.optional')})</Label>
              <Input
                placeholder="Ej: Cambios Bolívar"
                className="min-h-[44px]" style={{ fontSize: 14 }}
                value={exchangeHouse}
                onChange={e => setExchangeHouse(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">{t('fx.receiptUrl')} ({t('common.optional')})</Label>
            <Input
              type="url" placeholder="https://..."
              className="min-h-[44px]" style={{ fontSize: 14 }}
              inputMode="url"
              value={receiptUrl}
              onChange={e => setReceiptUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">{t('fx.notes')} ({t('common.optional')})</Label>
            <Textarea
              rows={2} placeholder="Observaciones adicionales..."
              style={{ fontSize: 14 }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* ── SECTION E: Summary box ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl px-4 py-3"
            style={{ background: 'var(--color-surface-secondary, rgba(255,255,255,0.04))', border: '1px solid var(--color-border)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('fx.totalToReceive')}</p>
              <p className="text-[11px] font-mono text-text-muted mt-0.5">
                {montoNum > 0 && tasaNum > 0
                  ? `${fmtAmount(montoNum, fromCur)} ${fromCur} × ${tasaNum.toFixed(4)}`
                  : '—'}
              </p>
            </div>
            <p className="text-xl font-bold font-mono sm:text-[20px]" style={{ color: '#10B981' }}>
              {destNum > 0 ? `${fmtAmount(destNum, toCur)} ${toCur}` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="shrink-0 p-5 pt-0 flex flex-col-reverse sm:flex-row gap-2.5">
        <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          className="w-full sm:flex-1"
          loading={create.isPending}
          disabled={!isValid}
          onClick={handleSubmit}
          style={{ background: '#6366F1', color: '#fff' }}
        >
          {t('fx.registerFx')}
        </Button>
      </div>
    </FxSheetModal>
  );
}

// ─── Sheet modal shell (bottom sheet on mobile, centered on desktop) ──

function FxSheetModal({
  children, onClose, title,
}: {
  children: React.ReactNode;
  onClose:  () => void;
  title:    string;
}): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes fxSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes fxFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (min-width: 640px) {
          .fx-sheet { animation: fxFadeIn 0.2s ease-out !important; border-radius: 16px !important; bottom: auto !important; top: 50% !important; left: 50% !important; right: auto !important; transform: translate(-50%, -50%) !important; width: 480px !important; max-height: 90dvh !important; }
        }
        /* Thin indigo scrollbar for the modal */
        .fx-sheet ::-webkit-scrollbar { width: 4px; }
        .fx-sheet ::-webkit-scrollbar-thumb { background: #6366F1; border-radius: 4px; }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        style={{ animation: 'fxFadeIn 0.2s ease-out' }}
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        className="fx-sheet fixed z-50 bottom-0 left-0 right-0 flex flex-col bg-surface overflow-hidden"
        style={{
          borderRadius: '20px 20px 0 0',
          maxHeight:    '92dvh',
          animation:    'fxSlideUp 0.25s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-text-muted/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-text-1">{title}</h2>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full text-text-muted hover:text-text-1 hover:bg-surface-hover transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </>,
    document.body
  );
}
