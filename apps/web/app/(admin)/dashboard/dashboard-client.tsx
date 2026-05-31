'use client';

import * as React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@precision/ui';
import { cn } from '@precision/ui';
import {
  CalendarDays, Users, DollarSign, Building2,
  Wallet, AlertTriangle, Download, Plus,
  TrendingUp, TrendingDown,
  Check, ArrowLeftRight, UserPlus, Zap, CreditCard,
  RefreshCw,
} from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';
import { api as trpc } from '@/lib/trpc/client';

// ─── Router output types ──────────────────────────────────────────────────────

type KPIs             = inferRouterOutputs<AppRouter>['dashboard']['kpis'];
type ActivityFeed     = inferRouterOutputs<AppRouter>['dashboard']['activityFeed'];
type CashBoxes        = inferRouterOutputs<AppRouter>['dashboard']['cashBoxes'];
type AppointmentsToday = inferRouterOutputs<AppRouter>['dashboard']['appointmentsToday'];
type PatientDist      = inferRouterOutputs<AppRouter>['dashboard']['patientDistribution'];
type SysStatus        = inferRouterOutputs<AppRouter>['dashboard']['systemStatus'];
type AgentStatusData  = inferRouterOutputs<AppRouter>['dashboard']['agentStatus'];
type CommsSummary     = inferRouterOutputs<AppRouter>['dashboard']['commissionsSummary'];
type TopRefs          = inferRouterOutputs<AppRouter>['dashboard']['topReferrers'];

// ─── Static maps ─────────────────────────────────────────────────────────────

const CASH_BOX_DISPLAY: Record<string, string> = {
  'Pleasant Grove Box': '🇺🇸 EEUU',
  'Provo Box':          '🇧🇴 Bolivia',
};

const TYPE_BADGE: Record<string, string> = {
  cyan:   'bg-cyan/[0.14] text-cyan border border-cyan/25',
  violet: 'bg-brand-2/[0.14] text-brand-2 border border-brand-2/25',
  pink:   'bg-pink/[0.14] text-pink border border-pink/25',
  green:  'bg-emerald/[0.14] text-emerald border border-emerald/25',
  amber:  'bg-amber/[0.14] text-amber border border-amber/25',
  rose:   'bg-rose/[0.14] text-rose border border-rose/25',
  blue:   'bg-cyan/[0.14] text-cyan border border-cyan/25',
};

const APPT_TYPE_MAP: Record<string, { key: string; color: string }> = {
  AUTO_ACCIDENT:   { key: 'autoAccident',   color: 'cyan' },
  FAMILY_PRACTICE: { key: 'familyPractice', color: 'violet' },
  URGENT_CARE:     { key: 'urgentCare',     color: 'pink' },
  FOLLOW_UP:       { key: 'autoAccident',   color: 'amber' },
  CONSULTATION:    { key: 'familyPractice', color: 'violet' },
};

const APPT_STATUS_MAP: Record<string, { key: string; color: string }> = {
  CONFIRMED:   { key: 'confirmed',       color: 'green' },
  PENDING:     { key: 'pendingStatus',   color: 'amber' },
  SCHEDULED:   { key: 'pendingStatus',   color: 'amber' },
  CANCELLED:   { key: 'cancelledStatus', color: 'rose' },
  COMPLETED:   { key: 'confirmed',       color: 'green' },
  IN_PROGRESS: { key: 'confirmed',       color: 'cyan' },
  NO_SHOW:     { key: 'cancelledStatus', color: 'rose' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[8px] bg-white/[0.05]', className)} />;
}

function useCountUp(target: number, duration = 900): number {
  const [displayed, setDisplayed] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const from = fromRef.current;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (target - from) * eased);
      fromRef.current = next;
      setDisplayed(next);
      if (progress < 1) { rafRef.current = requestAnimationFrame(tick); }
      else { rafRef.current = null; }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [target, duration]);

  return displayed;
}

function AnimatedKpiValue({ rawValue, formatter, className }: {
  rawValue: number | null;
  formatter: (n: number) => string;
  className?: string;
}) {
  const animated = useCountUp(rawValue ?? 0);
  return <div className={className}>{rawValue === null ? '—' : formatter(animated)}</div>;
}

function FadeInValue({ value, className }: { value: string; className?: string }) {
  const [displayed, setDisplayed] = useState(value);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (value === displayed) return;
    setVisible(false);
    const timer = setTimeout(() => { setDisplayed(value); setVisible(true); }, 150);
    return () => clearTimeout(timer);
  }, [value, displayed]);

  return (
    <div
      className={cn(className, 'transition-all duration-300')}
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(6px)' }}
    >
      {displayed}
    </div>
  );
}

function Sparkline({ data, color }: { data: readonly number[]; color: string }) {
  const W = 100, H = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - 2 - ((v - min) / range) * (H - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(' ');
  const id = `sg${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 36 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DonutChart({
  centerLabel,
  segments,
  total,
}: {
  centerLabel: string;
  segments: PatientDist['segments'];
  total: number;
}) {
  const r = 58, cx = 82.5, cy = 82.5;
  const circ = 2 * Math.PI * r;
  const gap = 3;

  const displaySegs = segments.length > 0 ? segments : [
    { label: 'Auto Accident',   count: 0, pct: 50, color: '#6366F1' },
    { label: 'Family Practice', count: 0, pct: 30, color: '#06B6D4' },
    { label: 'Urgent Care',     count: 0, pct: 15, color: '#10B981' },
    { label: 'Otros',           count: 0, pct: 5,  color: '#F59E0B' },
  ];

  let cumulative = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 165, height: 165 }}>
        <svg viewBox="0 0 165 165" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="16" />
          {displaySegs.map((seg) => {
            const len = (seg.pct / 100) * circ;
            const dashArr = `${(len - gap).toFixed(2)} ${(circ - len + gap).toFixed(2)}`;
            const offset = -cumulative;
            cumulative += len;
            return (
              <circle key={seg.label} cx={cx} cy={cy} r={r}
                fill="none" stroke={seg.color} strokeWidth="16"
                strokeDasharray={dashArr} strokeDashoffset={offset.toFixed(2)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="font-mono text-2xl font-bold leading-none text-text-1">
            {total > 0 ? total.toLocaleString() : '—'}
          </span>
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-text-3 mt-1">{centerLabel}</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 flex-1">
        {displaySegs.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: seg.color }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-text-1 leading-tight">{seg.label}</div>
              <div className="font-mono text-[10.5px] text-text-3">{seg.count.toLocaleString()}</div>
            </div>
            <span className="font-mono text-[13px] font-bold text-text-2">{seg.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerfChart({
  labelAttended,
  labelCancelled,
  dataAttended,
  dataCancelled,
}: {
  labelAttended: string;
  labelCancelled: string;
  dataAttended: number[];
  dataCancelled: number[];
}) {
  const W = 500, H = 200;
  const padL = 32, padR = 10, padT = 16, padB = 28;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  if (dataAttended.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-[12px] text-text-muted">
        Sin datos para este período
      </div>
    );
  }

  const maxV = Math.max(...dataAttended, 1) + 8;
  const range = maxV;
  const gx = (i: number) => padL + (i / (dataAttended.length - 1)) * cW;
  const gy = (v: number) => padT + cH - (v / range) * cH;
  const aPoints = dataAttended.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
  const cPoints = dataCancelled.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
  const aArea = `${padL},${padT + cH} ${aPoints} ${gx(dataAttended.length - 1).toFixed(1)},${padT + cH}`;
  const cArea = `${padL},${padT + cH} ${cPoints} ${gx(dataCancelled.length - 1).toFixed(1)},${padT + cH}`;
  const yTicks = [0, 25, 50, 75, 100].map(p => ({ y: gy((p / 100) * range), v: Math.round((p / 100) * range) }));
  const step = Math.max(1, Math.floor(dataAttended.length / 6));
  const xLabels = dataAttended.map((_, i) => i).filter((i) => i % step === 0 || i === dataAttended.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full" style={{ height: 200 }}>
      <defs>
        <linearGradient id="ga-perf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gc-perf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#F43F5E" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map(({ y, v }) => (
        <g key={v}>
          <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={padL - 4} y={y + 3.5} textAnchor="end" fontSize="9" fill="#6B7592" fontFamily="monospace">{v}</text>
        </g>
      ))}
      {xLabels.map(d => (
        <text key={d} x={gx(d).toFixed(1)} y={H - 6} textAnchor="middle" fontSize="9" fill="#6B7592" fontFamily="monospace">{d + 1}</text>
      ))}
      <polygon points={aArea} fill="url(#ga-perf)" />
      <polygon points={cArea} fill="url(#gc-perf)" />
      <polyline points={aPoints} fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={cPoints} fill="none" stroke="#F43F5E" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={W - 115} cy={8} r={4} fill="#6366F1" />
      <text x={W - 108} y={12} fontSize="10" fill="#A8B2CC" fontFamily="sans-serif" fontWeight="600">{labelAttended}</text>
      <circle cx={W - 55} cy={8} r={4} fill="#F43F5E" />
      <text x={W - 48} y={12} fontSize="10" fill="#A8B2CC" fontFamily="sans-serif" fontWeight="600">{labelCancelled}</text>
    </svg>
  );
}

function ActivityIconEl({ type, bg, color }: { type: string; bg: string; color: string }) {
  const iconMap: Record<string, React.ReactElement> = {
    check:  <Check className="h-3.5 w-3.5" />,
    fx:     <ArrowLeftRight className="h-3.5 w-3.5" />,
    user:   <UserPlus className="h-3.5 w-3.5" />,
    star:   <Zap className="h-3.5 w-3.5" />,
    wallet: <CreditCard className="h-3.5 w-3.5" />,
  };
  const ICON_COLORS: Record<string, { bg: string; color: string }> = {
    check: { bg: 'rgba(16,185,129,0.12)',  color: '#10B981' },
    fx:    { bg: 'rgba(99,102,241,0.12)',  color: '#6366F1' },
    user:  { bg: 'rgba(6,182,212,0.12)',   color: '#06B6D4' },
    star:  { bg: 'rgba(139,92,246,0.12)',  color: '#8B5CF6' },
    wallet:{ bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B' },
  };
  const c = ICON_COLORS[type] ?? { bg, color };
  return (
    <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg" style={{ background: c.bg, color: c.color }}>
      {iconMap[type] ?? <Check className="h-3.5 w-3.5" />}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles: Record<number, { bg: string; color: string }> = {
    1: { bg: 'linear-gradient(135deg,#FCD34D,#F59E0B)', color: '#1a1a1a' },
    2: { bg: 'linear-gradient(135deg,#E5E7EB,#9CA3AF)', color: '#1a1a1a' },
    3: { bg: 'linear-gradient(135deg,#FDBA74,#C2410C)', color: '#fff' },
  };
  const s = styles[rank];
  if (s) {
    return (
      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] font-mono text-[11px] font-bold shrink-0"
        style={{ background: s.bg, color: s.color }}>
        {rank}
      </span>
    );
  }
  return (
    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] font-mono text-[11px] font-bold text-text-3 border border-border bg-white/5 shrink-0">
      {rank}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 60_000;

export function DashboardClient({
  kpis:                initialKpis,
  activity:            initialActivity,
  cashBoxes:           initialCashBoxes,
  appointmentsToday:   initialAppts,
  patientDistribution: initialDist,
  systemStatus:        initialSysStatus,
  agentStatus:         initialAgentStatus,
  commissionsSummary:  initialComms,
  topReferrers:        initialTopRefs,
}: {
  kpis:                KPIs | null;
  activity:            ActivityFeed;
  cashBoxes:           CashBoxes;
  appointmentsToday:   AppointmentsToday | null;
  patientDistribution: PatientDist | null;
  systemStatus:        SysStatus | null;
  agentStatus:         AgentStatusData | null;
  commissionsSummary:  CommsSummary | null;
  topReferrers:        TopRefs | null;
}): React.ReactElement {
  const t       = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tNav    = useTranslations('nav');
  const locale  = useLocale();

  const [clinicTab, setClinicTab] = useState<'pg' | 'provo'>('pg');
  const [perfTab,   setPerfTab]   = useState<'30d' | '90d' | 'ytd'>('30d');
  const [refreshing, setRefreshing] = useState(false);

  // ── tRPC hooks ────────────────────────────────────────────────────────────
  const opts = { refetchInterval: REFRESH_INTERVAL, refetchIntervalInBackground: false };

  const kpisQ   = trpc.dashboard.kpis.useQuery(undefined, { ...opts, initialData: initialKpis ?? undefined });
  const actQ    = trpc.dashboard.activityFeed.useQuery(undefined, { ...opts, initialData: initialActivity });
  const cashQ   = trpc.dashboard.cashBoxes.useQuery(undefined, { ...opts, initialData: initialCashBoxes });
  const apptsQ  = trpc.dashboard.appointmentsToday.useQuery(undefined, { ...opts, initialData: initialAppts ?? undefined });
  const distQ   = trpc.dashboard.patientDistribution.useQuery(undefined, { ...opts, initialData: initialDist ?? undefined });
  const sysQ    = trpc.dashboard.systemStatus.useQuery(undefined, { ...opts, initialData: initialSysStatus ?? undefined });
  const agentQ  = trpc.dashboard.agentStatus.useQuery(undefined, { ...opts, initialData: initialAgentStatus ?? undefined });
  const commsQ  = trpc.dashboard.commissionsSummary.useQuery(undefined, { ...opts, initialData: initialComms ?? undefined });
  const refsQ   = trpc.dashboard.topReferrers.useQuery(undefined, { ...opts, initialData: initialTopRefs ?? undefined });
  const perfQ   = trpc.dashboard.performanceData.useQuery({ range: perfTab }, { ...opts });

  const utils = trpc.useUtils();
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await utils.dashboard.invalidate();
    setRefreshing(false);
  }, [utils]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const kpis    = kpisQ.data;
  const activity = actQ.data ?? [];
  const cashBoxes = cashQ.data ?? [];
  const appts   = apptsQ.data;
  const dist    = distQ.data;
  const sys     = sysQ.data;
  const agent   = agentQ.data;
  const comms   = commsQ.data;
  const refs    = refsQ.data;

  // Dynamic date
  const today = new Date();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES';
  const dateRaw = today.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dateStr = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1) + ' · ' + today.getFullYear();

  // KPI cards
  const kpiCards = [
    {
      label: t('monthlyRevenue'),
      value: kpis
        ? kpis.monthlyRevenue >= 1000
          ? `$${(kpis.monthlyRevenue / 1000).toFixed(1)}K`
          : `$${kpis.monthlyRevenue.toFixed(0)}`
        : '—',
      rawValue: kpis ? kpis.monthlyRevenue : null as number | null,
      formatter: (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`) as string,
      icon: DollarSign,
      color: '#F59E0B',
      bg: 'rgba(245,158,11,0.12)',
      border: 'rgba(245,158,11,0.25)',
      trend: '+0%',
      trendUp: true,
      sub: t('revenueGoal'),
      spark: kpis?.revenueSpark ?? [0, 0, 0, 0, 0, 0, 0],
      href: '/dashboard/employees?tab=pagos',
    },
    {
      label: t('appointments'),
      value: kpis ? kpis.todayAppointments.toLocaleString() : '—',
      rawValue: kpis ? kpis.todayAppointments : null as number | null,
      formatter: (n: number) => Math.round(n).toLocaleString() as string,
      icon: CalendarDays,
      color: '#06B6D4',
      bg: 'rgba(6,182,212,0.12)',
      border: 'rgba(6,182,212,0.25)',
      trend: kpis?.appointmentsTrend ?? '—',
      trendUp: kpis?.appointmentsTrendUp ?? true,
      sub: t('vsYesterday'),
      spark: kpis?.appointmentsSpark ?? [0, 0, 0, 0, 0, 0, 0],
      href: '/dashboard',
    },
    {
      label: t('activePatients'),
      value: kpis ? kpis.activePatients.toLocaleString() : '—',
      rawValue: kpis ? kpis.activePatients : null as number | null,
      formatter: (n: number) => Math.round(n).toLocaleString() as string,
      icon: Users,
      color: '#10B981',
      bg: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.25)',
      trend: kpis?.patientsTrend ?? '—',
      trendUp: kpis?.patientsTrendUp ?? true,
      sub: t('vsLastMonth'),
      spark: kpis?.patientsSpark ?? [0, 0, 0, 0, 0, 0, 0],
      href: '/dashboard',
    },
    {
      label: t('topClinic'),
      value: kpis?.topClinic ? `${kpis.topClinic.name}` : '—',
      rawValue: null as number | null,
      formatter: null as ((n: number) => string) | null,
      icon: Building2,
      color: '#6366F1',
      bg: 'rgba(99,102,241,0.12)',
      border: 'rgba(99,102,241,0.25)',
      trend: kpis?.topClinic ? `${kpis.topClinic.count} citas` : '—',
      trendUp: true,
      sub: t('vsLastMonth'),
      spark: kpis?.topClinicSpark ?? [0, 0, 0, 0, 0, 0, 0],
      href: '/dashboard/finanzas',
    },
  ];

  // Appointments for selected clinic tab
  const appointments = clinicTab === 'pg' ? (appts?.pg ?? []) : (appts?.provo ?? []);
  const pgCount    = appts?.pgCount    ?? 0;
  const provoCount = appts?.provoCount ?? 0;

  // Commission cards
  const commissionCards = [
    {
      label: t('generated'),
      value: comms ? `$${(comms.generated / 1000).toFixed(1)}K` : '$0',
      trend: '+0% vs mes ant.',
      warning: false,
      highlight: true,
    },
    {
      label: t('commissionsPaid'),
      value: comms ? `$${(comms.paid / 1000).toFixed(1)}K` : '$0',
      trend: '+0% vs mes ant.',
      warning: false,
      highlight: false,
    },
    {
      label: t('commissionsPending'),
      value: comms ? `$${(comms.pending / 1000).toFixed(1)}K` : '$0',
      trend: comms ? `${comms.pendingCount} por aprobar` : '0 por aprobar',
      warning: (comms?.pendingCount ?? 0) > 0,
      highlight: false,
    },
    {
      label: t('commissionsAverage'),
      value: comms ? `$${comms.average.toFixed(0)}` : '$0',
      trend: locale === 'en' ? 'per referral' : 'por referencia',
      warning: false,
      highlight: false,
    },
  ];

  // Performance chart data
  const perfData    = perfQ.data ?? [];
  const perfAttended  = perfData.map((d) => d.attended);
  const perfCancelled = perfData.map((d) => d.cancelled);

  return (
    <div className="p-6 pb-28 space-y-[18px]">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-1">
            {t('title')}{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg,#6366F1 0%,#06B6D4 60%,#14B8A6 100%)' }}
            >
              {t('executiveTitle')}
            </span>
          </h1>
          <div className="mt-1 flex items-center gap-2 text-[12.5px] text-text-3">
            <span>{dateStr}</span>
            <span className="h-[3px] w-[3px] rounded-full bg-text-muted" />
            <span>{t('welcome')}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-white/[0.04] px-3 text-[12.5px] font-semibold text-text-3 transition-all hover:border-brand/25 hover:bg-brand/[0.08] disabled:opacity-50"
            title="Actualizar datos"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
          <button className="flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-white/[0.04] px-4 text-[12.5px] font-semibold text-text-1 transition-all hover:border-brand/25 hover:bg-brand/[0.08] hover:-translate-y-px">
            <Download className="h-3.5 w-3.5" />
            {tCommon('export')}
          </button>
          <button
            className="flex h-[38px] items-center gap-2 rounded-[10px] px-4 text-[12.5px] font-semibold text-white transition-all hover:-translate-y-px"
            style={{ background: 'linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%)', boxShadow: '0 6px 20px rgba(99,102,241,0.35)' }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('newConsultation')}
          </button>
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.label} href={kpi.href}>
              <div
                className="rounded-[14px] border p-[18px] cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
                style={{
                  background: 'linear-gradient(180deg,var(--surface) 0%,var(--bg-2) 100%)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                    style={{ background: kpi.bg, border: `1px solid ${kpi.border}` }}
                  >
                    <Icon className="h-[18px] w-[18px]" style={{ color: kpi.color }} />
                  </div>
                  <span className={cn('flex items-center gap-1 text-[11px] font-bold', kpi.trendUp ? 'text-emerald' : 'text-rose')}>
                    {kpi.trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {kpi.trend}
                  </span>
                </div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-text-3 mb-1.5">{kpi.label}</div>
                {kpisQ.isLoading && !kpisQ.data ? (
                  <Skeleton className="h-8 w-24 mb-1" />
                ) : kpi.formatter !== null ? (
                  <AnimatedKpiValue
                    rawValue={kpi.rawValue}
                    formatter={kpi.formatter}
                    className="font-mono text-[28px] font-bold leading-none text-text-1 mb-1"
                  />
                ) : (
                  <FadeInValue
                    value={kpi.value}
                    className="font-mono text-[28px] font-bold leading-none text-text-1 mb-1"
                  />
                )}
                <div className="text-[11.5px] text-text-3 mb-2">{kpi.sub}</div>
                <Sparkline data={kpi.spark} color={kpi.color} />
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Row 1: Citas por clínica + Distribución ── */}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.55fr_1fr]">

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{t('appointmentsByClinic')}</CardTitle>
                <p className="text-[11.5px] text-text-3 mt-0.5">{t('clinicSubtitle')}</p>
              </div>
              <div className="flex gap-1 rounded-[9px] border border-border bg-white/[0.03] p-[3px]">
                {(['pg', 'provo'] as const).map((tab) => (
                  <button key={tab} onClick={() => setClinicTab(tab)}
                    className={cn('rounded-[6px] px-2.5 py-[5px] text-[11px] font-semibold transition-all',
                      clinicTab === tab ? 'text-white shadow-sm' : 'text-text-3 hover:text-text-1')}
                    style={clinicTab === tab ? { background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' } : {}}>
                    {tab === 'pg'
                      ? `${t('pleasantGrove')}${pgCount > 0 ? ` (${pgCount})` : ''}`
                      : `${t('provo')}${provoCount > 0 ? ` (${provoCount})` : ''}`}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {apptsQ.isLoading && !apptsQ.data ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[54px] w-full" />)
            ) : appointments.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-text-muted">Sin citas programadas para hoy</p>
            ) : (
              appointments.map((apt) => {
                const typeInfo   = APPT_TYPE_MAP[apt.type]   ?? { key: 'autoAccident', color: 'cyan' };
                const statusInfo = APPT_STATUS_MAP[apt.status] ?? { key: 'pendingStatus', color: 'amber' };
                return (
                  <div key={apt.id}
                    className="flex items-center gap-3 rounded-[11px] border border-border bg-white/[0.02] p-[11px] transition-all hover:border-brand/25 hover:bg-brand/[0.04] hover:translate-x-[3px] cursor-pointer">
                    <span className="font-mono text-[12px] font-bold text-cyan min-w-[56px]">{apt.time}</span>
                    <span className="w-px self-stretch bg-border" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-text-1 mb-0.5">{apt.patient}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-text-3">
                        <span>{apt.doctor}</span>
                        <span className={cn('rounded-[5px] px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-wider', TYPE_BADGE[typeInfo.color])}>
                          {t(typeInfo.key as Parameters<typeof t>[0])}
                        </span>
                      </div>
                    </div>
                    <span className={cn('rounded-[5px] px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-wider shrink-0', TYPE_BADGE[statusInfo.color])}>
                      {t(statusInfo.key as Parameters<typeof t>[0])}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('distribution')}</CardTitle>
            <p className="text-[11.5px] text-text-3 mt-0.5">{t('patientsByType')}</p>
          </CardHeader>
          <CardContent>
            {distQ.isLoading && !distQ.data ? (
              <Skeleton className="h-[165px] w-full" />
            ) : (
              <DonutChart
                centerLabel={t('patientsLabel')}
                segments={dist?.segments ?? []}
                total={dist?.total ?? 0}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Top Abogados + Top Proveedores + Actividad ── */}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3">

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('topLawyers')}</CardTitle>
                <p className="text-[11.5px] text-text-3 mt-0.5">{t('byReferrals')}</p>
              </div>
              {refs?.lawyersIsDemo && (
                <span className="text-[10px] font-semibold text-text-muted border border-border rounded-[5px] px-1.5 py-0.5">
                  datos de ejemplo
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-[9px]">
            {refsQ.isLoading && !refsQ.data ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[46px] w-full" />)
            ) : (refs?.lawyers ?? []).length === 0 ? (
              <p className="py-4 text-center text-[12px] text-text-muted">Sin abogados registrados</p>
            ) : (
              (refs?.lawyers ?? []).map((l) => (
                <div key={l.rank}
                  className="flex items-center gap-[11px] rounded-[10px] border border-border bg-white/[0.02] p-[9px_11px] transition-all hover:border-brand/20 hover:bg-brand/[0.05] hover:translate-x-0.5 cursor-pointer">
                  <RankBadge rank={l.rank} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-text-1 truncate">{l.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold">
                      {t(l.typeKey as Parameters<typeof t>[0])}
                    </div>
                  </div>
                  <span className="font-mono text-[13px] font-bold text-brand">{l.refs}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('topProviders')}</CardTitle>
                <p className="text-[11.5px] text-text-3 mt-0.5">{t('byReferrals')}</p>
              </div>
              {refs?.providersIsDemo && (
                <span className="text-[10px] font-semibold text-text-muted border border-border rounded-[5px] px-1.5 py-0.5">
                  datos de ejemplo
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-[9px]">
            {refsQ.isLoading && !refsQ.data ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[46px] w-full" />)
            ) : (refs?.providers ?? []).length === 0 ? (
              <p className="py-4 text-center text-[12px] text-text-muted">Sin proveedores registrados</p>
            ) : (
              (refs?.providers ?? []).map((p) => (
                <div key={p.rank}
                  className="flex items-center gap-[11px] rounded-[10px] border border-border bg-white/[0.02] p-[9px_11px] transition-all hover:border-brand/20 hover:bg-brand/[0.05] hover:translate-x-0.5 cursor-pointer">
                  <RankBadge rank={p.rank} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-text-1 truncate">{p.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold">
                      {t(p.typeKey as Parameters<typeof t>[0])}
                    </div>
                  </div>
                  <span className="font-mono text-[13px] font-bold text-brand">{p.refs}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('recentActivity')}</CardTitle>
            <p className="text-[11.5px] text-text-3 mt-0.5">{t('latestOperations')}</p>
          </CardHeader>
          <CardContent>
            {actQ.isLoading && !actQ.data ? (
              <div className="space-y-1">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[46px] w-full" />)}
              </div>
            ) : activity.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-text-muted">{t('noRecentActivity')}</p>
            ) : (
              <ul className="space-y-1">
                {activity.map((item) => (
                  <li key={item.id} className="flex gap-[11px] rounded-lg p-2 border-b border-border last:border-0 hover:bg-brand/[0.04] cursor-pointer transition-colors">
                    <ActivityIconEl type={item.type} bg="rgba(99,102,241,0.12)" color="#6366F1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] leading-snug text-text-2">
                        <strong className="text-text-1 font-semibold">{item.bold}</strong>
                        {item.description}
                      </div>
                      <span className="font-mono text-[10.5px] text-text-muted mt-0.5 block">{item.time}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Performance + Comisiones ── */}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[2fr_1fr]">

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{t('performanceTitle')}</CardTitle>
                <p className="text-[11.5px] text-text-3 mt-0.5">{t('attendedVsCancelled')}</p>
              </div>
              <div className="flex gap-1 rounded-[9px] border border-border bg-white/[0.03] p-[3px]">
                {(['30d', '90d', 'ytd'] as const).map((tab) => (
                  <button key={tab} onClick={() => setPerfTab(tab)}
                    className={cn('rounded-[6px] px-2.5 py-[5px] text-[11px] font-semibold transition-all uppercase',
                      perfTab === tab ? 'text-white shadow-sm' : 'text-text-3 hover:text-text-1')}
                    style={perfTab === tab ? { background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' } : {}}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {perfQ.isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <PerfChart
                labelAttended={t('attended')}
                labelCancelled={t('cancelledLabel')}
                dataAttended={perfAttended}
                dataCancelled={perfCancelled}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('commissionsTitle')}</CardTitle>
            <p className="text-[11.5px] text-text-3 mt-0.5">{t('commissionsMonth')}</p>
          </CardHeader>
          <CardContent>
            {commsQ.isLoading && !commsQ.data ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[60px] w-full" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3.5">
                  {commissionCards.map((c) => (
                    <div key={c.label} className="rounded-[10px] border p-3"
                      style={{
                        background: c.highlight ? 'linear-gradient(135deg,rgba(99,102,241,0.10),rgba(139,92,246,0.05))' : 'rgba(255,255,255,0.02)',
                        borderColor: c.highlight ? 'rgba(99,102,241,0.25)' : 'var(--border)',
                      }}>
                      <div className="text-[10px] uppercase tracking-wider text-text-3 font-bold mb-1.5">{c.label}</div>
                      <div className="font-mono text-[18px] font-bold text-text-1 leading-none">
                        <span className="text-[11px] opacity-60">$</span>
                        {c.value.replace('$', '')}
                      </div>
                      <div className={cn('mt-1.5 text-[10.5px] font-semibold', c.warning ? 'text-amber' : 'text-emerald')}>
                        {c.trend}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-text-3 mb-2">
                  <span>{t('monthlyGoal')}</span>
                  <span className="font-mono">
                    {comms ? `$${(comms.generated / 1000).toFixed(1)}K` : '$0'} / $40K
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden bg-white/5">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, comms ? (comms.generated / 40000) * 100 : 0).toFixed(1)}%`,
                      background: 'linear-gradient(90deg,#6366F1,#06B6D4)',
                    }} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Estado del Sistema ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('systemStatusTitle')}</CardTitle>
          <p className="text-[11.5px] text-text-3 mt-0.5">{t('serviceHealth')}</p>
        </CardHeader>
        <CardContent>
          {sysQ.isLoading && !sysQ.data ? (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[52px]" />)}
            </div>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              {/* API */}
              <StatusRow
                name="API · tRPC"
                detail={sys ? `${sys.dbMs}ms p95` : '—'}
                label={t('operational')}
                green
              />
              {/* DB */}
              <StatusRow
                name="Database · Supabase"
                detail={sys ? `${sys.dbMs}ms p95` : '—'}
                label={sys?.dbOk ? t('operational') : 'Error'}
                green={sys?.dbOk ?? false}
              />
              {/* Sync */}
              <StatusRow
                name="Sincronización Asistencia"
                detail={sys?.lastSyncLabel ?? 'No configurado'}
                label={sys?.lastSyncLabel !== 'No configurado' ? t('okStatus') : '—'}
                green={sys?.lastSyncLabel !== 'No configurado'}
              />
              {/* CIFO */}
              <StatusRow
                name="CIFO · Agente"
                detail={sys?.cifoLabel ?? '— / $50'}
                label={t('activeStatus')}
                green={sys?.cifoGreen ?? false}
              />
              {/* Audit */}
              <StatusRow
                name="Audit Agent"
                detail={sys?.auditLabel ?? '—'}
                label={sys?.auditGreen ? t('okStatus') : t('reviewStatus')}
                green={sys?.auditGreen ?? true}
              />
              {/* Resend */}
              <StatusRow
                name="Resend · Email"
                detail="—"
                label={t('okStatus')}
                green
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Caja Chica + Agentes IA ── */}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-text-3" />
              {tNav('pettyCash')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cashQ.isLoading && !cashQ.data ? (
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[56px] w-full" />)
            ) : cashBoxes.length === 0 ? (
              <p className="text-small text-text-muted">{t('noCashBoxes')}</p>
            ) : (
              cashBoxes.map((box) => (
                <Link key={box.id} href="/dashboard/petty-cash"
                  className="flex items-center justify-between rounded-[10px] border border-border p-2.5 hover:border-border-strong transition-colors">
                  <div>
                    <p className="text-small font-semibold text-text-2">{CASH_BOX_DISPLAY[box.name] ?? box.name}</p>
                    <p className="font-mono text-base font-bold text-text-1">${Number(box.balance).toLocaleString()}</p>
                  </div>
                  {/* Solo alerta si la caja YA fue aperturada (tiene al
                      menos 1 transaccion). Cajas recien creadas con
                      balance=0 no deberian disparar alerta — todavia
                      no estan en operacion. */}
                  {Number(box.balance) <= Number(box.lowBalanceThreshold) && box.hasTransactions && (
                    <AlertTriangle className="h-4 w-4 text-amber" />
                  )}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tNav('aiAgents')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {/* CIFO row */}
            <div className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" style={{ boxShadow: '0 0 6px #10B981' }} />
                <span className="text-small font-medium text-text-2">CIFO</span>
              </div>
              {agentQ.isLoading && !agentQ.data ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className="text-tiny text-text-muted">
                  {agent !== undefined
                    ? `${agent.cifoConversationsToday} consultas hoy`
                    : '—'}
                </span>
              )}
            </div>
            {/* Audit Agent row */}
            <div className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn('h-1.5 w-1.5 rounded-full animate-pulse', {
                    'bg-emerald': (agent?.auditPendingFindings ?? 0) === 0,
                    'bg-amber':   (agent?.auditPendingFindings ?? 0) > 0 && (agent?.auditPendingFindings ?? 0) <= 3,
                    'bg-rose':    (agent?.auditPendingFindings ?? 0) > 3,
                  })}
                />
                <span className="text-small font-medium text-text-2">Audit Agent</span>
              </div>
              {agentQ.isLoading && !agentQ.data ? (
                <Skeleton className="h-4 w-28" />
              ) : (
                <span className={cn('text-tiny', {
                  'text-emerald':   (agent?.auditPendingFindings ?? 0) === 0,
                  'text-amber':     (agent?.auditPendingFindings ?? 0) > 0 && (agent?.auditPendingFindings ?? 0) <= 3,
                  'text-rose font-semibold': (agent?.auditPendingFindings ?? 0) > 3,
                })}>
                  {agent === undefined
                    ? '—'
                    : agent.auditPendingFindings === 0
                      ? 'Sin hallazgos'
                      : agent.auditPendingFindings <= 3
                        ? `${agent.auditPendingFindings} hallazgos`
                        : `${agent.auditPendingFindings} hallazgos · Revisar`}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

// ─── StatusRow helper ─────────────────────────────────────────────────────────

function StatusRow({ name, detail, label, green }: { name: string; detail: string; label: string; green: boolean }) {
  return (
    <div className="flex items-center gap-[11px] rounded-[10px] border border-border bg-white/[0.02] p-[9px_11px]">
      <span
        className={cn('h-2 w-2 rounded-full shrink-0', green ? 'bg-emerald animate-pulse' : 'bg-amber')}
        style={{ boxShadow: green ? '0 0 8px #10B981' : '0 0 8px #F59E0B' }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-text-1">{name}</div>
        <div className="font-mono text-[10.5px] text-text-3 mt-px">{detail}</div>
      </div>
      <span className="font-mono text-[11px] font-semibold text-text-2 shrink-0">{label}</span>
    </div>
  );
}
