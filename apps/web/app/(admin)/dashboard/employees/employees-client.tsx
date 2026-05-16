'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label, Textarea, cn,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import {
  Plus, Search, ChevronRight, ChevronLeft, Trophy, Eye, EyeOff,
  Pencil, Trash2, Mail, Phone, MapPin, Briefcase, Calendar,
  DollarSign, FileText, Activity, Building2, UserCheck, CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type EmployeesListOutput = inferRouterOutputs<AppRouter>['employees']['list'];
type EmployeeListItem = EmployeesListOutput['items'][number];
type Department = inferRouterOutputs<AppRouter>['departments']['list'][number];

const TYPE_COLORS: Record<string, 'success' | 'info' | 'secondary'> = { FULL_TIME: 'success', EXTERNAL: 'info', CONTRACTOR: 'secondary' };
const STATUS_COLORS: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = { ACTIVE: 'success', ON_LEAVE: 'warning', SUSPENDED: 'destructive', INACTIVE: 'secondary' };

export function EmployeesClient({
  initial,
  departments,
}: {
  initial: EmployeesListOutput;
  departments: Department[];
}): React.ReactElement {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewingEmpId, setViewingEmpId] = useState<string | null>(null);
  const [editEmp, setEditEmp] = useState<EmployeeListItem | null>(null);
  const [deactivateEmp, setDeactivateEmp] = useState<EmployeeListItem | null>(null);

  const TYPE_LABELS = {
    FULL_TIME: t('employees.types.FULL_TIME'),
    EXTERNAL: t('employees.types.EXTERNAL'),
    CONTRACTOR: t('employees.types.CONTRACTOR'),
  };

  const STATUS_LABELS = {
    ACTIVE: t('employees.statuses.ACTIVE'),
    INACTIVE: t('employees.statuses.INACTIVE'),
    SUSPENDED: t('employees.statuses.SUSPENDED'),
    ON_LEAVE: t('employees.statuses.ON_LEAVE'),
  };

  const { data, refetch } = trpc.employees.list.useQuery(
    {
      page, pageSize: 25, search: search || undefined,
      type: (typeFilter as 'FULL_TIME' | 'EXTERNAL' | 'CONTRACTOR' | undefined) || undefined,
      status: (statusFilter as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ON_LEAVE' | undefined) || undefined,
      departmentId: deptFilter || undefined,
    },
    { initialData: initial },
  );

  const deactivate = trpc.employees.deactivate.useMutation({
    onSuccess: () => {
      toast.success(t('employees.deactivated'));
      void refetch();
      setDeactivateEmp(null);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('employees.title')}</h1>
          <p className="text-small text-text-3">{data?.total ?? 0} {t('employees.records')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('employees.addNew')}
        </Button>
      </div>

      <TopPerformers />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <Input placeholder={t('employees.searchPlaceholder')} className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t('employees.type')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('employees.allTypes')}</SelectItem>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={(v) => { setDeptFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t('employees.department')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('employees.allDepartments')}</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t('employees.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('employees.allStatuses')}</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table / Cards */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">

        {/* Mobile: card list */}
        <div className="md:hidden">
          {(data?.items ?? []).length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('employees.noEmployees')}</div>
          ) : (
            <div className="divide-y divide-border">
              {(data?.items ?? []).map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/20 text-small font-bold text-brand shrink-0">
                    {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-1 truncate">{emp.firstName} {emp.lastName}</p>
                    <p className="text-tiny text-text-3 truncate">{emp.email}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge variant={TYPE_COLORS[emp.type] ?? 'secondary'}>{TYPE_LABELS[emp.type as keyof typeof TYPE_LABELS] ?? emp.type}</Badge>
                      <Badge variant={STATUS_COLORS[emp.status] ?? 'secondary'}>{STATUS_LABELS[emp.status as keyof typeof STATUS_LABELS] ?? emp.status}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <ActionButton icon={Eye} title={t('common.view')} onClick={() => setViewingEmpId(emp.id)} />
                    <ActionButton icon={Pencil} title={t('common.edit')} onClick={() => setEditEmp(emp)} />
                    <ActionButton icon={Trash2} title={t('employees.deactivate')} variant="danger" onClick={() => setDeactivateEmp(emp)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop: full table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('employees.employee')}</TableHead>
                <TableHead>{t('employees.employeeCode')}</TableHead>
                <TableHead>{t('employees.department')}</TableHead>
                <TableHead>{t('employees.type')}</TableHead>
                <TableHead>{t('employees.status')}</TableHead>
                <TableHead>{t('employees.salary')}</TableHead>
                <TableHead className="w-32 text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-text-3">{t('employees.noEmployees')}</TableCell>
                </TableRow>
              ) : (
                (data?.items ?? []).map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-tiny font-bold text-brand shrink-0">
                          {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-text-1">{emp.firstName} {emp.lastName}</p>
                          <p className="text-tiny text-text-3">{emp.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-small text-text-2">{emp.employeeCode}</TableCell>
                    <TableCell className="text-small text-text-2">{(emp.department as unknown as { name: string } | null)?.name ?? '—'}</TableCell>
                    <TableCell><Badge variant={TYPE_COLORS[emp.type] ?? 'secondary'}>{TYPE_LABELS[emp.type as keyof typeof TYPE_LABELS] ?? emp.type}</Badge></TableCell>
                    <TableCell><Badge variant={STATUS_COLORS[emp.status] ?? 'secondary'}>{STATUS_LABELS[emp.status as keyof typeof STATUS_LABELS] ?? emp.status}</Badge></TableCell>
                    <TableCell className="text-small text-text-2">
                      {emp.baseSalary ? `$${Number(emp.baseSalary).toLocaleString()} ${emp.baseCurrency}` : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <ActionButton icon={Eye} title={t('common.view')} onClick={() => setViewingEmpId(emp.id)} />
                        <ActionButton icon={Pencil} title={t('common.edit')} onClick={() => setEditEmp(emp)} />
                        <ActionButton icon={Trash2} title={t('employees.deactivate')} variant="danger" onClick={() => setDeactivateEmp(emp)} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

      </div>

      {/* Pagination */}
      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-small text-text-3">{t('employees.page')} {page} {t('employees.of')} {data?.totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" /> {t('common.previous')}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>
              {t('common.next')} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {viewingEmpId && (
        <EmployeeViewDialog employeeId={viewingEmpId} onClose={() => setViewingEmpId(null)} />
      )}

      <CreateEmployeeDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
        departments={departments}
      />

      {editEmp && (
        <EditEmployeeDialog
          key={editEmp.id}
          employee={editEmp}
          departments={departments}
          onClose={() => setEditEmp(null)}
          onUpdated={() => { setEditEmp(null); void refetch(); }}
        />
      )}

      {deactivateEmp && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeactivateEmp(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('employees.deactivate')}</DialogTitle>
            </DialogHeader>
            <p className="text-small text-text-2">
              {t('employees.deactivateConfirm')}
            </p>
            <p className="text-small font-semibold text-text-1">
              {deactivateEmp.firstName} {deactivateEmp.lastName}
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeactivateEmp(null)}>{t('common.cancel')}</Button>
              <Button
                variant="destructive"
                loading={deactivate.isPending}
                onClick={() => deactivate.mutate({ id: deactivateEmp.id })}
              >
                {t('employees.deactivate')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Employee View Dialog ─────────────────────────────────────────────────────

type EmpDetail = inferRouterOutputs<AppRouter>['employees']['getById'];
type ActivityItem = inferRouterOutputs<AppRouter>['employees']['listActivity'][number];

const TABS_VIEW = ['overview', 'compensation', 'documents', 'activity'] as const;
type ViewTab = typeof TABS_VIEW[number];

function EmployeeViewDialog({ employeeId, onClose }: { employeeId: string; onClose: () => void }): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<ViewTab>('overview');
  const [showAccount, setShowAccount] = useState(false);

  const { data: emp, isLoading } = trpc.employees.getById.useQuery({ id: employeeId });
  const { data: activity = [] } = trpc.employees.listActivity.useQuery(
    { employeeId },
    { enabled: activeTab === 'activity' },
  );

  const TYPE_LABELS: Record<string, string> = {
    FULL_TIME: t('employees.types.FULL_TIME'),
    EXTERNAL: t('employees.types.EXTERNAL'),
    CONTRACTOR: t('employees.types.CONTRACTOR'),
  };
  const STATUS_LABELS: Record<string, string> = {
    ACTIVE: t('employees.statuses.ACTIVE'),
    INACTIVE: t('employees.statuses.INACTIVE'),
    SUSPENDED: t('employees.statuses.SUSPENDED'),
    ON_LEAVE: t('employees.statuses.ON_LEAVE'),
  };
  const ACTION_LABELS: Record<string, string> = {
    'employee.created': t('employees.activityActions.employeeCreated'),
    'employee.updated': t('employees.activityActions.employeeUpdated'),
    'employee.deactivated': t('employees.activityActions.employeeDeactivated'),
  };
  const TAB_LABELS: Record<ViewTab, string> = {
    overview: t('employees.overviewTab'),
    compensation: t('employees.compensationTab'),
    documents: t('employees.documentsTab'),
    activity: t('employees.activityTab'),
  };

  const fmt = (d: string | Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  const country = emp?.country as { code: string; name: string; currency: string } | null;
  const department = emp?.department as { name: string } | null;
  const supervisor = emp?.supervisor as { id: string; firstName: string; lastName: string } | null;
  const documents = (emp?.documents as Array<{ id: string; type: string; url: string; createdAt: string }>) ?? [];
  const empCast = emp as (EmpDetail & { city?: string; hourlyRate?: number; paymentMethod?: string; bankAccount?: string }) | undefined;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        {/* Header */}
        {emp && (
          <div className="flex items-start gap-3 pl-5 pr-12 pt-5 pb-4 border-b border-border">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/20 text-sm font-bold text-brand shrink-0 mt-0.5">
              {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text-1 truncate">{emp.firstName} {emp.lastName}</p>
              <p className="text-xs text-text-3 truncate">{emp.position}</p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="font-mono text-[10px] text-text-muted border border-border rounded px-1.5 py-0.5">{emp.employeeCode}</span>
                <Badge variant={STATUS_COLORS[emp.status] ?? 'secondary'}>{STATUS_LABELS[emp.status] ?? emp.status}</Badge>
                <Badge variant={TYPE_COLORS[emp.type] ?? 'secondary'}>{TYPE_LABELS[emp.type] ?? emp.type}</Badge>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-border px-5 scrollbar-none">
          {TABS_VIEW.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0',
                activeTab === tab
                  ? 'border-brand text-brand'
                  : 'border-transparent text-text-3 hover:text-text-1',
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 min-h-[260px] max-h-[65vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-text-muted text-sm">Cargando...</div>
          ) : emp ? (
            <>
              {/* Visión general */}
              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1.5 mb-2">
                      <UserCheck className="h-3 w-3" />{t('employees.personalInfo')}
                    </p>
                    <EmpInfoRow icon={Mail} label={t('employees.email')} value={emp.email} />
                    <EmpInfoRow icon={Phone} label={t('employees.phone')} value={emp.phone ?? '—'} />
                    <EmpInfoRow icon={MapPin} label={t('employees.country')} value={country ? `${country.name} (${country.code})` : '—'} />
                    <EmpInfoRow icon={MapPin} label={t('employees.city')} value={empCast?.city ?? '—'} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1.5 mb-2">
                      <Briefcase className="h-3 w-3" />{t('employees.workInfo')}
                    </p>
                    <EmpInfoRow icon={Building2} label={t('employees.department')} value={department?.name ?? '—'} />
                    <EmpInfoRow icon={Briefcase} label={t('employees.position')} value={emp.position} />
                    <EmpInfoRow icon={Calendar} label={t('employees.startDate')} value={fmt(emp.startDate)} />
                    {supervisor && <EmpInfoRow icon={UserCheck} label={t('employees.supervisor')} value={`${supervisor.firstName} ${supervisor.lastName}`} />}
                  </div>
                </div>
              )}

              {/* Compensación */}
              {activeTab === 'compensation' && (
                <div className="space-y-0">
                  <p className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1.5 mb-3">
                    <DollarSign className="h-3 w-3" />{t('employees.compensationTab')}
                  </p>
                  <div className="rounded-lg border border-border divide-y divide-border">
                    <EmpInfoRow icon={DollarSign} label={t('employees.baseSalary')} value={emp.baseSalary ? `$${Number(emp.baseSalary).toLocaleString()} ${emp.baseCurrency}` : '—'} padded />
                    <EmpInfoRow icon={DollarSign} label={t('employees.hourlyRate')} value={empCast?.hourlyRate ? `$${Number(empCast.hourlyRate).toFixed(2)}/hr` : '—'} padded />
                    <EmpInfoRow icon={CreditCard} label={t('employees.paymentMethod')} value={empCast?.paymentMethod ?? '—'} padded />
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-text-3">
                        <CreditCard className="h-3.5 w-3.5 shrink-0" />
                        {t('employees.bankAccount')}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-text-1">
                          {empCast?.bankAccount
                            ? showAccount ? empCast.bankAccount : '••••••••' + empCast.bankAccount.slice(-4)
                            : '—'}
                        </span>
                        {empCast?.bankAccount && (
                          <button onClick={() => setShowAccount(!showAccount)} className="text-text-muted hover:text-text-2">
                            {showAccount ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Documentos */}
              {activeTab === 'documents' && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1.5 mb-3">
                    <FileText className="h-3 w-3" />{t('employees.documentsTab')}
                  </p>
                  {documents.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-text-3 text-sm">{t('employees.noDocuments')}</div>
                  ) : (
                    <ul className="space-y-2">
                      {documents.map((doc) => (
                        <li key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-text-3 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-text-1">{doc.type}</p>
                              <p className="text-[10px] text-text-3">{fmt(doc.createdAt)}</p>
                            </div>
                          </div>
                          <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">
                            {t('common.view')}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Actividad */}
              {activeTab === 'activity' && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1.5 mb-3">
                    <Activity className="h-3 w-3" />{t('employees.activityTab')}
                  </p>
                  {activity.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-text-3 text-sm">{t('employees.noActivity')}</div>
                  ) : (
                    <ul className="divide-y divide-border/50">
                      {activity.map((item) => {
                        const actorRaw = item.actorUser as unknown;
                        const actor = Array.isArray(actorRaw)
                          ? (actorRaw[0] as { firstName: string; lastName: string } | undefined)
                          : (actorRaw as { firstName: string; lastName: string } | null);
                        const actorName = actor ? `${actor.firstName} ${actor.lastName}` : t('employees.system');
                        return (
                          <li key={item.id} className="flex items-start gap-3 py-2.5">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-[9px] font-bold text-brand shrink-0 mt-0.5">
                              {actorName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-text-1">{ACTION_LABELS[item.action] ?? item.action}</p>
                              <p className="text-[10px] text-text-muted">{actorName}</p>
                            </div>
                            <p className="text-[10px] text-text-muted shrink-0">{fmt(item.createdAt)}</p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmpInfoRow({ icon: Icon, label, value, padded }: { icon: React.ElementType; label: string; value: string; padded?: boolean }): React.ReactElement {
  return (
    <div className={cn('flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3', padded ? 'px-3 py-2.5' : 'py-2 border-b border-border/50 last:border-0')}>
      <div className="flex items-center gap-2 text-xs text-text-3 shrink-0">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </div>
      <span className="text-xs text-text-1 sm:text-right min-w-0 break-words pl-5 sm:pl-0">{value}</span>
    </div>
  );
}

// ─── Action Button ────────────────────────────────────────────────────────────

function ActionButton({
  icon: Icon,
  title,
  variant = 'default',
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  variant?: 'default' | 'danger';
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      title={title}
      onClick={onClick}
      className={[
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        variant === 'danger'
          ? 'text-text-muted hover:text-destructive hover:bg-destructive/10'
          : 'text-text-muted hover:text-text-1 hover:bg-border/60',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Top 5 Performers ────────────────────────────────────────────────────────

const TOP_5 = [
  { name: 'Maria González',  initials: 'MG', position: 'Recepcionista',   clinic: 'Provo',          score: 96 },
  { name: 'Carlos Méndez',   initials: 'CM', position: 'Terapeuta',        clinic: 'Spanish Fork',   score: 93 },
  { name: 'Ana Ramírez',     initials: 'AR', position: 'Enfermera',        clinic: 'Pleasant Grove', score: 91 },
  { name: 'Luis Torres',     initials: 'LT', position: 'Fisioterapeuta',   clinic: 'West Valley',    score: 88 },
  { name: 'Sofía Vargas',    initials: 'SV', position: 'Coordinadora',     clinic: 'South Murray',   score: 85 },
];

const RANK_STYLES = [
  { badge: '#F59E0B', label: '1°', avatar: 'from-amber-400 to-yellow-500',  ring: 'ring-amber-400/40' },
  { badge: '#94A3B8', label: '2°', avatar: 'from-slate-400 to-slate-500',   ring: 'ring-slate-400/40' },
  { badge: '#B45309', label: '3°', avatar: 'from-amber-700 to-amber-800',   ring: 'ring-amber-700/40' },
  { badge: '#6366F1', label: '4°', avatar: 'from-indigo-400 to-indigo-600', ring: 'ring-indigo-400/30' },
  { badge: '#6366F1', label: '5°', avatar: 'from-indigo-400 to-indigo-600', ring: 'ring-indigo-400/30' },
];

function scoreColor(s: number) {
  if (s >= 90) return { bar: 'bg-emerald-500', text: 'text-emerald' };
  if (s >= 80) return { bar: 'bg-brand',       text: 'text-brand' };
  return           { bar: 'bg-amber-400',      text: 'text-amber' };
}

function TopPerformers() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-amber-400" />
        <p className="text-sm font-semibold text-text-1">Top 5 Empleados del Mes</p>
        <span className="ml-auto text-xs text-text-3 bg-border/60 rounded-full px-2 py-0.5">Mayo 2026</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TOP_5.map((emp, i) => {
          const rank  = RANK_STYLES[i]!;
          const color = scoreColor(emp.score);
          return (
            <div
              key={emp.name}
              className="relative flex flex-col items-center gap-2 rounded-xl border border-border bg-bg-0 p-3 text-center"
            >
              {/* Rank badge */}
              <span
                className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-sm"
                style={{ background: rank.badge }}
              >
                {i + 1}
              </span>

              {/* Avatar */}
              <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${rank.avatar} ring-2 ${rank.ring} text-xs font-bold text-white shadow-sm`}>
                {emp.initials}
              </div>

              {/* Info */}
              <div className="w-full">
                <p className="text-xs font-semibold text-text-1 truncate">{emp.name}</p>
                <p className="text-[10px] text-text-3 truncate">{emp.position}</p>
                <p className="text-[10px] text-text-muted truncate">{emp.clinic}</p>
              </div>

              {/* Score bar */}
              <div className="w-full space-y-1">
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div className={`h-full rounded-full ${color.bar} transition-all`} style={{ width: `${emp.score}%` }} />
                </div>
                <p className={`text-xs font-bold font-mono ${color.text}`}>{emp.score}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Create Employee Dialog ───────────────────────────────────────────────────

function CreateEmployeeDialog({
  open, onClose, onCreated, departments,
}: {
  open: boolean; onClose: () => void; onCreated: () => void; departments: Department[];
}): React.ReactElement {
  const t = useTranslations();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    type: 'FULL_TIME' as const, departmentId: '', position: '', startDate: '',
    countryId: '', baseSalary: '', baseCurrency: 'USD' as const, paymentMethod: 'BANK_TRANSFER' as const, bankAccount: '',
  });

  const create = trpc.employees.create.useMutation({
    onSuccess: () => { toast.success(t('employees.created')); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (): void => {
    create.mutate({
      ...form,
      startDate: new Date(form.startDate),
      baseSalary: form.baseSalary ? Number(form.baseSalary) : undefined,
      phone: form.phone || undefined,
      bankAccount: form.bankAccount || undefined,
    });
  };

  const f = (k: keyof typeof form, v: string): void => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setStep(1); } }}>
      <DialogContent className="flex flex-col max-h-[90dvh] w-full sm:max-w-xl overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('employees.newEmployeeStep', { step })}</DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="flex gap-1.5 shrink-0">
          {[1, 2].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-brand' : 'bg-border'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{t('employees.firstName')} *</Label><Input required value={form.firstName} onChange={(e) => f('firstName', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t('employees.lastName')} *</Label><Input required value={form.lastName} onChange={(e) => f('lastName', e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>{t('employees.email')} *</Label><Input type="email" required value={form.email} onChange={(e) => f('email', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t('employees.phone')}</Label><Input value={form.phone} onChange={(e) => f('phone', e.target.value)} /></div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('employees.type')} *</Label>
                <Select value={form.type} onValueChange={(v) => f('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">{t('employees.types.FULL_TIME')}</SelectItem>
                    <SelectItem value="EXTERNAL">{t('employees.types.EXTERNAL')}</SelectItem>
                    <SelectItem value="CONTRACTOR">{t('employees.types.CONTRACTOR')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('employees.startDate')} *</Label>
                <Input type="date" required value={form.startDate} onChange={(e) => f('startDate', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.department')} *</Label>
              <Select value={form.departmentId} onValueChange={(v) => f('departmentId', v)}>
                <SelectTrigger><SelectValue placeholder={t('employees.selectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('employees.position')} *</Label><Input required value={form.position} onChange={(e) => f('position', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>{t('employees.country')} *</Label>
              <Select value={form.countryId} onValueChange={(v) => f('countryId', v)}>
                <SelectTrigger><SelectValue placeholder={t('employees.selectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States (USD)</SelectItem>
                  <SelectItem value="BO">Bolivia (BOB)</SelectItem>
                  <SelectItem value="PE">Peru (PEN)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="border-t" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{t('employees.baseSalary')}</Label><Input type="number" value={form.baseSalary} onChange={(e) => f('baseSalary', e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>{t('finance.currency')}</Label>
                <Select value={form.baseCurrency} onValueChange={(v) => f('baseCurrency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="BOB">BOB</SelectItem>
                    <SelectItem value="PEN">PEN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.paymentMethod')}</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => f('paymentMethod', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">{t('employees.bankTransfer')}</SelectItem>
                  <SelectItem value="CASH">{t('employees.cash')}</SelectItem>
                  <SelectItem value="ZELLE">Zelle</SelectItem>
                  <SelectItem value="WIRE">Wire</SelectItem>
                  <SelectItem value="OTHER">{t('employees.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('employees.bankAccount')}</Label><Input value={form.bankAccount} onChange={(e) => f('bankAccount', e.target.value)} placeholder={t('employees.bankAccountPlaceholder')} /></div>
          </div>
        )}

        <DialogFooter className="shrink-0">
          {step > 1 && <Button type="button" variant="ghost" onClick={() => setStep(s => s - 1)}>{t('common.back')}</Button>}
          <Button type="button" variant="ghost" onClick={() => { onClose(); setStep(1); }}>{t('common.cancel')}</Button>
          {step < 2 ? (
            <Button type="button" onClick={() => setStep(s => s + 1)} disabled={
              step === 1 && (!form.firstName || !form.lastName || !form.email)
            }>
              {t('common.next')}
            </Button>
          ) : (
            <Button onClick={handleSubmit} loading={create.isPending}>{t('employees.createEmployee')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Employee Dialog ─────────────────────────────────────────────────────

function EditEmployeeDialog({
  employee, departments, onClose, onUpdated,
}: {
  employee: EmployeeListItem; departments: Department[]; onClose: () => void; onUpdated: () => void;
}): React.ReactElement {
  const t = useTranslations();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone ?? '',
    type: employee.type as 'FULL_TIME' | 'EXTERNAL' | 'CONTRACTOR',
    departmentId: (employee.departmentId as string | null) ?? '',
    position: employee.position,
    startDate: employee.startDate ? new Date(employee.startDate).toISOString().split('T')[0]! : '',
    countryId: (employee.countryId as string | null) ?? '',
    baseSalary: employee.baseSalary ? String(employee.baseSalary) : '',
    baseCurrency: (employee.baseCurrency ?? 'USD') as 'USD' | 'BOB' | 'PEN',
    paymentMethod: 'BANK_TRANSFER' as 'BANK_TRANSFER' | 'CASH' | 'ZELLE' | 'WIRE' | 'OTHER',
    bankAccount: '',
  });

  const update = trpc.employees.update.useMutation({
    onSuccess: () => { toast.success(t('employees.updated')); onUpdated(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (): void => {
    update.mutate({
      id: employee.id,
      data: {
        ...form,
        startDate: form.startDate ? new Date(form.startDate) : undefined,
        baseSalary: form.baseSalary ? Number(form.baseSalary) : undefined,
        phone: form.phone || undefined,
        bankAccount: form.bankAccount || undefined,
      },
    });
  };

  const f = (k: keyof typeof form, v: string): void => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { onClose(); setStep(1); } }}>
      <DialogContent className="flex flex-col max-h-[90dvh] w-full sm:max-w-xl overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('employees.editEmployeeStep', { step })}</DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="flex gap-1.5 shrink-0">
          {[1, 2].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-brand' : 'bg-border'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{t('employees.firstName')} *</Label><Input required value={form.firstName} onChange={(e) => f('firstName', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t('employees.lastName')} *</Label><Input required value={form.lastName} onChange={(e) => f('lastName', e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>{t('employees.email')} *</Label><Input type="email" required value={form.email} onChange={(e) => f('email', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t('employees.phone')}</Label><Input value={form.phone} onChange={(e) => f('phone', e.target.value)} /></div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('employees.type')} *</Label>
                <Select value={form.type} onValueChange={(v) => f('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">{t('employees.types.FULL_TIME')}</SelectItem>
                    <SelectItem value="EXTERNAL">{t('employees.types.EXTERNAL')}</SelectItem>
                    <SelectItem value="CONTRACTOR">{t('employees.types.CONTRACTOR')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('employees.startDate')} *</Label>
                <Input type="date" required value={form.startDate} onChange={(e) => f('startDate', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.department')} *</Label>
              <Select value={form.departmentId} onValueChange={(v) => f('departmentId', v)}>
                <SelectTrigger><SelectValue placeholder={t('employees.selectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('employees.position')} *</Label><Input required value={form.position} onChange={(e) => f('position', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>{t('employees.country')} *</Label>
              <Select value={form.countryId} onValueChange={(v) => f('countryId', v)}>
                <SelectTrigger><SelectValue placeholder={t('employees.selectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States (USD)</SelectItem>
                  <SelectItem value="BO">Bolivia (BOB)</SelectItem>
                  <SelectItem value="PE">Peru (PEN)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="border-t" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{t('employees.baseSalary')}</Label><Input type="number" value={form.baseSalary} onChange={(e) => f('baseSalary', e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>{t('finance.currency')}</Label>
                <Select value={form.baseCurrency} onValueChange={(v) => f('baseCurrency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="BOB">BOB</SelectItem>
                    <SelectItem value="PEN">PEN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.paymentMethod')}</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => f('paymentMethod', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">{t('employees.bankTransfer')}</SelectItem>
                  <SelectItem value="CASH">{t('employees.cash')}</SelectItem>
                  <SelectItem value="ZELLE">Zelle</SelectItem>
                  <SelectItem value="WIRE">Wire</SelectItem>
                  <SelectItem value="OTHER">{t('employees.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('employees.bankAccount')}</Label><Input value={form.bankAccount} onChange={(e) => f('bankAccount', e.target.value)} placeholder={t('employees.bankAccountPlaceholder')} /></div>
          </div>
        )}

        <DialogFooter className="shrink-0">
          {step > 1 && <Button type="button" variant="ghost" onClick={() => setStep(s => s - 1)}>{t('common.back')}</Button>}
          <Button type="button" variant="ghost" onClick={() => { onClose(); setStep(1); }}>{t('common.cancel')}</Button>
          {step < 2 ? (
            <Button type="button" onClick={() => setStep(s => s + 1)} disabled={
              step === 1 && (!form.firstName || !form.lastName || !form.email)
            }>
              {t('common.next')}
            </Button>
          ) : (
            <Button onClick={handleSubmit} loading={update.isPending}>{t('common.save')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
