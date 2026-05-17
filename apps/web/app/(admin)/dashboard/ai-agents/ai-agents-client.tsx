'use client';

import * as React from 'react';
import { useState, useCallback, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Label, Input,
} from '@precision/ui';
import {
  Bot, AlertTriangle, MessageCircle, DollarSign, Sparkles,
  ShieldCheck, Shield, Eye, Hand, Play, Lock, Building2,
  Percent, ArrowLeftRight, RefreshCw, Clock, CheckCircle2,
  XCircle, ChevronDown, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────

type ScanFrequency = '15min' | '30min' | '1h' | 'nightly';

interface AgentSettings {
  id: string;
  created_at: string;
  updated_at: string;
  agent_name: string;
  mode_surveillance: boolean;
  mode_semi_autonomous: boolean;
  mode_autonomous: boolean;
  scan_frequency: string;
  scheduled_scan_time: string;
  notify_email: boolean;
  surveillance_active_since: string | null;
  monthly_budget: number;
}

interface AuditFinding {
  id: string;
  created_at: string;
  severity: string;
  module: string;
  description: string;
  suggestion: string | null;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  action_taken: string | null;
  run_id: string | null;
}

interface AuditRun {
  id: string;
  created_at: string;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  findings_count: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
}

interface AgentCosts {
  costs: Array<{ agent_name: string; month: string; total_cost: number; operation_count: number }>;
  budget: number;
  cifoTodayCount: number;
  cifoMonthCount: number;
  cifoMonthCost: number;
  auditMonthCost: number;
  totalMonthCost: number;
  monthScanCount: number;
}

type Tab = 'dashboard' | 'cifo' | 'audit' | 'findings' | 'costs';

interface Props {
  initialSettings: AgentSettings | null;
  initialFindings: AuditFinding[];
  initialRuns: AuditRun[];
  initialCosts: AgentCosts | null;
  initialLastRun: { id: string; completed_at: string; findings_count: number; critical_count: number; warning_count: number; info_count: number } | null;
}

// ─── Helpers ────────────────────────────────────────────────

function fmt2(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

type TFn = (key: string, values?: Record<string, number>) => string;
function fmtRelative(iso: string, t: TFn): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('aiAgents.justNow');
  if (mins < 60) return t('aiAgents.minsAgo', { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('aiAgents.hoursAgo', { n: hrs });
  return t('aiAgents.daysAgo', { n: Math.floor(hrs / 24) });
}

function fmtMonth(dateStr: string, locale: string): string {
  const [year, month] = dateStr.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Toggle switch ──────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  color = 'emerald',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color?: 'emerald' | 'indigo' | 'rose';
}): React.ReactElement {
  const bg = checked
    ? color === 'emerald' ? 'bg-emerald' : color === 'indigo' ? 'bg-brand' : 'bg-rose'
    : 'bg-border';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-200
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${bg}
        ${checked && !disabled ? 'shadow-[0_0_10px_rgba(16,185,129,0.35)]' : ''}
      `}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200
          ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

// ─── KPI Card ───────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  iconColor,
  bgColor,
  label,
  value,
  badge,
  badgeColor,
  subtext,
}: {
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  label: string;
  value: string | number;
  badge?: string;
  badgeColor?: string;
  subtext?: string;
}): React.ReactElement {
  return (
    <div className={`rounded-lg border border-border p-4 ${bgColor}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-surface ${iconColor}`}>
          <Icon className="h-4 w-4" />
        </div>
        {badge && (
          <span className={`text-tiny font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-tiny text-text-3 mb-1">{label}</p>
      <p className="text-xl font-bold text-text-1 font-mono">{value}</p>
      {subtext && <p className="text-tiny text-text-muted mt-1">{subtext}</p>}
    </div>
  );
}

// ─── Main client ────────────────────────────────────────────

export function AiAgentsClient({
  initialSettings,
  initialFindings,
  initialRuns,
  initialCosts,
  initialLastRun,
}: Props): React.ReactElement {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>('dashboard');

  const { data: settings, refetch: refetchSettings } = trpc.aiAgents.getAuditSettings.useQuery(undefined);

  const { data: findings, refetch: refetchFindings } = trpc.aiAgents.listFindings.useQuery(undefined);

  const { data: runs, refetch: refetchRuns } = trpc.aiAgents.listAuditRuns.useQuery(undefined);

  const { data: costs, refetch: refetchCosts } = trpc.aiAgents.getAgentCosts.useQuery(undefined);

  const { data: lastRun } = trpc.aiAgents.getLastAuditRun.useQuery(undefined);

  const pendingFindings = (findings ?? []).filter(f => f.status === 'pending');
  const pendingCount = pendingFindings.length;
  const budget = costs?.budget ?? settings?.monthly_budget ?? 50;

  const refetchAll = useCallback((): void => {
    void refetchSettings();
    void refetchFindings();
    void refetchRuns();
    void refetchCosts();
  }, [refetchSettings, refetchFindings, refetchRuns, refetchCosts]);

  const tabs: Array<{ key: Tab; label: string; badge?: number }> = [
    { key: 'dashboard', label: t('aiAgents.dashboardTab') },
    { key: 'cifo', label: t('aiAgents.cifoTab') },
    { key: 'audit', label: t('aiAgents.auditTab') },
    { key: 'findings', label: t('aiAgents.findingsTab'), badge: pendingCount },
    { key: 'costs', label: t('aiAgents.costsTab') },
  ];

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6 space-y-0 min-h-0">
      {/* Module header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-text-1">{t('aiAgents.title')}</h1>
        <p className="text-small text-text-3">{t('aiAgents.subtitle')}</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-border overflow-x-auto scrollbar-none -mx-3 sm:-mx-6 px-3 sm:px-6 mb-6">
        {tabs.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-small whitespace-nowrap transition-colors border-b-2 -mb-px shrink-0 ${
              tab === key
                ? 'border-brand text-brand font-semibold'
                : 'border-transparent text-text-3 hover:text-text-2'
            }`}
          >
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-rose text-white text-[10px] font-bold leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'dashboard' && (
        <DashboardTab
          settings={settings ?? null}
          allFindings={findings ?? []}
          costs={costs ?? null}
          lastRun={lastRun ?? null}
          onRunNow={() => setTab('audit')}
          onViewFindings={() => setTab('findings')}
          onOpenCifo={() => setTab('cifo')}
          budget={budget}
        />
      )}
      {tab === 'cifo' && (
        <CifoTab costs={costs ?? null} />
      )}
      {tab === 'audit' && (
        <AuditAgentTab
          settings={settings ?? null}
          runs={runs ?? []}
          onSettingsSaved={refetchAll}
          onScanComplete={refetchAll}
          onViewFindings={() => setTab('findings')}
        />
      )}
      {tab === 'findings' && (
        <HallazgosTab
          allFindings={findings ?? []}
          settings={settings ?? null}
          onResolved={refetchAll}
        />
      )}
      {tab === 'costs' && (
        <CostosTab
          costs={costs ?? null}
          onBudgetSaved={refetchAll}
        />
      )}
    </div>
  );
}

// ─── Tab: Dashboard ─────────────────────────────────────────

function DashboardTab({
  settings,
  allFindings,
  costs,
  lastRun,
  onRunNow,
  onViewFindings,
  onOpenCifo,
  budget,
}: {
  settings: AgentSettings | null;
  allFindings: AuditFinding[];
  costs: AgentCosts | null;
  lastRun: { completed_at: string; critical_count: number; warning_count: number } | null;
  onRunNow: () => void;
  onViewFindings: () => void;
  onOpenCifo: () => void;
  budget: number;
}): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();

  const pendingCount = allFindings.filter(f => f.status === 'pending').length;
  const criticalCount = allFindings.filter(f => f.status === 'pending' && f.severity === 'critical').length;
  const warningCount = allFindings.filter(f => f.status === 'pending' && f.severity === 'warning').length;
  const totalMonthCost = costs?.totalMonthCost ?? 0;
  const cifoTodayCount = costs?.cifoTodayCount ?? 0;

  const auditRunning = settings?.mode_surveillance ?? true;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Bot}
          iconColor="text-emerald"
          bgColor="bg-emerald/[0.06]"
          label={t('aiAgents.agentsActive')}
          value={2}
          badge="ACTIVO"
          badgeColor="bg-emerald/15 text-emerald"
        />
        <KpiCard
          icon={AlertTriangle}
          iconColor={pendingCount > 0 ? 'text-rose' : 'text-emerald'}
          bgColor={pendingCount > 0 ? 'bg-rose/[0.06]' : 'bg-emerald/[0.06]'}
          label={t('aiAgents.openFindings')}
          value={pendingCount}
          badge={pendingCount > 0 ? t('aiAgents.toReview') : 'OK'}
          badgeColor={pendingCount > 0 ? 'bg-rose/15 text-rose' : 'bg-emerald/15 text-emerald'}
        />
        <KpiCard
          icon={MessageCircle}
          iconColor="text-cyan"
          bgColor="bg-cyan/[0.06]"
          label={t('aiAgents.cifoQueriesToday')}
          value={cifoTodayCount}
        />
        <KpiCard
          icon={DollarSign}
          iconColor="text-amber"
          bgColor="bg-amber/[0.06]"
          label={t('aiAgents.monthCost')}
          value={fmt2(totalMonthCost)}
          subtext={`de $${budget.toFixed(2)} presupuesto`}
        />
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* CIFO Card */}
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%)',
            borderColor: 'rgba(99,102,241,0.25)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #6366F1, #06B6D4)',
                  boxShadow: '0 0 20px rgba(99,102,241,0.35)',
                }}
              >
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-small font-bold text-text-1">CIFO</p>
                <p className="text-tiny text-text-3">{t('aiAgents.cifoSubtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
              <span className="text-tiny text-emerald font-medium">{t('aiAgents.active')}</span>
            </div>
          </div>

          {/* CIFO stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t('aiAgents.queriesDay'), value: String(cifoTodayCount), color: 'text-cyan' },
              { label: t('aiAgents.queryMonth'), value: String(costs?.cifoMonthCount ?? 0), color: 'text-cyan' },
              { label: t('aiAgents.costMonthLabel'), value: fmt2(costs?.cifoMonthCost ?? 0), color: 'text-emerald' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-surface/50 px-3 py-2 text-center">
                <p className={`text-base font-bold font-mono ${color}`}>{value}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Last conversation */}
          <div className="rounded-lg bg-black/20 px-3 py-2.5">
            <p className="text-tiny text-text-muted">{t('aiAgents.lastConversationLabel')}</p>
            <p className="text-tiny text-text-2 mt-0.5 italic">
              {(costs?.cifoMonthCount ?? 0) > 0
                ? '¿Cuántos empleados hay en Bolivia?'
                : t('aiAgents.noConversationsYet')}
            </p>
          </div>

          <button
            onClick={onOpenCifo}
            className="w-full rounded-lg border px-3 py-2 text-small font-medium text-brand hover:bg-brand/10 transition-colors"
            style={{ borderColor: 'rgba(99,102,241,0.4)' }}
          >
            {t('aiAgents.openCifo')}
          </button>
        </div>

        {/* Audit Agent Card */}
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(244,63,94,0.08) 100%)',
            borderColor: 'rgba(245,158,11,0.25)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #F59E0B, #F43F5E)',
                  boxShadow: '0 0 20px rgba(245,158,11,0.35)',
                }}
              >
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-small font-bold text-text-1">Audit Agent</p>
                <p className="text-tiny text-text-3">{t('aiAgents.auditSubtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {criticalCount > 0 ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber animate-pulse" />
                  <span className="text-tiny text-amber font-medium">{criticalCount} críticos</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald" />
                  <span className="text-tiny text-emerald font-medium">{t('aiAgents.noFindingsStatus')}</span>
                </>
              )}
            </div>
          </div>

          {/* Audit stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t('aiAgents.criticalFindingsLabel'), value: String(criticalCount), color: 'text-rose' },
              { label: t('aiAgents.warningFindingsLabel'), value: String(warningCount), color: 'text-amber' },
              { label: t('aiAgents.costMonthLabel'), value: fmt2(costs?.auditMonthCost ?? 0), color: 'text-emerald' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-surface/50 px-3 py-2 text-center">
                <p className={`text-base font-bold font-mono ${color}`}>{value}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Latest findings preview */}
          {allFindings.filter(f => f.status === 'pending').slice(0, 2).map(f => (
            <FindingPill key={f.id} finding={f} />
          ))}
          {allFindings.filter(f => f.status === 'pending').length === 0 && (
            <div className="rounded-lg bg-black/20 px-3 py-2.5 text-center">
              <p className="text-tiny text-text-muted">{t('aiAgents.noFindingsStatus')}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={onViewFindings}
              className="flex-1 rounded-lg border px-3 py-2 text-small font-medium text-amber hover:bg-amber/10 transition-colors"
              style={{ borderColor: 'rgba(245,158,11,0.4)' }}
            >
              {t('aiAgents.viewFindingsBtn')}
            </button>
            <button
              onClick={onRunNow}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-small font-medium text-brand hover:bg-brand/10 transition-colors"
              style={{ borderColor: 'rgba(99,102,241,0.4)' }}
            >
              <Play className="h-3.5 w-3.5" />
              {t('aiAgents.runNowBtn')}
            </button>
          </div>
        </div>
      </div>

      {/* Last audit summary bar */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-small font-semibold text-text-1">{t('aiAgents.lastAuditTitle')}</p>
          {lastRun?.completed_at ? (
            <span className="font-mono text-tiny text-text-muted">
              {t('dashboard.today')} {fmtTime(lastRun.completed_at, locale)}
            </span>
          ) : (
            <span className="text-tiny text-text-muted">{t('aiAgents.noAuditYet')}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: t('aiAgents.finanzasReviewed'), ok: lastRun ? lastRun.critical_count === 0 : true },
            { label: t('aiAgents.paymentsVerified'), ok: lastRun ? (lastRun.critical_count === 0) : true },
            { label: t('aiAgents.pettyCashChecked'), ok: lastRun ? true : true },
            { label: t('aiAgents.commissionsOk'), ok: lastRun ? lastRun.warning_count === 0 : true },
            { label: t('aiAgents.hipaaOk'), ok: true },
          ].map(({ label, ok }) => (
            <span
              key={label}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-tiny font-medium ${
                ok
                  ? 'bg-emerald/12 text-emerald'
                  : 'bg-rose/12 text-rose'
              }`}
            >
              {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {label}
            </span>
          ))}
          {lastRun && !auditRunning && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-tiny font-medium bg-amber/12 text-amber">
              Vigilancia desactivada
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Finding pill (small) ────────────────────────────────────

function FindingPill({ finding }: { finding: AuditFinding }): React.ReactElement {
  const t = useTranslations();
  const borderColor = finding.severity === 'critical' ? 'rgba(244,63,94,0.4)' : 'rgba(245,158,11,0.4)';
  const textColor = finding.severity === 'critical' ? 'text-rose' : 'text-amber';
  return (
    <div
      className="rounded-lg bg-black/20 border px-3 py-2"
      style={{ borderColor }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${textColor}`}>
          {finding.severity === 'critical' ? 'CRÍTICO' : 'ADVERTENCIA'}
        </span>
        <span className="text-tiny text-text-muted font-mono">{fmtRelative(finding.created_at, t)}</span>
      </div>
      <p className="text-tiny text-text-2 line-clamp-1">{finding.description}</p>
    </div>
  );
}

// ─── Tab: CIFO ──────────────────────────────────────────────

function fmtRelativeSimple(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

function CifoTab({ costs }: { costs: AgentCosts | null }): React.ReactElement {
  const t = useTranslations();
  const { data: conversations = [], isLoading: convsLoading } = trpc.aiAgents.getCifoConversations.useQuery();

  const openSession = (sessionId: string): void => {
    window.dispatchEvent(new CustomEvent('cifo:open-session', { detail: { sessionId } }));
  };

  return (
    <div className="space-y-5">
      {/* Stats banner */}
      <div
        className="rounded-xl border p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(6,182,212,0.08) 100%)',
          borderColor: 'rgba(99,102,241,0.25)',
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, #6366F1, #06B6D4)', boxShadow: '0 0 16px rgba(99,102,241,0.35)' }}
          >
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-small font-bold text-text-1">CIFO</p>
            <p className="text-tiny text-text-3">{t('aiAgents.cifoSubtitle')}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
            <span className="text-tiny text-emerald font-medium">{t('aiAgents.active')}</span>
          </div>
        </div>

        <p className="text-small font-semibold text-text-1 mb-3">{t('aiAgents.cifoStatsTitle')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Consultas hoy', value: String(costs?.cifoTodayCount ?? 0), color: 'text-cyan' },
            { label: 'Consultas este mes', value: String(costs?.cifoMonthCount ?? 0), color: 'text-cyan' },
            { label: 'Costo este mes', value: fmt2(costs?.cifoMonthCost ?? 0), color: 'text-emerald' },
            { label: 'Promedio / consulta', value: '$0.00', color: 'text-amber' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-surface/60 px-3 py-3 text-center">
              <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
              <p className="text-[10px] text-text-muted mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Hint to use FAB */}
      <div className="rounded-xl border border-border bg-surface p-5 flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-brand/30 bg-brand/10">
          <MessageCircle className="h-5 w-5 text-brand" />
        </div>
        <div>
          <p className="text-small font-semibold text-text-1 mb-1">Iniciar conversación con CIFO</p>
          <p className="text-tiny text-text-3 max-w-sm">{t('aiAgents.openFabHint')}</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/25">
          <span className="text-tiny text-brand font-medium">Busca el botón</span>
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand">
            <Sparkles className="h-2.5 w-2.5 text-white" />
          </div>
          <span className="text-tiny text-brand font-medium">en la esquina inferior derecha</span>
        </div>
      </div>

      {/* Conversations list */}
      <div>
        <p className="text-small font-semibold text-text-1 mb-3">{t('aiAgents.cifoConversations')}</p>
        {convsLoading ? (
          <div className="rounded-xl border border-border bg-surface py-8 flex items-center justify-center">
            <span className="text-tiny text-text-muted animate-pulse">Cargando...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface py-10 flex flex-col items-center gap-2">
            <MessageCircle className="h-8 w-8 text-text-muted" />
            <p className="text-small text-text-3">{t('aiAgents.noCifoConversations')}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
            {conversations.map(conv => (
              <button
                key={conv.session_id}
                onClick={() => openSession(conv.session_id)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface/80 transition-colors"
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5"
                  style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.10))', border: '1px solid rgba(99,102,241,0.20)' }}
                >
                  <MessageCircle className="h-3.5 w-3.5 text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-small text-text-1 truncate">{conv.first_message || '—'}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    {conv.message_count} mensajes · {fmtRelativeSimple(conv.last_message_at)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Audit Agent ────────────────────────────────────────

const SCAN_STEPS = [
  { key: 'cash',        icon: Building2,     label: 'Verificando cajas chicas',        ms: 350 },
  { key: 'payments',    icon: DollarSign,    label: 'Detectando pagos duplicados',     ms: 850 },
  { key: 'fx',          icon: ArrowLeftRight,label: 'Analizando operaciones FX',       ms: 1350 },
  { key: 'commissions', icon: Percent,       label: 'Revisando comisiones',            ms: 1800 },
  { key: 'ai',          icon: Sparkles,      label: 'Análisis IA con OpenRouter',      ms: 2300 },
] as const;

function AuditAgentTab({
  settings,
  runs,
  onSettingsSaved,
  onScanComplete,
  onViewFindings,
}: {
  settings: AgentSettings | null;
  runs: AuditRun[];
  onSettingsSaved: () => void;
  onScanComplete: () => void;
  onViewFindings: () => void;
}): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();

  const [local, setLocal] = useState<{
    modeSurveillance: boolean;
    modeSemiAutonomous: boolean;
    modeAutonomous: boolean;
    scanFrequency: ScanFrequency;
    scheduledScanTime: string;
    notifyEmail: boolean;
  }>({
    modeSurveillance: settings?.mode_surveillance ?? true,
    modeSemiAutonomous: settings?.mode_semi_autonomous ?? false,
    modeAutonomous: settings?.mode_autonomous ?? false,
    scanFrequency: (settings?.scan_frequency as ScanFrequency | undefined) ?? '30min',
    scheduledScanTime: settings?.scheduled_scan_time ?? '02:00',
    notifyEmail: settings?.notify_email ?? true,
  });

  const [showSemiConfirm, setShowSemiConfirm] = useState(false);
  const [showAutoConfirm, setShowAutoConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [scanPending, setScanPending] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [scanResult, setScanResult] = useState<{
    findings_count: number; critical_count: number; warning_count: number; info_count: number;
  } | null>(null);
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const surveillanceDays = daysSince(settings?.surveillance_active_since ?? null);
  const autonomousLocked = surveillanceDays < 7;

  const saveSettings = trpc.aiAgents.saveAuditSettings.useMutation({
    onSuccess: () => { toast.success(t('aiAgents.settingsSaved')); onSettingsSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const handleRunScan = async (): Promise<void> => {
    setScanPending(true);
    setVisibleSteps(0);
    setScanResult(null);

    // Schedule step reveals
    stepTimers.current = SCAN_STEPS.map((step, i) =>
      setTimeout(() => setVisibleSteps(i + 1), step.ms),
    );

    try {
      const res = await fetch('/api/audit/run', { method: 'POST' });
      const data = await res.json() as {
        findings_count?: number; critical_count?: number;
        warning_count?: number; info_count?: number; error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Error al ejecutar el escaneo');

      // Clear pending timers and snap all steps to done
      stepTimers.current.forEach(clearTimeout);
      setVisibleSteps(SCAN_STEPS.length);
      setScanResult({
        findings_count: data.findings_count ?? 0,
        critical_count:  data.critical_count  ?? 0,
        warning_count:   data.warning_count   ?? 0,
        info_count:      data.info_count      ?? 0,
      });
      toast.success(`${t('aiAgents.scanCompleted')} · ${data.findings_count ?? 0} hallazgos`);
      onScanComplete();
    } catch (err) {
      stepTimers.current.forEach(clearTimeout);
      setVisibleSteps(SCAN_STEPS.length);
      toast.error(err instanceof Error ? err.message : 'Error al ejecutar el escaneo');
    } finally {
      setScanPending(false);
    }
  };

  const handleToggle = (key: keyof typeof local, value: boolean): void => {
    if (key === 'modeSemiAutonomous' && value) {
      setShowSemiConfirm(true);
      return;
    }
    if (key === 'modeAutonomous' && value) {
      setShowAutoConfirm(true);
      return;
    }
    const next = { ...local, [key]: value };
    setLocal(next);
    saveSettings.mutate(next);
  };

  const confirmSemi = (): void => {
    const next = { ...local, modeSemiAutonomous: true };
    setLocal(next);
    setShowSemiConfirm(false);
    saveSettings.mutate(next);
  };

  const confirmAuto = (): void => {
    const next = { ...local, modeAutonomous: true };
    setLocal(next);
    setShowAutoConfirm(false);
    saveSettings.mutate(next);
  };

  const handleConfigChange = (patch: Partial<typeof local>): void => {
    const next = { ...local, ...patch };
    setLocal(next);
    saveSettings.mutate(next);
  };

  const CHECKS = [
    { icon: Building2, label: t('aiAgents.checkCajachica'), desc: t('aiAgents.checkCajachicaDesc') },
    { icon: DollarSign, label: t('aiAgents.checkTransacciones'), desc: t('aiAgents.checkTransaccionesDesc') },
    { icon: Bot, label: t('aiAgents.checkEmpleados'), desc: t('aiAgents.checkEmpleadosDesc') },
    { icon: Percent, label: t('aiAgents.checkComisiones'), desc: t('aiAgents.checkComisionesDesc') },
    { icon: ArrowLeftRight, label: t('aiAgents.checkFx'), desc: t('aiAgents.checkFxDesc') },
    { icon: Shield, label: t('aiAgents.checkHipaa'), desc: t('aiAgents.checkHipaaDesc') },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Operation Mode */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <p className="text-small font-semibold text-text-1">{t('aiAgents.operationMode')}</p>

        {/* Toggle 1: Vigilancia 24/7 */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Eye className={`h-4 w-4 shrink-0 ${local.modeSurveillance ? 'text-cyan' : 'text-text-muted'}`} />
            <div className="min-w-0">
              <p className={`text-small font-medium ${local.modeSurveillance ? 'text-cyan' : 'text-text-2'}`}>
                {t('aiAgents.surveillance24')}
              </p>
              <p className="text-tiny text-text-muted">{t('aiAgents.surveillanceDesc')}</p>
            </div>
          </div>
          <ToggleSwitch
            checked={local.modeSurveillance}
            onChange={(v) => handleToggle('modeSurveillance', v)}
          />
        </div>

        <div className="h-px bg-border" />

        {/* Toggle 2: Semi-autónomo */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Hand className={`h-4 w-4 shrink-0 ${local.modeSemiAutonomous ? 'text-brand' : 'text-text-muted'}`} />
            <div className="min-w-0">
              <p className={`text-small font-medium ${local.modeSemiAutonomous ? 'text-brand' : 'text-text-2'}`}>
                {t('aiAgents.semiAutonomous')}
              </p>
              <p className="text-tiny text-text-muted">{t('aiAgents.semiAutonomousDesc')}</p>
            </div>
          </div>
          <ToggleSwitch
            checked={local.modeSemiAutonomous}
            onChange={(v) => handleToggle('modeSemiAutonomous', v)}
            color="indigo"
          />
        </div>

        <div className="h-px bg-border" />

        {/* Toggle 3: Autónomo total */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Bot className={`h-4 w-4 shrink-0 ${local.modeAutonomous ? 'text-rose' : 'text-text-muted'}`} />
            <div className="min-w-0">
              <p className={`text-small font-medium ${autonomousLocked ? 'text-text-muted' : local.modeAutonomous ? 'text-rose' : 'text-text-2'}`}>
                {t('aiAgents.fullyAutonomous')}
              </p>
              <p className="text-tiny text-text-muted">{t('aiAgents.fullyAutonomousDesc')}</p>
              {autonomousLocked && (
                <p className="text-[10px] text-amber mt-0.5">
                  {surveillanceDays === 0
                    ? t('aiAgents.lockedTooltip')
                    : `${7 - surveillanceDays} días restantes para desbloquearse`}
                </p>
              )}
            </div>
          </div>
          {autonomousLocked ? (
            <div className="flex items-center gap-1.5 opacity-40">
              <Lock className="h-3.5 w-3.5 text-text-muted" />
              <span className="h-6 w-11 rounded-full bg-border" />
            </div>
          ) : (
            <ToggleSwitch
              checked={local.modeAutonomous}
              onChange={(v) => handleToggle('modeAutonomous', v)}
              color="rose"
            />
          )}
        </div>
      </div>

      {/* Scan Configuration */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <p className="text-small font-semibold text-text-1">{t('aiAgents.scanConfigTitle')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-tiny text-text-3">{t('aiAgents.scanFrequencyLabel')}</Label>
            <Select
              value={local.scanFrequency}
              onValueChange={(v) => handleConfigChange({ scanFrequency: v as ScanFrequency })}
            >
              <SelectTrigger className="h-9 text-small">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15min">{t('aiAgents.freq15min')}</SelectItem>
                <SelectItem value="30min">{t('aiAgents.freq30min')}</SelectItem>
                <SelectItem value="1h">{t('aiAgents.freq1h')}</SelectItem>
                <SelectItem value="nightly">{t('aiAgents.freqNightly')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-tiny text-text-3">{t('aiAgents.scheduledTimeLabel')}</Label>
            <Input
              type="time"
              value={local.scheduledScanTime}
              onChange={(e) => handleConfigChange({ scheduledScanTime: e.target.value })}
              className="h-9 text-small font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label className="text-small text-text-2 cursor-pointer">{t('aiAgents.notifyEmailLabel')}</Label>
          <ToggleSwitch
            checked={local.notifyEmail}
            onChange={(v) => handleConfigChange({ notifyEmail: v })}
          />
        </div>
      </div>

      {/* Manual Execution */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <p className="text-small font-semibold text-text-1">{t('aiAgents.manualExecTitle')}</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            className="flex-1 sm:flex-none"
            loading={scanPending}
            disabled={scanPending}
            onClick={() => { void handleRunScan(); }}
          >
            <Play className="h-4 w-4" />
            {scanPending ? t('aiAgents.scanRunning') : t('aiAgents.runScanBtn')}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5"
          >
            <Clock className="h-4 w-4" />
            {t('aiAgents.viewHistoryBtn')}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Scan progress panel */}
        {(scanPending || scanResult !== null) && (
          <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface/60">
              {scanPending ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-brand animate-pulse shrink-0" />
                  <span className="text-small font-medium text-brand">Escaneo en progreso...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald shrink-0" />
                  <span className="text-small font-medium text-emerald">Escaneo completado</span>
                </>
              )}
            </div>

            {/* Steps */}
            <div className="px-4 py-3 space-y-2">
              {SCAN_STEPS.map((step, i) => {
                const revealed = i < visibleSteps;
                const isActive = scanPending && i === visibleSteps - 1;
                const Icon = step.icon;
                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-3 transition-all duration-300 ${
                      revealed ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 overflow-hidden'
                    }`}
                  >
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full shrink-0 transition-colors ${
                      isActive ? 'bg-brand/15' : revealed ? 'bg-emerald/15' : 'bg-border/50'
                    }`}>
                      {isActive
                        ? <RefreshCw className="h-3 w-3 text-brand animate-spin" />
                        : <CheckCircle2 className="h-3 w-3 text-emerald" />
                      }
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-brand' : 'text-text-muted'}`} />
                      <span className={`text-small ${isActive ? 'text-brand font-medium' : 'text-text-2'}`}>
                        {step.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Result summary */}
            {scanResult !== null && (
              <div className="px-4 pb-4 space-y-2">
                {/* Severity badges row */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                  {scanResult.findings_count === 0 ? (
                    <span className="text-tiny font-medium text-emerald">Sin hallazgos — sistema OK</span>
                  ) : (
                    <>
                      <span className="text-tiny text-text-muted font-mono">
                        {scanResult.findings_count} hallazgo{scanResult.findings_count !== 1 ? 's' : ''}:
                      </span>
                      {scanResult.critical_count > 0 && (
                        <span className="text-tiny font-semibold text-rose bg-rose/10 px-2 py-0.5 rounded-full">
                          {scanResult.critical_count} crítico{scanResult.critical_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {scanResult.warning_count > 0 && (
                        <span className="text-tiny font-semibold text-amber bg-amber/10 px-2 py-0.5 rounded-full">
                          {scanResult.warning_count} advertencia{scanResult.warning_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {scanResult.info_count > 0 && (
                        <span className="text-tiny font-semibold text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded-full">
                          {scanResult.info_count} info
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* CTA — only show when there are findings */}
                {scanResult.findings_count > 0 && (
                  <button
                    onClick={onViewFindings}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-brand/8 px-3 py-2 text-small font-medium text-brand hover:bg-brand/15 transition-colors"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Ver detalle de hallazgos
                    <span className="ml-auto text-tiny opacity-60">→ tab Hallazgos</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {showHistory && runs.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-border bg-surface/60">
                  <th className="text-left px-3 py-2 text-tiny text-text-muted font-medium">{t('aiAgents.colStart')}</th>
                  <th className="text-left px-3 py-2 text-tiny text-text-muted font-medium">{t('common.type')}</th>
                  <th className="text-left px-3 py-2 text-tiny text-text-muted font-medium">{t('aiAgents.findingsTab')}</th>
                  <th className="text-right px-3 py-2 text-tiny text-text-muted font-medium">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 8).map((run) => (
                  <tr key={run.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-tiny text-text-2">
                      {new Date(run.started_at).toLocaleDateString(locale, { day: '2-digit', month: 'short' })} {fmtTime(run.started_at, locale)}
                    </td>
                    <td className="px-3 py-2 text-tiny text-text-3 capitalize">{run.triggered_by}</td>
                    <td className="px-3 py-2 text-tiny">
                      {run.critical_count > 0 && <span className="text-rose font-semibold">{run.critical_count}C </span>}
                      {run.warning_count > 0 && <span className="text-amber">{run.warning_count}W </span>}
                      {run.findings_count === 0 && <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-[10px] font-semibold ${run.status === 'completed' ? 'text-emerald' : run.status === 'failed' ? 'text-rose' : 'text-amber'}`}>
                        {run.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showHistory && runs.length === 0 && (
          <p className="text-tiny text-text-muted text-center py-4">{t('aiAgents.noRunsYet')}</p>
        )}
      </div>

      {/* What the agent checks */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-small font-semibold text-text-1 mb-4">{t('aiAgents.auditChecksTitle')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CHECKS.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3 rounded-lg border border-border/50 bg-surface/50 p-3">
              <Icon className="h-4 w-4 text-brand shrink-0 mt-0.5" />
              <div>
                <p className="text-small font-medium text-text-2">{label}</p>
                <p className="text-tiny text-text-muted mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Semi-autonomous confirmation */}
      <Dialog open={showSemiConfirm} onOpenChange={(o) => { if (!o) setShowSemiConfirm(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('aiAgents.semiAutoConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-small text-text-3 leading-relaxed">{t('aiAgents.semiAutoConfirmBody')}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSemiConfirm(false)}>{t('common.cancel')}</Button>
            <Button onClick={confirmSemi}>{t('aiAgents.activate')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Autonomous confirmation */}
      <Dialog open={showAutoConfirm} onOpenChange={(o) => { if (!o) setShowAutoConfirm(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('aiAgents.autoConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-small text-text-3">
            <div className="rounded-lg border border-emerald/25 bg-emerald/8 p-3">
              <p className="font-semibold text-emerald mb-2">{t('aiAgents.agentCanDo')}</p>
              <ul className="space-y-1 text-text-2 text-tiny">
                <li>• Crear hallazgos y enviar notificaciones</li>
                <li>• Marcar pagos duplicados como revisados</li>
                <li>• Registrar notas de auditoría</li>
              </ul>
            </div>
            <div className="rounded-lg border border-rose/25 bg-rose/8 p-3">
              <p className="font-semibold text-rose mb-2">{t('aiAgents.agentCannotDo')}</p>
              <ul className="space-y-1 text-text-2 text-tiny">
                <li>• Eliminar o modificar pagos</li>
                <li>• Cambiar configuraciones del sistema</li>
                <li>• Acceder a datos de pacientes</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAutoConfirm(false)}>{t('common.cancel')}</Button>
            <Button onClick={confirmAuto}>Activar modo autónomo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Hallazgos ──────────────────────────────────────────

function HallazgosTab({
  allFindings,
  settings,
  onResolved,
}: {
  allFindings: AuditFinding[];
  settings: AgentSettings | null;
  onResolved: () => void;
}): React.ReactElement {
  const t = useTranslations();
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterModule, setFilterModule] = useState('all');
  const [filterStatus, setFilterStatus] = useState('pending');

  const isSemiAutonomous = settings?.mode_semi_autonomous ?? false;

  const resolve = trpc.aiAgents.resolveFinding.useMutation({
    onSuccess: (d) => {
      toast.success(d.status === 'resolved' ? t('aiAgents.findingResolved') : t('aiAgents.findingIgnored'));
      onResolved();
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = allFindings.filter(f => {
    if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false;
    if (filterModule !== 'all' && f.module !== filterModule) return false;
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    return true;
  });

  const modules = Array.from(new Set(allFindings.map(f => f.module)));

  const MODULE_LABELS: Record<string, string> = {
    caja_chica: 'Caja Chica',
    empleados: 'Empleados',
    comisiones: 'Comisiones',
    fx: 'FX',
    hipaa: 'HIPAA',
    finanzas: 'Finanzas',
    sistema: 'Sistema',
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Severity filter */}
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          {[
            { key: 'all', label: t('aiAgents.filterAll') },
            { key: 'critical', label: t('aiAgents.filterCritical') },
            { key: 'warning', label: t('aiAgents.filterWarning') },
            { key: 'info', label: t('aiAgents.filterInfo') },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterSeverity(key)}
              className={`px-3 py-1.5 text-tiny border-r border-border last:border-r-0 transition-colors ${
                filterSeverity === key ? 'bg-brand/15 text-brand font-semibold' : 'text-text-3 hover:text-text-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Module filter */}
        {modules.length > 0 && (
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="h-8 text-tiny w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('aiAgents.moduleAll')}</SelectItem>
              {modules.map(m => (
                <SelectItem key={m} value={m}>{MODULE_LABELS[m] ?? m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Status filter */}
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          {[
            { key: 'pending', label: t('aiAgents.filterPending') },
            { key: 'resolved', label: t('aiAgents.filterResolved') },
            { key: 'ignored', label: t('aiAgents.filterIgnored') },
            { key: 'all', label: t('aiAgents.filterAll') },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1.5 text-tiny border-r border-border last:border-r-0 transition-colors ${
                filterStatus === key ? 'bg-brand/15 text-brand font-semibold' : 'text-text-3 hover:text-text-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-tiny text-text-muted font-mono">
          {filtered.length} {t('aiAgents.findingsCountLabel')}
        </span>
      </div>

      {/* Findings list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 flex flex-col items-center gap-3 text-center">
          <ShieldCheck className="h-10 w-10 text-emerald" />
          <p className="text-small font-medium text-text-2">{t('aiAgents.noFindingsPending')}</p>
          <p className="text-tiny text-text-muted">{t('aiAgents.noFindingsSubtext')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(finding => (
            <FindingCard
              key={finding.id}
              finding={finding}
              isSemiAutonomous={isSemiAutonomous}
              onResolve={(action) => resolve.mutate({ id: finding.id, action })}
              isResolving={resolve.isPending && resolve.variables?.id === finding.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Finding Card (full) ─────────────────────────────────────

function FindingCard({
  finding,
  isSemiAutonomous,
  onResolve,
  isResolving,
}: {
  finding: AuditFinding;
  isSemiAutonomous: boolean;
  onResolve: (action: 'resolved' | 'ignored') => void;
  isResolving: boolean;
}): React.ReactElement {
  const t = useTranslations();
  const isResolved = finding.status !== 'pending';

  const accentColor =
    finding.severity === 'critical' ? '#F43F5E'
    : finding.severity === 'warning' ? '#F59E0B'
    : '#06B6D4';

  const MODULE_LABELS: Record<string, string> = {
    caja_chica: 'CAJA CHICA', empleados: 'EMPLEADOS', comisiones: 'COMISIONES',
    fx: 'FX', hipaa: 'HIPAA', finanzas: 'FINANZAS', sistema: 'SISTEMA',
  };

  const severityLabel =
    finding.severity === 'critical' ? t('aiAgents.severityCritical')
    : finding.severity === 'warning' ? t('aiAgents.severityWarning')
    : t('aiAgents.severityInfo');

  return (
    <div
      className={`rounded-xl border bg-surface overflow-hidden transition-opacity ${isResolved ? 'opacity-60' : ''}`}
      style={{ borderColor: `${accentColor}33` }}
    >
      <div className="flex">
        {/* Left accent bar */}
        <div className="w-1 shrink-0 rounded-l-xl" style={{ backgroundColor: accentColor }} />

        <div className="flex-1 p-4 space-y-2.5">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ color: accentColor, background: `${accentColor}18` }}
            >
              {severityLabel}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-border text-text-3">
              {MODULE_LABELS[finding.module] ?? finding.module.toUpperCase()}
            </span>
            <span className="ml-auto font-mono text-tiny text-text-muted">
              {fmtRelative(finding.created_at, t)}
            </span>
          </div>

          {/* Description */}
          <p className="text-small font-medium text-text-1 leading-relaxed">{finding.description}</p>

          {/* Suggestion */}
          {finding.suggestion && (
            <p className="text-tiny text-text-muted italic">
              💡 {t('aiAgents.suggestionLabel')}: {finding.suggestion}
            </p>
          )}

          {/* Action buttons */}
          {!isResolved && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {isSemiAutonomous ? (
                <>
                  <button
                    disabled={isResolving}
                    onClick={() => onResolve('resolved')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald/40 bg-emerald/8 text-tiny font-medium text-emerald hover:bg-emerald/15 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t('aiAgents.approveAndExecute')}
                  </button>
                  <button
                    disabled={isResolving}
                    onClick={() => onResolve('ignored')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose/40 bg-rose/8 text-tiny font-medium text-rose hover:bg-rose/15 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {t('aiAgents.rejectAction')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={isResolving}
                    onClick={() => onResolve('resolved')}
                    className="px-3 py-1.5 rounded-lg border border-border text-tiny font-medium text-text-2 hover:text-text-1 hover:border-border-strong transition-colors disabled:opacity-50"
                  >
                    {t('aiAgents.markResolved')}
                  </button>
                  <button
                    disabled={isResolving}
                    onClick={() => onResolve('ignored')}
                    className="px-3 py-1.5 rounded-lg text-tiny text-text-muted hover:text-text-3 transition-colors disabled:opacity-50"
                  >
                    {t('aiAgents.ignoreAction')}
                  </button>
                </>
              )}
            </div>
          )}

          {isResolved && (
            <p className="text-tiny text-text-muted italic">
              {finding.status === 'resolved' ? t('aiAgents.resolvedLabel') : t('aiAgents.ignoredLabel')}{finding.resolved_at ? ` · ${fmtRelative(finding.resolved_at, t)}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Costos ─────────────────────────────────────────────

function CostosTab({
  costs,
  onBudgetSaved,
}: {
  costs: AgentCosts | null;
  onBudgetSaved: () => void;
}): React.ReactElement {
  const t = useTranslations();
  const [budgetInput, setBudgetInput] = useState(String(costs?.budget ?? 50));

  const budget = costs?.budget ?? 50;
  const totalMonthCost = costs?.totalMonthCost ?? 0;
  const budgetPct = Math.min(100, (totalMonthCost / Math.max(0.01, budget)) * 100);

  const saveBudget = trpc.aiAgents.saveBudget.useMutation({
    onSuccess: () => { toast.success(t('aiAgents.budgetSaved')); onBudgetSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const now = new Date();
  const months: Array<{ label: string; key: string; cifo: number; audit: number }> = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().split('T')[0] as string;
    const shortKey = key.slice(0, 7);
    months.push({
      label: d.toLocaleDateString('es', { month: 'short', year: '2-digit' }),
      key: shortKey,
      cifo: Number((costs?.costs ?? []).find(c => c.agent_name === 'cifo' && c.month.startsWith(shortKey))?.total_cost ?? 0),
      audit: Number((costs?.costs ?? []).find(c => c.agent_name === 'audit_agent' && c.month.startsWith(shortKey))?.total_cost ?? 0),
    });
  }

  return (
    <div className="space-y-5">
      {/* Header + total */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-small text-text-3 mb-1">{t('aiAgents.costsTitle')} · {new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' })}</p>
            <p className="text-3xl font-bold font-mono text-text-1">{fmt2(totalMonthCost)}</p>
            <p className="text-tiny text-text-muted mt-1">{t('aiAgents.totalCostMonth')}</p>
          </div>
          <div className={`flex items-center gap-1.5 text-tiny font-medium px-2.5 py-1 rounded-full ${
            budgetPct >= 90 ? 'bg-rose/12 text-rose' : budgetPct >= 70 ? 'bg-amber/12 text-amber' : 'bg-emerald/12 text-emerald'
          }`}>
            <TrendingUp className="h-3.5 w-3.5" />
            {budgetPct.toFixed(0)}%
          </div>
        </div>

        {/* Budget bar */}
        <div>
          <div className="flex items-center justify-between text-tiny text-text-muted mb-1.5">
            <span>{fmt2(totalMonthCost)} {t('aiAgents.budgetProgress')}</span>
            <span className="font-mono">{fmt2(budget)}</span>
          </div>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                budgetPct >= 90 ? 'bg-rose' : budgetPct >= 70 ? 'bg-amber' : 'bg-brand'
              }`}
              style={{ width: `${budgetPct}%`, background: budgetPct < 70 ? 'linear-gradient(90deg, #6366F1, #06B6D4)' : undefined }}
            />
          </div>
        </div>
      </div>

      {/* Per-agent cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* CIFO */}
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.04)' }}>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <p className="text-small font-semibold text-text-1">CIFO</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-tiny">
              <span className="text-text-muted">{t('common.total')}</span>
              <span className="font-mono font-semibold text-text-1">{fmt2(costs?.cifoMonthCost ?? 0)}</span>
            </div>
            <div className="flex justify-between text-tiny">
              <span className="text-text-muted">{t('aiAgents.avgPerConversation')}</span>
              <span className="font-mono text-text-2">
                {costs && (costs.cifoMonthCount ?? 0) > 0
                  ? fmt2((costs.cifoMonthCost ?? 0) / (costs.cifoMonthCount ?? 1))
                  : '$0.00'}
              </span>
            </div>
            <div className="flex justify-between text-tiny">
              <span className="text-text-muted">{t('aiAgents.conversationCount')}</span>
              <span className="font-mono text-text-2">{costs?.cifoMonthCount ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Audit Agent */}
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.04)' }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber" />
            <p className="text-small font-semibold text-text-1">Audit Agent</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-tiny">
              <span className="text-text-muted">{t('common.total')}</span>
              <span className="font-mono font-semibold text-text-1">{fmt2(costs?.auditMonthCost ?? 0)}</span>
            </div>
            <div className="flex justify-between text-tiny">
              <span className="text-text-muted">{t('aiAgents.avgPerScan')}</span>
              <span className="font-mono text-text-2">
                {costs && (costs.monthScanCount ?? 0) > 0
                  ? fmt2((costs.auditMonthCost ?? 0) / (costs.monthScanCount ?? 1))
                  : '$0.00'}
              </span>
            </div>
            <div className="flex justify-between text-tiny">
              <span className="text-text-muted">{t('aiAgents.scanCount')}</span>
              <span className="font-mono text-text-2">{costs?.monthScanCount ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly history table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-small font-semibold text-text-1">{t('aiAgents.monthlyHistoryTitle')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-border bg-surface/60">
                <th className="text-left px-4 py-2.5 text-tiny font-medium text-text-muted">{t('aiAgents.colMonth')}</th>
                <th className="text-right px-4 py-2.5 text-tiny font-medium text-text-muted">{t('aiAgents.colCifo')}</th>
                <th className="text-right px-4 py-2.5 text-tiny font-medium text-text-muted">{t('aiAgents.colAudit')}</th>
                <th className="text-right px-4 py-2.5 text-tiny font-medium text-text-muted">{t('aiAgents.colTotal')}</th>
                <th className="text-right px-4 py-2.5 text-tiny font-medium text-text-muted">{t('aiAgents.colBudget')}</th>
              </tr>
            </thead>
            <tbody>
              {months.map(({ label, cifo, audit }) => {
                const total = cifo + audit;
                const pct = (total / budget) * 100;
                return (
                  <tr key={label} className="border-b border-border last:border-0 hover:bg-surface/60 transition-colors">
                    <td className="px-4 py-2.5 text-small text-text-2 capitalize">{label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-tiny text-text-3">{fmt2(cifo)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-tiny text-text-3">{fmt2(audit)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-small font-semibold text-text-1">{fmt2(total)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-tiny font-medium ${pct >= 90 ? 'text-rose' : pct >= 70 ? 'text-amber' : 'text-emerald'}`}>
                        {pct.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Budget alert */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-small font-semibold text-text-1 mb-3">{t('aiAgents.budgetAlertLabel')}</p>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-small text-text-muted">$</span>
            <Input
              type="number"
              min="1"
              max="9999"
              step="5"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              className="pl-6 h-9 text-small font-mono"
            />
          </div>
          <span className="text-tiny text-text-muted">/mes</span>
          <Button
            size="sm"
            loading={saveBudget.isPending}
            disabled={saveBudget.isPending || !budgetInput || Number(budgetInput) < 1}
            onClick={() => saveBudget.mutate({ budget: Number(budgetInput) })}
          >
            {t('aiAgents.saveBudgetBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
