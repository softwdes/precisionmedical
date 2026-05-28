'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, cn,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label,
} from '@precision/ui';
import { Plus, Search, Pencil, Trash2, Eye, KeyRound, Mail, ShieldCheck, Check, Loader2 } from 'lucide-react';
import { SuccessModal } from '@/components/notifications/SuccessModal';
import { toast } from 'sonner';
import { RolesTab } from './roles-tab';
import {
  ALL_ROLES, ROLE_META, dbRoleToRole, roleToDbRole,
  can,
} from '@/lib/permissions';
import type { Role } from '@/lib/permissions';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type UsersListOutput = inferRouterOutputs<AppRouter>['users']['list'];
type UserRow = UsersListOutput['users'][number];

type NotificationData = {
  initials: string;
  name: string;
  email: string;
  header: string;
  title: string;
  emailSent: boolean;
  emailError?: string | null;
  role?: string;
};

type ToastItem = NotificationData & { id: string };
type ActiveTab = 'usuarios' | 'roles';

const PROTECTED_EMAIL = 'erick@precisionmedicalcare.com';

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success', PENDING_VERIFICATION: 'warning', SUSPENDED: 'destructive', INACTIVE: 'secondary',
};

// ─── Role Badge ────────────────────────────────────────────────────────────────
function RoleBadge({ dbRole }: { dbRole: string }): React.ReactElement {
  const role = dbRoleToRole(dbRole);
  const meta = ROLE_META[role];
  return (
    <span
      style={{
        background: `${meta.color}1a`,
        color: meta.color,
        border: `1px solid ${meta.color}40`,
        padding: '3px 9px',
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 500,
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}

// ─── Accesos summary text ──────────────────────────────────────────────────────
function AccesosText({ dbRole }: { dbRole: string }): React.ReactElement {
  const role = dbRoleToRole(dbRole);
  const meta = ROLE_META[role];
  return (
    <span className="text-[11px] text-text-muted leading-relaxed">
      {meta.accesos}
    </span>
  );
}

// ─── Inline Role Select ────────────────────────────────────────────────────────
function InlineRoleSelect({
  user,
  currentUserId,
  onRoleChanged,
}: {
  user: UserRow;
  currentUserId: string;
  onRoleChanged: () => void;
}): React.ReactElement {
  const currentDbRole = user.role as string;
  const currentInternalRole = dbRoleToRole(currentDbRole);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isSelf   = user.id === currentUserId;
  const isSuperAdmin = currentDbRole === 'SUPER_ADMIN';
  const isDisabled = isSelf || isSuperAdmin || saving;

  const handleChange = async (newRole: string): Promise<void> => {
    if (newRole === currentInternalRole) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Error al guardar');
      }
      setSaved(true);
      onRoleChanged();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cambiar rol');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 min-w-[140px]">
      {saving ? (
        <Loader2 className="h-3 w-3 animate-spin text-text-muted" />
      ) : saved ? (
        <Check className="h-3 w-3 text-emerald shrink-0" />
      ) : null}
      <div className="relative">
        <select
          value={currentInternalRole}
          onChange={e => { void handleChange(e.target.value); }}
          disabled={isDisabled}
          className={cn(
            'appearance-none rounded-full border px-2.5 py-0.5 text-[10px] font-medium pr-5 cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-brand min-h-[28px]',
            isDisabled
              ? 'opacity-50 cursor-not-allowed bg-bg-1 border-border text-text-muted'
              : 'bg-bg-1 border-border text-text-1 hover:border-brand/50',
          )}
          style={!isDisabled ? {
            background: `${ROLE_META[currentInternalRole].color}1a`,
            color: ROLE_META[currentInternalRole].color,
            borderColor: `${ROLE_META[currentInternalRole].color}40`,
          } : undefined}
          onClick={e => e.stopPropagation()}
        >
          {ALL_ROLES.map(r => (
            <option key={r} value={r} style={{ color: ROLE_META[r].color }}>
              {ROLE_META[r].label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-current opacity-60">▼</span>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function UsersClient({
  initial,
  currentUserRole,
  currentUserId,
}: {
  initial: UsersListOutput;
  currentUserRole: Role;
  currentUserId: string;
}): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<ActiveTab>('usuarios');
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

  // Whether "Roles y Permisos" tab is visible
  const showRolesTab = can(currentUserRole, 'usuarios') && currentUserRole === 'super_admin';

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
        {activeTab === 'usuarios' && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t('users.addNew')}
          </Button>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-0 border-b border-border -mx-3 sm:-mx-6 px-3 sm:px-6">
        {(['usuarios', ...(showRolesTab ? ['roles'] : [])] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as ActiveTab)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab
                ? 'border-brand text-brand'
                : 'border-transparent text-text-3 hover:text-text-2',
            )}
          >
            {tab === 'usuarios' ? 'Usuarios' : 'Roles y Permisos'}
          </button>
        ))}
      </div>

      {/* ── Roles y Permisos tab ── */}
      {activeTab === 'roles' && <RolesTab />}

      {/* ── Usuarios tab ── */}
      {activeTab === 'usuarios' && (
        <>
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
                          <RoleBadge dbRole={user.role as string} />
                          <Badge variant={STATUS_COLORS[user.status] ?? 'secondary'}>{STATUS_LABELS[user.status as keyof typeof STATUS_LABELS] ?? user.status}</Badge>
                        </div>
                        <p className="text-[10px] text-text-muted mt-1">
                          {ROLE_META[dbRoleToRole(user.role as string)].accesos}
                        </p>
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
                    <TableHead>Rol</TableHead>
                    <TableHead>Accesos</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('users.lastAccess')}</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.users ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-text-3">
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <InlineRoleSelect
                            user={user}
                            currentUserId={currentUserId}
                            onRoleChanged={() => void refetch()}
                          />
                        </TableCell>
                        <TableCell>
                          <AccesosText dbRole={user.role as string} />
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
        </>
      )}

      {/* Dialogs (only in usuarios tab) */}
      {activeTab === 'usuarios' && (
        <>
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
        </>
      )}

      {toasts.length > 0 && (
        <SuccessModal
          key={toasts[0].id}
          title={toasts[0].header}
          subtitle={toasts[0].title.toUpperCase()}
          name={toasts[0].name}
          card1={toasts[0].emailSent ? {
            icon: <Mail size={20} />,
            label: 'Invitación enviada',
            value: toasts[0].email,
            color: '#10B981',
          } : undefined}
          card2={toasts[0].role ? {
            icon: <ShieldCheck size={20} />,
            label: 'Rol asignado',
            value: ROLE_META[dbRoleToRole(toasts[0].role)].label,
            color: '#6366F1',
          } : undefined}
          onClose={() => removeToast(toasts[0].id)}
          autoCloseMs={4000}
        />
      )}
    </div>
  );
}

// ─── Create Dialog ─────────────────────────────────────────────────────────────
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
        header: 'Nuevo usuario',
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

// ─── Edit Dialog ──────────────────────────────────────────────────────────────
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
        header: 'Acceso enviado',
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
        {user && (
          <div className="flex items-start gap-3 pl-5 pr-12 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand text-sm font-bold text-white shrink-0 mt-0.5">
              {user.firstName.charAt(0)}{user.lastName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text-1 truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-text-3 truncate">{user.email}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant={STATUS_COLORS[user.status] ?? 'secondary'}>{STATUS_LABELS[user.status] ?? user.status}</Badge>
                <RoleBadge dbRole={user.role as string} />
              </div>
            </div>
          </div>
        )}

        <div className="flex overflow-x-auto border-b border-border px-5 scrollbar-none shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0',
                activeTab === tab.id ? 'border-brand text-brand' : 'border-transparent text-text-3 hover:text-text-1',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5 min-h-[200px] flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-text-muted text-sm">{t('common.loading')}</div>
          ) : user ? (
            <>
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
                      <RoleBadge dbRole={user.role as string} />
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

// ─── Delete Confirm Dialog ─────────────────────────────────────────────────────
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
