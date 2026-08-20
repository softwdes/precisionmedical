/**
 * Portal Médico · Mis Estadísticas (D5)
 *
 * Server component: métricas del doctor de sesión vía lib/provider-metrics
 * (la misma fuente que consumirá Métricas del Admin). Rango por searchParam.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  CalendarCheck2, Clock3, Users, UserX, FlaskConical, Pill, FileSignature, BarChart3,
} from 'lucide-react';
import { PageHeader, KpiCard, EmptyState } from '@/components/ui-phoenix';
import { getSessionProvider } from '@/lib/get-session-provider';
import { getProviderMetrics, type MetricsRange } from '@/lib/provider-metrics';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.nav');
  return { title: t('stats') };
}

const RANGES: MetricsRange[] = ['week', 'month', 'year'];

export default async function DoctorStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const t = await getTranslations('phoenix.doctor');
  const locale = await getLocale();
  const { range: rangeParam } = await searchParams;
  const range: MetricsRange = RANGES.includes(rangeParam as MetricsRange) ? (rangeParam as MetricsRange) : 'week';

  const m = await getProviderMetrics(provider.id, range, locale);
  const maxBucket = Math.max(1, ...m.buckets.map((b) => b.total));
  // En mes/año hay muchos buckets — limitar labels visibles
  const labelEvery = m.buckets.length > 14 ? Math.ceil(m.buckets.length / 12) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader title={t('statsTitle')} subtitle={t('statsSubtitle')} />
        {/* Toggle de rango — links server-side */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-1 p-1">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/doctor/stats?range=${r}`}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                r === range ? 'text-white' : 'text-text-muted hover:text-text-1'
              }`}
              style={r === range ? { background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' } : undefined}
            >
              {t(`statsRange_${r}`)}
            </Link>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard compact label={t('statsKpiConsultations')} value={m.completed} sub={t('statsKpiOfTotal', { total: m.totalAppointments })} color="text-violet-text" icon={CalendarCheck2} iconBg="bg-violet/10" iconColor="text-violet-text" />
        <KpiCard compact label={t('statsKpiAvgDuration')} value={m.avgDurationMin > 0 ? `${m.avgDurationMin} min` : '—'} color="text-emerald" icon={Clock3} iconBg="bg-emerald/10" iconColor="text-emerald" />
        <KpiCard compact label={t('statsKpiUniquePatients')} value={m.uniquePatients} color="text-cyan" icon={Users} iconBg="bg-cyan/10" iconColor="text-cyan" />
        <KpiCard compact label={t('statsKpiNoShows')} value={m.noShows} sub={m.cancelled > 0 ? t('statsKpiCancelled', { count: m.cancelled }) : undefined} color={m.noShows > 0 ? 'text-amber' : 'text-text-1'} icon={UserX} iconBg="bg-amber/10" iconColor="text-amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart — consultas por bucket */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-bg-1 p-5">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-4 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-violet-text" />
            {t('statsChartTitle')}
          </div>
          {m.totalAppointments === 0 ? (
            <EmptyState.Inline message={t('statsEmpty')} />
          ) : (
            <div className="flex items-end gap-[3px] h-40 overflow-x-auto pb-1">
              {m.buckets.map((b, i) => (
                <div key={i} className="flex-1 min-w-[10px] flex flex-col items-center gap-1 group" title={`${b.label}: ${b.completed}/${b.total}`}>
                  <span className="text-[9px] text-violet-text font-bold tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                    {b.total > 0 ? b.total : ''}
                  </span>
                  <div className="w-full max-w-[26px] flex flex-col justify-end" style={{ height: '110px' }}>
                    {/* total (programadas) tenue + atendidas sólidas encima */}
                    <div
                      className="w-full rounded-t-sm bg-violet/20"
                      style={{ height: `${(b.total / maxBucket) * 100}%`, minHeight: b.total > 0 ? 3 : 0 }}
                    >
                      <div
                        className="w-full rounded-t-sm"
                        style={{
                          height: b.total > 0 ? `${(b.completed / b.total) * 100}%` : 0,
                          background: 'linear-gradient(180deg,#A78BFA,#7C3AED)',
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-[8.5px] text-text-muted whitespace-nowrap">
                    {i % labelEvery === 0 ? b.label : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 text-[10px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'linear-gradient(180deg,#A78BFA,#7C3AED)' }} />
              {t('statsLegendCompleted')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-violet/20" />
              {t('statsLegendScheduled')}
            </span>
          </div>
        </div>

        {/* Panel calidad y cumplimiento */}
        <div className="rounded-lg border border-border bg-bg-1 p-5">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3 flex items-center gap-1.5">
            <FileSignature className="w-3.5 h-3.5 text-violet-text" />
            {t('statsQualityTitle')}
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40">
              <span className="text-text-2">{t('statsNotesSigned24h')}</span>
              <span className={`font-bold tabular-nums ${m.notesSignedWithin24hPct === null ? 'text-text-muted' : m.notesSignedWithin24hPct >= 90 ? 'text-emerald' : 'text-amber'}`}>
                {m.notesSignedWithin24hPct === null ? '—' : `${m.notesSignedWithin24hPct}%`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40">
              <span className="text-text-2">{t('statsNotesSigned')}</span>
              <span className="font-bold tabular-nums text-text-1">{m.notesSigned}</span>
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40">
              <span className="text-text-2">{t('statsNotesPending')}</span>
              <span className={`font-bold tabular-nums ${m.notesDraft > 0 ? 'text-amber' : 'text-emerald'}`}>{m.notesDraft}</span>
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40">
              <span className="text-text-2 flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 text-text-muted" />{t('statsLabsOrdered')}</span>
              <span className="font-bold tabular-nums text-text-1">{m.labsOrdered}</span>
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-text-2 flex items-center gap-1.5"><Pill className="w-3.5 h-3.5 text-text-muted" />{t('statsRxIssued')}</span>
              <span className="font-bold tabular-nums text-text-1">{m.rxIssued}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
