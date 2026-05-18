'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Card, CardContent,
} from '@precision/ui';
import {
  Plus, Search, MoreHorizontal, Users, DollarSign,
  ChevronLeft, ChevronRight, Eye, Pencil, Trash2, Clock, Mail, Briefcase, CheckCircle,
} from 'lucide-react';
import { SuccessModal } from '@/components/notifications/SuccessModal';
import { SuccessToast } from '@/components/notifications/SuccessToast';
import { ToastPortal, useToastManager } from '@/components/notifications/ToastManager';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type ListOutput    = inferRouterOutputs<AppRouter>['freelancers']['list'];
type FreelancerItem = ListOutput['items'][number];
type SummaryOutput  = inferRouterOutputs<AppRouter>['freelancers']['getSummary'];
type PaymentItem    = inferRouterOutputs<AppRouter>['freelancers']['listPayments'][number];

const MODALIDAD_VARIANT: Record<string, 'info' | 'secondary'> = {
  POR_HORA:     'info',
  POR_SERVICIO: 'secondary',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAmount(amount: number, moneda: string) {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;
}

function getPayments(emp: FreelancerItem) {
  return (emp.freelancer_payments as Array<{ monto: number; moneda: string; fechaPago: string }> | null) ?? [];
}

function getTotalPagado(emp: FreelancerItem): number {
  return getPayments(emp).reduce((s, p) => s + Number(p.monto), 0);
}

function getUltimoPago(emp: FreelancerItem): string | null {
  const payments = getPayments(emp);
  if (!payments.length) return null;
  return [...payments].sort((a, b) => new Date(b.fechaPago).getTime() - new Date(a.fechaPago).getTime())[0]!.fechaPago;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FreelancersClient({
  initial,
  initialSummary,
}: {
  initial:        ListOutput;
  initialSummary: SummaryOutput;
}): React.ReactElement {
  const t      = useTranslations();
  const locale = useLocale();

  const [page,             setPage]             = useState(1);
  const [search,           setSearch]           = useState('');
  const [modalidadFilter,  setModalidadFilter]  = useState('');
  const [openMenuId,       setOpenMenuId]       = useState<string | null>(null);
  const [showCreate,       setShowCreate]       = useState(false);
  const [editFreelancer,   setEditFreelancer]   = useState<FreelancerItem | null>(null);
  const [newPaymentFor,    setNewPaymentFor]    = useState<FreelancerItem | null>(null);
  const [deleteFreelancer, setDeleteFreelancer] = useState<FreelancerItem | null>(null);
  const [viewPaymentsFor,  setViewPaymentsFor]  = useState<FreelancerItem | null>(null);

  const MODALIDAD_LABELS: Record<string, string> = {
    POR_HORA:     t('freelancers.modalidades.POR_HORA'),
    POR_SERVICIO: t('freelancers.modalidades.POR_SERVICIO'),
  };

  const { data, refetch } = trpc.freelancers.list.useQuery(
    { page, pageSize: 25, search: search || undefined, modalidad: (modalidadFilter as 'POR_HORA' | 'POR_SERVICIO' | undefined) || undefined },
    { initialData: initial },
  );

  const { data: summary, refetch: refetchSummary } = trpc.freelancers.getSummary.useQuery(
    undefined,
    { initialData: initialSummary },
  );

  const refetchAll = () => { void refetch(); void refetchSummary(); };

  const deactivate = trpc.freelancers.deactivate.useMutation({
    onSuccess: () => { toast.success(t('freelancers.deleted')); refetchAll(); setDeleteFreelancer(null); },
    onError:   (e) => toast.error(e.message),
  });

  // Close 3-dot menu when clicking outside
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const openMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(prev => (prev === id ? null : id));
  };

  const menuAction = (fn: () => void) => { setOpenMenuId(null); fn(); };

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('freelancers.title')}</h1>
          <p className="text-small text-text-3">{data?.total ?? 0} {t('freelancers.records')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('freelancers.addNew')}
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          icon={Users}
          label={t('freelancers.activos')}
          value={String(summary?.totalActivos ?? 0)}
          color="brand"
        />
        <KpiCard
          icon={DollarSign}
          label={t('freelancers.pagadoMes')}
          value={`$${(summary?.totalPagadoMes ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color="emerald"
        />
        <KpiCard
          icon={Clock}
          label={t('freelancers.totalRegistros')}
          value={String(summary?.totalPagos ?? 0)}
          color="amber"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <Input
            placeholder={t('freelancers.searchPlaceholder')}
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={modalidadFilter} onValueChange={(v) => { setModalidadFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t('freelancers.modalidad')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('freelancers.allModalidades')}</SelectItem>
            <SelectItem value="POR_HORA">{t('freelancers.modalidades.POR_HORA')}</SelectItem>
            <SelectItem value="POR_SERVICIO">{t('freelancers.modalidades.POR_SERVICIO')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden" ref={menuRef}>

        {/* Mobile: cards */}
        <div className="md:hidden">
          {(data?.items ?? []).length === 0 ? (
            <EmptyState onNew={() => setShowCreate(true)} t={t} />
          ) : (
            <div className="divide-y divide-border">
              {(data?.items ?? []).map((emp) => (
                <div key={emp.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/20 text-small font-bold text-brand shrink-0">
                    {(emp.nombre as string).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-1 truncate">{emp.nombre as string}</p>
                    <p className="text-tiny text-text-3 truncate">{emp.pais as string}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant={MODALIDAD_VARIANT[emp.modalidad as string] ?? 'secondary'}>
                        {MODALIDAD_LABELS[emp.modalidad as string] ?? emp.modalidad}
                      </Badge>
                    </div>
                  </div>
                  <ThreeDotMenu
                    id={emp.id}
                    openMenuId={openMenuId}
                    onOpen={(e) => openMenu(emp.id, e)}
                    onVerPagos={()   => menuAction(() => setViewPaymentsFor(emp))}
                    onNuevoPago={()  => menuAction(() => setNewPaymentFor(emp))}
                    onEditar={()     => menuAction(() => setEditFreelancer(emp))}
                    onEliminar={()   => menuAction(() => setDeleteFreelancer(emp))}
                    t={t}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('freelancers.nombre')}</TableHead>
                <TableHead>{t('freelancers.pais')}</TableHead>
                <TableHead>{t('freelancers.modalidad')}</TableHead>
                <TableHead>{t('freelancers.tarifaBaseCol')}</TableHead>
                <TableHead>{t('freelancers.totalPagado')}</TableHead>
                <TableHead>{t('freelancers.ultimoPago')}</TableHead>
                <TableHead className="w-12 text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-0 border-0">
                    <EmptyState onNew={() => setShowCreate(true)} t={t} />
                  </TableCell>
                </TableRow>
              ) : (
                (data?.items ?? []).map((emp) => {
                  const totalPagado = getTotalPagado(emp);
                  const ultimoPago  = getUltimoPago(emp);
                  const moneda      = emp.moneda as string;
                  const modalidad   = emp.modalidad as string;
                  const tarifaBase  = emp.tarifaBase as number | null;

                  return (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-tiny font-bold text-brand shrink-0">
                            {(emp.nombre as string).slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-text-1">{emp.nombre as string}</p>
                            {emp.email && <p className="text-tiny text-text-3">{emp.email as string}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-small text-text-2">{emp.pais as string}</TableCell>
                      <TableCell>
                        <Badge variant={MODALIDAD_VARIANT[modalidad] ?? 'secondary'}>
                          {MODALIDAD_LABELS[modalidad] ?? modalidad}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-small text-text-2">
                        {modalidad === 'POR_HORA' && tarifaBase
                          ? `$${Number(tarifaBase).toFixed(2)} ${moneda}/hr`
                          : modalidad === 'POR_HORA'
                          ? '—'
                          : <span className="text-text-muted italic">{t('freelancers.variable')}</span>}
                      </TableCell>
                      <TableCell className="text-small text-text-2 font-mono">
                        {totalPagado > 0 ? fmtAmount(totalPagado, moneda) : '—'}
                      </TableCell>
                      <TableCell className="text-small text-text-2">
                        {fmtDate(ultimoPago)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ThreeDotMenu
                          id={emp.id}
                          openMenuId={openMenuId}
                          onOpen={(e) => openMenu(emp.id, e)}
                          onVerPagos={()   => menuAction(() => setViewPaymentsFor(emp))}
                          onNuevoPago={()  => menuAction(() => setNewPaymentFor(emp))}
                          onEditar={()     => menuAction(() => setEditFreelancer(emp))}
                          onEliminar={()   => menuAction(() => setDeleteFreelancer(emp))}
                          t={t}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-small text-text-3">
            {t('freelancers.page')} {page} {t('freelancers.of')} {data?.totalPages}
          </p>
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

      {/* Modals */}
      <FreelancerFormDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => { setShowCreate(false); refetchAll(); }}
        t={t}
      />

      {editFreelancer && (
        <FreelancerFormDialog
          key={editFreelancer.id}
          open
          freelancer={editFreelancer}
          onClose={() => setEditFreelancer(null)}
          onSaved={() => { setEditFreelancer(null); refetchAll(); }}
          t={t}
        />
      )}

      {newPaymentFor && (
        <NewPaymentDialog
          key={`pay-${newPaymentFor.id}`}
          preselected={newPaymentFor}
          allFreelancers={data?.items ?? []}
          onClose={() => setNewPaymentFor(null)}
          onSaved={() => { setNewPaymentFor(null); refetchAll(); }}
          t={t}
          locale={locale}
        />
      )}

      {viewPaymentsFor && (
        <PaymentsHistoryDialog
          freelancer={viewPaymentsFor}
          onClose={() => setViewPaymentsFor(null)}
          t={t}
          locale={locale}
        />
      )}

      {deleteFreelancer && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleteFreelancer(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('freelancers.eliminar')}</DialogTitle>
            </DialogHeader>
            <p className="text-small text-text-2">{t('freelancers.deleteConfirm')}</p>
            <p className="text-small font-semibold text-text-1">{deleteFreelancer.nombre as string}</p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteFreelancer(null)}>{t('common.cancel')}</Button>
              <Button
                variant="destructive"
                loading={deactivate.isPending}
                onClick={() => deactivate.mutate({ id: deleteFreelancer.id })}
              >
                {t('freelancers.eliminar')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string; color: 'brand' | 'emerald' | 'amber';
}) {
  const colors = {
    brand:   'bg-brand/10 text-brand',
    emerald: 'bg-emerald-500/10 text-emerald-500',
    amber:   'bg-amber-400/10 text-amber-400',
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-tiny text-text-3">{label}</p>
          <p className="text-lg font-bold text-text-1 font-mono">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew, t }: { onNew: () => void; t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-border/50">
        <Users className="h-7 w-7 text-text-muted" />
      </div>
      <div>
        <p className="font-medium text-text-2">{t('freelancers.noFreelancers')}</p>
        <p className="text-small text-text-3 mt-0.5">{t('freelancers.noFreelancersSubtext')}</p>
      </div>
      <Button size="sm" onClick={onNew}>
        <Plus className="h-4 w-4" />
        {t('freelancers.addNew')}
      </Button>
    </div>
  );
}

// ─── 3-Dot Menu ──────────────────────────────────────────────────────────────

function ThreeDotMenu({
  id, openMenuId, onOpen, onVerPagos, onNuevoPago, onEditar, onEliminar, t,
}: {
  id:          string;
  openMenuId:  string | null;
  onOpen:      (e: React.MouseEvent) => void;
  onVerPagos:  () => void;
  onNuevoPago: () => void;
  onEditar:    () => void;
  onEliminar:  () => void;
  t:           ReturnType<typeof useTranslations>;
}) {
  const isOpen = openMenuId === id;
  return (
    <div className="relative inline-block">
      <button
        onClick={onOpen}
        className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:text-text-1 hover:bg-border/60 transition-colors"
        title={t('common.actions')}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-8 z-50 min-w-[160px] rounded-lg border border-border bg-surface shadow-lg py-1">
          <MenuItem icon={Eye}     label={t('freelancers.verPagos')}  onClick={onVerPagos}  />
          <MenuItem icon={Plus}    label={t('freelancers.nuevoPago')} onClick={onNuevoPago} />
          <div className="my-1 border-t border-border/50" />
          <MenuItem icon={Pencil}  label={t('freelancers.editar')}    onClick={onEditar}    />
          <MenuItem icon={Trash2}  label={t('freelancers.eliminar')}  onClick={onEliminar}  danger />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger = false }: {
  icon: React.ElementType; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex w-full items-center gap-2.5 px-3 py-2 text-small transition-colors',
        danger
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-text-2 hover:bg-border/50 hover:text-text-1',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  );
}

// ─── Freelancer Form Dialog (Create + Edit) ───────────────────────────────────

function FreelancerFormDialog({
  open, freelancer, onClose, onSaved, t,
}: {
  open:        boolean;
  freelancer?: FreelancerItem | null;
  onClose:     () => void;
  onSaved:     () => void;
  t:           ReturnType<typeof useTranslations>;
}) {
  const isEdit = !!freelancer;
  const [form, setForm] = useState({
    nombre:     (freelancer?.nombre as string | undefined)     ?? '',
    email:      (freelancer?.email as string | null | undefined) ?? '',
    phone:      (freelancer?.phone as string | null | undefined) ?? '',
    pais:       (freelancer?.pais as string | undefined)       ?? '',
    modalidad:  (freelancer?.modalidad as string | undefined)  ?? '',
    tarifaBase: freelancer?.tarifaBase != null ? String(freelancer.tarifaBase) : '',
    moneda:     (freelancer?.moneda as string | undefined)     ?? 'USD',
    notas:      (freelancer?.notas as string | null | undefined) ?? '',
  });

  const [successData, setSuccessData] = useState<{ nombre: string; email: string; pais: string; modalidad: string } | null>(null);

  const f = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const create = trpc.freelancers.create.useMutation({
    onSuccess: () => {
      setSuccessData({ nombre: form.nombre, email: form.email, pais: form.pais, modalidad: form.modalidad });
      onSaved();
    },
    onError:   (e) => toast.error(e.message),
  });

  const update = trpc.freelancers.update.useMutation({
    onSuccess: () => { toast.success(t('freelancers.saved')); onSaved(); },
    onError:   (e) => toast.error(e.message),
  });

  const isPending = create.isPending || update.isPending;

  const handleSubmit = () => {
    const payload = {
      nombre:     form.nombre,
      email:      form.email || undefined,
      phone:      form.phone || undefined,
      pais:       form.pais,
      modalidad:  form.modalidad as 'POR_HORA' | 'POR_SERVICIO',
      tarifaBase: form.modalidad === 'POR_HORA' && form.tarifaBase ? Number(form.tarifaBase) : undefined,
      moneda:     form.moneda as 'USD' | 'BOB' | 'PEN',
      notas:      form.notas || undefined,
    };
    if (isEdit && freelancer) {
      update.mutate({ id: freelancer.id, data: payload });
    } else {
      create.mutate(payload);
    }
  };

  const canSubmit = form.nombre.length >= 2 && form.pais && form.modalidad && form.moneda;

  const MODALIDAD_DISPLAY: Record<string, string> = { POR_HORA: 'Por hora', POR_SERVICIO: 'Por servicio' };

  return (
    <>
    {successData && (
      <SuccessModal
        title="Nuevo freelancer"
        subtitle="FREELANCER REGISTRADO EXITOSAMENTE"
        name={successData.nombre}
        card1={successData.email ? { icon: <Mail size={20} />, label: 'Email', value: successData.email, color: '#10B981' } : undefined}
        card2={{ icon: <Briefcase size={20} />, label: 'Modalidad · País', value: `${MODALIDAD_DISPLAY[successData.modalidad] ?? successData.modalidad} · ${successData.pais}`, color: '#6366F1' }}
        onClose={() => setSuccessData(null)}
        autoCloseMs={4000}
      />
    )}
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('freelancers.editTitle') : t('freelancers.newTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label>{t('freelancers.nombre')} *</Label>
            <Input
              value={form.nombre}
              onChange={(e) => f('nombre', e.target.value)}
              placeholder={t('freelancers.nombrePlaceholder')}
            />
          </div>

          {/* País + Moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('freelancers.pais')} *</Label>
              <Select value={form.pais} onValueChange={(v) => {
                f('pais', v);
                const currencyMap: Record<string, string> = { 'United States': 'USD', 'Bolivia': 'BOB', 'Peru': 'PEN' };
                if (currencyMap[v]) f('moneda', currencyMap[v]!);
              }}>
                <SelectTrigger><SelectValue placeholder={t('freelancers.paisPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="United States">United States (USD)</SelectItem>
                  <SelectItem value="Bolivia">Bolivia (BOB)</SelectItem>
                  <SelectItem value="Peru">Peru (PEN)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('freelancers.moneda')} *</Label>
              <Select value={form.moneda} onValueChange={(v) => f('moneda', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="BOB">BOB</SelectItem>
                  <SelectItem value="PEN">PEN</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('freelancers.email')}</Label>
              <Input type="email" value={form.email ?? ''} onChange={(e) => f('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('freelancers.phone')}</Label>
              <Input value={form.phone ?? ''} onChange={(e) => f('phone', e.target.value)} />
            </div>
          </div>

          {/* Modalidad */}
          <div className="space-y-1.5">
            <Label>{t('freelancers.modalidad')} *</Label>
            <Select value={form.modalidad} onValueChange={(v) => { f('modalidad', v); if (v === 'POR_SERVICIO') f('tarifaBase', ''); }}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="POR_HORA">{t('freelancers.modalidades.POR_HORA')}</SelectItem>
                <SelectItem value="POR_SERVICIO">{t('freelancers.modalidades.POR_SERVICIO')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tarifa base — only if POR_HORA */}
          {form.modalidad === 'POR_HORA' && (
            <div className="space-y-1.5">
              <Label>{t('freelancers.tarifaBase')}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.tarifaBase}
                onChange={(e) => f('tarifaBase', e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Notas */}
          <div className="space-y-1.5">
            <Label>{t('freelancers.notas')}</Label>
            <Input
              value={form.notas ?? ''}
              onChange={(e) => f('notas', e.target.value)}
              placeholder={t('freelancers.notasPlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} loading={isPending} disabled={!canSubmit}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── New Payment Dialog ───────────────────────────────────────────────────────

function NewPaymentDialog({
  preselected, allFreelancers, onClose, onSaved, t, locale,
}: {
  preselected:    FreelancerItem;
  allFreelancers: FreelancerItem[];
  onClose:        () => void;
  onSaved:        () => void;
  t:              ReturnType<typeof useTranslations>;
  locale:         string;
}) {
  const [freelancerId, setFreelancerId] = useState(preselected.id);
  const [form, setForm] = useState({
    descripcion:   '',
    horas:         '',
    tarifaHora:    String((preselected.tarifaBase as number | null) ?? ''),
    monto:         '',
    moneda:        preselected.moneda as string,
    fechaServicio: '',
    fechaPago:     '',
    notas:         '',
  });

  const selectedFreelancer = allFreelancers.find(f => f.id === freelancerId) ?? preselected;
  const modalidad = selectedFreelancer.modalidad as string;

  // When freelancer changes — sync moneda and tarifaHora
  const handleFreelancerChange = (id: string) => {
    const fl = allFreelancers.find(f => f.id === id);
    if (!fl) return;
    setFreelancerId(id);
    setForm(prev => ({
      ...prev,
      moneda:    fl.moneda as string,
      tarifaHora: fl.modalidad === 'POR_HORA' && fl.tarifaBase != null ? String(fl.tarifaBase) : '',
      monto:     '',
    }));
  };

  // Real-time calculation for POR_HORA
  const horasNum     = parseFloat(form.horas)     || 0;
  const tarifaNum    = parseFloat(form.tarifaHora) || 0;
  const calculado    = modalidad === 'POR_HORA' ? horasNum * tarifaNum : parseFloat(form.monto) || 0;

  const f = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const { toasts: paymentToasts, addToast: addPaymentToast, removeToast: removePaymentToast } = useToastManager();

  const create = trpc.freelancers.createPayment.useMutation({
    onSuccess: () => {
      const freelancerName = selectedFreelancer.nombre as string;
      const detail = modalidad === 'POR_HORA'
        ? `${horasNum}h × $${tarifaNum} = $${calculado.toFixed(2)}`
        : `$${(parseFloat(form.monto) || 0).toFixed(2)}`;
      addPaymentToast({
        icon: <CheckCircle size={20} color="#10B981" />,
        title: `${freelancerName} · ${form.moneda}`,
        detail,
        statusText: 'PAGO REGISTRADO',
        barColor: '#10B981',
      });
      onSaved();
    },
    onError:   (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    create.mutate({
      freelancerId,
      descripcion:   form.descripcion,
      horas:         modalidad === 'POR_HORA' ? horasNum : undefined,
      tarifaHora:    modalidad === 'POR_HORA' ? tarifaNum : undefined,
      monto:         modalidad === 'POR_HORA' ? calculado : parseFloat(form.monto),
      moneda:        form.moneda as 'USD' | 'BOB' | 'PEN',
      fechaServicio: new Date(form.fechaServicio),
      fechaPago:     new Date(form.fechaPago),
      notas:         form.notas || undefined,
    });
  };

  const canSubmit =
    freelancerId &&
    form.descripcion.length >= 3 &&
    form.fechaServicio &&
    form.fechaPago &&
    (modalidad === 'POR_HORA' ? horasNum > 0 && tarifaNum > 0 : parseFloat(form.monto) > 0);

  return (
    <>
    <ToastPortal toasts={paymentToasts} removeToast={removePaymentToast} />
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('freelancers.newPaymentTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Freelancer selector */}
          <div className="space-y-1.5">
            <Label>{t('freelancers.freelancer')} *</Label>
            <Select value={freelancerId} onValueChange={handleFreelancerChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allFreelancers.map(fl => (
                  <SelectItem key={fl.id} value={fl.id}>{fl.nombre as string}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Modalidad badge (read-only context) */}
          <div className="flex items-center gap-2">
            <Badge variant={MODALIDAD_VARIANT[modalidad] ?? 'secondary'}>
              {t(`freelancers.modalidades.${modalidad}` as Parameters<typeof t>[0])}
            </Badge>
            <span className="text-small text-text-3">{form.moneda}</span>
          </div>

          {/* Descripcion */}
          <div className="space-y-1.5">
            <Label>{t('freelancers.descripcion')} *</Label>
            <Input
              value={form.descripcion}
              onChange={(e) => f('descripcion', e.target.value)}
              placeholder={t('freelancers.descripcionPlaceholder')}
            />
          </div>

          {/* POR_HORA: horas + tarifa + calculated total */}
          {modalidad === 'POR_HORA' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('freelancers.horas')} *</Label>
                  <Input
                    type="number" min="0" step="0.5"
                    value={form.horas}
                    onChange={(e) => f('horas', e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('freelancers.tarifaHora')} *</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={form.tarifaHora}
                    onChange={(e) => f('tarifaHora', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              {/* Real-time total */}
              <div className="flex items-center justify-between rounded-lg bg-brand/5 border border-brand/20 px-4 py-3">
                <span className="text-small text-text-3">{t('freelancers.totalCalculado')}</span>
                <span className="text-base font-bold font-mono text-brand">
                  {calculado > 0 ? fmtAmount(calculado, form.moneda) : `$0.00 ${form.moneda}`}
                </span>
              </div>
            </div>
          )}

          {/* POR_SERVICIO: solo monto */}
          {modalidad === 'POR_SERVICIO' && (
            <div className="space-y-1.5">
              <Label>{t('freelancers.monto')} *</Label>
              <Input
                type="number" min="0" step="0.01"
                value={form.monto}
                onChange={(e) => f('monto', e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('freelancers.fechaServicio')} *</Label>
              <Input type="date" value={form.fechaServicio} onChange={(e) => f('fechaServicio', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('freelancers.fechaPago')} *</Label>
              <Input type="date" value={form.fechaPago} onChange={(e) => f('fechaPago', e.target.value)} />
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label>{t('freelancers.notas')}</Label>
            <Input
              value={form.notas}
              onChange={(e) => f('notas', e.target.value)}
              placeholder={t('freelancers.notasPlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} loading={create.isPending} disabled={!canSubmit}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Payments History Dialog ──────────────────────────────────────────────────

function PaymentsHistoryDialog({
  freelancer, onClose, t, locale,
}: {
  freelancer: FreelancerItem;
  onClose:    () => void;
  t:          ReturnType<typeof useTranslations>;
  locale:     string;
}) {
  const { data: payments = [], isLoading } = trpc.freelancers.listPayments.useQuery(
    { freelancerId: freelancer.id },
  );

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('freelancers.paymentsTitle')} — {freelancer.nombre as string}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-small text-text-3">{t('common.loading')}</div>
        ) : payments.length === 0 ? (
          <div className="py-8 text-center text-small text-text-muted">{t('freelancers.noPayments')}</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('freelancers.descripcion')}</TableHead>
                  <TableHead>{t('freelancers.modalidad')}</TableHead>
                  <TableHead>{t('freelancers.monto')}</TableHead>
                  <TableHead>{t('freelancers.fechaServicio')}</TableHead>
                  <TableHead>{t('freelancers.fechaPago')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payments as PaymentItem[]).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-small text-text-1">{p.descripcion as string}</TableCell>
                    <TableCell>
                      <Badge variant={MODALIDAD_VARIANT[p.modalidad as string] ?? 'secondary'}>
                        {t(`freelancers.modalidades.${p.modalidad as string}` as Parameters<typeof t>[0])}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-small font-mono text-text-2">
                      {fmtAmount(Number(p.monto), p.moneda as string)}
                      {p.modalidad === 'POR_HORA' && p.horas != null && (
                        <span className="block text-tiny text-text-muted">{String(p.horas)} hr × ${String(p.tarifaHora ?? 0)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-small text-text-2">{fmtDate(p.fechaServicio as string)}</TableCell>
                    <TableCell className="text-small text-text-2">{fmtDate(p.fechaPago as string)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
