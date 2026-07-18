'use client';

import * as React from 'react';
import { useState } from 'react';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  cn,
} from '@precision/ui';
import {
  Wallet, Plus, Pencil, Power, PowerOff, Trash2, AlertTriangle, AlertCircle, Lock, ToggleRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRole } from '@/contexts/role-context';

type BoxRow = {
  id: string;
  name: string;
  currency: string;
  balance: string | number;
  lowBalanceThreshold: string | number;
  is_active: boolean;
  clinicId: string | null;
  responsibleUserId: string | null;
  updatedAt: string;
};

const CURRENCY_FORMATTER: Record<string, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
  BOB: new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }),
  PEN: new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }),
};

function fmtMoney(amount: number, currency: string): string {
  const formatter = CURRENCY_FORMATTER[currency] ?? CURRENCY_FORMATTER.USD!;
  return formatter.format(amount);
}

interface StatusBadgeProps {
  isActive: boolean;
  balance: number;
  threshold: number;
}

function StatusBadge({ isActive, balance, threshold }: StatusBadgeProps): React.ReactElement {
  if (!isActive) {
    return <Badge variant="secondary">Inactiva</Badge>;
  }
  if (balance <= 0) {
    // Balance 0 on an active box: critical, but our caller decides if
    // it's "never opened" or "fully spent" via transactions count.
    // Here we just show the visual — alert logic lives elsewhere.
    return <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30">Sin saldo</Badge>;
  }
  if (balance <= threshold) {
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">Saldo bajo</Badge>;
  }
  return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Activa</Badge>;
}

export function CashBoxesClient(): React.ReactElement {
  const role = useRole();
  const canManage = role === 'super_admin';
  const [showInactive, setShowInactive] = useState(false);
  const { data: boxes = [], refetch, isLoading } = trpc.pettyCash.listBoxes.useQuery({ includeInactive: showInactive });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BoxRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BoxRow | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<BoxRow | null>(null);

  const toggleActive = trpc.pettyCash.toggleBoxActive.useMutation({
    onSuccess: () => {
      toast.success(confirmToggle?.is_active ? 'Caja desactivada' : 'Caja activada');
      setConfirmToggle(null);
      void refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteBox = trpc.pettyCash.deleteBox.useMutation({
    onSuccess: () => {
      toast.success('Caja eliminada');
      setConfirmDelete(null);
      void refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="px-3 py-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-text-1">Cajas chicas</h2>
          <p className="text-small text-text-3">
            {boxes.length} caja{boxes.length === 1 ? '' : 's'} · gestiona, edita y configura los umbrales mínimos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-tiny text-text-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-border"
            />
            Mostrar inactivas
          </label>
          {canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Nueva caja
            </Button>
          )}
        </div>
      </div>

      {/* Read-only notice */}
      {!canManage && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Solo Super Admin puede crear, editar o desactivar cajas chicas. Tu rol tiene acceso de lectura.
          </p>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-text-3">Cargando...</div>
      ) : boxes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
          <Wallet className="h-8 w-8 mx-auto text-text-muted mb-3" />
          <p className="text-small font-medium text-text-1">No hay cajas chicas registradas</p>
          <p className="text-tiny text-text-3 mt-1">
            Crea la primera caja para empezar a registrar transacciones.
          </p>
          {canManage && (
            <Button onClick={() => setCreating(true)} className="mt-4">
              <Plus className="h-4 w-4" />
              Nueva caja
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boxes.map((b) => {
            const box = b as BoxRow;
            const balance = Number(box.balance);
            const threshold = Number(box.lowBalanceThreshold);
            const ratio = threshold > 0 ? balance / threshold : 1;
            const barColor =
              !box.is_active ? '#6B7280' :
              balance <= 0 ? '#F43F5E' :
              balance <= threshold ? '#F59E0B' :
              '#10B981';

            return (
              <div
                key={box.id}
                className={cn(
                  'rounded-xl border border-border bg-surface p-4 transition-colors',
                  !box.is_active && 'opacity-60',
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-1 truncate">{box.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px] font-mono">{box.currency}</Badge>
                      <StatusBadge isActive={box.is_active} balance={balance} threshold={threshold} />
                    </div>
                  </div>
                </div>

                {/* Balance */}
                <div className="mb-3">
                  <p className="text-tiny text-text-muted uppercase tracking-wide">Saldo</p>
                  <p className={cn('text-xl font-bold font-mono', balance <= threshold && box.is_active ? 'text-amber-400' : 'text-text-1')}>
                    {fmtMoney(balance, box.currency)}
                  </p>
                  <p className="text-tiny text-text-3 mt-0.5">
                    Umbral mínimo: {fmtMoney(threshold, box.currency)}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full bg-border/40 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, ratio * 50))}%`,
                      background: barColor,
                    }}
                  />
                </div>

                {/* Actions */}
                {canManage && (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-border/50">
                    <button
                      onClick={() => setEditing(box)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-tiny text-text-3 hover:text-text-1 hover:bg-surface/80 transition-colors"
                      title="Editar caja"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </button>
                    <button
                      onClick={() => setConfirmToggle(box)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-tiny text-text-3 hover:text-text-1 hover:bg-surface/80 transition-colors"
                      title={box.is_active ? 'Desactivar caja' : 'Activar caja'}
                    >
                      {box.is_active ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                      {box.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(box)}
                      className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-tiny text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Eliminar (solo si no tiene transacciones)"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      {creating && (
        <CashBoxFormDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); void refetch(); }}
        />
      )}
      {editing && (
        <CashBoxFormDialog
          mode="edit"
          box={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void refetch(); }}
        />
      )}

      {/* Toggle active confirmation */}
      <Dialog open={!!confirmToggle} onOpenChange={(o) => { if (!o) setConfirmToggle(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmToggle?.is_active ? <PowerOff className="h-4 w-4 text-amber-500" /> : <Power className="h-4 w-4 text-emerald-500" />}
              {confirmToggle?.is_active ? 'Desactivar caja' : 'Activar caja'}
            </DialogTitle>
            <DialogDescription>
              {confirmToggle?.is_active
                ? 'La caja desaparecerá de los selects de nueva transacción y dejará de generar alertas de saldo bajo. Las transacciones históricas se mantienen visibles.'
                : 'La caja volverá a estar disponible para transacciones nuevas y alertas.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmToggle(null)}>Cancelar</Button>
            <Button
              variant={confirmToggle?.is_active ? 'destructive' : 'default'}
              loading={toggleActive.isPending}
              onClick={() => confirmToggle && toggleActive.mutate({ id: confirmToggle.id, isActive: !confirmToggle.is_active })}
            >
              {confirmToggle?.is_active ? 'Desactivar' : 'Activar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <Trash2 className="h-4 w-4" />
              Eliminar caja
            </DialogTitle>
            <DialogDescription>
              Esta acción es permanente. Solo se puede eliminar si la caja no tiene
              ninguna transacción registrada. Si tiene historial, usa "Desactivar" en su lugar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              loading={deleteBox.isPending}
              onClick={() => confirmDelete && deleteBox.mutate({ id: confirmDelete.id })}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Form dialog (create + edit) ─────────────────────────────────────

interface FormDialogProps {
  mode: 'create' | 'edit';
  box?: BoxRow;
  onClose: () => void;
  onSaved: () => void;
}

function CashBoxFormDialog({ mode, box, onClose, onSaved }: FormDialogProps): React.ReactElement {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    name: box?.name ?? '',
    currency: (box?.currency ?? 'USD') as 'USD' | 'BOB' | 'PEN',
    openingBalance: '0',
    lowBalanceThreshold: String(Number(box?.lowBalanceThreshold ?? 100)),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = trpc.pettyCash.createBox.useMutation({
    onSuccess: () => { toast.success('Caja creada'); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.pettyCash.updateBox.useMutation({
    onSuccess: () => { toast.success('Caja actualizada'); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const f = (k: keyof typeof form, v: string): void => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Nombre mínimo 2 caracteres';
    if (Number(form.lowBalanceThreshold) <= 0) errs.lowBalanceThreshold = 'Debe ser mayor a 0';
    if (!isEdit && Number(form.openingBalance) < 0) errs.openingBalance = 'No puede ser negativo';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    if (isEdit && box) {
      updateMutation.mutate({
        id: box.id,
        name: form.name.trim(),
        lowBalanceThreshold: Number(form.lowBalanceThreshold),
      });
    } else {
      createMutation.mutate({
        name: form.name.trim(),
        currency: form.currency,
        openingBalance: Number(form.openingBalance) || 0,
        lowBalanceThreshold: Number(form.lowBalanceThreshold),
      });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar caja' : 'Nueva caja chica'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Podés cambiar el nombre y el umbral mínimo. La moneda y el saldo no se editan directo (el saldo se ajusta vía depósitos o gastos).'
              : 'Crea una nueva caja. El saldo inicial registra una transacción de apertura automática.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input
              value={form.name}
              onChange={(e) => f('name', e.target.value)}
              placeholder="Ej: Caja Chica Bolivia"
              error={!!errors.name}
            />
            {errors.name && <p className="text-tiny text-rose">{errors.name}</p>}
          </div>

          {!isEdit && (
            <>
              <div className="space-y-1.5">
                <Label>Moneda *</Label>
                <Select value={form.currency} onValueChange={(v) => f('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="BOB">BOB</SelectItem>
                    <SelectItem value="PEN">PEN</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-tiny text-text-muted">
                  ⚠️ No se puede cambiar después de crear la caja.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Saldo inicial</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.openingBalance}
                  onChange={(e) => f('openingBalance', e.target.value)}
                  placeholder="0.00"
                  error={!!errors.openingBalance}
                />
                {errors.openingBalance && <p className="text-tiny text-rose">{errors.openingBalance}</p>}
                <p className="text-tiny text-text-muted">
                  Si es {'>'} 0, se registra una transacción de apertura.
                </p>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Umbral de saldo mínimo *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.lowBalanceThreshold}
              onChange={(e) => f('lowBalanceThreshold', e.target.value)}
              placeholder="100"
              error={!!errors.lowBalanceThreshold}
            />
            {errors.lowBalanceThreshold && <p className="text-tiny text-rose">{errors.lowBalanceThreshold}</p>}
            <p className="text-tiny text-text-muted">
              Cuando el saldo baje de este valor, aparecerá alerta.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              {isEdit ? 'Guardar cambios' : 'Crear caja'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
