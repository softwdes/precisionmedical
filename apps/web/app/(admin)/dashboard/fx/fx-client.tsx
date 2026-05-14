'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@precision-medical/ui';
import { Plus, ArrowLeftRight, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type FxList = inferRouterOutputs<AppRouter>['fx']['list'];
type Wallet = inferRouterOutputs<AppRouter>['wallets']['list'][number];

export function FxClient({ initial, wallets }: { initial: FxList; wallets: Wallet[] }): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<string | null>(null);
  const [reverseNotes, setReverseNotes] = useState('');

  const { data, refetch } = trpc.fx.list.useQuery({ page, pageSize: 25 }, { initialData: initial });

  const reverse = trpc.fx.reverse.useMutation({
    onSuccess: () => { toast.success(t('fx.reversed')); setReverseTarget(null); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const fmt = (locale === 'en') ? 'en-US' : 'es-ES';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-1">{t('fx.title')}</h1>
          <p className="text-small text-text-3">{t('fx.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('fx.addNew')}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">

        {/* Mobile cards */}
        <div className="md:hidden">
          {(data?.items ?? []).length === 0 ? (
            <div className="text-center py-12 text-text-3">{t('fx.noOps')}</div>
          ) : (
            <div className="divide-y divide-border">
              {(data?.items ?? []).map((op) => {
                const from = op.fromWallet as unknown as { name: string; currency: string } | null;
                const to = op.toWallet as unknown as { name: string; currency: string } | null;
                return (
                  <div key={op.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-text-muted shrink-0" />
                        <div className="min-w-0">
                          <p className="text-small font-medium text-text-1 truncate">{from?.name} → {to?.name}</p>
                          <p className="text-tiny text-text-3">{new Date(op.performedAt as string).toLocaleDateString(fmt)}</p>
                        </div>
                      </div>
                      {op.reversedById && <Badge variant="warning" className="text-tiny shrink-0">{t('fx.reversedLabel')}</Badge>}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-small text-text-2 font-mono">
                        <span className="text-rose">{Number(op.amountFrom).toLocaleString()} {from?.currency}</span>
                        <span className="text-text-muted mx-1.5">→</span>
                        <span className="text-emerald">{Number(op.amountTo).toLocaleString()} {to?.currency}</span>
                      </p>
                      <p className="text-tiny text-text-muted">@{Number(op.rate).toFixed(4)}</p>
                    </div>
                    {!op.reversedById && (
                      <Button variant="outline" size="sm" onClick={() => setReverseTarget(op.id)}>
                        <RotateCcw className="h-3 w-3" />
                        {t('fx.reverseOp')}
                      </Button>
                    )}
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
                <TableHead>{t('fx.fromWallet')}</TableHead>
                <TableHead>{t('fx.toWallet')}</TableHead>
                <TableHead className="text-right">{t('fx.amountFrom')}</TableHead>
                <TableHead className="text-right">{t('fx.amountTo')}</TableHead>
                <TableHead>{t('fx.rate')}</TableHead>
                <TableHead>{t('fx.exchangeHouse')}</TableHead>
                <TableHead>{t('fx.performedAt')}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-text-3">{t('fx.noOps')}</TableCell></TableRow>
              ) : (
                (data?.items ?? []).map((op) => {
                  const from = op.fromWallet as unknown as { name: string; currency: string } | null;
                  const to = op.toWallet as unknown as { name: string; currency: string } | null;
                  return (
                    <TableRow key={op.id}>
                      <TableCell className="text-small text-text-2">{from?.name ?? '—'}</TableCell>
                      <TableCell className="text-small text-text-2">{to?.name ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-small text-rose">{Number(op.amountFrom).toLocaleString()} {from?.currency}</TableCell>
                      <TableCell className="text-right font-mono text-small text-emerald">{Number(op.amountTo).toLocaleString()} {to?.currency}</TableCell>
                      <TableCell className="font-mono text-small text-text-2">{Number(op.rate).toFixed(4)}</TableCell>
                      <TableCell className="text-small text-text-3">{(op.exchangeHouse as string | null) ?? '—'}</TableCell>
                      <TableCell className="text-small text-text-3">{new Date(op.performedAt as string).toLocaleDateString(fmt)}</TableCell>
                      <TableCell>
                        {!op.reversedById ? (
                          <button onClick={() => setReverseTarget(op.id)} className="p-1 text-text-muted hover:text-amber transition-colors" title={t('fx.reverseOp')}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <Badge variant="warning" className="text-tiny">{t('fx.reversedLabel')}</Badge>
                        )}
                      </TableCell>
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

      <CreateFxDialog
        open={showCreate}
        wallets={wallets}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void refetch(); }}
      />

      {reverseTarget && (
        <Dialog open onOpenChange={(o) => { if (!o) setReverseTarget(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t('fx.reverseOp')}</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              <Label>{t('fx.notes')}</Label>
              <Textarea value={reverseNotes} onChange={(e) => setReverseNotes(e.target.value)} placeholder={t('fx.notes')} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setReverseTarget(null)}>{t('common.cancel')}</Button>
              <Button variant="destructive" loading={reverse.isPending} onClick={() => reverse.mutate({ id: reverseTarget, notes: reverseNotes })}>
                {t('fx.reverseOp')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CreateFxDialog({ open, wallets, onClose, onCreated }: { open: boolean; wallets: Wallet[]; onClose: () => void; onCreated: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({
    fromWalletId: '', toWalletId: '',
    amountFrom: '', amountTo: '', rate: '', fee: '',
    exchangeHouse: '', notes: '', receiptUrl: '',
  });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.fx.create.useMutation({
    onSuccess: () => { toast.success(t('fx.created')); onCreated(); setForm({ fromWalletId: '', toWalletId: '', amountFrom: '', amountTo: '', rate: '', fee: '', exchangeHouse: '', notes: '', receiptUrl: '' }); },
    onError: (e) => toast.error(e.message),
  });

  const isValid = form.fromWalletId && form.toWalletId && form.amountFrom && form.amountTo && form.rate;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('fx.createOp')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('fx.fromWallet')} *</Label>
              <Select value={form.fromWalletId} onValueChange={(v) => f('fromWalletId', v)}>
                <SelectTrigger><SelectValue placeholder="Origen..." /></SelectTrigger>
                <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('fx.toWallet')} *</Label>
              <Select value={form.toWalletId} onValueChange={(v) => f('toWalletId', v)}>
                <SelectTrigger><SelectValue placeholder="Destino..." /></SelectTrigger>
                <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>{t('fx.amountFrom')} *</Label><Input type="number" min="0.01" step="0.01" value={form.amountFrom} onChange={(e) => f('amountFrom', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t('fx.amountTo')} *</Label><Input type="number" min="0.01" step="0.01" value={form.amountTo} onChange={(e) => f('amountTo', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t('fx.rate')} *</Label><Input type="number" min="0.000001" step="0.0001" value={form.rate} onChange={(e) => f('rate', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{t('fx.fee')}</Label><Input type="number" min="0" step="0.01" value={form.fee} onChange={(e) => f('fee', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t('fx.exchangeHouse')}</Label><Input value={form.exchangeHouse} onChange={(e) => f('exchangeHouse', e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>{t('fx.receiptUrl')}</Label><Input type="url" value={form.receiptUrl} onChange={(e) => f('receiptUrl', e.target.value)} placeholder="https://..." /></div>
          <div className="space-y-1.5"><Label>{t('fx.notes')}</Label><Textarea value={form.notes} onChange={(e) => f('notes', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={create.isPending}
            disabled={!isValid}
            onClick={() => create.mutate({
              fromWalletId: form.fromWalletId,
              toWalletId: form.toWalletId,
              amountFrom: Number(form.amountFrom),
              amountTo: Number(form.amountTo),
              rate: Number(form.rate),
              fee: Number(form.fee) || 0,
              exchangeHouse: form.exchangeHouse || undefined,
              receiptUrl: form.receiptUrl || undefined,
              notes: form.notes || undefined,
            })}
          >
            {t('fx.createOp')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
