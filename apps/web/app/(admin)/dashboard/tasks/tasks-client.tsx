'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@precision/ui';
import { Plus, Star, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type TaskList = inferRouterOutputs<AppRouter>['tasks']['list'];
type Employee = inferRouterOutputs<AppRouter>['employees']['list']['items'][number];

const STATUS_VARIANTS: Record<string, 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  ASSIGNED: 'secondary',
  IN_PROGRESS: 'info',
  DELIVERED: 'warning',
  REVIEWED: 'success',
  REJECTED: 'destructive',
  CANCELLED: 'secondary',
};

const PRIORITY_VARIANTS: Record<string, 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  LOW: 'secondary',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'destructive',
};

export function TasksClient({
  initial,
  employees,
}: {
  initial: TaskList;
  employees: Employee[];
}): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<string | null>(null);

  const STATUS_LABELS: Record<string, string> = {
    ASSIGNED: t('tasks.statuses.ASSIGNED'),
    IN_PROGRESS: t('tasks.statuses.IN_PROGRESS'),
    DELIVERED: t('tasks.statuses.DELIVERED'),
    REVIEWED: t('tasks.statuses.REVIEWED'),
    REJECTED: t('tasks.statuses.REJECTED'),
    CANCELLED: t('tasks.statuses.CANCELLED'),
  };

  const PRIORITY_LABELS: Record<string, string> = {
    LOW: t('tasks.priorities.LOW'),
    NORMAL: t('tasks.priorities.NORMAL'),
    HIGH: t('tasks.priorities.HIGH'),
    URGENT: t('tasks.priorities.URGENT'),
  };

  const { data, refetch } = trpc.tasks.list.useQuery(
    {
      page, pageSize: 25,
      status: (statusFilter as 'ASSIGNED' | 'IN_PROGRESS' | 'DELIVERED' | 'REVIEWED' | 'REJECTED' | 'CANCELLED' | undefined) || undefined,
      priority: (priorityFilter as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | undefined) || undefined,
      assigneeId: assigneeFilter || undefined,
    },
    { initialData: initial },
  );

  const updateStatus = trpc.tasks.updateStatus.useMutation({
    onSuccess: () => { toast.success(t('tasks.updated')); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const fmt = locale === 'en' ? 'en-US' : 'es-ES';

  const isDueOverdue = (dueDate: string, status: string): boolean => {
    if (status === 'REVIEWED' || status === 'CANCELLED') return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('tasks.title')}</h1>
          <p className="text-small text-text-3">{data?.total ?? 0} {t('tasks.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('tasks.addNew')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={assigneeFilter} onValueChange={(v) => { setAssigneeFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder={t('tasks.assignee')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('tasks.all')}</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('tasks.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('tasks.allStatuses')}</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder={t('tasks.priority')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('tasks.allPriorities')}</SelectItem>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">

        {/* Mobile cards */}
        <div className="md:hidden">
          {(data?.items ?? []).length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('tasks.noTasks')}</div>
          ) : (
            <div className="divide-y divide-border">
              {(data?.items ?? []).map((task) => {
                const assignee = task.assignee as unknown as { firstName: string; lastName: string } | null;
                const overdue = isDueOverdue(task.dueDate as string, task.status);
                return (
                  <div key={task.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-small font-medium text-text-1 truncate">{task.title}</p>
                        <p className="text-tiny text-text-3 truncate">{assignee?.firstName} {assignee?.lastName}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={PRIORITY_VARIANTS[task.priority] ?? 'secondary'}>{PRIORITY_LABELS[task.priority] ?? task.priority}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant={STATUS_VARIANTS[task.status] ?? 'secondary'}>{STATUS_LABELS[task.status] ?? task.status}</Badge>
                      <p className={`text-tiny font-mono ${overdue ? 'text-rose' : 'text-text-muted'}`}>
                        {new Date(task.dueDate as string).toLocaleDateString(fmt)}
                      </p>
                    </div>
                    {task.status !== 'REVIEWED' && task.status !== 'CANCELLED' && (
                      <div className="flex gap-2">
                        {task.status === 'ASSIGNED' && (
                          <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: task.id, status: 'IN_PROGRESS' })}>
                            {t('tasks.statuses.IN_PROGRESS')}
                          </Button>
                        )}
                        {(task.status === 'IN_PROGRESS' || task.status === 'DELIVERED') && (
                          <Button variant="outline" size="sm" onClick={() => setCompleteTarget(task.id)}>
                            <Star className="h-3 w-3" />
                            {t('tasks.complete')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tasks.titleField')}</TableHead>
                <TableHead>{t('tasks.assignee')}</TableHead>
                <TableHead>{t('tasks.priority')}</TableHead>
                <TableHead>{t('tasks.status')}</TableHead>
                <TableHead>{t('tasks.dueDate')}</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-3">{t('tasks.noTasks')}</TableCell></TableRow>
              ) : (
                (data?.items ?? []).map((task) => {
                  const assignee = task.assignee as unknown as { firstName: string; lastName: string } | null;
                  const overdue = isDueOverdue(task.dueDate as string, task.status);
                  return (
                    <TableRow key={task.id}>
                      <TableCell>
                        <p className="text-small font-medium text-text-1 max-w-[200px] truncate">{task.title}</p>
                        {task.qualityRating && (
                          <div className="flex items-center gap-0.5 mt-0.5">
                            {Array.from({ length: task.qualityRating }).map((_, i) => (
                              <Star key={i} className="h-3 w-3 fill-amber text-amber" />
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-small text-text-2">{assignee?.firstName} {assignee?.lastName}</TableCell>
                      <TableCell><Badge variant={PRIORITY_VARIANTS[task.priority] ?? 'secondary'}>{PRIORITY_LABELS[task.priority] ?? task.priority}</Badge></TableCell>
                      <TableCell><Badge variant={STATUS_VARIANTS[task.status] ?? 'secondary'}>{STATUS_LABELS[task.status] ?? task.status}</Badge></TableCell>
                      <TableCell className={`text-small font-mono ${overdue ? 'text-rose font-semibold' : 'text-text-3'}`}>
                        {new Date(task.dueDate as string).toLocaleDateString(fmt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {task.status === 'ASSIGNED' && (
                            <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: task.id, status: 'IN_PROGRESS' })}>
                              {t('tasks.statuses.IN_PROGRESS')}
                            </Button>
                          )}
                          {(task.status === 'IN_PROGRESS' || task.status === 'DELIVERED') && (
                            <Button variant="outline" size="sm" onClick={() => setCompleteTarget(task.id)}>
                              <Star className="h-3 w-3" />
                              {t('tasks.complete')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-small text-text-3">{t('employees.page')} {page} {t('employees.of')} {data?.totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
            <Button variant="outline" size="sm" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
          </div>
        </div>
      )}

      <CreateTaskDialog
        open={showCreate}
        employees={employees}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />

      {completeTarget && (
        <CompleteTaskDialog
          taskId={completeTarget}
          onClose={() => setCompleteTarget(null)}
          onCompleted={() => { setCompleteTarget(null); void refetch(); }}
        />
      )}
    </div>
  );
}

function CreateTaskDialog({ open, employees, onClose, onCreated }: { open: boolean; employees: Employee[]; onClose: () => void; onCreated: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({
    title: '', description: '',
    assigneeId: '', supervisorId: '',
    priority: 'NORMAL' as const,
    dueDate: '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.tasks.create.useMutation({
    onSuccess: () => { toast.success(t('tasks.created')); onCreated(); setForm({ title: '', description: '', assigneeId: '', supervisorId: '', priority: 'NORMAL', dueDate: '' }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('tasks.createTask')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('tasks.titleField')} *</Label>
            <Input value={form.title} onChange={(e) => f('title', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('tasks.description')}</Label>
            <Textarea value={form.description} onChange={(e) => f('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('tasks.assignee')} *</Label>
              <Select value={form.assigneeId} onValueChange={(v) => f('assigneeId', v)}>
                <SelectTrigger><SelectValue placeholder={t('tasks.selectEmployee')} /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('tasks.supervisor')}</Label>
              <Select value={form.supervisorId} onValueChange={(v) => f('supervisorId', v)}>
                <SelectTrigger><SelectValue placeholder={t('tasks.selectEmployee')} /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('tasks.priority')}</Label>
              <Select value={form.priority} onValueChange={(v) => f('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">{t('tasks.priorities.LOW')}</SelectItem>
                  <SelectItem value="NORMAL">{t('tasks.priorities.NORMAL')}</SelectItem>
                  <SelectItem value="HIGH">{t('tasks.priorities.HIGH')}</SelectItem>
                  <SelectItem value="URGENT">{t('tasks.priorities.URGENT')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('tasks.dueDate')} *</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => f('dueDate', e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={create.isPending}
            disabled={!form.title || !form.assigneeId || !form.dueDate}
            onClick={() => create.mutate({
              title: form.title,
              description: form.description || undefined,
              assigneeId: form.assigneeId,
              supervisorId: form.supervisorId || undefined,
              priority: form.priority as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
              dueDate: new Date(form.dueDate),
            })}
          >
            {t('tasks.createTask')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteTaskDialog({ taskId, onClose, onCompleted }: { taskId: string; onClose: () => void; onCompleted: () => void }): React.ReactElement {
  const t = useTranslations();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');

  const complete = trpc.tasks.complete.useMutation({
    onSuccess: () => { toast.success(t('tasks.updated')); onCompleted(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('tasks.complete')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('tasks.qualityRating')}</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className="p-1 transition-colors"
                >
                  <Star className={`h-6 w-6 ${n <= rating ? 'fill-amber text-amber' : 'text-border'}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('tasks.qualityFeedback')}</Label>
            <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={complete.isPending}
            onClick={() => complete.mutate({
              id: taskId,
              qualityRating: rating || undefined,
              qualityFeedback: feedback || undefined,
            })}
          >
            {t('tasks.complete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
