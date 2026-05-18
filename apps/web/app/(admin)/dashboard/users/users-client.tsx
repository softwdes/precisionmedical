'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, cn,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label,
} from '@precision/ui';
import { Plus, Search, Pencil, Trash2, Eye, KeyRound, Mail, ShieldCheck, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type UsersListOutput = inferRouterOutputs<AppRouter>['users']['list'];
type UserRow = UsersListOutput['users'][number];

type NotificationData = {
  initials: string;
  name: string;
  email: string;
  title: string;
  emailSent: boolean;
  emailError?: string | null;
  role?: string;
};

type ToastItem = NotificationData & { id: string };

const ROLE_DISPLAY: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  EMPLOYEE: 'Empleado',
  LAWYER: 'Abogado',
  PROVIDER: 'Proveedor',
  AUDITOR_AI: 'Auditor AI',
};

const PROTECTED_EMAIL = 'erick@precisionmedicalcare.com';

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success', PENDING_VERIFICATION: 'warning', SUSPENDED: 'destructive', INACTIVE: 'secondary',
};

export function UsersClient({ initial }: { initial: UsersListOutput }): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const addToast = useCallback((n: NotificationData) => {
    setToasts(prev => [...prev, { ...n, id: `${Date.now()}-${Math.random()}` }]);
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const ROLE_LABELS = {
    SUPER_ADMIN: t('users.roles.SUPER_ADMIN'),
    ADMIN: t('users.roles.ADMIN'),
    EMPLOYEE: t('users.roles.EMPLOYEE'),
    LAWYER: t('users.roles.LAWYER'),
    PROVIDER: t('users.roles.PROVIDER'),
    AUDITOR_AI: t('users.roles.AUDITOR_AI'),
  };

  const STATUS_LABELS = {
    ACTIVE: t('users.statuses.ACTIVE'),
    INACTIVE: t('users.statuses.INACTIVE'),
    SUSPENDED: t('users.statuses.SUSPENDED'),
    PENDING_VERIFICATION: t('users.statuses.PENDING_VERIFICATION'),
  };

  const { data, refetch } = trpc.users.list.useQuery(
    {
      page, pageSize: 20, search: search || undefined,
      role: (roleFilter as 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE' | 'LAWYER' | 'PROVIDER' | 'AUDITOR_AI' | undefined) || undefined,
      status: (statusFilter as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION' | undefined) || undefined,
    },
    { initialData: initial },
  );

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => { toast.success('Usuario eliminado'); setDeletingUser(null); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function ActionButtons({ user }: { user: UserRow }) {
    const isProtected = user.email === PROTECTED_EMAIL;
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); setViewingUserId(user.id); }}
          className="p-1.5 rounded text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
          title="Ver usuario"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setEditingUser(user); }}
          className="p-1.5 rounded text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
          title="Editar usuario"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {!isProtected && (
          <button
            onClick={(e) => { e.stopPropagation(); setDeletingUser(user); }}
            className="p-1.5 rounded text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
            title="Eliminar usuario"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-3 py-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('users.title')}</h1>
          <p className="text-small text-text-3">{data?.total ?? 0} {t('users.registered')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('users.addNew')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <Input
            placeholder={t('users.searchPlaceholder')}
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('users.role')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('users.allRoles')}</SelectItem>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t('common.status')} />
          </SelectTrigger>
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
          {(data?.users ?? []).length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('users.noUsers')}</div>
          ) : (
            <div className="divide-y divide-border">
              {(data?.users ?? []).map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-surface/50 active:bg-surface transition-colors"
                  onClick={() => setViewingUserId(user.id)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand text-small font-bold text-white shrink-0">
                    {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-1 truncate">{user.firstName} {user.lastName}</p>
                    <p className="text-tiny text-text-3 truncate">{user.email}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge variant="secondary">{ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}</Badge>
                      <Badge variant={STATUS_COLORS[user.status] ?? 'secondary'}>{STATUS_LABELS[user.status as keyof typeof STATUS_LABELS] ?? user.status}</Badge>
                    </div>
                  </div>
                  <ActionButtons user={user} />
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
                <TableHead>{t('users.userLabel')}</TableHead>
                <TableHead>{t('users.role')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('users.lastAccess')}</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.users ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-text-3">
                    {t('users.noUsers')}
                  </TableCell>
                </TableRow>
              ) : (
                (data?.users ?? []).map((user) => (
                  <TableRow key={user.id} className="cursor-pointer" onClick={() => setViewingUserId(user.id)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-brand text-tiny font-bold text-white shrink-0">
                          {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-text-1">{user.firstName} {user.lastName}</p>
                          <p className="text-tiny text-text-3">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[user.status] ?? 'secondary'}>{STATUS_LABELS[user.status as keyof typeof STATUS_LABELS] ?? user.status}</Badge>
                    </TableCell>
                    <TableCell className="text-text-3 text-small">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES') : '—'}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionButtons user={user} />
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
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
            <Button variant="outline" size="sm" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateUserDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void refetch(); }} onNotify={addToast} />

      {viewingUserId && (
        <UserViewDialog userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); void refetch(); }}
          onNotify={addToast}
        />
      )}

      {deletingUser && (
        <DeleteConfirmDialog
          user={deletingUser}
          isPending={deleteUser.isPending}
          onConfirm={() => deleteUser.mutate({ id: deletingUser.id })}
          onClose={() => setDeletingUser(null)}
        />
      )}

      {toasts.length > 0 && createPortal(
        <UserCreatedModal key={toasts[0].id} {...toasts[0]} onDone={() => removeToast(toasts[0].id)} />,
        document.body,
      )}
    </div>
  );
}

// ─── Create Dialog ───────────────────────────────────────────────────────────
function CreateUserDialog({ open, onClose, onCreated, onNotify }: { open: boolean; onClose: () => void; onCreated: () => void; onNotify: (n: NotificationData) => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', role: 'EMPLOYEE' as const, phone: '' });

  const ROLE_LABELS = {
    SUPER_ADMIN: t('users.roles.SUPER_ADMIN'),
    ADMIN: t('users.roles.ADMIN'),
    EMPLOYEE: t('users.roles.EMPLOYEE'),
    LAWYER: t('users.roles.LAWYER'),
    PROVIDER: t('users.roles.PROVIDER'),
    AUDITOR_AI: t('users.roles.AUDITOR_AI'),
  };

  const create = trpc.users.create.useMutation({
    onSuccess: (result) => {
      onNotify({
        initials: `${result.firstName.charAt(0)}${result.lastName.charAt(0)}`.toUpperCase(),
        name: `${result.firstName} ${result.lastName}`,
        email: result.email,
        title: 'Usuario creado exitosamente',
        emailSent: result.emailSent,
        emailError: result.emailError,
        role: result.role,
      });
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    create.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col max-h-[90dvh] overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('users.addNew')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('employees.firstName')}</Label>
                <Input required value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('employees.lastName')}</Label>
                <Input required value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('auth.email')}</Label>
              <Input type="email" required value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('users.role')}</Label>
              <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v as typeof form.role }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.phone')} <span className="text-text-muted font-normal">({t('common.optional')})</span></Label>
              <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" loading={create.isPending}>{t('users.createUser')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Dialog ─────────────────────────────────────────────────────────────
function EditUserDialog({ user, onClose, onSaved, onNotify }: { user: UserRow; onClose: () => void; onSaved: () => void; onNotify: (n: NotificationData) => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE' | 'LAWYER' | 'PROVIDER' | 'AUDITOR_AI',
    status: user.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION',
    phone: user.phone ?? '',
  });

  const ROLE_LABELS = {
    SUPER_ADMIN: t('users.roles.SUPER_ADMIN'), ADMIN: t('users.roles.ADMIN'),
    EMPLOYEE: t('users.roles.EMPLOYEE'), LAWYER: t('users.roles.LAWYER'),
    PROVIDER: t('users.roles.PROVIDER'), AUDITOR_AI: t('users.roles.AUDITOR_AI'),
  };

  const STATUS_LABELS = {
    ACTIVE: t('users.statuses.ACTIVE'), INACTIVE: t('users.statuses.INACTIVE'),
    SUSPENDED: t('users.statuses.SUSPENDED'), PENDING_VERIFICATION: t('users.statuses.PENDING_VERIFICATION'),
  };

  const update = trpc.users.update.useMutation({
    onSuccess: () => { toast.success('Usuario actualizado'); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const sendAccess = trpc.users.sendPasswordReset.useMutation({
    onSuccess: () => {
      onNotify({
        initials: `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        title: 'Enlace de acceso enviado',
        emailSent: true,
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    update.mutate({ id: user.id, ...form });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col max-h-[90dvh] overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('users.editUser')}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 py-1 px-1 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white shrink-0">
            {user.firstName.charAt(0)}{user.lastName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium text-text-1">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-text-3">{user.email}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden pt-1">
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('employees.firstName')}</Label>
                <Input required value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('employees.lastName')}</Label>
                <Input required value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('users.role')}</Label>
                <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v as typeof form.role }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('common.status')}</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as typeof form.status }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.phone')} <span className="text-text-muted font-normal">({t('common.optional')})</span></Label>
              <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              loading={sendAccess.isPending}
              onClick={() => sendAccess.mutate({ id: user.id })}
              className="sm:mr-auto"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Enviar acceso
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" loading={update.isPending}>{t('users.saveChanges')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── User View Dialog ─────────────────────────────────────────────────────────
function UserViewDialog({ userId, onClose }: { userId: string; onClose: () => void }): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'activity'>('profile');

  const { data: user, isLoading } = trpc.users.getById.useQuery({ id: userId });
  const { data: activity = [] } = trpc.users.listActivity.useQuery({ userId });

  const ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: t('users.roles.SUPER_ADMIN'), ADMIN: t('users.roles.ADMIN'),
    EMPLOYEE: t('users.roles.EMPLOYEE'), LAWYER: t('users.roles.LAWYER'),
    PROVIDER: t('users.roles.PROVIDER'), AUDITOR_AI: t('users.roles.AUDITOR_AI'),
  };
  const STATUS_LABELS: Record<string, string> = {
    ACTIVE: t('users.statuses.ACTIVE'), INACTIVE: t('users.statuses.INACTIVE'),
    SUSPENDED: t('users.statuses.SUSPENDED'), PENDING_VERIFICATION: t('users.statuses.PENDING_VERIFICATION'),
  };
  const ACTION_LABELS: Record<string, string> = {
    'user.created': t('users.activityActions.userCreated'),
    'user.updated': t('users.activityActions.userUpdated'),
    'user.suspended': t('users.activityActions.userSuspended'),
    'employee.created': t('users.activityActions.employeeCreated'),
    'employee.updated': t('users.activityActions.employeeUpdated'),
    'payment.created': t('users.activityActions.paymentCreated'),
    'payment.paid': t('users.activityActions.paymentPaid'),
  };

  const tabs = [
    { id: 'profile' as const, label: t('users.profile') },
    { id: 'security' as const, label: t('users.security') },
    { id: 'activity' as const, label: t('users.activityTab') },
  ];

  const fmt = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const fmtFull = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES') : '—';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="p-0 flex flex-col max-h-[90dvh] overflow-hidden">
        {/* User header */}
        {user && (
          <div className="flex items-start gap-3 pl-5 pr-12 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand text-sm font-bold text-white shrink-0 mt-0.5">
              {user.firstName.charAt(0)}{user.lastName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text-1 truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-text-3 truncate">{user.email}</p>
              <div className="mt-1.5">
                <Badge variant={STATUS_COLORS[user.status] ?? 'secondary'}>{STATUS_LABELS[user.status] ?? user.status}</Badge>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-border px-5 scrollbar-none shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0',
                activeTab === tab.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-text-3 hover:text-text-1',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5 min-h-[200px] flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-text-muted text-sm">{t('common.loading')}</div>
          ) : user ? (
            <>
              {/* Perfil */}
              {activeTab === 'profile' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('employees.firstName')}</p>
                      <p className="text-sm text-text-1">{user.firstName}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('employees.lastName')}</p>
                      <p className="text-sm text-text-1">{user.lastName}</p>
                    </div>
                    <div className="col-span-2 space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('auth.email')}</p>
                      <p className="text-sm text-text-1">{user.email}</p>
                    </div>
                    {user.phone && (
                      <div className="col-span-2 space-y-0.5">
                        <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('employees.phone')}</p>
                        <p className="text-sm text-text-1">{user.phone}</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('users.role')}</p>
                      <Badge variant="secondary">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('users.createdAt')}</p>
                      <p className="text-sm text-text-1">{fmt(user.createdAt)}</p>
                    </div>
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">{t('users.preferences')}</p>
                    <div className="flex gap-2">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-surface border border-border text-text-2">
                        {user.preferredLocale === 'es' ? t('users.spanish') : t('users.english')}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-surface border border-border text-text-2">
                        {user.preferredTheme === 'dark' ? t('users.dark') : t('users.light')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Seguridad */}
              {activeTab === 'security' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-surface/50 px-4 py-3">
                    <p className="text-xs font-medium text-text-1">{t('users.mfa')}</p>
                    <Badge variant={user.mfaEnabled ? 'success' : 'secondary'}>
                      {user.mfaEnabled ? t('users.mfaEnabled') : t('users.mfaDisabled')}
                    </Badge>
                  </div>
                  <div className="rounded-lg border border-border bg-surface/50 divide-y divide-border">
                    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-text-muted">{t('users.lastAccess')}</p>
                      <p className="text-xs font-medium text-text-1 break-all">{fmtFull(user.lastLoginAt)}</p>
                    </div>
                    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-text-muted">{t('users.lastLoginIp')}</p>
                      <p className="text-xs font-mono text-text-1">{user.lastLoginIp ?? '—'}</p>
                    </div>
                    <div className="flex justify-between items-center px-4 py-3">
                      <p className="text-xs text-text-muted">{t('common.status')}</p>
                      <Badge variant={STATUS_COLORS[user.status] ?? 'secondary'}>{STATUS_LABELS[user.status] ?? user.status}</Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Actividad */}
              {activeTab === 'activity' && (
                <div className="space-y-2">
                  {activity.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-text-3 text-sm">{t('users.noActivity')}</div>
                  ) : (
                    activity.map((entry) => {
                      const actorArr = entry.actorUser as { firstName: string; lastName: string }[] | null;
                      const actor = Array.isArray(actorArr) ? actorArr[0] : null;
                      const actorName = actor ? `${actor.firstName} ${actor.lastName}` : t('users.system');
                      return (
                        <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface/50 px-3 py-2.5">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand shrink-0 mt-0.5">
                            <span className="text-[9px] font-bold">{actorName.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-text-1">{ACTION_LABELS[entry.action] ?? entry.action}</p>
                            <p className="text-[10px] text-text-muted">{actorName}</p>
                          </div>
                          <p className="text-[10px] text-text-muted shrink-0">{fmt(entry.createdAt)}</p>
                        </div>
                      );
                    })
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

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────
function DeleteConfirmDialog({ user, isPending, onConfirm, onClose }: {
  user: UserRow;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}): React.ReactElement {
  const t = useTranslations();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col max-h-[90dvh] w-full sm:max-w-sm overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-rose-500">{t('users.deleteUser')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white shrink-0">
              {user.firstName.charAt(0)}{user.lastName.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium text-text-1">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-text-3">{user.email}</p>
            </div>
          </div>
          <p className="text-sm text-text-2 leading-relaxed">
            ¿Estás seguro de que deseas eliminar este usuario? Se eliminará su acceso al sistema y esta acción <strong className="text-text-1">no se puede deshacer</strong>.
          </p>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
          <Button
            disabled={isPending}
            loading={isPending}
            onClick={onConfirm}
            style={{ background: '#f43f5e', color: '#fff' }}
          >
            {t('users.deleteUser')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Created Modal ──────────────────────────────────────────────────────
function UserCreatedModal({ name, email, emailSent, role, onDone }: NotificationData & { onDone: () => void }): React.ReactElement {
  const [exiting, setExiting] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const dismissedRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gradientId = useRef(`cg-${Math.random().toString(36).slice(2)}`).current;

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    clearTimeout(autoTimerRef.current);
    setExiting(true);
    exitTimerRef.current = setTimeout(() => onDoneRef.current(), 300);
  }, []);

  useEffect(() => {
    // auto-dismiss: 1.5s bar delay + 6s bar duration = 7.5s
    autoTimerRef.current = setTimeout(dismiss, 7500);
    return () => {
      clearTimeout(autoTimerRef.current);
      clearTimeout(exitTimerRef.current);
    };
  }, [dismiss]);

  const roleLabel = ROLE_DISPLAY[role ?? ''] ?? role ?? '';

  return (
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 9998,
        animation: exiting ? 'modal-fade-out 0.3s ease-out forwards' : 'modal-fade-in 0.3s ease-out both',
      }} />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo usuario creado"
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          width: 420, maxWidth: 'calc(100vw - 32px)',
          background: 'var(--surface)',
          border: '0.5px solid var(--border-strong)',
          borderRadius: 20,
          overflow: 'hidden',
          zIndex: 9999,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          animation: exiting
            ? 'modal-out 0.3s cubic-bezier(0.4,0,1,1) forwards'
            : 'modal-in 0.45s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* Section 1: Header */}
        <div style={{ padding: '18px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: 0 }}>Nuevo usuario</p>
          <button
            onClick={dismiss}
            aria-label="Cerrar"
            style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Section 2: Animated check circle + name */}
        <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 16, animation: 'modal-pop-in 0.5s 0.2s ease-out both', opacity: 0 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(6,182,212,0.12))',
              border: '2px solid rgba(99,102,241,0.22)',
            }} />
            <svg width="80" height="80" viewBox="0 0 80 80" style={{ position: 'absolute', inset: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366F1" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
              <circle
                cx="40" cy="40" r="30"
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="2.5"
                strokeDasharray="188.4"
                strokeDashoffset="188.4"
                strokeLinecap="round"
                style={{ transformOrigin: '40px 40px', transform: 'rotate(-90deg)', animation: 'modal-circle-draw 1s 0.3s ease-out forwards' }}
              />
              <polyline
                points="27,40 36,49 53,31"
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="60"
                strokeDashoffset="60"
                style={{ animation: 'modal-check-draw 0.4s 1.1s ease-out forwards' }}
              />
            </svg>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.10em', margin: '0 0 4px', animation: 'modal-fade-in-up 0.4s 0.9s ease-out both', opacity: 0 }}>
            USUARIO CREADO EXITOSAMENTE
          </p>
          <p style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-1)', margin: '0 0 20px', animation: 'modal-fade-in-up 0.4s 1.0s ease-out both', opacity: 0 }}>
            {name}
          </p>
        </div>

        {/* Section 4: Info cards */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {emailSent && (
            <div style={{
              background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.22)',
              borderRadius: 12, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              animation: 'modal-fade-in-up 0.4s 1.1s ease-out both', opacity: 0,
            }}>
              <Mail size={20} color="#10B981" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#10B981', margin: 0 }}>Invitación enviada</p>
                <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</p>
              </div>
              <Check size={16} color="#10B981" style={{ flexShrink: 0 }} />
            </div>
          )}
          {roleLabel && (
            <div style={{
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)',
              borderRadius: 12, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              animation: 'modal-fade-in-up 0.4s 1.2s ease-out both', opacity: 0,
            }}>
              <ShieldCheck size={20} color="#6366F1" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#6366F1', margin: 0 }}>Rol asignado</p>
                <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>{roleLabel}</p>
              </div>
              <Check size={16} color="#6366F1" style={{ flexShrink: 0 }} />
            </div>
          )}
        </div>

        {/* Section 5: Progress bar */}
        <div style={{ padding: '20px 20px 6px', animation: 'modal-fade-in-up 0.4s 1.3s ease-out both', opacity: 0 }}>
          <div style={{ height: 4, background: 'var(--bg-2)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0,
              height: '100%', width: '100%',
              background: 'linear-gradient(90deg, #6366F1, #8B5CF6, #06B6D4)',
              borderRadius: 999,
              animation: 'modal-shrink-bar 6s 1.5s linear forwards',
            }} />
            <div style={{
              position: 'absolute', top: 0,
              left: '-100%', width: '40%', height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.50), transparent)',
              animation: 'modal-shimmer 1.8s 2s ease-in-out infinite',
            }} />
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-2)', textAlign: 'center', margin: '5px 0 0' }}>
            Se cerrará automáticamente
          </p>
        </div>

        {/* Section 6: Close button */}
        <div style={{ padding: '10px 20px 20px', animation: 'modal-fade-in-up 0.4s 1.4s ease-out both', opacity: 0 }}>
          <button
            onClick={dismiss}
            style={{
              width: '100%', padding: 12, borderRadius: 10,
              fontWeight: 500, fontSize: 14, cursor: 'pointer',
              background: 'transparent',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-1)',
              fontFamily: 'inherit',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
