'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Card, CardContent, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@precision/ui';
import { Plus, Landmark, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type Wallet = inferRouterOutputs<AppRouter>['wallets']['list'][number];

const CURRENCY_COLORS: Record<string, string> = {
  USD: 'text-emerald',
  BOB: 'text-amber',
  PEN: 'text-sky',
};

const COUNTRIES = [
  { id: 'US', name: 'United States', currency: 'USD' },
  { id: 'BO', name: 'Bolivia', currency: 'BOB' },
  { id: 'PE', name: 'Peru', currency: 'PEN' },
];

export function WalletsClient({ initialWallets }: { initialWallets: Wallet[] }): React.ReactElement {
  const t = useTranslations();
  const [showCreate, setShowCreate] = useState(false);
  const [reconcileTarget, setReconcileTarget] = useState<Wallet | null>(null);

  const { data: wallets, refetch } = trpc.wallets.list.useQuery(undefined, { initialData: initialWallets });

  const totalUsd = wallets
    .filter(w => w.currency === 'USD')
    .reduce((s, w) => s + Number(w.balance), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('wallets.title')}</h1>
          <p className="text-small text-text-3">{wallets.length} {t('wallets.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('wallets.addNew')}
        </Button>
      </div>

      {/* Summary strip */}
      <div className="rounded-lg border border-border bg-surface px-4 py-3 flex items-center gap-3">
        <Landmark className="h-4 w-4 text-text-3 shrink-0" />
        <p className="text-small text-text-2">
          Total USD: <span className="font-mono font-semibold text-text-1">${totalUsd.toLocaleString()}</span>
        </p>
        <span className="text-text-muted mx-1">·</span>
        <p className="text-small text-text-3">{wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'}</p>
      </div>

      {/* Wallet cards */}
      {wallets.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface py-16 text-center text-text-3">
          {t('wallets.noWallets')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {wallets.map((wallet) => {
            const country = wallet.country as unknown as { code: string; name: string } | null;
            return (
              <Card key={wallet.id} className="hover:border-brand/30 transition-colors">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-brand/10">
                        <Landmark className="h-4 w-4 text-brand" />
                      </div>
                      <div>
                        <p className="text-small font-semibold text-text-1 truncate max-w-[140px]">{wallet.name}</p>
                        <p className="text-tiny text-text-3">{country?.name ?? '—'}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className={`font-mono text-tiny ${CURRENCY_COLORS[wallet.currency] ?? ''}`}>
                      {wallet.currency}
                    </Badge>
                  </div>

                  <p className={`text-2xl font-bold font-mono ${CURRENCY_COLORS[wallet.currency] ?? 'text-text-1'}`}>
                    {wallet.currency === 'USD' ? '$' : ''}{Number(wallet.balance).toLocaleString()}
                    {wallet.currency !== 'USD' && <span className="text-small ml-1 text-text-3">{wallet.currency}</span>}
                  </p>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-tiny text-text-muted">
                      {wallet.lastReconciledAt ? (
                        <>
                          <CheckCircle className="h-3 w-3 text-emerald" />
                          {new Date(wallet.lastReconciledAt).toLocaleDateString()}
                        </>
                      ) : (
                        <>
                          <Clock className="h-3 w-3" />
                          {t('wallets.neverReconciled')}
                        </>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReconcileTarget(wallet)}
                    >
                      {t('wallets.reconcile')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
          onClose={() => setReconcileTarget(null)}
          onReconciled={() => { setReconcileTarget(null); void refetch(); }}
        />
      )}
    </div>
  );
}

function CreateWalletDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({ name: '', currency: 'USD' as const, countryId: 'US', initialBalance: '' });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.wallets.create.useMutation({
    onSuccess: () => { toast.success(t('wallets.created')); onCreated(); setForm({ name: '', currency: 'USD', countryId: 'US', initialBalance: '' }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('wallets.createWallet')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('wallets.name')} *</Label>
            <Input value={form.name} onChange={(e) => f('name', e.target.value)} placeholder="Ej: Nómina Bolivia" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('wallets.currency')} *</Label>
              <Select value={form.currency} onValueChange={(v) => f('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="BOB">BOB</SelectItem>
                  <SelectItem value="PEN">PEN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('wallets.country')} *</Label>
              <Select value={form.countryId} onValueChange={(v) => f('countryId', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('wallets.initialBalance')}</Label>
            <Input type="number" min="0" step="0.01" value={form.initialBalance} onChange={(e) => f('initialBalance', e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={create.isPending}
            disabled={!form.name || !form.currency || !form.countryId}
            onClick={() => create.mutate({ name: form.name, currency: form.currency as 'USD' | 'BOB' | 'PEN', countryId: form.countryId, initialBalance: Number(form.initialBalance) || 0 })}
          >
            {t('wallets.createWallet')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReconcileDialog({ wallet, onClose, onReconciled }: { wallet: Wallet; onClose: () => void; onReconciled: () => void }): React.ReactElement {
  const t = useTranslations();
  const [balance, setBalance] = useState(String(Number(wallet.balance)));

  const reconcile = trpc.wallets.reconcile.useMutation({
    onSuccess: () => { toast.success(t('wallets.reconciled')); onReconciled(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('wallets.reconcile')} — {wallet.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-small text-text-3">{t('wallets.reconcileConfirm')}</p>
          <div className="space-y-1.5">
            <Label>{t('wallets.currentBalance')} ({wallet.currency}) *</Label>
            <Input type="number" min="0" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
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
