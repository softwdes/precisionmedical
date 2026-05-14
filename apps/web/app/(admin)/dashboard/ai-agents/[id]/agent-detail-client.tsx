'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@precision/ui';
import {
  ArrowLeft, Bot, Play, Pause, CheckCircle, XCircle, Cpu,
  DollarSign, Activity, MessageSquare, Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type Agent = inferRouterOutputs<AppRouter>['aiAgents']['getById'];
type ActionList = inferRouterOutputs<AppRouter>['aiAgents']['listActions'];
type ConvList = inferRouterOutputs<AppRouter>['aiAgents']['listConversations'];

const STATUS_DOTS: Record<string, string> = {
  IDLE: 'bg-text-muted',
  RUNNING: 'bg-emerald animate-pulse',
  PAUSED: 'bg-amber',
  ERROR: 'bg-rose',
};

const SEVERITY_VARIANTS: Record<string, 'info' | 'warning' | 'destructive' | 'secondary'> = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'destructive',
  CRITICAL: 'destructive',
};

const ACTION_STATUS_VARIANTS: Record<string, 'warning' | 'success' | 'destructive' | 'secondary' | 'info'> = {
  PENDING_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
  APPLIED: 'success',
  FAILED: 'destructive',
  AUTO_APPLIED: 'info',
};

const MODES = ['MANUAL', 'APPROVAL', 'AUTONOMOUS'] as const;
const LLM_PROVIDERS = ['ANTHROPIC', 'OPENAI', 'CUSTOM'] as const;
const ACTION_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED', 'FAILED', 'AUTO_APPLIED'] as const;
const SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;

export function AgentDetailClient({
  agent: initial,
  initialActions,
  initialConversations,
}: {
  agent: Agent;
  initialActions: ActionList;
  initialConversations: ConvList;
}): React.ReactElement {
  const t = useTranslations();
  const [tab, setTab] = useState<'config' | 'actions' | 'conversations'>('config');
  const [showEdit, setShowEdit] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ id: string; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [actionStatus, setActionStatus] = useState('');
  const [actionSeverity, setActionSeverity] = useState('');
  const [actionPage, setActionPage] = useState(1);

  const { data: agent, refetch: refetchAgent } = trpc.aiAgents.getById.useQuery({ id: initial.id }, { initialData: initial });
  const { data: actions, refetch: refetchActions } = trpc.aiAgents.listActions.useQuery(
    {
      agentId: initial.id,
      page: actionPage,
      status: actionStatus as typeof ACTION_STATUSES[number] | undefined,
      severity: actionSeverity as typeof SEVERITIES[number] | undefined,
    },
    { initialData: initialActions },
  );
  const { data: conversations } = trpc.aiAgents.listConversations.useQuery(
    { agentId: initial.id },
    { initialData: initialConversations },
  );

  const toggle = trpc.aiAgents.toggleStatus.useMutation({
    onSuccess: (d) => {
      toast.success(d.status === 'IDLE' ? t('aiAgents.activated') : t('aiAgents.paused'));
      void refetchAgent();
    },
    onError: (e) => toast.error(e.message),
  });

  const isRunning = agent.status === 'RUNNING';
  const budgetPct = Math.min(100, (Number(agent.totalCostUsd) / Math.max(1, Number(agent.budgetMonthlyUsd))) * 100);
  const pendingCount = (actions?.items ?? []).filter(a => a.status === 'PENDING_REVIEW').length;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/ai-agents" className="text-text-3 hover:text-text-1 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="relative flex h-9 w-9 items-center justify-center rounded bg-brand/10 text-lg shrink-0">
          <Bot className="h-4 w-4 text-brand" />
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-1 ${STATUS_DOTS[agent.status]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-text-1 truncate">{agent.name}</h1>
          <p className="text-small text-text-3">{t(`aiAgents.types.${agent.type}`)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggle.mutate({ id: agent.id, status: isRunning ? 'PAUSED' : 'IDLE' })}
            loading={toggle.isPending}
          >
            {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {isRunning ? t('aiAgents.pause') : t('aiAgents.activate')}
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5 text-center">
          <p className="text-tiny text-text-3 mb-0.5">{t('aiAgents.totalActions')}</p>
          <p className="font-mono font-bold text-text-1">{Number(agent.totalActions).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5 text-center">
          <p className="text-tiny text-text-3 mb-0.5">{t('aiAgents.tokensUsed')}</p>
          <p className="font-mono font-bold text-text-1">{Number(agent.totalTokensUsed).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5 text-center">
          <p className="text-tiny text-text-3 mb-0.5">{t('aiAgents.totalCost')}</p>
          <p className="font-mono font-bold text-text-1">${Number(agent.totalCostUsd).toFixed(4)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: 'config', label: t('aiAgents.configTab'), icon: Settings2 },
          { key: 'actions', label: `${t('aiAgents.actionsTab')}${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: Activity },
          { key: 'conversations', label: t('aiAgents.conversationsTab'), icon: MessageSquare },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-small transition-colors border-b-2 -mb-px ${
              tab === key ? 'border-brand text-brand font-semibold' : 'border-transparent text-text-3 hover:text-text-2'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* CONFIG TAB */}
      {tab === 'config' && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-small font-semibold text-text-1">{t('aiAgents.configTab')}</h2>
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
              <Settings2 className="h-3.5 w-3.5" />
              {t('common.edit')}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-small">
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('aiAgents.description')}</p>
              <p className="text-text-1">{agent.description}</p>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('aiAgents.mode')}</p>
              <Badge variant="secondary">{t(`aiAgents.modes.${agent.mode}`)}</Badge>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('aiAgents.llmProvider')}</p>
              <p className="text-text-1">{t(`aiAgents.providers.${agent.llmProvider}`)}</p>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('aiAgents.llmModel')}</p>
              <p className="font-mono text-text-1">{agent.llmModel}</p>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('aiAgents.schedule')}</p>
              <p className="font-mono text-text-1">{agent.schedule ?? '—'}</p>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('aiAgents.lastRun')}</p>
              <p className="text-text-1">{agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleString() : t('aiAgents.neverRun')}</p>
            </div>
          </div>
          {/* Budget bar */}
          <div className="space-y-1 pt-2 border-t border-border">
            <div className="flex items-center justify-between text-tiny text-text-muted">
              <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{t('aiAgents.budgetUsed')}</span>
              <span className="font-mono">${Number(agent.totalCostUsd).toFixed(4)} / ${Number(agent.budgetMonthlyUsd).toFixed(0)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className={`h-full rounded-full ${budgetPct >= 90 ? 'bg-rose' : budgetPct >= 70 ? 'bg-amber' : 'bg-brand'}`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
          </div>
          {/* Permissions */}
          {(agent.permissions as string[]).length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-tiny text-text-3 mb-2">{t('aiAgents.permissions')}</p>
              <div className="flex flex-wrap gap-1.5">
                {(agent.permissions as string[]).map((p) => (
                  <span key={p} className="text-tiny px-2 py-0.5 rounded border border-border text-text-2 font-mono">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ACTIONS TAB */}
      {tab === 'actions' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={actionStatus} onValueChange={(v) => { setActionStatus(v === 'ALL' ? '' : v); setActionPage(1); }}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('aiAgents.allStatuses')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('aiAgents.allStatuses')}</SelectItem>
                {ACTION_STATUSES.map(s => <SelectItem key={s} value={s}>{t(`aiAgents.actionStatuses.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actionSeverity} onValueChange={(v) => { setActionSeverity(v === 'ALL' ? '' : v); setActionPage(1); }}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('aiAgents.allSeverities')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('aiAgents.allSeverities')}</SelectItem>
                {SEVERITIES.map(s => <SelectItem key={s} value={s}>{t(`aiAgents.severities.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            {/* Mobile */}
            <div className="md:hidden divide-y divide-border">
              {(actions?.items ?? []).length === 0 ? (
                <div className="text-center py-12 text-text-3">{t('aiAgents.noActions')}</div>
              ) : (
                (actions?.items ?? []).map((action) => (
                  <div key={action.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-small text-text-1 line-clamp-2">{action.summary}</p>
                        <p className="text-tiny text-text-muted mt-0.5">
                          {t(`aiAgents.actionTypes.${action.type}`)} · {new Date(action.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant={SEVERITY_VARIANTS[action.severity] ?? 'secondary'}>{t(`aiAgents.severities.${action.severity}`)}</Badge>
                        <Badge variant={ACTION_STATUS_VARIANTS[action.status] ?? 'secondary'}>{t(`aiAgents.actionStatuses.${action.status}`)}</Badge>
                      </div>
                    </div>
                    {action.status === 'PENDING_REVIEW' && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setReviewTarget({ id: action.id, decision: 'APPROVED' })}>
                          <CheckCircle className="h-3 w-3 text-emerald" />
                          {t('aiAgents.approve')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setReviewTarget({ id: action.id, decision: 'REJECTED' })}>
                          <XCircle className="h-3 w-3 text-rose" />
                          {t('aiAgents.reject')}
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('aiAgents.summary')}</TableHead>
                    <TableHead>{t('aiAgents.type')}</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>{t('aiAgents.status')}</TableHead>
                    <TableHead className="text-right">{t('aiAgents.costUsd')}</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(actions?.items ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-3">{t('aiAgents.noActions')}</TableCell></TableRow>
                  ) : (
                    (actions?.items ?? []).map((action) => (
                      <TableRow key={action.id}>
                        <TableCell>
                          <p className="text-small text-text-1 line-clamp-2 max-w-xs">{action.summary}</p>
                          <p className="text-tiny text-text-muted">{new Date(action.createdAt).toLocaleString()}</p>
                        </TableCell>
                        <TableCell className="text-small text-text-2">{t(`aiAgents.actionTypes.${action.type}`)}</TableCell>
                        <TableCell>
                          <Badge variant={SEVERITY_VARIANTS[action.severity] ?? 'secondary'}>{t(`aiAgents.severities.${action.severity}`)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ACTION_STATUS_VARIANTS[action.status] ?? 'secondary'}>{t(`aiAgents.actionStatuses.${action.status}`)}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-small text-text-2">${Number(action.costUsd).toFixed(6)}</TableCell>
                        <TableCell>
                          {action.status === 'PENDING_REVIEW' && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => setReviewTarget({ id: action.id, decision: 'APPROVED' })}
                                className="p-1.5 rounded text-emerald hover:bg-emerald/10 transition-colors"
                                title={t('aiAgents.approve')}
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setReviewTarget({ id: action.id, decision: 'REJECTED' })}
                                className="p-1.5 rounded text-rose hover:bg-rose/10 transition-colors"
                                title={t('aiAgents.reject')}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {(actions?.totalPages ?? 1) > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-small text-text-3">{t('employees.page')} {actionPage} {t('employees.of')} {actions?.totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={actionPage === 1} onClick={() => setActionPage(p => p - 1)}>{t('common.previous')}</Button>
                <Button variant="outline" size="sm" disabled={actionPage >= (actions?.totalPages ?? 1)} onClick={() => setActionPage(p => p + 1)}>{t('common.next')}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONVERSATIONS TAB */}
      {tab === 'conversations' && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          {(conversations?.items ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <MessageSquare className="h-8 w-8 text-text-muted" />
              <p className="text-text-3">{t('aiAgents.noConversations')}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(conversations?.items ?? []).map((conv) => {
                const msgs = conv.messages as unknown as Array<{ role: string; content: string }>;
                const lastMsg = msgs?.[msgs.length - 1];
                const duration = conv.endedAt
                  ? Math.round((new Date(conv.endedAt).getTime() - new Date(conv.startedAt).getTime()) / 1000)
                  : null;
                return (
                  <div key={conv.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-text-3 shrink-0" />
                        <p className="text-small font-medium text-text-1">
                          {new Date(conv.startedAt).toLocaleString()}
                        </p>
                        {duration !== null && (
                          <span className="text-tiny text-text-muted">{duration}s</span>
                        )}
                      </div>
                      <span className="text-tiny font-mono text-text-muted">{msgs?.length ?? 0} msgs</span>
                    </div>
                    {lastMsg && (
                      <p className="text-tiny text-text-3 line-clamp-2 pl-5">
                        <span className="font-semibold capitalize">{lastMsg.role}:</span> {lastMsg.content}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {showEdit && (
        <EditConfigDialog
          agent={agent}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); void refetchAgent(); }}
        />
      )}

      {reviewTarget && (
        <ReviewActionDialog
          actionId={reviewTarget.id}
          decision={reviewTarget.decision}
          onClose={() => setReviewTarget(null)}
          onReviewed={() => { setReviewTarget(null); void refetchActions(); void refetchAgent(); }}
        />
      )}
    </div>
  );
}

function EditConfigDialog({ agent, onClose, onSaved }: { agent: Agent; onClose: () => void; onSaved: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({
    description: agent.description,
    mode: agent.mode,
    llmProvider: agent.llmProvider,
    llmModel: agent.llmModel,
    budgetMonthlyUsd: String(Number(agent.budgetMonthlyUsd)),
    schedule: agent.schedule ?? '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const save = trpc.aiAgents.updateConfig.useMutation({
    onSuccess: () => { toast.success(t('aiAgents.updated')); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('aiAgents.configTab')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('aiAgents.description')} *</Label>
            <Input value={form.description} onChange={(e) => f('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('aiAgents.mode')}</Label>
              <Select value={form.mode} onValueChange={(v) => f('mode', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODES.map(m => <SelectItem key={m} value={m}>{t(`aiAgents.modes.${m}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('aiAgents.budget')}</Label>
              <Input type="number" min="0" step="10" value={form.budgetMonthlyUsd} onChange={(e) => f('budgetMonthlyUsd', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('aiAgents.llmProvider')}</Label>
              <Select value={form.llmProvider} onValueChange={(v) => f('llmProvider', v)}>
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
            <Label>{t('aiAgents.schedule')}</Label>
            <Input value={form.schedule} onChange={(e) => f('schedule', e.target.value)} placeholder="0 */6 * * *" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={save.isPending}
            disabled={!form.description}
            onClick={() => save.mutate({
              id: agent.id,
              description: form.description,
              mode: form.mode as typeof MODES[number],
              llmProvider: form.llmProvider as typeof LLM_PROVIDERS[number],
              llmModel: form.llmModel,
              budgetMonthlyUsd: Number(form.budgetMonthlyUsd),
              schedule: form.schedule || undefined,
            })}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewActionDialog({
  actionId, decision, onClose, onReviewed,
}: {
  actionId: string;
  decision: 'APPROVED' | 'REJECTED';
  onClose: () => void;
  onReviewed: () => void;
}): React.ReactElement {
  const t = useTranslations();
  const [notes, setNotes] = useState('');

  const review = trpc.aiAgents.reviewAction.useMutation({
    onSuccess: () => {
      toast.success(decision === 'APPROVED' ? t('aiAgents.approved') : t('aiAgents.rejected'));
      onReviewed();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className={decision === 'APPROVED' ? 'text-emerald' : 'text-rose'}>
            {decision === 'APPROVED' ? t('aiAgents.approve') : t('aiAgents.reject')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{t('aiAgents.reviewNotes')}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('common.optional')} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={review.isPending}
            variant={decision === 'APPROVED' ? 'default' : 'destructive' as 'default'}
            onClick={() => review.mutate({ id: actionId, decision, reviewNotes: notes || undefined })}
          >
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
