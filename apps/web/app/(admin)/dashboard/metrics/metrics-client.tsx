'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label, Input,
} from '@precision/ui';
import { Activity, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type Snapshot = inferRouterOutputs<AppRouter>['metrics']['list'][number];
type Department = inferRouterOutputs<AppRouter>['departments']['list'][number];

const GRADE_VARIANTS: Record<string, 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  A_PLUS: 'success',
  A: 'success',
  B: 'info',
  C: 'warning',
  D: 'destructive',
};

function ScoreBar({ value, color }: { value: number; color: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-tiny font-mono text-text-2 w-8 text-right">{Number(value).toFixed(0)}</span>
    </div>
  );
}

export function MetricsClient({
  initialSnapshots,
  departments,
  currentMonth,
}: {
  initialSnapshots: Snapshot[];
  departments: Department[];
  currentMonth: string;
}): React.ReactElement {
  const t = useTranslations();
  const [month, setMonth] = useState(currentMonth);
  const [deptFilter, setDeptFilter] = useState('');
  const [computeTarget, setComputeTarget] = useState<Snapshot | null>(null);

  const GRADE_LABELS: Record<string, string> = {
    A_PLUS: t('metrics.grades.A_PLUS'),
    A: t('metrics.grades.A'),
    B: t('metrics.grades.B'),
    C: t('metrics.grades.C'),
    D: t('metrics.grades.D'),
  };

  const { data: snapshots, refetch } = trpc.metrics.list.useQuery(
    { month, departmentId: deptFilter || undefined },
    { initialData: initialSnapshots },
  );

  const avg = snapshots.length > 0
    ? snapshots.reduce((s, m) => s + Number(m.globalScore), 0) / snapshots.length
    : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('metrics.title')}</h1>
          <p className="text-small text-text-3">{t('metrics.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand/20 bg-brand/5">
          <Activity className="h-4 w-4 text-brand" />
          <span className="text-small font-semibold text-brand">{t('metrics.globalScore')}: {avg.toFixed(1)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-auto"
        />
        <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder={t('metrics.allDepartments')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('metrics.allDepartments')}</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">

        {/* Mobile cards */}
        <div className="md:hidden">
          {snapshots.length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('metrics.noMetrics')}</div>
          ) : (
            <div className="divide-y divide-border">
              {snapshots.map((snap) => {
                const emp = snap.employee as unknown as { firstName: string; lastName: string; employeeCode: string; position: string } | null;
                return (
                  <div key={snap.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-small font-semibold text-text-1 truncate">{emp?.firstName} {emp?.lastName}</p>
                        <p className="text-tiny text-text-3 truncate">{emp?.position}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-bold text-text-1">{Number(snap.globalScore).toFixed(1)}</span>
                        <Badge variant={GRADE_VARIANTS[snap.grade] ?? 'secondary'}>{GRADE_LABELS[snap.grade] ?? snap.grade}</Badge>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <ScoreBar value={Number(snap.attendanceScore)} color="bg-brand" />
                      <ScoreBar value={Number(snap.punctualityScore)} color="bg-cyan" />
                      <ScoreBar value={Number(snap.productivityScore)} color="bg-emerald" />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setComputeTarget(snap)}>
                      <Calculator className="h-3 w-3" />
                      {t('metrics.compute')}
                    </Button>
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
                <TableHead>{t('metrics.employee')}</TableHead>
                <TableHead>{t('metrics.attendanceScore')}</TableHead>
                <TableHead>{t('metrics.punctuality')}</TableHead>
                <TableHead>{t('metrics.taskOnTime')}</TableHead>
                <TableHead>{t('metrics.productivity')}</TableHead>
                <TableHead>{t('metrics.quality')}</TableHead>
                <TableHead>{t('metrics.globalScore')}</TableHead>
                <TableHead>{t('metrics.grade')}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-text-3">{t('metrics.noMetrics')}</TableCell></TableRow>
              ) : (
                snapshots.map((snap) => {
                  const emp = snap.employee as unknown as { firstName: string; lastName: string; employeeCode: string; position: string } | null;
                  return (
                    <TableRow key={snap.id}>
                      <TableCell>
                        <p className="text-small font-medium text-text-1">{emp?.firstName} {emp?.lastName}</p>
                        <p className="text-tiny text-text-muted">{emp?.position}</p>
                      </TableCell>
                      <TableCell><ScoreBar value={Number(snap.attendanceScore)} color="bg-brand" /></TableCell>
                      <TableCell><ScoreBar value={Number(snap.punctualityScore)} color="bg-cyan" /></TableCell>
                      <TableCell><ScoreBar value={Number(snap.taskOnTimeScore)} color="bg-amber" /></TableCell>
                      <TableCell><ScoreBar value={Number(snap.productivityScore)} color="bg-emerald" /></TableCell>
                      <TableCell><ScoreBar value={Number(snap.qualityScore)} color="bg-sky" /></TableCell>
                      <TableCell className="font-mono font-bold text-text-1">{Number(snap.globalScore).toFixed(1)}</TableCell>
                      <TableCell><Badge variant={GRADE_VARIANTS[snap.grade] ?? 'secondary'}>{GRADE_LABELS[snap.grade] ?? snap.grade}</Badge></TableCell>
                      <TableCell>
                        <button onClick={() => setComputeTarget(snap)} className="p-1 text-text-muted hover:text-brand transition-colors" title={t('metrics.compute')}>
                          <Calculator className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {computeTarget && (
        <ComputeDialog
          snapshot={computeTarget}
          month={month}
          onClose={() => setComputeTarget(null)}
          onComputed={() => { setComputeTarget(null); void refetch(); }}
        />
      )}
    </div>
  );
}

function ComputeDialog({ snapshot, month, onClose, onComputed }: { snapshot: Snapshot; month: string; onClose: () => void; onComputed: () => void }): React.ReactElement {
  const t = useTranslations();
  const [targetMonth, setTargetMonth] = useState(month);
  const emp = snapshot.employee as unknown as { firstName: string; lastName: string } | null;

  const compute = trpc.metrics.compute.useMutation({
    onSuccess: () => { toast.success(t('metrics.computed')); onComputed(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('metrics.compute')} — {emp?.firstName} {emp?.lastName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{t('metrics.month')}</Label>
          <Input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={compute.isPending}
            onClick={() => compute.mutate({ employeeId: snapshot.employeeId, month: targetMonth })}
          >
            {t('metrics.compute')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
