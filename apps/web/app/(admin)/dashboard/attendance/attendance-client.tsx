'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@precision/ui';
import { Plus, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type AttendanceList = inferRouterOutputs<AppRouter>['attendance']['list'];
type Employee = inferRouterOutputs<AppRouter>['employees']['list']['items'][number];

export function AttendanceClient({
  initial,
  employees,
}: {
  initial: AttendanceList;
  employees: Employee[];
}): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [statusFilter, setStatusFilter] = useState<'all' | 'late' | 'absent' | 'present'>('all');
  const [showCreate, setShowCreate] = useState(false);

  const { data, refetch } = trpc.attendance.list.useQuery(
    {
      page, pageSize: 25,
      employeeId: employeeFilter || undefined,
      month,
      isAbsent: statusFilter === 'absent' ? true : undefined,
      isLate: statusFilter === 'late' ? true : undefined,
    },
    { initialData: initial },
  );

  const fmt = locale === 'en' ? 'en-US' : 'es-ES';

  const getStatusBadge = (isAbsent: boolean, isLate: boolean): React.ReactElement => {
    if (isAbsent) return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t('attendance.isAbsent')}</Badge>;
    if (isLate) return <Badge variant="warning"><AlertTriangle className="h-3 w-3 mr-1" />{t('attendance.isLate')}</Badge>;
    return <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />{t('attendance.present')}</Badge>;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('attendance.title')}</h1>
          <p className="text-small text-text-3">{data?.total ?? 0} {t('attendance.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('attendance.addNew')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          type="month"
          value={month}
          onChange={(e) => { setMonth(e.target.value); setPage(1); }}
          className="w-auto"
        />
        <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder={t('attendance.employee')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('attendance.all')}</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('common.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('attendance.all')}</SelectItem>
            <SelectItem value="present">{t('attendance.filterPresent')}</SelectItem>
            <SelectItem value="late">{t('attendance.filterLate')}</SelectItem>
            <SelectItem value="absent">{t('attendance.filterAbsent')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">

        {/* Mobile cards */}
        <div className="md:hidden">
          {(data?.items ?? []).length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('attendance.noRecords')}</div>
          ) : (
            <div className="divide-y divide-border">
              {(data?.items ?? []).map((rec) => {
                const emp = rec.employee as unknown as { firstName: string; lastName: string; employeeCode: string } | null;
                return (
                  <div key={rec.id} className="px-4 py-3.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-small font-medium text-text-1 truncate">{emp?.firstName} {emp?.lastName}</p>
                        <p className="text-tiny text-text-muted font-mono">{emp?.employeeCode}</p>
                      </div>
                      {getStatusBadge(rec.isAbsent, rec.isLate)}
                    </div>
                    <div className="flex items-center gap-4 text-tiny text-text-3">
                      <span>{new Date(rec.date as string).toLocaleDateString(fmt)}</span>
                      {!rec.isAbsent && (
                        <>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{rec.clockIn ? new Date(rec.clockIn as string).toLocaleTimeString(fmt, { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          <span>→ {rec.clockOut ? new Date(rec.clockOut as string).toLocaleTimeString(fmt, { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          <span className="font-mono font-medium text-text-2">{rec.totalHours ? `${Number(rec.totalHours).toFixed(1)}h` : '—'}</span>
                        </>
                      )}
                    </div>
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
                <TableHead>{t('attendance.employee')}</TableHead>
                <TableHead>{t('attendance.date')}</TableHead>
                <TableHead>{t('attendance.clockIn')}</TableHead>
                <TableHead>{t('attendance.clockOut')}</TableHead>
                <TableHead>{t('attendance.totalHours')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-text-3">{t('attendance.noRecords')}</TableCell></TableRow>
              ) : (
                (data?.items ?? []).map((rec) => {
                  const emp = rec.employee as unknown as { firstName: string; lastName: string; employeeCode: string } | null;
                  return (
                    <TableRow key={rec.id}>
                      <TableCell>
                        <p className="text-small font-medium text-text-1">{emp?.firstName} {emp?.lastName}</p>
                        <p className="text-tiny text-text-muted font-mono">{emp?.employeeCode}</p>
                      </TableCell>
                      <TableCell className="text-small text-text-2">{new Date(rec.date as string).toLocaleDateString(fmt)}</TableCell>
                      <TableCell className="font-mono text-small text-text-2">{rec.clockIn ? new Date(rec.clockIn as string).toLocaleTimeString(fmt, { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                      <TableCell className="font-mono text-small text-text-2">{rec.clockOut ? new Date(rec.clockOut as string).toLocaleTimeString(fmt, { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                      <TableCell className="font-mono text-small font-semibold text-text-1">{rec.totalHours ? `${Number(rec.totalHours).toFixed(1)}h` : '—'}</TableCell>
                      <TableCell>{getStatusBadge(rec.isAbsent, rec.isLate)}</TableCell>
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

      <LogAttendanceDialog
        open={showCreate}
        employees={employees}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />
    </div>
  );
}

function LogAttendanceDialog({ open, employees, onClose, onCreated }: { open: boolean; employees: Employee[]; onClose: () => void; onCreated: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({
    employeeId: '',
    date: new Date().toISOString().split('T')[0],
    clockIn: '',
    clockOut: '',
    isLate: false,
    isAbsent: false,
  });
  const f = (k: keyof typeof form, v: string | boolean): void => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.attendance.create.useMutation({
    onSuccess: () => { toast.success(t('attendance.created')); onCreated(); setForm({ employeeId: '', date: new Date().toISOString().split('T')[0], clockIn: '', clockOut: '', isLate: false, isAbsent: false }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('attendance.createRecord')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('attendance.employee')} *</Label>
            <Select value={form.employeeId} onValueChange={(v) => f('employeeId', v)}>
              <SelectTrigger><SelectValue placeholder={t('attendance.employee')} /></SelectTrigger>
              <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('attendance.date')} *</Label>
            <Input type="date" value={form.date} onChange={(e) => f('date', e.target.value)} />
          </div>
          {!form.isAbsent && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>{t('attendance.clockIn')}</Label><Input type="time" value={form.clockIn} onChange={(e) => f('clockIn', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t('attendance.clockOut')}</Label><Input type="time" value={form.clockOut} onChange={(e) => f('clockOut', e.target.value)} /></div>
            </div>
          )}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-small text-text-2 cursor-pointer">
              <input type="checkbox" checked={form.isLate} onChange={(e) => f('isLate', e.target.checked)} className="rounded" />
              {t('attendance.isLate')}
            </label>
            <label className="flex items-center gap-2 text-small text-text-2 cursor-pointer">
              <input type="checkbox" checked={form.isAbsent} onChange={(e) => f('isAbsent', e.target.checked)} className="rounded" />
              {t('attendance.isAbsent')}
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={create.isPending}
            disabled={!form.employeeId || !form.date}
            onClick={() => create.mutate({
              employeeId: form.employeeId,
              date: new Date(form.date),
              clockIn: form.clockIn ? new Date(`${form.date}T${form.clockIn}`) : undefined,
              clockOut: form.clockOut ? new Date(`${form.date}T${form.clockOut}`) : undefined,
              isLate: form.isLate,
              isAbsent: form.isAbsent,
            })}
          >
            {t('attendance.createRecord')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
