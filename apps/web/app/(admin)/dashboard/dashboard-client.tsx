'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@precision/ui';
import { cn } from '@precision/ui';
import {
  CalendarDays, Users, DollarSign, CheckSquare,
  Wallet, AlertTriangle, Download, Plus,
  TrendingUp, TrendingDown,
  Check, ArrowLeftRight, UserPlus, Zap, CreditCard,
} from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type KPIs = inferRouterOutputs<AppRouter>['dashboard']['kpis'];
type ActivityFeed = inferRouterOutputs<AppRouter>['dashboard']['activityFeed'];
type CashBoxes = inferRouterOutputs<AppRouter>['dashboard']['cashBoxes'];

// ─── Static sample data (non-translatable: names, numbers, colors) ───────────

const SPARK = {
  citas:     [38, 42, 40, 45, 42, 47, 47],
  pacientes: [2630, 2680, 2720, 2750, 2790, 2820, 2847],
  ingresos:  [220, 235, 240, 258, 268, 278, 284],
  tareas:    [28, 30, 27, 25, 24, 25, 23],
};

const SAMPLE_ACTIVITIES_DATA = [
  { id: 's1', type: 'check',  bg: 'rgba(16,185,129,0.12)',  color: '#10B981', bold: 'Smith & Partners',  restKey: 'sampleCommission', time: '2 min' },
  { id: 's2', type: 'fx',     bg: 'rgba(99,102,241,0.12)',  color: '#6366F1', bold: 'USD → BOB',          restKey: 'sampleFx',          time: '15 min' },
  { id: 's3', type: 'user',   bg: 'rgba(6,182,212,0.12)',   color: '#06B6D4', bold: 'Maria González',     restKey: 'sampleEmployeeAdded', time: '1 h' },
  { id: 's4', type: 'star',   bg: 'rgba(139,92,246,0.12)',  color: '#8B5CF6', bold: 'Audit Agent',        restKey: 'sampleAuditFindings', time: '2 h' },
  { id: 's5', type: 'wallet', bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B', bold: 'Caja Provo',         restKey: 'sampleLowBalance',  time: '3 h' },
] as const;

const APPOINTMENTS_PG = [
  { time: '09:00', patient: 'John Anderson',  doctor: 'Dr. Martinez', typeKey: 'autoAccident',   typeColor: 'cyan',   statusKey: 'confirmed',      statusColor: 'green' },
  { time: '09:30', patient: 'Sarah Mitchell', doctor: 'Dr. Williams', typeKey: 'familyPractice', typeColor: 'violet', statusKey: 'confirmed',      statusColor: 'green' },
  { time: '10:00', patient: 'Michael Brown',  doctor: 'Dr. Martinez', typeKey: 'autoAccident',   typeColor: 'cyan',   statusKey: 'pendingStatus',  statusColor: 'amber' },
  { time: '10:30', patient: 'Emily Davis',    doctor: 'Dr. Johnson',  typeKey: 'urgentCare',     typeColor: 'pink',   statusKey: 'confirmed',      statusColor: 'green' },
  { time: '11:00', patient: 'Robert Wilson',  doctor: 'Dr. Williams', typeKey: 'autoAccident',   typeColor: 'cyan',   statusKey: 'cancelledStatus',statusColor: 'rose'  },
] as const;

const APPOINTMENTS_PROVO = [
  { time: '09:15', patient: 'Ana Ramirez',   doctor: 'Dr. Lopez',  typeKey: 'autoAccident',   typeColor: 'cyan',   statusKey: 'confirmed',      statusColor: 'green' },
  { time: '10:00', patient: 'James Turner',  doctor: 'Dr. Smith',  typeKey: 'familyPractice', typeColor: 'violet', statusKey: 'confirmed',      statusColor: 'green' },
  { time: '10:45', patient: 'Lisa Chen',     doctor: 'Dr. Lopez',  typeKey: 'urgentCare',     typeColor: 'pink',   statusKey: 'pendingStatus',  statusColor: 'amber' },
  { time: '11:30', patient: 'Carlos Mendez', doctor: 'Dr. Smith',  typeKey: 'autoAccident',   typeColor: 'cyan',   statusKey: 'confirmed',      statusColor: 'green' },
  { time: '12:00', patient: 'Rachel White',  doctor: 'Dr. Brown',  typeKey: 'familyPractice', typeColor: 'violet', statusKey: 'cancelledStatus',statusColor: 'rose'  },
] as const;

const TOP_LAWYERS = [
  { rank: 1, name: 'Smith & Partners',      typeKey: 'lawFirm',     refs: 42 },
  { rank: 2, name: 'Johnson Law Group',     typeKey: 'lawFirm',     refs: 35 },
  { rank: 3, name: 'Maria Rodriguez Esq.',  typeKey: 'independent', refs: 28 },
  { rank: 4, name: 'Davis & Cohen LLP',     typeKey: 'lawFirm',     refs: 21 },
  { rank: 5, name: 'Thompson Legal',        typeKey: 'independent', refs: 17 },
] as const;

const TOP_PROVIDERS = [
  { rank: 1, name: 'Dr. Patricia Hayes', typeKey: 'radiology',       refs: 38 },
  { rank: 2, name: 'Dr. James Carter',   typeKey: 'neurology',       refs: 31 },
  { rank: 3, name: 'Mountain PT Center', typeKey: 'physicalTherapy', refs: 26 },
  { rank: 4, name: 'Dr. Linda Park',     typeKey: 'chiropractic',    refs: 19 },
  { rank: 5, name: 'Dr. Mark Stevens',   typeKey: 'orthopedics',     refs: 14 },
] as const;

const SYSTEM_STATUS = [
  { name: 'API · tRPC',                detail: '142ms p95',          valueKey: 'operational', green: true },
  { name: 'Database · LienMaster',      detail: '38ms p95',           valueKey: 'operational', green: true },
  { name: 'Sincronización Asistencia', detail: 'Última: 02:00 AM',   valueKey: 'okStatus',    green: true },
  { name: 'CIFO · Agente',             detail: '$12.40 / $50',       valueKey: 'activeStatus',green: true },
  { name: 'Audit Agent',               detail: '3 hallazgos pend.',  valueKey: 'reviewStatus',green: false },
  { name: 'Resend · Email',            detail: '2,142 / 50K',        valueKey: 'okStatus',    green: true },
] as const;

const PERF_ATTENDED  = [35,38,42,39,45,47,50,48,52,49,53,56,58,54,60,62,59,65,63,68,70,67,72,75,73,78,80,76,82,85];
const PERF_CANCELLED = [3,4,2,5,3,4,2,6,3,5,4,3,5,7,4,3,6,4,5,3,4,6,3,5,4,3,5,7,4,3];

const ACTION_KEY: Record<string, string> = {
  'employee.created':     'actions.employeeCreated',
  'employee.updated':     'actions.employeeUpdated',
  'employee.deactivated': 'actions.employeeDeactivated',
  'payment.created':      'actions.paymentCreated',
  'payment.paid':         'actions.paymentPaid',
  'payment.reversed':     'actions.paymentReversed',
  'user.created':         'actions.userCreated',
  'user.updated':         'actions.userUpdated',
  'user.suspended':       'actions.userSuspended',
};

const SAMPLE_KPIS = {
  todayAppointments: 47,
  activePatients: 2847,
  monthlyRevenue: 284500,
  pendingTasks: 23,
  activeEmployees: 12,
  currentPeriod: 'Mayo 2026',
};

// ─── Badge color map ──────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  cyan:   'bg-cyan/[0.14] text-cyan border border-cyan/25',
  violet: 'bg-brand-2/[0.14] text-brand-2 border border-brand-2/25',
  pink:   'bg-pink/[0.14] text-pink border border-pink/25',
  green:  'bg-emerald/[0.14] text-emerald border border-emerald/25',
  amber:  'bg-amber/[0.14] text-amber border border-amber/25',
  rose:   'bg-rose/[0.14] text-rose border border-rose/25',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function DonutChart({ centerLabel }: { centerLabel: string }) {
  const r = 58, cx = 82.5, cy = 82.5;
  const circ = 2 * Math.PI * r;
  const gap = 3;
  const segs = [
    { label: 'Auto Accident',   count: 1423, pct: 50, color: '#6366F1' },
    { label: 'Family Practice', count: 854,  pct: 30, color: '#06B6D4' },
    { label: 'Urgent Care',     count: 427,  pct: 15, color: '#10B981' },
    { label: 'Otros',           count: 143,  pct: 5,  color: '#F59E0B' },
  ];
  let cumulative = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 165, height: 165 }}>
        <svg viewBox="0 0 165 165" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="16" />
          {segs.map((seg) => {
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
          <span className="font-mono text-2xl font-bold leading-none text-text-1">2,847</span>
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-text-3 mt-1">{centerLabel}</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 flex-1">
        {segs.map((seg) => (
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

function PerfChart({ labelAttended, labelCancelled }: { labelAttended: string; labelCancelled: string }) {
  const W = 500, H = 200;
  const padL = 32, padR = 10, padT = 16, padB = 28;
  const cW = W - padL - padR;
  const cH = H - padT - padB;
  const maxV = Math.max(...PERF_ATTENDED) + 8;
  const range = maxV;
  const gx = (i: number) => padL + (i / (PERF_ATTENDED.length - 1)) * cW;
  const gy = (v: number) => padT + cH - (v / range) * cH;
  const aPoints = PERF_ATTENDED.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
  const cPoints = PERF_CANCELLED.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
  const aArea = `${padL},${padT + cH} ${aPoints} ${gx(PERF_ATTENDED.length - 1).toFixed(1)},${padT + cH}`;
  const cArea = `${padL},${padT + cH} ${cPoints} ${gx(PERF_CANCELLED.length - 1).toFixed(1)},${padT + cH}`;
  const yTicks = [0, 25, 50, 75, 100].map(p => ({ y: gy((p / 100) * range), v: Math.round((p / 100) * range) }));
  const xLabels = [1, 5, 10, 15, 20, 25, 30];
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
        <text key={d} x={gx(d - 1).toFixed(1)} y={H - 6} textAnchor="middle" fontSize="9" fill="#6B7592" fontFamily="monospace">{d}</text>
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
  return (
    <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg" style={{ background: bg, color }}>
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

export function DashboardClient({
  kpis,
  activity,
  cashBoxes,
}: {
  kpis: KPIs | null;
  activity: ActivityFeed;
  cashBoxes: CashBoxes;
}): React.ReactElement {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const locale = useLocale();

  const [clinicTab, setClinicTab] = useState<'pg' | 'provo'>('pg');
  const [perfTab, setPerfTab] = useState<'30d' | '90d' | 'ytd'>('30d');

  const hasRealData = kpis !== null && (kpis.todayAppointments > 0 || kpis.activePatients > 0 || kpis.monthlyRevenue > 0);
  const data = hasRealData && kpis ? kpis : SAMPLE_KPIS;

  // Dynamic date — respects current locale
  const today = new Date();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES';
  const dateRaw = today.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dateStr = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1) + ' · ' + today.getFullYear();

  const kpiCards = [
    {
      label: t('appointments'),
      value: data.todayAppointments.toLocaleString(),
      icon: CalendarDays,
      color: '#06B6D4',
      bg: 'rgba(6,182,212,0.12)',
      border: 'rgba(6,182,212,0.25)',
      trend: '+12.4%',
      trendUp: true,
      sub: t('vsYesterday'),
      spark: SPARK.citas,
      href: '/dashboard',
    },
    {
      label: t('activePatients'),
      value: data.activePatients.toLocaleString(),
      icon: Users,
      color: '#10B981',
      bg: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.25)',
      trend: '+8.2%',
      trendUp: true,
      sub: t('vsLastMonth'),
      spark: SPARK.pacientes,
      href: '/dashboard',
    },
    {
      label: t('monthlyRevenue'),
      value: `$${(data.monthlyRevenue / 1000).toFixed(1)}K`,
      icon: DollarSign,
      color: '#F59E0B',
      bg: 'rgba(245,158,11,0.12)',
      border: 'rgba(245,158,11,0.25)',
      trend: '+18.7%',
      trendUp: true,
      sub: t('revenueGoal'),
      spark: SPARK.ingresos,
      href: '/dashboard/payments',
    },
    {
      label: t('pendingTasks'),
      value: ('pendingTasks' in data ? data.pendingTasks : SAMPLE_KPIS.pendingTasks).toLocaleString(),
      icon: CheckSquare,
      color: '#8B5CF6',
      bg: 'rgba(139,92,246,0.12)',
      border: 'rgba(139,92,246,0.25)',
      trend: '-3.1%',
      trendUp: false,
      sub: t('tasksDueToday'),
      spark: SPARK.tareas,
      href: '/dashboard',
    },
  ];

  const appointments = clinicTab === 'pg' ? APPOINTMENTS_PG : APPOINTMENTS_PROVO;

  const commissionCards = [
    { label: t('generated'),          value: '$32.4K', trend: '+22% vs abr', warning: false, highlight: true },
    { label: t('commissionsPaid'),     value: '$24.1K', trend: '+18% vs abr', warning: false, highlight: false },
    { label: t('commissionsPending'),  value: '$8.3K',  trend: '3 por aprobar', warning: true, highlight: false },
    { label: t('commissionsAverage'),  value: '$432',   trend: locale === 'en' ? 'per referral' : 'por referencia', warning: false, highlight: false },
  ];

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
                <div className="font-mono text-[28px] font-bold leading-none text-text-1 mb-1">{kpi.value}</div>
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
                    {tab === 'pg' ? t('pleasantGrove') : t('provo')}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {appointments.map((apt) => (
              <div key={`${apt.time}-${apt.patient}`}
                className="flex items-center gap-3 rounded-[11px] border border-border bg-white/[0.02] p-[11px] transition-all hover:border-brand/25 hover:bg-brand/[0.04] hover:translate-x-[3px] cursor-pointer">
                <span className="font-mono text-[12px] font-bold text-cyan min-w-[56px]">{apt.time}</span>
                <span className="w-px self-stretch bg-border" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-text-1 mb-0.5">{apt.patient}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-3">
                    <span>{apt.doctor}</span>
                    <span className={cn('rounded-[5px] px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-wider', TYPE_BADGE[apt.typeColor])}>
                      {t(apt.typeKey)}
                    </span>
                  </div>
                </div>
                <span className={cn('rounded-[5px] px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-wider shrink-0', TYPE_BADGE[apt.statusColor])}>
                  {t(apt.statusKey)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('distribution')}</CardTitle>
            <p className="text-[11.5px] text-text-3 mt-0.5">{t('patientsByType')}</p>
          </CardHeader>
          <CardContent>
            <DonutChart centerLabel={t('patientsLabel')} />
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Top Abogados + Top Proveedores + Actividad ── */}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3">

        <Card>
          <CardHeader>
            <CardTitle>{t('topLawyers')}</CardTitle>
            <p className="text-[11.5px] text-text-3 mt-0.5">{t('byReferrals')}</p>
          </CardHeader>
          <CardContent className="space-y-[9px]">
            {TOP_LAWYERS.map((l) => (
              <div key={l.name}
                className="flex items-center gap-[11px] rounded-[10px] border border-border bg-white/[0.02] p-[9px_11px] transition-all hover:border-brand/20 hover:bg-brand/[0.05] hover:translate-x-0.5 cursor-pointer">
                <RankBadge rank={l.rank} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-text-1 truncate">{l.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold">{t(l.typeKey)}</div>
                </div>
                <span className="font-mono text-[13px] font-bold text-brand">{l.refs}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('topProviders')}</CardTitle>
            <p className="text-[11.5px] text-text-3 mt-0.5">{t('byReferrals')}</p>
          </CardHeader>
          <CardContent className="space-y-[9px]">
            {TOP_PROVIDERS.map((p) => (
              <div key={p.name}
                className="flex items-center gap-[11px] rounded-[10px] border border-border bg-white/[0.02] p-[9px_11px] transition-all hover:border-brand/20 hover:bg-brand/[0.05] hover:translate-x-0.5 cursor-pointer">
                <RankBadge rank={p.rank} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-text-1 truncate">{p.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold">{t(p.typeKey)}</div>
                </div>
                <span className="font-mono text-[13px] font-bold text-brand">{p.refs}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('recentActivity')}</CardTitle>
            <p className="text-[11.5px] text-text-3 mt-0.5">{t('latestOperations')}</p>
          </CardHeader>
          <CardContent>
            {activity.length > 0 ? (
              <ul className="space-y-1">
                {activity.slice(0, 5).map((item) => {
                  const actor = (item.actor as unknown) as { firstName: string; lastName: string } | null;
                  const prefix = item.action.split('.')[0] ?? '';
                  const iconType = prefix === 'payment' ? 'check' : prefix === 'employee' ? 'user' : 'star';
                  const actionKeyStr = ACTION_KEY[item.action];
                  const actionLabel = actionKeyStr ? t(actionKeyStr as Parameters<typeof t>[0]) : item.action;
                  return (
                    <li key={item.id} className="flex gap-[11px] rounded-lg p-2 border-b border-border last:border-0 hover:bg-brand/[0.04] cursor-pointer transition-colors">
                      <ActivityIconEl type={iconType} bg="rgba(99,102,241,0.12)" color="#6366F1" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] leading-snug text-text-2">
                          <strong className="text-text-1 font-semibold">
                            {actor ? `${actor.firstName} ${actor.lastName}` : 'Sistema'}
                          </strong>
                          {' · '}{actionLabel}
                        </div>
                        <span className="font-mono text-[10.5px] text-text-muted mt-0.5 block">
                          {new Date(item.createdAt).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-1">
                {SAMPLE_ACTIVITIES_DATA.map((a) => (
                  <li key={a.id} className="flex gap-[11px] rounded-lg p-2 border-b border-border last:border-0 hover:bg-brand/[0.04] cursor-pointer transition-colors">
                    <ActivityIconEl type={a.type} bg={a.bg} color={a.color} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] leading-snug text-text-2">
                        <strong className="text-text-1 font-semibold">{a.bold}</strong>
                        {t(a.restKey)}
                      </div>
                      <span className="font-mono text-[10.5px] text-text-muted mt-0.5 block">{a.time}</span>
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
            <PerfChart labelAttended={t('attended')} labelCancelled={t('cancelledLabel')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('commissionsTitle')}</CardTitle>
            <p className="text-[11.5px] text-text-3 mt-0.5">{t('commissionsMonth')}</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 mb-3.5">
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
              <span className="font-mono">$32.4K / $40K</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-white/5">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: '81%', background: 'linear-gradient(90deg,#6366F1,#06B6D4)' }} />
            </div>
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
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
            {SYSTEM_STATUS.map((s) => (
              <div key={s.name} className="flex items-center gap-[11px] rounded-[10px] border border-border bg-white/[0.02] p-[9px_11px]">
                <span className={cn('h-2 w-2 rounded-full shrink-0', s.green ? 'bg-emerald animate-pulse' : 'bg-amber')}
                  style={{ boxShadow: s.green ? '0 0 8px #10B981' : '0 0 8px #F59E0B' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-text-1">{s.name}</div>
                  <div className="font-mono text-[10.5px] text-text-3 mt-px">{s.detail}</div>
                </div>
                <span className="font-mono text-[11px] font-semibold text-text-2 shrink-0">
                  {t(s.valueKey as Parameters<typeof t>[0])}
                </span>
              </div>
            ))}
          </div>
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
            {cashBoxes.length === 0 ? (
              <p className="text-small text-text-muted">{t('noCashBoxes')}</p>
            ) : (
              cashBoxes.map((box) => (
                <Link key={box.id} href="/dashboard/petty-cash"
                  className="flex items-center justify-between rounded-[10px] border border-border p-2.5 hover:border-border-strong transition-colors">
                  <div>
                    <p className="text-small font-semibold text-text-2">{box.name}</p>
                    <p className="font-mono text-base font-bold text-text-1">${Number(box.balance).toLocaleString()}</p>
                  </div>
                  {Number(box.balance) <= Number(box.lowBalanceThreshold) && (
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
            {['CIFO', 'Audit Agent'].map((agent) => (
              <div key={agent} className="flex items-center justify-between py-1.5">
                <span className="text-small font-medium text-text-2">{agent}</span>
                <span className="flex items-center gap-1.5 text-tiny text-text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
                  {t('phase4')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
