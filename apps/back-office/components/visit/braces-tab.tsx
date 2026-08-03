'use client';

/**
 * BracesTab — férulas / DME entregados en la visita.
 *
 * Fila por entrega (no una lista agrupada): cada férula es un hecho clínico y
 * contable con su talla, lado y cantidad. Se comparte entre el portal del doctor
 * y Day Admission — la puede cargar el doctor o el asistente.
 *
 * El cobro lo resuelve el backend: cada férula genera su fila de facturación y se
 * paga junto con los servicios de la visita. Las férulas se pagan COMPLETAS, sin
 * lien ni seguro.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Bandage, Plus, Loader2, AlertTriangle, Ban, History } from 'lucide-react';
import { EmptyState, TagPill } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { BracePickerDialog, type CatalogBrace } from './brace-picker-dialog';

type Side = 'NA' | 'LEFT' | 'RIGHT';
type Status = 'DISPENSED' | 'RETURNED' | 'VOIDED';

export interface BraceRow {
  id: string;
  code: string;
  name: string;
  sizeLabel: string | null;
  hcpcsCode: string | null;
  unitPrice: string | number;
  side: Side;
  quantity: number;
  status: Status;
  notes: string | null;
  voidReason: string | null;
  dispensedByName: string | null;
  dispensedAt: string;
}

const STATUS_CLASS: Record<Status, string> = {
  DISPENSED: 'bg-emerald/15 text-emerald border-emerald/30',
  RETURNED: 'bg-amber/15 text-amber border-amber/30',
  VOIDED: 'bg-white/5 text-text-muted border-border',
};

const money = (n: number): string => `$${n.toFixed(2)}`;

export function BracesTab({ appointmentId }: { appointmentId: string }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  const [rows, setRows] = React.useState<BraceRow[]>([]);
  const [history, setHistory] = React.useState<BraceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<BraceRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/braces/${appointmentId}`);
      if (!res.ok) { setError(t('braceErrLoad')); return; }
      const d = (await res.json()) as { braces: BraceRow[]; history: BraceRow[] };
      setRows(d.braces);
      setHistory(d.history);
      setError(null);
    } catch {
      setError(t('braceErrLoad'));
    } finally {
      setLoading(false);
    }
  }, [appointmentId, t]);

  React.useEffect(() => { void load(); }, [load]);

  const handleAdd = async (item: CatalogBrace, side: Side, quantity: number): Promise<void> => {
    setError(null);
    const res = await fetch(`/api/admin/braces/${appointmentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catalogItemId: item.id,
        code: item.code,
        name: item.name,
        sizeLabel: item.sizeLabel,
        hcpcsCode: item.hcpcsCode,
        unitPrice: item.publicPrice ?? 0,
        side,
        quantity,
      }),
    });
    if (!res.ok) { setError(t('braceErrSave')); return; }
    setPickerOpen(false);
    await load();
  };

  const handleVoid = async (row: BraceRow): Promise<void> => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/braces/item/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RETURNED' }),
      });
      if (!res.ok) setError(t('braceErrVoid'));
      else await load();
    } finally {
      setBusyId(null);
      setVoidTarget(null);
    }
  };

  const sideLabel = (s: Side): string | null =>
    s === 'LEFT' ? t('braceSideLeft') : s === 'RIGHT' ? t('braceSideRight') : null;

  const total = rows
    .filter((r) => r.status === 'DISPENSED')
    .reduce((sum, r) => sum + Number(r.unitPrice) * r.quantity, 0);

  const braceRow = (r: BraceRow, showDate = false): React.ReactElement => {
    const inactive = r.status !== 'DISPENSED';
    const side = sideLabel(r.side);
    return (
      <div
        key={r.id}
        className={`px-3 py-2 flex items-center gap-2.5 flex-wrap ${inactive ? 'opacity-50' : ''}`}
      >
        <Bandage className="w-3.5 h-3.5 text-violet shrink-0" />
        <span className="text-[12.5px] text-text-1 flex-1 min-w-[140px]">
          {r.name}
          {r.sizeLabel && <span className="text-text-muted"> · {r.sizeLabel}</span>}
        </span>

        {side && <TagPill label={side} colorClass="bg-cyan/15 text-cyan border-cyan/30" />}
        {r.quantity > 1 && (
          <span className="text-[11px] font-semibold text-text-2 shrink-0">×{r.quantity}</span>
        )}
        <span className="text-[12.5px] font-semibold text-text-1 shrink-0 tabular-nums">
          {money(Number(r.unitPrice) * r.quantity)}
        </span>
        <TagPill label={t(`braceStatus_${r.status}`)} colorClass={STATUS_CLASS[r.status]} />

        {showDate && (
          <span className="text-[11px] text-text-muted shrink-0">
            {new Date(r.dispensedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </span>
        )}

        {!inactive && !showDate && (
          <button
            type="button"
            onClick={() => setVoidTarget(r)}
            disabled={busyId === r.id}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose hover:underline shrink-0"
          >
            {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
            {t('braceReturn')}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-bg-1">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
          <Bandage className="w-4 h-4 text-violet shrink-0" />
          <span className="text-text-1 font-semibold text-[12px] uppercase tracking-wider">
            {t('braceTitle')}
          </span>
          {total > 0 && (
            <TagPill
              label={t('braceTotal', { amount: money(total) })}
              colorClass="bg-emerald/15 text-emerald border-emerald/30"
            />
          )}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[11.5px] font-semibold text-violet bg-violet/10 border border-violet/30 hover:bg-violet/20 hover:border-violet/50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t('braceAdd')}
          </button>
        </div>

        <div className="p-2">
          {loading ? (
            <div className="p-6 flex items-center justify-center gap-2 text-[12.5px] text-text-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('braceLoading')}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState.Rich icon={Bandage} title={t('braceEmptyTitle')} subtitle={t('braceEmptySubtitle')} />
          ) : (
            <div className="divide-y divide-border/40">{rows.map((r) => braceRow(r))}</div>
          )}
        </div>

        {rows.some((r) => r.status === 'DISPENSED') && (
          <div className="px-4 py-2.5 border-t border-border">
            <p className="text-[11px] text-text-muted">{t('braceFullPaymentNote')}</p>
          </div>
        )}

        {error && (
          <div className="mx-3 mb-3 rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        )}
      </div>

      {/* Ya entregadas en visitas anteriores — evita darle dos veces la misma */}
      {history.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-1">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <History className="w-4 h-4 text-text-muted shrink-0" />
            <span className="text-text-1 font-semibold text-[12px] uppercase tracking-wider">
              {t('braceHistoryTitle')}
            </span>
            <span className="text-[10px] text-text-muted">· {history.length}</span>
          </div>
          <div className="p-2 divide-y divide-border/40">
            {history.map((r) => braceRow(r, true))}
          </div>
        </div>
      )}

      {pickerOpen && (
        <BracePickerDialog onClose={() => setPickerOpen(false)} onAdd={handleAdd} />
      )}

      {voidTarget && (
        <ConfirmDialog
          open
          title={t('braceReturnTitle')}
          description={t('braceReturnDesc', { name: voidTarget.name })}
          confirmLabel={t('braceReturn')}
          onConfirm={() => void handleVoid(voidTarget)}
          onCancel={() => setVoidTarget(null)}
        />
      )}
    </div>
  );
}
