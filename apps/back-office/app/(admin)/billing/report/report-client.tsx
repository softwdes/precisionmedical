'use client';

/**
 * B.27 — Reporte mensual consolidado (Screen 3)
 * Route: /billing/report
 *
 * Dashboard de Brunella con:
 * - 4 KPI cards (facturado, cobrado PIP, pendiente, lien acumulado)
 * - Provider billing breakdown con progress bars
 * - Facility (clínica) breakdown
 * - Lien aging horizontal bar (<90d emerald | 90-180d amber | >180d rose)
 * - Top 5 bufetes
 * - Alerta de casos >180d (rose gradient)
 *
 * Color identity: amber (Billing, Regla #5) + brand para summary
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Download, Mail, BarChart3, TrendingUp, AlertCircle, Building2, Scale, Users, ChevronUp, ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix/page-header';
import { EmptyState }  from '@/components/ui-phoenix/empty-state';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Provider {
  name:      string;
  amount:    number;
  amountFmt: string;
  visits:    number;
  clinics:   string;
  pct:       number;
}

interface Facility {
  name:      string;
  amount:    number;
  amountFmt: string;
  visits:    number;
}

interface AgingBucket {
  count:      number;
  amount:     number;
  amountFmt:  string;
  pct:        number;
  pctAmount:  number;
}

interface CriticalCase {
  caseId:          string;
  patientName:     string;
  firmName:        string | null;
  daysSinceDol:    number;
  totalCharged:    number;
  totalChargedFmt: string;
}

interface Firm {
  firmId:       string | null;
  firmName:     string;
  caseCount:    number;
  totalCharged: number;
  amountFmt:    string;
}

interface ReportData {
  ok:         boolean;
  monthLabel: string;
  monthParam: string;
  kpis: {
    totalBilled:       number;
    totalBilledFmt:    string;
    billedChangePct:   number;
    totalCollected:    number;
    totalCollectedFmt: string;
    pendingPip:        number;
    pendingPipFmt:     string;
    lienAccumulated:   number;
    lienFmt:           string;
  };
  providers:     Provider[];
  facilities:    Facility[];
  lienAging: {
    under90:         AgingBucket;
    between90and180: AgingBucket;
    over180:         AgingBucket;
  };
  criticalCases:     CriticalCase[];
  criticalCount:     number;
  criticalAmountFmt: string;
  topFirms:          Firm[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prevMonth(param: string): string {
  const [y, m] = param.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(param: string): string {
  const [y, m] = param.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportClient() {
  const t = useTranslations('phoenix.billing');
  const router = useRouter();

  const [data,    setData]    = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [month,   setMonth]   = useState<string>(''); // "" = current month

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs  = m ? `?month=${m}` : '';
      const res = await fetch(`/api/admin/billing/report${qs}`);
      const json = await res.json() as ReportData;
      if (!json.ok) throw new Error('ERROR');
      setData(json);
      if (!m) setMonth(json.monthParam); // capture actual month
    } catch {
      setError(t('errorLoadingReport'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(''); }, [load]);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="h-8 w-72 animate-pulse rounded-lg bg-bg-1" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-bg-1" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 animate-pulse rounded-xl bg-bg-1" />
          <div className="h-64 animate-pulse rounded-xl bg-bg-1" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState.Rich
          icon={AlertCircle}
          title={t('errorTitle')}
          subtitle={error ?? t('errorNoData')}
        />
      </div>
    );
  }

  const { kpis, providers, facilities, lienAging, criticalCases, topFirms } = data;
  const totalAgingAmount = lienAging.under90.amount + lienAging.between90and180.amount + lienAging.over180.amount || 1;

  return (
    <div className="flex flex-col gap-6 p-5">

      {/* ── Topbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => router.push('/billing')}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-muted transition-colors hover:bg-bg-1 hover:text-text-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('navBackToBilling')}
        </button>
        <span className="text-border">/</span>

        {/* Month navigator */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { const p = prevMonth(month); setMonth(p); void load(p); }}
            className="rounded p-1 hover:bg-bg-1 text-text-muted"
          >
            <ChevronUp className="w-4 h-4 rotate-90" />
          </button>
          <span className="text-[13px] font-semibold text-text-1 px-2">{data.monthLabel}</span>
          <button
            type="button"
            onClick={() => { const p = nextMonth(month); setMonth(p); void load(p); }}
            className="rounded p-1 hover:bg-bg-1 text-text-muted"
          >
            <ChevronDown className="w-4 h-4 rotate-90" />
          </button>
        </div>
      </div>

      <PageHeader
        title={t('reportTitle')}
        subtitle={`${t('reportSubtitle')} · ${data.monthLabel}`}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-1 px-3 py-1.5 text-[11px] text-text-muted hover:text-text-1 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              {t('btnEmailManagement')}
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-amber px-3 py-1.5 text-[11px] font-medium text-black hover:bg-amber/90 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {t('btnDownloadPdf')}
            </button>
          </div>
        }
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Total facturado */}
        <div className="rounded-xl border border-border bg-bg-1 p-4">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">{t('kpiTotalBilled')}</div>
          <div className="text-2xl font-bold font-mono text-text-1">{kpis.totalBilledFmt}</div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className={`text-[10px] font-medium ${kpis.billedChangePct >= 0 ? 'text-emerald' : 'text-rose'}`}>
              {kpis.billedChangePct >= 0 ? '+' : ''}{kpis.billedChangePct}%
            </span>
            <span className="text-[10px] text-text-muted">{t('vsPrevMonth')}</span>
          </div>
        </div>

        {/* Cobrado PIP */}
        <div
          className="rounded-xl border p-4"
          style={{ background: 'linear-gradient(135deg,rgba(52,211,153,0.10),rgba(52,211,153,0.04))', borderColor: 'rgba(52,211,153,0.25)' }}
        >
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">{t('kpiCollectedPip')}</div>
          <div className="text-2xl font-bold font-mono" style={{ color: '#34d399' }}>{kpis.totalCollectedFmt}</div>
          <div className="mt-2 text-[10px] text-text-muted">
            {kpis.totalBilled > 0 ? Math.round((kpis.totalCollected / kpis.totalBilled) * 100) : 0}% {t('ofBilled')}
          </div>
        </div>

        {/* Pendiente PIP */}
        <div
          className="rounded-xl border p-4"
          style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.10),rgba(245,158,11,0.04))', borderColor: 'rgba(245,158,11,0.25)' }}
        >
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">{t('kpiPendingPip')}</div>
          <div className="text-2xl font-bold font-mono" style={{ color: '#f59e0b' }}>{kpis.pendingPipFmt}</div>
          <div className="mt-2 text-[10px] text-text-muted">{t('kpiPendingPipSub')}</div>
        </div>

        {/* Lien acumulado */}
        <div
          className="rounded-xl border p-4"
          style={{ background: 'linear-gradient(135deg,rgba(251,113,133,0.10),rgba(251,113,133,0.04))', borderColor: 'rgba(251,113,133,0.25)' }}
        >
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">{t('kpiLienAccumulated')}</div>
          <div className="text-2xl font-bold font-mono" style={{ color: '#fda4af' }}>{kpis.lienFmt}</div>
          <div className="mt-2 text-[10px] text-text-muted">{t('kpiLienAccumulatedSub')}</div>
        </div>
      </div>

      {/* ── Provider + Facilities row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Provider billing breakdown */}
        <div className="rounded-xl border border-border bg-bg-1 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-brand" />
            <span className="text-sm font-semibold text-text-1 uppercase tracking-wider">{t('sectionByProvider')}</span>
          </div>

          {providers.length === 0 ? (
            <div className="text-[12px] text-text-muted">{t('noDataThisMonth')}</div>
          ) : (
            <div className="flex flex-col gap-3">
              {providers.map(p => (
                <div key={p.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-text-1 font-medium truncate mr-2">{p.name}</span>
                    <span className="text-[12px] font-mono text-text-1 shrink-0">{p.amountFmt}</span>
                  </div>
                  <div className="relative h-2 w-full rounded-full bg-bg-2/80">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width:      `${p.pct}%`,
                        background: 'linear-gradient(90deg, #06b6d4, #6366f1)',
                      }}
                    />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-muted">
                    <span>{p.visits} {t('visits')}</span>
                    {p.clinics && <span>· {p.clinics}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Facility breakdown */}
        <div className="rounded-xl border border-border bg-bg-1 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-brand" />
            <span className="text-sm font-semibold text-text-1 uppercase tracking-wider">{t('sectionByClinic')}</span>
          </div>

          {facilities.length === 0 ? (
            <div className="text-[12px] text-text-muted">{t('noDataThisMonth')}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {facilities.slice(0, 6).map((f, i) => (
                <div
                  key={f.name}
                  className="rounded-lg border p-3"
                  style={{
                    borderColor:  i % 3 === 0 ? 'rgba(99,102,241,0.25)'  : i % 3 === 1 ? 'rgba(6,182,212,0.25)'  : 'rgba(139,92,246,0.25)',
                    background:   i % 3 === 0 ? 'rgba(99,102,241,0.06)'  : i % 3 === 1 ? 'rgba(6,182,212,0.06)'  : 'rgba(139,92,246,0.06)',
                  }}
                >
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1 truncate">{f.name}</div>
                  <div className="text-lg font-bold font-mono text-text-1">{f.amountFmt}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{f.visits} {t('visits')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Lien aging ── */}
      <div className="rounded-xl border border-border bg-bg-1 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Scale className="w-4 h-4 text-brand" />
          <span className="text-sm font-semibold text-text-1 uppercase tracking-wider">{t('sectionLienAging')}</span>
        </div>

        {/* Horizontal stacked bar */}
        <div className="flex h-5 w-full overflow-hidden rounded-full mb-3">
          {lienAging.under90.pctAmount > 0 && (
            <div style={{ width: `${lienAging.under90.pctAmount}%`, background: '#34d399' }} title={`<90d: ${lienAging.under90.amountFmt}`} />
          )}
          {lienAging.between90and180.pctAmount > 0 && (
            <div style={{ width: `${lienAging.between90and180.pctAmount}%`, background: '#f59e0b' }} title={`90-180d: ${lienAging.between90and180.amountFmt}`} />
          )}
          {lienAging.over180.pctAmount > 0 && (
            <div style={{ width: `${lienAging.over180.pctAmount}%`, background: '#fda4af' }} title={`>180d: ${lienAging.over180.amountFmt}`} />
          )}
          {(lienAging.under90.pctAmount + lienAging.between90and180.pctAmount + lienAging.over180.pctAmount) === 0 && (
            <div className="w-full bg-bg-2" />
          )}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald" />
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{t('agingUnder90')}</span>
            </div>
            <div className="text-lg font-bold font-mono text-text-1">{lienAging.under90.amountFmt}</div>
            <div className="text-[11px] text-text-muted">{lienAging.under90.count} caso{lienAging.under90.count !== 1 ? 's' : ''}</div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-2.5 w-2.5 rounded-full bg-amber" />
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{t('aging90to180')}</span>
            </div>
            <div className="text-lg font-bold font-mono text-text-1">{lienAging.between90and180.amountFmt}</div>
            <div className="text-[11px] text-text-muted">{lienAging.between90and180.count} caso{lienAging.between90and180.count !== 1 ? 's' : ''}</div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: '#fda4af' }} />
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{t('agingOver180')}</span>
            </div>
            <div className="text-lg font-bold font-mono text-text-1">{lienAging.over180.amountFmt}</div>
            <div className="text-[11px] text-text-muted">{lienAging.over180.count} caso{lienAging.over180.count !== 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>

      {/* ── Top law firms + Critical cases row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top 5 bufetes */}
        <div className="rounded-xl border border-border bg-bg-1 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-brand" />
            <span className="text-sm font-semibold text-text-1 uppercase tracking-wider">{t('sectionTopFirms')}</span>
          </div>

          {topFirms.length === 0 ? (
            <div className="text-[12px] text-text-muted">{t('noActiveFirms')}</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">{t('thFirm')}</th>
                  <th className="text-right pb-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">{t('thCases')}</th>
                  <th className="text-right pb-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">{t('thBilled')}</th>
                </tr>
              </thead>
              <tbody>
                {topFirms.map((f, i) => (
                  <tr key={f.firmId ?? i} className="border-b border-border/40 hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 text-text-1 font-medium truncate max-w-[180px]">{f.firmName}</td>
                    <td className="py-2.5 text-right text-text-muted">{f.caseCount}</td>
                    <td className="py-2.5 text-right font-mono text-text-1">{f.amountFmt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Critical cases >180d */}
        {data.criticalCount > 0 ? (
          <div
            className="rounded-xl border p-5"
            style={{
              background:   'linear-gradient(135deg, rgba(251,113,133,0.10), rgba(251,113,133,0.04))',
              borderColor:  'rgba(251,113,133,0.35)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose" />
                <span className="text-sm font-semibold text-text-1 uppercase tracking-wider">{t('sectionCriticalCases')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-rose/20 border border-rose/30 text-rose text-[10px] font-bold px-2 py-0.5">
                  {data.criticalCount} {t('cases')}
                </span>
                <span className="text-[11px] font-mono text-rose">{data.criticalAmountFmt}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
              {criticalCases.slice(0, 10).map(c => (
                <button
                  key={c.caseId}
                  type="button"
                  onClick={() => router.push(`/billing/${c.caseId}/ledger`)}
                  className="flex items-center justify-between rounded-lg border border-rose/20 bg-rose/5 px-3 py-2 text-left hover:bg-rose/10 transition-colors w-full"
                >
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-text-1 truncate">{c.patientName}</div>
                    <div className="text-[10px] text-text-muted">{c.firmName ?? t('noFirm')} · {c.daysSinceDol}d</div>
                  </div>
                  <div className="shrink-0 ml-2 font-mono text-[12px] text-rose font-bold">{c.totalChargedFmt}</div>
                </button>
              ))}
              {data.criticalCount > 10 && (
                <div className="text-center text-[11px] text-text-muted py-1">
                  +{data.criticalCount - 10} {t('moreCases')}
                </div>
              )}
            </div>

            {/* Bottom action */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-rose/30 bg-rose/10 px-3 py-1.5 text-[11px] font-medium text-rose hover:bg-rose/15 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                {t('btnEmailFirms', { count: data.criticalCount })}
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-1 px-3 py-1.5 text-[11px] text-text-muted hover:text-text-1 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t('btnDownloadList')}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="rounded-xl border border-emerald/25 p-5"
            style={{ background: 'rgba(52,211,153,0.05)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald" />
              <span className="text-sm font-semibold text-text-1 uppercase tracking-wider">{t('noCriticalCasesTitle')}</span>
            </div>
            <p className="text-[12px] text-text-muted">{t('noCriticalCasesBody')}</p>
          </div>
        )}
      </div>

      {/* ── Bottom schedule note ── */}
      <div className="rounded-lg border border-border bg-bg-2/30 p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-[11px] text-text-muted">
          {t('scheduleNote')}
        </div>
        <button
          type="button"
          className="text-[11px] text-brand hover:underline"
        >
          {t('btnConfigureSchedule')}
        </button>
      </div>

    </div>
  );
}
