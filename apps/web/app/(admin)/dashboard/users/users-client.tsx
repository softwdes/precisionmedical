'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label,
} from '@precision/ui';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type UsersListOutput = inferRouterOutputs<AppRouter>['users']['list'];
type UserRow = UsersListOutput['users'][number];

const PROTECTED_EMAIL = 'erick@precisionmedicalcare.com';

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success', PENDING_VERIFICATION: 'warning', SUSPENDED: 'destructive', INACTIVE: 'secondary',
};

export function UsersClient({ initial }: { initial: UsersListOutput }): React.ReactElement {
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);

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
    <div className="p-6 space-y-4">
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
                  onClick={() => router.push(`/dashboard/users/${user.id}`)}
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
                <TableHead className="w-20"></TableHead>
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
                  <TableRow key={user.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/users/${user.id}`)}>
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
      <CreateUserDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void refetch(); }} />

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); void refetch(); }}
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
    </div>
  );
}

// ─── Create Dialog ───────────────────────────────────────────────────────────
function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }): React.ReactElement {
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
      if (result.emailSent) {
        toast.success(`${t('users.created')} — Correo de activación enviado a ${result.email}`);
      } else {
        toast.warning(`${t('users.created')} — El correo de activación no pudo enviarse. Verifica la configuración de email.`);
      }
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.addNew')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" loading={create.isPending}>{t('users.createUser')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Dialog ─────────────────────────────────────────────────────────────
function EditUserDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }): React.ReactElement {
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

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    update.mutate({ id: user.id, ...form });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 py-1 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white shrink-0">
            {user.firstName.charAt(0)}{user.lastName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium text-text-1">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-text-3">{user.email}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" loading={update.isPending}>Guardar cambios</Button>
          </DialogFooter>
        </form>
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
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-rose-500">Eliminar usuario</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
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
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button
            disabled={isPending}
            loading={isPending}
            onClick={onConfirm}
            style={{ background: '#f43f5e', color: '#fff' }}
          >
            Eliminar usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
