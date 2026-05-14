'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge, Input, Label, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Card, CardContent,
} from '@precision-medical/ui';
import { ArrowUpCircle, ArrowDownCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type CashBox = inferRouterOutputs<AppRouter>['pettyCash']['listBoxes'][number];
type TxList = inferRouterOutputs<AppRouter>['pettyCash']['listTransactions'];

export function PettyCashClient({ initialBoxes }: { initialBoxes: CashBox[] }): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [selectedBox, setSelectedBox] = useState<CashBox | null>(null);
  const [page, setPage] = useState(1);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showExpense, setShowExpense] = useState(false);

  const CATEGORY_LABELS: Record<string, string> = {
    MEDICAL_SUPPLIES: t('pettyCash.categories.MEDICAL_SUPPLIES'),
    TRANSPORT: t('pettyCash.categories.TRANSPORT'),
    FOOD: t('pettyCash.categories.FOOD'),
    OFFICE: t('pettyCash.categories.OFFICE'),
    UTILITIES: t('pettyCash.categories.UTILITIES'),
    MAINTENANCE: t('pettyCash.categories.MAINTENANCE'),
    OTHER: t('pettyCash.categories.OTHER'),
  };

  const { data: boxes, refetch: refetchBoxes } = trpc.pettyCash.listBoxes.useQuery(undefined, { initialData: initialBoxes });

  const { data: txData, refetch: refetchTx } = trpc.pettyCash.listTransactions.useQuery(
    { cashBoxId: selectedBox?.id ?? '', page, pageSize: 25 },
    { enabled: !!selectedBox },
  );

  const refetchAll = (): void => { void refetchBoxes(); void refetchTx(); };

  const activeBox = boxes.find(b => b.id === selectedBox?.id) ?? selectedBox;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text-1">{t('pettyCash.title')}</h1>
        <p className="text-small text-text-3">{boxes.length} {t('pettyCash.registeredBoxes')}</p>
      </div>

      {/* Cash Box Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {boxes.map((box) => (
          <Card
            key={box.id}
            className={`cursor-pointer transition-all hover:border-brand/50 ${selectedBox?.id === box.id ? 'border-brand/50 bg-brand/5' : ''}`}
            onClick={() => { setSelectedBox(box); setPage(1); }}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-small font-semibold text-text-2 truncate">{box.name}</p>
                  <p className="text-2xl font-bold font-mono text-text-1">${Number(box.balance).toLocaleString()}</p>
                  <p className="text-tiny text-text-3">{box.currency}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {Number(box.balance) <= Number(box.lowBalanceThreshold) && (
                    <Badge variant="warning" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {t('pettyCash.lowBalance')}
                    </Badge>
                  )}
                  <p className="text-tiny text-text-muted">{t('pettyCash.minBalance')}: ${Number(box.lowBalanceThreshold).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Selected Box Detail */}
      {selectedBox && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-text-1 truncate">{activeBox?.name} — {t('pettyCash.transactions')}</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeposit(true)}>
                <ArrowUpCircle className="h-3.5 w-3.5 text-emerald" />
                {t('pettyCash.deposit')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowExpense(true)}>
                <ArrowDownCircle className="h-3.5 w-3.5 text-rose" />
                {t('pettyCash.expense')}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface overflow-hidden">

            {/* Mobile: card list */}
            <div className="md:hidden">
              {(txData?.items ?? []).length === 0 ? (
                <div className="text-center py-8 text-text-3">{t('pettyCash.noTransactions')}</div>
              ) : (
                <div className="divide-y divide-border">
                  {(txData?.items ?? []).map((tx) => (
                    <div key={tx.id} className="px-4 py-3.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <Badge variant={tx.type === 'DEPOSIT' ? 'success' : tx.type === 'EXPENSE' ? 'destructive' : 'secondary'}>
                            {tx.type === 'DEPOSIT' ? t('pettyCash.typeDeposit') : tx.type === 'EXPENSE' ? t('pettyCash.typeExpense') : t('pettyCash.typeAdjustment')}
                          </Badge>
                          <span className="text-small text-text-2 truncate">
                            {tx.category ? CATEGORY_LABELS[tx.category] ?? tx.category : '—'}
                          </span>
                        </div>
                        <span className={`font-mono font-semibold text-small shrink-0 ${Number(tx.amount) >= 0 ? 'text-emerald' : 'text-rose'}`}>
                          {Number(tx.amount) >= 0 ? '+' : ''}${Math.abs(Number(tx.amount)).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-small text-text-2 line-clamp-2">{tx.description}</p>
                      <p className="text-tiny text-text-muted">
                        {new Date(tx.performedAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES')}
                      </p>
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
                    <TableHead>{t('pettyCash.date')}</TableHead>
                    <TableHead>{t('pettyCash.type')}</TableHead>
                    <TableHead>{t('pettyCash.category')}</TableHead>
                    <TableHead>{t('pettyCash.description')}</TableHead>
                    <TableHead className="text-right">{t('common.amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(txData?.items ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-text-3">{t('pettyCash.noTransactions')}</TableCell></TableRow>
                  ) : (
                    (txData?.items ?? []).map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-small text-text-3">{new Date(tx.performedAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES')}</TableCell>
                        <TableCell>
                          <Badge variant={tx.type === 'DEPOSIT' ? 'success' : tx.type === 'EXPENSE' ? 'destructive' : 'secondary'}>
                            {tx.type === 'DEPOSIT' ? t('pettyCash.typeDeposit') : tx.type === 'EXPENSE' ? t('pettyCash.typeExpense') : t('pettyCash.typeAdjustment')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-small text-text-2">{tx.category ? CATEGORY_LABELS[tx.category] ?? tx.category : '—'}</TableCell>
                        <TableCell className="text-small text-text-2 max-w-[200px] truncate">{tx.description}</TableCell>
                        <TableCell className={`text-right font-mono font-semibold text-small ${Number(tx.amount) >= 0 ? 'text-emerald' : 'text-rose'}`}>
                          {Number(tx.amount) >= 0 ? '+' : ''}${Math.abs(Number(tx.amount)).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

          </div>

          {/* Pagination */}
          {(txData?.totalPages ?? 1) > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-small text-text-3">{t('employees.page')} {page} {t('employees.of')} {txData?.totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
                <Button variant="outline" size="sm" disabled={page >= (txData?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Deposit Dialog */}
      <DepositDialog
        open={showDeposit}
        boxId={selectedBox?.id ?? ''}
        onClose={() => setShowDeposit(false)}
        onCreated={() => { setShowDeposit(false); refetchAll(); }}
      />

      {/* Expense Dialog */}
      <ExpenseDialog
        open={showExpense}
        boxId={selectedBox?.id ?? ''}
        onClose={() => setShowExpense(false)}
        onCreated={() => { setShowExpense(false); refetchAll(); }}
      />
    </div>
  );
}

function DepositDialog({ open, boxId, onClose, onCreated }: { open: boolean; boxId: string; onClose: () => void; onCreated: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({ amount: '', description: '' });

  const deposit = trpc.pettyCash.deposit.useMutation({
    onSuccess: () => { toast.success(t('pettyCash.depositRegistered')); onCreated(); setForm({ amount: '', description: '' }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('pettyCash.registerDeposit')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>{t('common.amount')} *</Label><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>{t('pettyCash.description')} *</Label><Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('pettyCash.depositSource')} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={deposit.isPending} disabled={!form.amount || !form.description} onClick={() => deposit.mutate({ cashBoxId: boxId, amount: Number(form.amount), description: form.description })}>
            {t('pettyCash.register')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({ open, boxId, onClose, onCreated }: { open: boolean; boxId: string; onClose: () => void; onCreated: () => void }): React.ReactElement {
  const t = useTranslations();
  const [form, setForm] = useState({ amount: '', category: 'OTHER' as const, description: '', receiptUrl: '' });
  const f = (k: keyof typeof form, v: string): void => setForm(p => ({ ...p, [k]: v }));

  const CATEGORY_LABELS: Record<string, string> = {
    MEDICAL_SUPPLIES: t('pettyCash.categories.MEDICAL_SUPPLIES'),
    TRANSPORT: t('pettyCash.categories.TRANSPORT'),
    FOOD: t('pettyCash.categories.FOOD'),
    OFFICE: t('pettyCash.categories.OFFICE'),
    UTILITIES: t('pettyCash.categories.UTILITIES'),
    MAINTENANCE: t('pettyCash.categories.MAINTENANCE'),
    OTHER: t('pettyCash.categories.OTHER'),
  };

  const expense = trpc.pettyCash.expense.useMutation({
    onSuccess: () => { toast.success(t('pettyCash.expenseRegistered')); onCreated(); setForm({ amount: '', category: 'OTHER', description: '', receiptUrl: '' }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('pettyCash.registerExpense')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{t('common.amount')} *</Label><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => f('amount', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>{t('pettyCash.category')} *</Label>
              <Select value={form.category} onValueChange={(v) => f('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>{t('pettyCash.description')} *</Label><Textarea value={form.description} onChange={(e) => f('description', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>{t('pettyCash.receiptUrl')} *</Label>
            <Input type="url" value={form.receiptUrl} onChange={(e) => f('receiptUrl', e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="destructive" loading={expense.isPending} disabled={!form.amount || !form.description || !form.receiptUrl} onClick={() => expense.mutate({ cashBoxId: boxId, amount: Number(form.amount), category: form.category as 'OTHER', description: form.description, receiptUrl: form.receiptUrl })}>
            {t('pettyCash.registerExpense')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
