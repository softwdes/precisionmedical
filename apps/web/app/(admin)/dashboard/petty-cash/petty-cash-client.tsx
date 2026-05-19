'use client';

import * as React from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Input, Label,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import {
  Wallet, TrendingDown, AlertTriangle, Plus, Download, FileText,
  ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { ToastPortal, useToastManager } from '@/components/notifications/ToastManager';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type KPIs  = inferRouterOutputs<AppRouter>['pettyCash']['kpis'];
type Boxes = inferRouterOutputs<AppRouter>['pettyCash']['listBoxes'];

function isEEUUBox(name: string): boolean {
  const n = name.toLowerCase();
  return ['provo', 'pleasant grove', 'spanish fork', 'west valley', 'south murray'].some(k => n.includes(k));
}

const CATEGORY_KEYS = [
  'FOOD', 'CALACOTO', 'RECORDINGS', 'MAINTENANCE', 'OFFICE',
  'UTILITIES', 'MEDICAL_SUPPLIES', 'TRANSPORT', 'VIATICOS', 'OTHER',
] as const;

// Used only for CSV/PDF export output (always Spanish)
const CATEGORY_LABELS_ES: Record<string, string> = {
  FOOD:             'Alimentación personal',
  CALACOTO:         'Calacoto',
  RECORDINGS:       'Grabaciones',
  MAINTENANCE:      'Limpieza',
  OFFICE:           'Papelería y oficina',
  UTILITIES:        'Servicios básicos',
  MEDICAL_SUPPLIES: 'Suministros médicos',
  TRANSPORT:        'Transporte',
  VIATICOS:         'Viáticos',
  OTHER:            'Otros',
};

function getMonthOptions(locale: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}

function fmt(amount: number) {
  return Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

export function PettyCashClient({ initialBoxes, initialKpis }: { initialBoxes: Boxes; initialKpis: KPIs }) {
  const t = useTranslations();
  const locale = useLocale();
  const MONTH_OPTIONS = useMemo(() => getMonthOptions(locale), [locale]);

  const [filterCountry, setFilterCountry] = useState<'all' | 'EEUU' | 'Bolivia'>('all');
  const [filterClinic,  setFilterClinic]  = useState('all');
  const [filterType,    setFilterType]    = useState<'all' | 'DEPOSIT' | 'EXPENSE'>('all');
  const [filterMonth,   setFilterMonth]   = useState(MONTH_OPTIONS[0].value);
  const [page,          setPage]          = useState(1);
  const [showModal,     setShowModal]     = useState(false);

  const { data: kpis, refetch: refetchKpis } = trpc.pettyCash.kpis.useQuery(undefined, { initialData: initialKpis });

  const { data: movements, refetch: refetchMovements } = trpc.pettyCash.listMovements.useQuery({
    country:    filterCountry,
    clinicName: filterClinic !== 'all' ? filterClinic : undefined,
    type:       filterType,
    month:      filterMonth,
    page,
    pageSize:   20,
  });

  const clinicOptions = useMemo(() => {
    if (filterCountry === 'EEUU')    return initialBoxes.filter(b => isEEUUBox(b.name)).map(b => b.name);
    if (filterCountry === 'Bolivia') return initialBoxes.filter(b => !isEEUUBox(b.name)).map(b => b.name);
    return initialBoxes.map(b => b.name);
  }, [filterCountry, initialBoxes]);

  const refetchAll = () => { void refetchKpis(); void refetchMovements(); void refetchBoxes(); };

  const { data: liveBoxes, refetch: refetchBoxes } = trpc.pettyCash.listBoxes.useQuery(undefined, { refetchInterval: 60_000 });

  const handleCountryChange = (v: string) => { setFilterCountry(v as 'all' | 'EEUU' | 'Bolivia'); setFilterClinic('all'); setPage(1); };
  const handleClinicChange  = (v: string) => { setFilterClinic(v); setPage(1); };
  const handleTypeChange    = (v: string) => { setFilterType(v as 'all' | 'DEPOSIT' | 'EXPENSE'); setPage(1); };
  const handleMonthChange   = (v: string) => { setFilterMonth(v); setPage(1); };

  const items      = movements?.items      ?? [];
  const total      = movements?.total      ?? 0;
  const totalPages = movements?.totalPages ?? 1;

  const boxMap = useMemo((): Record<string, { balance: number; threshold: number }> => {
    const src = liveBoxes ?? initialBoxes;
    return Object.fromEntries(src.map(b => [b.id, { balance: Number(b.balance), threshold: Number(b.lowBalanceThreshold) }]));
  }, [liveBoxes, initialBoxes]);

  const runningBalances = useMemo(() => {
    const tracker: Record<string, number> = {};
    Object.entries(boxMap).forEach(([id, v]) => { tracker[id] = v.balance; });
    const result: Record<string, number> = {};
    for (const tx of items) {
      result[tx.id] = tracker[tx.cashBoxId] ?? 0;
      tracker[tx.cashBoxId] = (tracker[tx.cashBoxId] ?? 0) - Number(tx.amount);
    }
    return result;
  }, [items, boxMap]);

  const getCategoryLabel = (key: string) =>
    (CATEGORY_KEYS as readonly string[]).includes(key)
      ? t(`pettyCash.categories.${key}`)
      : key;

  const sidebarStats = useMemo(() => {
    const deposits = items.filter(tx => tx.type === 'DEPOSIT').reduce((s, tx) => s + Math.abs(Number(tx.amount)), 0);
    const expenses  = items.filter(tx => tx.type === 'EXPENSE').reduce((s, tx) => s + Math.abs(Number(tx.amount)), 0);
    const byCat = items.filter(tx => tx.type === 'EXPENSE').reduce((acc, tx) => {
      const cat = tx.category ?? 'OTHER';
      acc[cat] = (acc[cat] ?? 0) + Math.abs(Number(tx.amount));
      return acc;
    }, {} as Record<string, number>);
    const topCategories = (Object.entries(byCat) as [string, number][]).sort(([, a], [, b]) => b - a).slice(0, 4);
    return { deposits, expenses, net: deposits - expenses, topCategories };
  }, [items]);

  const monthLabel     = MONTH_OPTIONS.find(o => o.value === filterMonth)?.label ?? filterMonth;
  const eeuuHealthy    = !(kpis?.lowBoxes ?? []).some(b => b.country === 'EEUU');
  const boliviaHealthy = !(kpis?.lowBoxes ?? []).some(b => b.country === 'Bolivia');
  const totalBoxCount  = (kpis?.eeuuBoxCount ?? 0) + (kpis?.boliviaBoxCount ?? 0);

  // ── Export CSV ──
  const handleExportCSV = () => {
    const headers = ['Fecha', 'Sede', 'Clínica', 'Descripción', 'Categoría', 'Monto'];
    const rows = items.map(tx => [
      fmtDate(tx.performedAt, locale),
      tx.country,
      tx.clinicName,
      tx.description,
      CATEGORY_LABELS_ES[tx.category ?? ''] ?? (tx.category ?? ''),
      `${Number(tx.amount) >= 0 ? '+' : ''}${Number(tx.amount).toFixed(2)}`,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const [y, m] = filterMonth.split('-');
    a.href = url; a.download = `caja-chica-${m}-${y}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Export PDF ──
  const handleExportPDF = () => {
    const rows = items.map(tx => `
      <tr>
        <td>${fmtDate(tx.performedAt, locale)}</td>
        <td>${tx.country}</td>
        <td>${tx.clinicName}</td>
        <td>${tx.description}</td>
        <td>${CATEGORY_LABELS_ES[tx.category ?? ''] ?? (tx.category ?? '')}</td>
        <td style="text-align:right;color:${Number(tx.amount) >= 0 ? '#16a34a' : '#dc2626'};font-family:monospace">
          ${Number(tx.amount) >= 0 ? '+' : ''}$${Math.abs(Number(tx.amount)).toFixed(2)}
        </td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Caja Chica ${monthLabel}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{margin:0;font-size:20px}
.sub{color:#666;font-size:12px;margin:4px 0 20px}.kpis{display:flex;gap:12px;margin-bottom:20px}
.kpi{background:#f3f4f6;padding:10px 14px;border-radius:8px;flex:1}.kpi-l{font-size:10px;color:#666;text-transform:uppercase}
.kpi-v{font-size:17px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:11px}
th{text-align:left;border-bottom:2px solid #e5e7eb;padding:7px 5px;font-size:10px;text-transform:uppercase;color:#666}
td{padding:6px 5px;border-bottom:1px solid #f0f0f0}@media print{body{padding:0}}</style></head><body>
<h1>Caja Chica — Precision Medical</h1>
<p class="sub">${monthLabel} · Generado ${new Date().toLocaleDateString('es-ES')}</p>
<div class="kpis">
  <div class="kpi"><div class="kpi-l">Saldo Total</div><div class="kpi-v">$${fmt(kpis?.total ?? 0)}</div></div>
  <div class="kpi"><div class="kpi-l">🇺🇸 EEUU</div><div class="kpi-v">$${fmt(kpis?.eeuu ?? 0)}</div></div>
  <div class="kpi"><div class="kpi-l">🇧🇴 Bolivia</div><div class="kpi-v">$${fmt(kpis?.bolivia ?? 0)}</div></div>
  <div class="kpi"><div class="kpi-l">Gastos del Mes</div><div class="kpi-v" style="color:#dc2626">$${fmt(kpis?.monthlyExpenses ?? 0)}</div></div>
</div>
<table><thead><tr><th>Fecha</th><th>Sede</th><th>Clínica</th><th>Descripción</th><th>Categoría</th><th style="text-align:right">Monto</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  };

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('pettyCash.title')}</h1>
          <p className="text-sm text-text-3">{t('pettyCash.subtitle')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> {t('pettyCash.newMovement')}
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-semibold text-text-3 uppercase tracking-widest">{t('pettyCash.totalBalance')}</p>
            <Wallet className="h-4 w-4 text-brand opacity-70" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-text-1">${fmt(kpis?.total ?? 0)}</p>
          <p className="mt-1 text-xs text-text-3">{totalBoxCount} {t('pettyCash.registeredBoxes')} · USD</p>
        </div>

        <div className={`rounded-xl border p-4 ${eeuuHealthy ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-400/30 bg-amber-400/5'}`}>
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-semibold text-text-3 uppercase tracking-widest">EEUU</p>
            <span className="text-base leading-none">🇺🇸</span>
          </div>
          <p className={`mt-2 text-2xl font-bold font-mono ${eeuuHealthy ? 'text-emerald-500' : 'text-amber-400'}`}>
            ${fmt(kpis?.eeuu ?? 0)}
          </p>
          <p className="mt-1 text-xs text-text-3">{t('pettyCash.minBalance')}: $100 · {eeuuHealthy ? t('pettyCash.healthy') : t('pettyCash.lowStatus')}</p>
        </div>

        <div className={`rounded-xl border p-4 ${boliviaHealthy ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-400/30 bg-amber-400/5'}`}>
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-semibold text-text-3 uppercase tracking-widest">Bolivia</p>
            <span className="text-base leading-none">🇧🇴</span>
          </div>
          <p className={`mt-2 text-2xl font-bold font-mono ${boliviaHealthy ? 'text-emerald-500' : 'text-amber-400'}`}>
            ${fmt(kpis?.bolivia ?? 0)}
          </p>
          <p className="mt-1 text-xs text-text-3">{t('pettyCash.minBalance')}: $100 · {boliviaHealthy ? t('pettyCash.healthy') : t('pettyCash.lowStatus')}</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-semibold text-text-3 uppercase tracking-widest">{t('pettyCash.monthlyExpensesLabel', { month: monthLabel })}</p>
            <TrendingDown className="h-4 w-4 text-rose-500 opacity-70" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-rose-500">${fmt(kpis?.monthlyExpenses ?? 0)}</p>
          <p className="mt-1 text-xs text-text-3">{kpis?.monthlyCount ?? 0} {t('pettyCash.transactions').toLowerCase()}</p>
        </div>
      </div>

      {/* ── Main: table + sidebar ── */}
      <div className="flex gap-5 items-start flex-col md:flex-row">

        {/* Left: table */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* Filters toolbar */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <Select value={filterCountry} onValueChange={handleCountryChange}>
              <SelectTrigger className="h-8 w-full sm:w-auto sm:min-w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('pettyCash.allSedes')}</SelectItem>
                <SelectItem value="EEUU">🇺🇸 EEUU</SelectItem>
                <SelectItem value="Bolivia">🇧🇴 Bolivia</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterClinic} onValueChange={handleClinicChange}>
              <SelectTrigger className="h-8 w-full sm:w-auto sm:min-w-[155px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('pettyCash.allClinics')}</SelectItem>
                {clinicOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={handleTypeChange}>
              <SelectTrigger className="h-8 w-full sm:w-auto sm:min-w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('pettyCash.allTypes')}</SelectItem>
                <SelectItem value="DEPOSIT">{t('pettyCash.deposits')}</SelectItem>
                <SelectItem value="EXPENSE">{t('pettyCash.expenses')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterMonth} onValueChange={handleMonthChange}>
              <SelectTrigger className="h-8 w-full sm:w-auto sm:min-w-[155px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <span className="col-span-2 text-xs text-text-3 sm:ml-auto">{total} {t('pettyCash.records')}</span>
          </div>

          {/* Mobile: card list */}
          <div className="md:hidden rounded-lg border border-border bg-surface overflow-hidden">
            {items.length === 0 ? (
              <div className="text-center py-12 text-text-3 text-sm">{t('pettyCash.noMovements')}</div>
            ) : (
              <div className="divide-y divide-border">
                {items.map(tx => (
                  <div key={tx.id} className="flex items-start gap-3 px-4 py-3.5">
                    <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                      tx.type === 'DEPOSIT' ? 'bg-emerald-500/10' : 'bg-rose-500/10'
                    }`}>
                      {tx.type === 'DEPOSIT'
                        ? <ArrowDownCircle className="h-4 w-4 text-emerald-500" />
                        : <ArrowUpCircle className="h-4 w-4 text-rose-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-text-1 truncate">{tx.description}</p>
                        <p className={`text-sm font-bold font-mono shrink-0 ${Number(tx.amount) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {Number(tx.amount) >= 0 ? '+' : ''}${fmt(Number(tx.amount))}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] text-text-3">{fmtDate(tx.performedAt, locale)}</span>
                        <span className="text-[10px] text-text-muted">·</span>
                        <span className="text-[10px] text-text-3">{tx.country === 'EEUU' ? '🇺🇸' : '🇧🇴'} {tx.clinicName}</span>
                        {tx.category && (
                          <>
                            <span className="text-[10px] text-text-muted">·</span>
                            <span className="text-[10px] text-text-muted">{getCategoryLabel(tx.category)}</span>
                          </>
                        )}
                        {(() => {
                          const bal = runningBalances[tx.id] ?? 0;
                          const threshold = boxMap[tx.cashBoxId]?.threshold ?? 100;
                          const balColor = bal > threshold ? 'text-emerald-500' : bal > 0 ? 'text-amber-400' : 'text-rose-500';
                          const warn = bal > threshold ? '' : bal > 0 ? ' ⚠' : ' ⚠⚠';
                          return (
                            <>
                              <span className="text-[10px] text-text-muted">·</span>
                              <span className={`text-[10px] font-mono ${balColor}`}>Saldo: ${fmt(bal)}{warn}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block rounded-lg border border-border bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">{t('pettyCash.date')}</TableHead>
                    <TableHead className="text-[11px]">{t('pettyCash.sedeHeader')}</TableHead>
                    <TableHead className="text-[11px]">{t('pettyCash.clinicHeader')}</TableHead>
                    <TableHead className="text-[11px]">{t('pettyCash.description')}</TableHead>
                    <TableHead className="text-[11px]">{t('pettyCash.category')}</TableHead>
                    <TableHead className="text-right text-[11px]">{t('common.amount')}</TableHead>
                    <TableHead className="text-right text-[11px]">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-text-3 text-sm">
                        {t('pettyCash.noMovements')}
                      </TableCell>
                    </TableRow>
                  ) : items.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-text-3 whitespace-nowrap">{fmtDate(tx.performedAt, locale)}</TableCell>
                      <TableCell className="text-xs text-text-2 whitespace-nowrap">
                        {tx.country === 'EEUU' ? '🇺🇸 EEUU' : '🇧🇴 Bolivia'}
                      </TableCell>
                      <TableCell className="text-xs text-text-2">{tx.clinicName}</TableCell>
                      <TableCell className="text-xs text-text-2 max-w-[180px] truncate">{tx.description}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          tx.type === 'DEPOSIT'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {tx.type === 'DEPOSIT' ? t('pettyCash.typeDeposit') : t('pettyCash.typeExpense')}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-xs font-semibold ${Number(tx.amount) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {Number(tx.amount) >= 0 ? '+' : ''}${fmt(Number(tx.amount))}
                      </TableCell>
                      {(() => {
                        const bal = runningBalances[tx.id] ?? 0;
                        const threshold = boxMap[tx.cashBoxId]?.threshold ?? 100;
                        const color = bal > threshold ? 'text-emerald-500' : bal > 0 ? 'text-amber-400' : 'text-rose-500';
                        const warn = bal > threshold ? '' : bal > 0 ? ' ⚠' : ' ⚠⚠';
                        return (
                          <TableCell className={`text-right font-mono text-xs font-semibold whitespace-nowrap ${color}`}>
                            ${fmt(bal)}{warn}
                          </TableCell>
                        );
                      })()}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-text-3">
            <span>{t('pettyCash.showing', { from: items.length > 0 ? (page - 1) * 20 + 1 : 0, to: Math.min(page * 20, total), total })}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3 w-3" /> {t('common.previous')}
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                {t('common.next')} <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right: sidebar */}
        <div className="w-full md:w-52 flex-shrink-0 space-y-3">

          {/* Monthly summary */}
          <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
            <p className="text-[10px] font-semibold text-text-3 uppercase tracking-widest">{t('pettyCash.summary', { month: monthLabel })}</p>
            <div className="flex justify-between text-xs py-0.5">
              <span className="text-text-3">{t('pettyCash.totalDepositsLabel')}</span>
              <span className="font-mono text-emerald-500 font-semibold">+${fmt(sidebarStats.deposits)}</span>
            </div>
            <div className="flex justify-between text-xs py-0.5">
              <span className="text-text-3">{t('pettyCash.totalExpensesLabel')}</span>
              <span className="font-mono text-rose-500 font-semibold">-${fmt(sidebarStats.expenses)}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between text-xs font-semibold pt-0.5">
              <span className="text-text-2">{t('pettyCash.netBalance')}</span>
              <span className={`font-mono ${sidebarStats.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {sidebarStats.net >= 0 ? '+' : ''}${fmt(sidebarStats.net)}
              </span>
            </div>
          </div>

          {/* Top categories */}
          {(() => {
            const cats = sidebarStats.topCategories;
            const max = cats[0]?.[1] ?? 1;
            return (
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <p className="text-[10px] font-semibold text-text-3 uppercase tracking-widest">{t('pettyCash.topCategories')}</p>
                {cats.length === 0 ? (
                  <p className="text-xs text-text-3 text-center py-2">Sin movimientos este mes</p>
                ) : cats.map(([cat, amount]) => (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-2 truncate pr-2">{getCategoryLabel(cat)}</span>
                      <span className="font-mono text-text-3 flex-shrink-0">${fmt(amount)}</span>
                    </div>
                    <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(amount / max) * 100}%`, background: 'linear-gradient(90deg, #6366F1, #06B6D4)' }} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Low balance alerts */}
          {(() => {
            const lowBoxes = kpis?.lowBoxes ?? [];
            if (lowBoxes.length === 0) {
              return (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 flex items-center gap-1.5">
                  <span className="text-emerald-500 text-xs font-bold">✓</span>
                  <p className="text-xs font-semibold text-emerald-500">Todas las cajas saludables</p>
                </div>
              );
            }
            return (
              <div className="space-y-2">
                {lowBoxes.map(box => (
                  <div key={box.name} className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                      <p className="text-xs font-semibold text-amber-400">
                        {box.country === 'EEUU' ? '🇺🇸' : '🇧🇴'} {box.name}
                      </p>
                    </div>
                    <p className="text-xs text-amber-300/80">
                      Saldo ${fmt(box.balance)} — mín ${fmt(box.threshold)}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <NuevoMovimientoModal
          open={showModal}
          boxes={initialBoxes}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); refetchAll(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────
function NuevoMovimientoModal({
  open, boxes, onClose, onSuccess,
}: {
  open: boolean;
  boxes: Boxes;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations();

  const [tipo,        setTipo]        = useState<'DEPOSIT' | 'EXPENSE'>('DEPOSIT');
  const [country,     setCountry]     = useState<'EEUU' | 'Bolivia'>('EEUU');
  const [clinic,      setClinic]      = useState(() => boxes.filter(b => isEEUUBox(b.name))[0]?.name ?? '');
  const [amount,      setAmount]      = useState('');
  const [currency,    setCurrency]    = useState<'USD' | 'BOB'>('USD');
  const [category,    setCategory]    = useState('');
  const [description, setDescription] = useState('');
  const [date,        setDate]        = useState(() => new Date().toISOString().split('T')[0]);
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [lowWarn,     setLowWarn]     = useState(false);
  const lowWarnRef = useRef(false);

  const { toasts: movToasts, addToast: addMovToast, removeToast: removeMovToast } = useToastManager();

  const categoryOptions = useMemo(
    () => CATEGORY_KEYS.map(key => ({ value: key, label: t(`pettyCash.categories.${key}`) })),
    [t],
  );

  const clinicOptions = country === 'EEUU'
    ? boxes.filter(b => isEEUUBox(b.name)).map(b => b.name)
    : boxes.filter(b => !isEEUUBox(b.name)).map(b => b.name);

  const isDeposit = tipo === 'DEPOSIT';

  useEffect(() => {
    if (!isDeposit || country === 'EEUU') {
      setClinic(clinicOptions[0] ?? '');
    }
    setCurrency(country === 'Bolivia' ? 'BOB' : 'USD');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, tipo]);

  const create = trpc.pettyCash.createMovement.useMutation({
    onSuccess: () => {
      const isDepo = tipo === 'DEPOSIT';
      const hadLowWarn = lowWarnRef.current;
      const amtNum = Number(amount);
      if (isDepo) {
        addMovToast({
          icon: <ArrowDownCircle size={20} color="#10B981" />,
          title: `Depósito · ${currency}`,
          detail: `$${amtNum.toFixed(2)} ingresado`,
          statusText: 'MOVIMIENTO REGISTRADO',
          barColor: '#10B981',
        });
      } else {
        const barColor = hadLowWarn ? '#F59E0B' : '#F43F5E';
        const iconColor = barColor;
        addMovToast({
          icon: <ArrowUpCircle size={20} color={iconColor} />,
          title: `Gasto · ${currency}`,
          detail: `$${amtNum.toFixed(2)} · ${clinic}`,
          statusText: 'MOVIMIENTO REGISTRADO',
          barColor,
          warning: hadLowWarn ? '⚠ Saldo bajo después de este movimiento' : undefined,
        });
      }
      onSuccess();
    },
    onError:   (e) => toast.error(e.message),
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (country === 'EEUU') {
      if (!clinic.trim()) errs.clinic = 'Selecciona o ingresa una sede';
    }
    if (!amount || Number(amount) <= 0) errs.amount = t('pettyCash.errAmount');
    if (!description.trim()) errs.description = t('pettyCash.errDescription');
    if (tipo === 'EXPENSE' && !category) errs.category = t('pettyCash.errCategory');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (tipo === 'EXPENSE') {
      const box = boxes.find(b => b.name === clinic);
      if (box && Number(box.balance) - Number(amount) < 100 && !lowWarn) {
        setLowWarn(true);
        return;
      }
    }
    lowWarnRef.current = lowWarn;
    setLowWarn(false);
    const clinicName = country === 'Bolivia' ? 'Bolivia' : clinic;
    create.mutate({ type: tipo, clinicName, amount: Number(amount), currency, category: category || 'OTHER', description, date });
  };

  return (
    <>
    <ToastPortal toasts={movToasts} removeToast={removeMovToast} />
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <div className="max-h-[80vh] overflow-y-auto pr-2 scroll-thin">
          <DialogHeader><DialogTitle>{t('pettyCash.newMovement')}</DialogTitle></DialogHeader>

          <div className="space-y-5 pt-4 pb-2">

            {/* Tipo */}
            <div className="space-y-2">
              <Label>{t('pettyCash.movementType')}</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setTipo('DEPOSIT'); setCategory(''); }}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                    isDeposit ? 'border-emerald-500 bg-emerald-500/[0.07]' : 'border-border hover:border-border/80'
                  }`}
                >
                  <ArrowDownCircle className={`h-6 w-6 ${isDeposit ? 'text-emerald-500' : 'text-text-3'}`} />
                  <span className={`text-sm font-semibold ${isDeposit ? 'text-emerald-500' : 'text-text-2'}`}>{t('pettyCash.deposit')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('EXPENSE')}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                    !isDeposit ? 'border-rose-500 bg-rose-500/[0.07]' : 'border-border hover:border-border/80'
                  }`}
                >
                  <ArrowUpCircle className={`h-6 w-6 ${!isDeposit ? 'text-rose-500' : 'text-text-3'}`} />
                  <span className={`text-sm font-semibold ${!isDeposit ? 'text-rose-500' : 'text-text-2'}`}>{t('pettyCash.expense')}</span>
                </button>
              </div>
            </div>

            {/* País / Sede */}
            <div className="space-y-1.5">
              <Label>{t('pettyCash.countryField')}</Label>
              <Select value={country} onValueChange={v => setCountry(v as 'EEUU' | 'Bolivia')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EEUU">🇺🇸 EEUU</SelectItem>
                  <SelectItem value="Bolivia">🇧🇴 Bolivia</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-text-3">{t('pettyCash.countryHint')}</p>
            </div>

            {/* Clínica — solo se muestra para EEUU */}
            {country === 'EEUU' && (
              <div className="space-y-1.5">
                <Label>{t('pettyCash.clinicHeader')}</Label>
                {clinicOptions.length > 0 ? (
                  <Select value={clinic} onValueChange={v => { setClinic(v); setErrors(r => ({ ...r, clinic: '' })); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {clinicOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Nombre de la sede"
                    value={clinic}
                    onChange={e => { setClinic(e.target.value); setErrors(r => ({ ...r, clinic: '' })); }}
                  />
                )}
                {errors.clinic && <p className="text-xs text-rose-500">{errors.clinic}</p>}
                <p className="text-[11px] text-text-3">{t('pettyCash.clinicHint')}</p>
              </div>
            )}

            {/* Monto */}
            <div className="space-y-1.5">
              <Label>{t('common.amount')}</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Select value={currency} onValueChange={v => setCurrency(v as 'USD' | 'BOB')}>
                  <SelectTrigger className="w-full sm:w-[90px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="BOB">BOB</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number" min="0.01" step="0.01" placeholder="0.00"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setErrors(r => ({ ...r, amount: '' })); setLowWarn(false); }}
                  className="flex-1"
                />
              </div>
              {errors.amount && <p className="text-xs text-rose-500">{errors.amount}</p>}
            </div>

            {/* Categoría (solo Gasto) */}
            {!isDeposit && (
              <div className="space-y-1.5">
                <Label>{t('pettyCash.category')}</Label>
                <Select value={category} onValueChange={v => { setCategory(v); setErrors(r => ({ ...r, category: '' })); }}>
                  <SelectTrigger><SelectValue placeholder={t('pettyCash.selectCategory')} /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.category && <p className="text-xs text-rose-500">{errors.category}</p>}
              </div>
            )}

            {/* Descripción */}
            <div className="space-y-1.5">
              <Label>{t('pettyCash.description')}</Label>
              <Input
                placeholder={t('pettyCash.descPlaceholder')}
                value={description}
                onChange={e => { setDescription(e.target.value); setErrors(r => ({ ...r, description: '' })); }}
              />
              {errors.description && <p className="text-xs text-rose-500">{errors.description}</p>}
            </div>

            {/* Fecha */}
            <div className="space-y-1.5">
              <Label>{t('pettyCash.date')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            {/* Low balance warning */}
            {lowWarn && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">{t('pettyCash.lowWarnText')}</p>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              disabled={create.isPending}
              onClick={handleSubmit}
              style={isDeposit
                ? { background: '#10b981', color: '#fff' }
                : { background: '#f43f5e', color: '#fff' }}
            >
              {create.isPending
                ? t('pettyCash.saving')
                : isDeposit
                  ? t('pettyCash.registerDeposit')
                  : t('pettyCash.registerExpense')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
