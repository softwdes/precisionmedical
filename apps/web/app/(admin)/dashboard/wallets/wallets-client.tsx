'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@precision/ui';
import { Plus, Clock, Wallet, Info } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type WalletItem = inferRouterOutputs<AppRouter>['wallets']['list'][number];
// Desglose de saldo derivado (Opción A). Ver wallets.getBreakdown.
type WalletBreakdown = {
  base: number; fxIn: number; fxOut: number; salariesPaid: number;
  pettyCashOut: number; salariesPending: number; balance: number;
  lastAt: string | null; reconciledAt: string | null;
};

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: 'US',
  BOB: 'BO',
  PEN: 'PE',
};

const CURRENCY_TO_COUNTRY_DISPLAY: Record<string, string> = {
  USD: 'EEUU',
  BOB: 'Bolivia',
  PEN: 'Peru',
};

const COUNTRIES = [
  { id: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
  { id: 'BO', name: 'Bolivia', flag: '🇧🇴' },
  { id: 'PE', name: 'Perú', flag: '🇵🇪' },
];

const CURRENCY_OPTIONS = [
  { value: 'USD', label: '🇺🇸 USD — Dólar americano' },
  { value: 'BOB', label: '🇧🇴 BOB — Boliviano' },
  { value: 'PEN', label: '🇵🇪 PEN — Sol peruano' },
];

const CURRENCY_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  USD: { bg: 'rgba(16,185,129,0.10)', color: '#10B981', border: 'rgba(16,185,129,0.25)' },
  BOB: { bg: 'rgba(245,158,11,0.10)', color: '#F59E0B', border: 'rgba(245,158,11,0.25)' },
  PEN: { bg: 'rgba(139,92,246,0.10)', color: '#8B5CF6', border: 'rgba(139,92,246,0.25)' },
};

function getFlag(currency: string): string {
  const map: Record<string, string> = { USD: '🇺🇸', BOB: '🇧🇴', PEN: '🇵🇪' };
  return map[currency] ?? '🌍';
}

function getCountryLabel(currency: string): string {
  const map: Record<string, string> = {
    USD: 'Estados Unidos · USD',
    BOB: 'Bolivia · BOB',
    PEN: 'Perú · PEN',
  };
  return map[currency] ?? '—';
}

function formatBalance(balance: number, currency: string): string {
  const abs = Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = balance < 0 ? '-' : '';
  if (currency === 'USD') return `${sign}$${abs}`;
  if (currency === 'BOB') return `${sign}Bs ${abs}`;
  if (currency === 'PEN') return `${sign}S/ ${abs}`;
  return `${sign}${abs}`;
}

function getCurrencyPrefix(currency: string): string {
  if (currency === 'USD') return '$';
  if (currency === 'BOB') return 'Bs';
  if (currency === 'PEN') return 'S/';
  return '';
}

export function WalletsClient({ initialWallets }: { initialWallets: WalletItem[] }): React.ReactElement {
  const [showCreate, setShowCreate] = useState(false);
  const [reconcileTarget, setReconcileTarget] = useState<WalletItem | null>(null);
  const [breakdownTarget, setBreakdownTarget] = useState<WalletItem | null>(null);

  const { data: wallets, refetch } = trpc.wallets.list.useQuery(undefined, { initialData: initialWallets });
  const { data: breakdowns = {}, refetch: refetchStats } = trpc.wallets.getBreakdown.useQuery();

  const totalUsd = wallets
    .filter(w => w.currency === 'USD')
    .reduce((s, w) => s + (breakdowns[w.id]?.balance ?? Number(w.balance)), 0);

  const timeStr = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-1">Wallets</h1>
          <p className="text-small text-text-3">Carteras por moneda y país · Precision Medical</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" />
          + Nueva wallet
        </Button>
      </div>

      {/* Summary bar */}
      <div
        className="rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 px-[18px] py-3 flex-wrap"
        style={{
          background: 'var(--surface)',
          border: '0.5px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2 text-[13px] text-text-2">
          <Wallet className="h-3.5 w-3.5 shrink-0 text-brand" />
          <span>{wallets.length} carteras activas</span>
        </div>

        <div className="hidden sm:block h-4 w-px shrink-0 bg-border opacity-60" />

        <div className="flex items-center gap-2 text-[13px] text-text-2">
          <span className="font-bold text-emerald">$</span>
          <span>
            Total USD:{' '}
            <span className="font-bold font-mono text-text-1">
              ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </span>
        </div>

        <div className="hidden sm:block h-4 w-px shrink-0 bg-border opacity-60" />

        <div className="flex items-center gap-2 text-[12px] text-text-3">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>Última actualización: hoy {timeStr}</span>
        </div>
      </div>

      {/* Cards or empty state */}
      {wallets.length === 0 ? (
        <EmptyState onAdd={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {wallets.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              breakdown={breakdowns[wallet.id]}
              onReconcile={() => setReconcileTarget(wallet)}
              onBreakdown={() => setBreakdownTarget(wallet)}
            />
          ))}
        </div>
      )}

      <CreateWalletDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />

      {reconcileTarget && (
        <ReconcileDialog
          wallet={reconcileTarget}
          breakdown={breakdowns[reconcileTarget.id]}
          onClose={() => setReconcileTarget(null)}
          onReconciled={() => { setReconcileTarget(null); void refetch(); void refetchStats(); }}
        />
      )}

      {breakdownTarget && (
        <BreakdownDialog
          wallet={breakdownTarget}
          breakdown={breakdowns[breakdownTarget.id]}
          onClose={() => setBreakdownTarget(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }): React.ReactElement {
  return (
    <div
      className="rounded-xl flex flex-col items-center justify-center py-16 text-center gap-4"
      style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}
    >
      <Wallet className="h-12 w-12 text-text-3" />
      <div>
        <p className="text-[14px] font-semibold text-text-2 mb-1.5">Sin wallets configuradas</p>
        <p className="text-[13px] text-text-3 max-w-xs mx-auto leading-relaxed">
          Crea tu primera cartera para comenzar a registrar operaciones financieras
        </p>
      </div>
      <Button onClick={onAdd} className="gap-1.5">
        <Plus className="h-4 w-4" />
        + Nueva wallet
      </Button>
    </div>
  );
}

function WalletCard({ wallet, breakdown, onReconcile, onBreakdown }: { wallet: WalletItem; breakdown?: WalletBreakdown; onReconcile: () => void; onBreakdown: () => void }): React.ReactElement {
  // Entradas = entradas FX. Salidas = todas las salidas (FX + salarios pagados
  // + financiamiento a caja chica), para que base + entradas − salidas = saldo.
  const entradas = breakdown?.fxIn ?? 0;
  const salidas  = (breakdown?.fxOut ?? 0) + (breakdown?.salariesPaid ?? 0) + (breakdown?.pettyCashOut ?? 0);
  const balance  = breakdown?.balance ?? Number(wallet.balance);

  const badge = CURRENCY_BADGE[wallet.currency] ?? { bg: 'rgba(255,255,255,0.06)', color: '#aaa', border: 'rgba(255,255,255,0.12)' };

  const balanceColor = balance > 0 ? 'var(--text-1)' : balance === 0 ? 'var(--text-3)' : '#F43F5E';
  const statusDotColor = balance > 0 ? '#10B981' : balance === 0 ? '#F59E0B' : '#F43F5E';
  const statusText = balance > 0
    ? 'Activa'
    : balance === 0
    ? 'Sin fondos · pendiente de depósito'
    : '⚠ Saldo negativo';

  const lastMovement = breakdown?.lastAt
    ?? (wallet.lastReconciledAt ? String(wallet.lastReconciledAt) : null);

  return (
    <div
      data-wallet-id={wallet.id}
      data-currency={wallet.currency}
      data-country={CURRENCY_TO_COUNTRY_DISPLAY[wallet.currency] ?? ''}
      className="group"
      style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = 'rgba(99,102,241,0.30)';
        el.style.boxShadow = '0 4px 20px rgba(99,102,241,0.08)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = 'var(--border)';
        el.style.boxShadow = 'none';
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 24, lineHeight: 1, marginBottom: 6 }}>{getFlag(wallet.currency)}</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 }}>
            {wallet.name}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {getCountryLabel(wallet.currency)}
          </p>
        </div>
        <div
          style={{
            background: badge.bg,
            color: badge.color,
            border: `1px solid ${badge.border}`,
            padding: '3px 10px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
        >
          {wallet.currency}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />

      {/* Balance section */}
      <div style={{ padding: '14px 16px' }}>
        <p
          className="text-[24px] sm:text-[28px] font-bold font-mono"
          style={{ color: balanceColor, lineHeight: 1.1, marginBottom: 12 }}
        >
          {formatBalance(balance, wallet.currency)}
        </p>

        {/* Mini stats */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 2 }}>
              Entradas
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#10B981', fontFamily: 'monospace' }}>
              {formatBalance(entradas, wallet.currency)}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 2 }}>
              Salidas
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#F43F5E', fontFamily: 'monospace' }}>
              {formatBalance(salidas, wallet.currency)}
            </p>
          </div>
        </div>

        {/* Status dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className={balance > 0 ? 'animate-pulse' : ''}
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusDotColor,
              flexShrink: 0,
            }}
          />
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{statusText}</p>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '10px 16px',
          borderTop: '0.5px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.01)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock style={{ width: 11, height: 11, color: 'var(--text-3)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {lastMovement
              ? `Último: ${new Date(lastMovement).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}`
              : 'Sin movimientos'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={onBreakdown}
            title="¿De dónde sale este saldo?"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'transparent',
              border: '0.5px solid var(--border)',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 12,
              color: 'var(--text-2)',
              cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s, background 0.15s',
              minHeight: 44,
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = 'rgba(99,102,241,0.35)';
              el.style.color = '#6366F1';
              el.style.background = 'rgba(99,102,241,0.06)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = 'var(--border)';
              el.style.color = 'var(--text-2)';
              el.style.background = 'transparent';
            }}
          >
            <Info style={{ width: 13, height: 13 }} /> Desglose
          </button>
          <button
            onClick={onReconcile}
            style={{
              background: 'transparent',
              border: '0.5px solid var(--border)',
              borderRadius: 8,
              padding: '5px 12px',
              fontSize: 12,
              color: 'var(--text-2)',
              cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s, background 0.15s',
              minHeight: 44,
              minWidth: 44,
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = 'rgba(99,102,241,0.35)';
              el.style.color = '#6366F1';
              el.style.background = 'rgba(99,102,241,0.06)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = 'var(--border)';
              el.style.color = 'var(--text-2)';
              el.style.background = 'transparent';
            }}
          >
            Reconciliar
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateWalletDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const [form, setForm] = useState({
    name: '',
    currency: 'USD' as 'USD' | 'BOB' | 'PEN',
    countryId: 'US',
    initialBalance: '',
  });

  const setField = (k: keyof typeof form, v: string): void =>
    setForm(p => ({ ...p, [k]: v }));

  const handleCurrencyChange = (v: string): void => {
    const currency = v as 'USD' | 'BOB' | 'PEN';
    setForm(p => ({ ...p, currency, countryId: CURRENCY_TO_COUNTRY[currency] ?? 'US' }));
  };

  const currencyPrefix = getCurrencyPrefix(form.currency);

  const create = trpc.wallets.create.useMutation({
    onSuccess: () => {
      toast.success('Wallet creada', {
        description: `${form.name} · ${form.currency} — Cartera lista para recibir fondos`,
      });
      onCreated();
      setForm({ name: '', currency: 'USD', countryId: 'US', initialBalance: '' });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className={[
          'sm:max-w-md',
          // Mobile bottom sheet
          'max-sm:!fixed max-sm:!bottom-0 max-sm:!left-0 max-sm:!right-0 max-sm:!top-auto',
          'max-sm:!translate-x-0 max-sm:!translate-y-0',
          'max-sm:!w-full max-sm:!max-w-none',
          'max-sm:!rounded-t-[20px] max-sm:!rounded-b-none',
          'max-sm:!max-h-[85vh] max-sm:!overflow-y-auto',
        ].join(' ')}
      >
        <DialogHeader>
          <DialogTitle>Nueva wallet</DialogTitle>
          <p className="text-small text-text-3">Agrega una cartera para una moneda y país</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Field 1: name */}
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Ej: Nómina Bolivia, Caja Operaciones..."
            />
            <p className="text-[11px] text-text-3">
              Un nombre descriptivo para identificar esta cartera fácilmente
            </p>
          </div>

          {/* Field 2: currency + country */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Moneda *</Label>
              <Select value={form.currency} onValueChange={handleCurrencyChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>País *</Label>
              <Select value={form.countryId} onValueChange={(v) => setField('countryId', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.flag} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Field 3: initial balance */}
          <div className="space-y-1.5">
            <Label>Saldo inicial (opcional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-text-3 font-mono pointer-events-none select-none">
                {currencyPrefix}
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.initialBalance}
                onChange={(e) => setField('initialBalance', e.target.value)}
                placeholder="0.00"
                className="pl-8"
              />
            </div>
            <p className="text-[11px] text-text-3">
              Puedes dejarlo en 0 y ajustarlo al reconciliar
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            loading={create.isPending}
            disabled={!form.name || !form.currency || !form.countryId}
            onClick={() =>
              create.mutate({
                name: form.name,
                currency: form.currency,
                countryId: form.countryId,
                initialBalance: Number(form.initialBalance) || 0,
              })
            }
            className="bg-brand hover:bg-brand/90 border-brand"
          >
            Crear wallet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReconcileDialog({
  wallet,
  breakdown,
  onClose,
  onReconciled,
}: {
  wallet: WalletItem;
  breakdown?: WalletBreakdown;
  onClose: () => void;
  onReconciled: () => void;
}): React.ReactElement {
  const t = useTranslations();
  // Pre-llenamos con el saldo MOSTRADO (saldo derivado de eventos desde la
  // última reconciliación), que es lo que el usuario ve en la tarjeta, no el
  // balance crudo en BD. Al confirmar, ese valor pasa a ser la nueva base.
  const displayedBalance = breakdown?.balance ?? Number(wallet.balance);
  const [balance, setBalance] = useState(String(displayedBalance));

  const reconcile = trpc.wallets.reconcile.useMutation({
    onSuccess: () => { toast.success(t('wallets.reconciled')); onReconciled(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('wallets.reconcile')} — {wallet.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-small text-text-3">{t('wallets.reconcileConfirm')}</p>
          <div className="space-y-1.5">
            <Label>{t('wallets.currentBalance')} ({wallet.currency}) *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={reconcile.isPending}
            disabled={balance === ''}
            onClick={() => reconcile.mutate({ id: wallet.id, balance: Number(balance) })}
          >
            {t('wallets.reconcile')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────
// Desglose de saldo — "¿De dónde sale este saldo?"
// ─────────────────────────────────────────────────────
function BreakdownDialog({
  wallet,
  breakdown,
  onClose,
}: {
  wallet: WalletItem;
  breakdown?: WalletBreakdown;
  onClose: () => void;
}): React.ReactElement {
  const cur = wallet.currency;
  const b: WalletBreakdown = breakdown ?? {
    base: Number(wallet.balance), fxIn: 0, fxOut: 0, salariesPaid: 0,
    pettyCashOut: 0, salariesPending: 0, balance: Number(wallet.balance),
    lastAt: null, reconciledAt: wallet.lastReconciledAt ? String(wallet.lastReconciledAt) : null,
  };

  const baseLabel = b.reconciledAt
    ? `Base reconciliada · ${new Date(b.reconciledAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : 'Saldo inicial';

  // Solo mostramos líneas con valor para no saturar.
  const rows: Array<{ label: string; amount: number; sign: '+' | '−'; color: string }> = [];
  if (b.fxIn !== 0)        rows.push({ label: 'Entradas FX', amount: b.fxIn, sign: '+', color: '#10B981' });
  if (b.fxOut !== 0)       rows.push({ label: 'Salidas FX', amount: b.fxOut, sign: '−', color: '#F43F5E' });
  if (b.salariesPaid !== 0) rows.push({ label: 'Salarios pagados', amount: b.salariesPaid, sign: '−', color: '#F43F5E' });
  if (b.pettyCashOut !== 0) rows.push({ label: 'Financiamiento a Caja Chica', amount: b.pettyCashOut, sign: '−', color: '#F43F5E' });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{getFlag(cur)} {wallet.name}</DialogTitle>
          <p className="text-small text-text-3">¿De dónde sale este saldo?</p>
        </DialogHeader>

        <div className="space-y-1 text-sm">
          {/* Base */}
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <span className="text-text-3">{baseLabel}</span>
            <span className="font-mono text-text-1">{formatBalance(b.base, cur)}</span>
          </div>

          {/* Movimientos desde la base */}
          {rows.length === 0 ? (
            <p className="py-3 text-[12px] text-text-3 text-center">
              Sin movimientos desde {b.reconciledAt ? 'la reconciliación' : 'la apertura'}.
            </p>
          ) : rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-text-2">{r.label}</span>
              <span className="font-mono" style={{ color: r.color }}>
                {r.sign} {formatBalance(Math.abs(r.amount), cur)}
              </span>
            </div>
          ))}

          {/* Total */}
          <div className="flex items-center justify-between pt-3">
            <span className="font-semibold text-text-1">Saldo actual</span>
            <span className="font-mono font-bold text-base" style={{ color: b.balance < 0 ? '#F43F5E' : 'var(--text-1)' }}>
              {formatBalance(b.balance, cur)}
            </span>
          </div>

          {/* Comprometido (informativo, no afecta saldo) */}
          {b.salariesPending > 0 && (
            <div className="mt-3 rounded-lg px-3 py-2 text-[12px]"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }}>
              Comprometido (salarios pendientes, aún no descontados):{' '}
              <span className="font-mono font-semibold">{formatBalance(b.salariesPending, cur)}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
