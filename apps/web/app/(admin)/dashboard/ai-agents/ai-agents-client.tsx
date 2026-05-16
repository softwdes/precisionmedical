'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Label, Input,
} from '@precision/ui';
import {
  Plus, Bot, Play, Pause, ChevronRight, Cpu, DollarSign, Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type Agent = inferRouterOutputs<AppRouter>['aiAgents']['list'][number];

const STATUS_VARIANTS: Record<string, 'success' | 'info' | 'secondary' | 'destructive' | 'warning'> = {
  IDLE: 'secondary',
  RUNNING: 'success',
  PAUSED: 'warning',
  ERROR: 'destructive',
};

const STATUS_DOTS: Record<string, string> = {
  IDLE: 'bg-text-muted',
  RUNNING: 'bg-emerald animate-pulse',
  PAUSED: 'bg-amber',
  ERROR: 'bg-rose',
};

const TYPE_ICONS: Record<string, string> = {
  CONVERSATIONAL: '💬',
  AUDITOR: '🔍',
  METRICS: '📊',
  FX_WATCHER: '💱',
  REFERRAL_OPTIMIZER: '🔗',
  ORCHESTRATOR: '🎛',
};

const AGENT_TYPES = ['CONVERSATIONAL', 'AUDITOR', 'METRICS', 'FX_WATCHER', 'REFERRAL_OPTIMIZER', 'ORCHESTRATOR'] as const;
const LLM_PROVIDERS = ['ANTHROPIC', 'OPENAI', 'CUSTOM'] as const;
const MODES = ['MANUAL', 'APPROVAL', 'AUTONOMOUS'] as const;

export function AiAgentsClient({ initialAgents }: { initialAgents: Agent[] }): React.ReactElement {
  const t = useTranslations();
  const [showCreate, setShowCreate] = useState(false);

  const { data: agents, refetch } = trpc.aiAgents.list.useQuery(undefined, { initialData: initialAgents });

  const toggle = trpc.aiAgents.toggleStatus.useMutation({
    onSuccess: (d) => {
      toast.success(d.status === 'IDLE' ? t('aiAgents.activated') : t('aiAgents.paused'));
      void refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalCost = agents.reduce((s, a) => s + Number(a.totalCostUsd), 0);
  const runningCount = agents.filter(a => a.status === 'RUNNING').length;

  return (
    <div className="px-3 py-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('aiAgents.title')}</h1>
          <p className="text-small text-text-3">{agents.length} {t('aiAgents.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('aiAgents.addNew')}
        </Button>
      </div>

      {/* Summary strip */}
      <div className="rounded-lg border border-border bg-surface px-4 py-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald" />
          <span className="text-small text-text-2">
            <span className="font-semibold text-text-1">{runningCount}</span> {t('aiAgents.statuses.RUNNING').toLowerCase()}
          </span>
        </div>
        <span className="text-text-muted">·</span>
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-text-3" />
          <span className="text-small text-text-2">
            {t('aiAgents.totalCost')}: <span className="font-mono font-semibold text-text-1">${totalCost.toFixed(4)}</span>
          </span>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface py-20 flex flex-col items-center gap-3 text-center">
          <Bot className="h-10 w-10 text-text-muted" />
          <p className="text-text-3">{t('aiAgents.noAgents')}</p>
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t('aiAgents.addNew')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const budgetPct = Math.min(100, (Number(agent.totalCostUsd) / Math.max(1, Number(agent.budgetMonthlyUsd))) * 100);
            const isRunning = agent.status === 'RUNNING';
            return (
              <div key={agent.id} className="rounded-lg border border-border bg-surface hover:border-brand/30 transition-colors">
                <div className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative flex h-8 w-8 items-center justify-center rounded bg-brand/10 shrink-0 text-base">
                        {TYPE_ICONS[agent.type] ?? '🤖'}
                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-1 ${STATUS_DOTS[agent.status]}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-small font-semibold text-text-1 truncate">{agent.name}</p>
                        <p className="text-tiny text-text-3">{t(`aiAgents.types.${agent.type}`)}</p>
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANTS[agent.status] ?? 'secondary'} className="shrink-0 text-tiny">
                      {t(`aiAgents.statuses.${agent.status}`)}
                    </Badge>
                  </div>

                  {/* Description */}
                  <p className="text-tiny text-text-3 line-clamp-2">{agent.description}</p>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 text-tiny text-text-muted">
                    <div className="flex items-center gap-1">
                      <Cpu className="h-3 w-3" />
                      <span>{agent.llmModel}</span>
                    </div>
                    <span>·</span>
                    <span className="font-mono">{Number(agent.totalActions).toLocaleString()} {t('aiAgents.totalActions').toLowerCase()}</span>
                  </div>

                  {/* Budget bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-tiny text-text-muted">
                      <span>{t('aiAgents.budgetUsed')}</span>
                      <span className="font-mono">${Number(agent.totalCostUsd).toFixed(4)} / ${Number(agent.budgetMonthlyUsd).toFixed(0)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-border overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${budgetPct >= 90 ? 'bg-rose' : budgetPct >= 70 ? 'bg-amber' : 'bg-brand'}`}
                        style={{ width: `${budgetPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Mode badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-tiny px-2 py-0.5 rounded border border-border text-text-3">
                      {t(`aiAgents.modes.${agent.mode}`)}
                    </span>
                    <p className="text-tiny text-text-muted">
                      {agent.lastRunAt
                        ? new Date(agent.lastRunAt).toLocaleDateString()
                        : t('aiAgents.neverRun')}
                    </p>
                  </div>
                </div>

                {/* Card footer */}
                <div className="flex items-center border-t border-border">
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-tiny text-text-3 hover:text-text-1 hover:bg-surface/80 transition-colors"
                    onClick={() => toggle.mutate({ id: agent.id, status: isRunning ? 'PAUSED' : 'IDLE' })}
                  >
                    {isRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {isRunning ? t('aiAgents.pause') : t('aiAgents.activate')}
                  </button>
                  <div className="w-px h-8 bg-border" />
                  <Link
                    href={`/dashboard/ai-agents/${agent.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-tiny text-text-3 hover:text-brand hover:bg-surface/80 transition-colors"
                  >
                    {t('common.view')}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateAgentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />
    </div>
  );
}

function CreateAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({
    name: '',
    type: 'CONVERSATIONAL' as typeof AGENT_TYPES[number],
    description: '',
    mode: 'MANUAL' as typeof MODES[number],
    llmProvider: 'ANTHROPIC' as typeof LLM_PROVIDERS[number],
    llmModel: 'claude-sonnet-4-6',
    budgetMonthlyUsd: '100',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.aiAgents.create.useMutation({
    onSuccess: () => { toast.success(t('aiAgents.created')); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  const modelDefaults: Record<string, string> = {
    ANTHROPIC: 'claude-sonnet-4-6',
    OPENAI: 'gpt-4o',
    CUSTOM: 'custom-model',
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col max-h-[90dvh] w-full sm:max-w-md overflow-hidden">
        <DialogHeader className="shrink-0"><DialogTitle>{t('aiAgents.createAgent')}</DialogTitle></DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
          <div className="space-y-1.5">
            <Label>{t('aiAgents.name')} *</Label>
            <Input value={form.name} onChange={(e) => f('name', e.target.value)} placeholder="Ej: Auditor Financiero" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('aiAgents.type')} *</Label>
              <Select value={form.type} onValueChange={(v) => f('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGENT_TYPES.map(tp => (
                    <SelectItem key={tp} value={tp}>
                      {TYPE_ICONS[tp]} {t(`aiAgents.types.${tp}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('aiAgents.mode')} *</Label>
              <Select value={form.mode} onValueChange={(v) => f('mode', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODES.map(m => <SelectItem key={m} value={m}>{t(`aiAgents.modes.${m}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('aiAgents.description')} *</Label>
            <Input
              value={form.description}
              onChange={(e) => f('description', e.target.value)}
              placeholder="Ej: Revisa anomalías en pagos y comisiones"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('aiAgents.llmProvider')}</Label>
              <Select
                value={form.llmProvider}
                onValueChange={(v) => { f('llmProvider', v); f('llmModel', modelDefaults[v] ?? ''); }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LLM_PROVIDERS.map(p => <SelectItem key={p} value={p}>{t(`aiAgents.providers.${p}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('aiAgents.llmModel')}</Label>
              <Input value={form.llmModel} onChange={(e) => f('llmModel', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('aiAgents.budget')}</Label>
            <Input type="number" min="0" step="10" value={form.budgetMonthlyUsd} onChange={(e) => f('budgetMonthlyUsd', e.target.value)} />
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={create.isPending}
            disabled={!form.name || !form.description}
            onClick={() => create.mutate({
              name: form.name,
              type: form.type,
              description: form.description,
              mode: form.mode,
              llmProvider: form.llmProvider,
              llmModel: form.llmModel,
              budgetMonthlyUsd: Number(form.budgetMonthlyUsd),
            })}
          >
            {t('aiAgents.createAgent')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
