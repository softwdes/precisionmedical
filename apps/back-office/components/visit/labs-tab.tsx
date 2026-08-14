'use client';
import { localeApp } from '@/lib/fechas';

/**
 * LabsTab — órdenes de laboratorio / imagen de la visita (B.20 · L3).
 *
 * Una orden agrupa N estudios (`groupId`): se imprimen en una hoja, pero cada
 * estudio sigue su propio estado y resultado. Debajo, el historial del paciente
 * para leer resultados de visitas anteriores sin salir de la consulta.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@precision/ui';
import {
  FlaskConical, Scan, HeartPulse, Plus, Printer, Loader2, Upload, FileText,
  ChevronDown, ChevronRight, AlertTriangle, Building2, Home, Trash2,
} from 'lucide-react';
import { EmptyState, TagPill } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { LabOrderDialog, type SelectedStudy } from './lab-order-dialog';

export interface LabOrderRow {
  id: string;
  groupId: string | null;
  orderType: string;
  studyName: string;
  studyCode: string | null;
  loincCode: string | null;
  clinicalIndication: string;
  urgency: string;
  billingType: string | null;
  collectionSite: string;
  sampleDate: string | null;
  preferredCenter: string | null;
  icd10Codes: string[];
  status: string;
  orderedAt: string;
  orderedByName: string | null;
  resultFileName: string | null;
  resultUploadedAt: string | null;
  resultUploadedByName: string | null;
  resultNotes: string | null;
  appointment?: { id: string; scheduledFor: string } | null;
  /**
   * Lo que se le cobra al paciente por el estudio, según la FACTURACIÓN.
   * `null` = el estudio no tiene precio en el catálogo y no genera cobro — que
   * no es lo mismo que $0. Solo viene en las órdenes de la visita, no en el
   * historial.
   */
  price?: number | null;
  /** Lo que falta pagar de ese estudio. Misma fuente que `price`. */
  balance?: number | null;
}

interface Props {
  appointmentId: string;
  userId: string | null;
  /** Doctor de la cita — sale preseleccionado como solicitante de la orden */
  defaultProviderId?: string | null;
}

const CATEGORY_ICON: Record<string, React.ElementType> = {
  LABORATORY: FlaskConical, IMAGING: Scan, CARDIOLOGY: HeartPulse, OTHER: FlaskConical,
};

const STATUS_CLASS: Record<string, string> = {
  ORDERED: 'bg-amber/15 text-amber border-amber/30',
  IN_PROGRESS: 'bg-cyan/15 text-cyan border-cyan/30',
  RESULTED: 'bg-emerald/15 text-emerald border-emerald/30',
  VOIDED: 'bg-white/5 text-text-muted border-border',
};

const URGENCY_CLASS: Record<string, string> = {
  STAT: 'bg-rose/15 text-rose border-rose/30',
  URGENT: 'bg-amber/15 text-amber border-amber/30',
  ROUTINE: '',
};

const money = (n: number): string =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function fmtDate(iso: string | null, withTime = false): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(localeApp(), {
    month: 'short', day: 'numeric', year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'America/Denver',
  });
}

/**
 * En la VISITA (consulta del doctor y Day Admission) el estudio se QUITA, no se
 * anula: la hoja la imprime la clínica después de cobrar, así que hasta acá no
 * salió ningún papel. Médico y asistente pueden. En el detalle del caso —días
 * después, con la hoja ya entregada— la vía es anular.
 */
export function LabsTab({ appointmentId, userId, defaultProviderId = null }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  /** Los avisos de cargos son los MISMOS en los tres tabs que cobran. */
  const tc = useTranslations('phoenix.charges');

  const [orders, setOrders] = React.useState<LabOrderRow[]>([]);
  const [history, setHistory] = React.useState<LabOrderRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<LabOrderRow | null>(null);
  const fileInputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/lab-orders/${appointmentId}`);
      if (!res.ok) throw new Error('load');
      const d = await res.json() as { orders: LabOrderRow[]; history: LabOrderRow[] };
      setOrders(d.orders ?? []);
      setHistory(d.history ?? []);
      setError(null);
    } catch {
      setError(t('labErrLoad'));
    } finally {
      setLoading(false);
    }
  }, [appointmentId, t]);

  React.useEffect(() => { void load(); }, [load]);

  const handleCreate = async (payload: Parameters<React.ComponentProps<typeof LabOrderDialog>['onCreate']>[0]): Promise<void> => {
    const res = await fetch(`/api/admin/lab-orders/${appointmentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload satisfies { studies: SelectedStudy[] } & Record<string, unknown>),
    });
    if (!res.ok) throw new Error('create');
    await load();
  };

  const openResult = async (id: string): Promise<void> => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/lab-orders/item/${id}/result`);
      const d = await res.json() as { url?: string };
      if (d.url) window.open(d.url, '_blank', 'noopener');
      else setError(t('labErrResult'));
    } catch {
      setError(t('labErrResult'));
    } finally {
      setBusyId(null);
    }
  };

  const uploadResult = async (id: string, file: File): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/lab-orders/item/${id}/result`, { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error === 'FILE_TOO_LARGE' ? t('labErrTooLarge')
          : d.error === 'INVALID_TYPE' ? t('labErrType')
          : t('labErrUpload'));
        return;
      }
      await load();
    } catch {
      setError(t('labErrUpload'));
    } finally {
      setBusyId(null);
    }
  };

  /** Quitar el estudio del pedido. En la visita nadie anula: no hay papel aún. */
  const deleteOrder = async (id: string): Promise<void> => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/lab-orders/item/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        // Un estudio ya cobrado no se quita: primero se anula el pago (ver
        // lib/charge-payments.ts). Con el monto adentro, que es lo que decide
        // si vale la pena ir a anular el cobro.
        const d = await res.json().catch(() => ({} as { error?: string; paid?: number }));
        setError(d.error === 'ALREADY_PAID'
          ? tc('errAlreadyPaid', { amount: money(Number(d.paid ?? 0)) })
          : t('labErrDelete'));
      } else await load();
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  /** Estudios agrupados por orden (groupId), ordenados por fecha */
  const groups = React.useMemo(() => {
    const map = new Map<string, LabOrderRow[]>();
    for (const o of orders) {
      const key = o.groupId ?? o.id;
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return [...map.entries()].sort((a, b) =>
      new Date(b[1][0].orderedAt).getTime() - new Date(a[1][0].orderedAt).getTime());
  }, [orders]);

  const studyRow = (o: LabOrderRow, showDate = false): React.ReactElement => {
    const Icon = CATEGORY_ICON[o.orderType] ?? FlaskConical;
    const busy = busyId === o.id;
    const voided = o.status === 'VOIDED';
    return (
      <div
        key={o.id}
        className={`px-3 py-2 flex items-center gap-2.5 flex-wrap ${voided ? 'opacity-50' : ''}`}
      >
        <Icon className="w-3.5 h-3.5 text-cyan shrink-0" />
        {o.studyCode && <span className="font-mono text-[10.5px] text-cyan shrink-0">{o.studyCode}</span>}
        <span className="text-[12.5px] text-text-1 flex-1 min-w-[140px]">{o.studyName}</span>
        {showDate && (
          <span className="text-[11px] text-text-muted shrink-0">{fmtDate(o.orderedAt)}</span>
        )}
        {/* Lo que cuesta el estudio. El paciente lo paga al salir, junto con lo
            demás, y hasta ahora el monto solo existía en el cobro: el que pedía
            el estudio no sabía que le estaba sumando $130.50 a la salida. Un
            estudio sin precio en el catálogo no muestra nada — no genera cobro,
            y "$0.00" diría que es gratis. */}
        {o.price != null && !voided && (
          <span className="text-[11.5px] font-semibold text-text-1 tabular-nums shrink-0">{money(o.price)}</span>
        )}
        <TagPill label={t(`labStatus_${o.status}`)} colorClass={STATUS_CLASS[o.status] ?? ''} />

        {/* Acciones */}
        <div className="flex items-center gap-1.5 shrink-0">
          {o.resultFileName ? (
            <button
              type="button"
              onClick={() => void openResult(o.id)}
              disabled={busy}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald hover:underline"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
              {t('labViewResult')}
            </button>
          ) : !voided ? (
            <>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                ref={(el) => { fileInputs.current[o.id] = el; }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadResult(o.id, f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputs.current[o.id]?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-violet-text hover:underline"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {t('labUploadResult')}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(o)}
                disabled={busy}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-text-muted hover:text-rose"
              >
                <Trash2 className="w-3 h-3" /> {t('labRemove')}
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center text-text-muted text-[12px] gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('labLoading')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de acción */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-text-muted">
          {orders.length > 0 ? t('labCountThisVisit', { count: orders.length }) : t('labNoneThisVisit')}
        </div>
        <Button onClick={() => setDialogOpen(true)} className="h-9 gap-1.5">
          <Plus className="w-3.5 h-3.5" /> {t('labNewOrder')}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Órdenes de esta visita */}
      {groups.length === 0 ? (
        <EmptyState.Rich icon={FlaskConical} title={t('labEmptyTitle')} subtitle={t('labEmptySubtitle')} />
      ) : (
        <div className="space-y-3">
          {groups.map(([groupId, items]) => {
            const head = items[0];
            const inHouse = head.collectionSite === 'IN_HOUSE';
            return (
              <div key={groupId} className="rounded-lg border border-border bg-bg-1">
                {/* Cabecera de la orden */}
                <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
                    {fmtDate(head.orderedAt, true)}
                  </span>
                  {head.urgency !== 'ROUTINE' && (
                    <TagPill label={t(`labUrgency_${head.urgency}`)} colorClass={URGENCY_CLASS[head.urgency]} />
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] text-text-2">
                    {inHouse ? <Home className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                    {t(`labCollection_${head.collectionSite}`)}
                  </span>
                  {head.billingType && (
                    <TagPill label={t(`labBilling_${head.billingType}`)} colorClass="bg-white/5 text-text-2 border-border" />
                  )}
                  <div className="flex-1" />
                  {head.groupId && (
                    <a
                      href={`/doctor-print/lab-order/${head.groupId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-text-2 hover:text-violet-text"
                    >
                      <Printer className="w-3.5 h-3.5" /> {t('labPrintOrder')}
                    </a>
                  )}
                </div>

                {/* Estudios */}
                <div className="divide-y divide-border/40">
                  {items.map((o) => studyRow(o))}
                </div>

                {/* Pie: indicación, diagnósticos, centro */}
                {(head.clinicalIndication || head.icd10Codes.length > 0 || head.preferredCenter) && (
                  <div className="px-3 py-2 border-t border-border/60 space-y-1">
                    {head.clinicalIndication && (
                      <div className="text-[11.5px] text-text-2">
                        <span className="text-text-muted">{t('labIndication')}: </span>
                        {head.clinicalIndication}
                      </div>
                    )}
                    {head.icd10Codes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {head.icd10Codes.map((c) => (
                          <span key={c} className="text-[10.5px] font-mono text-cyan">{c}</span>
                        ))}
                      </div>
                    )}
                    {head.preferredCenter && (
                      <div className="text-[11.5px] text-text-2">
                        <span className="text-text-muted">{t('labCenter')}: </span>{head.preferredCenter}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Historial del paciente */}
      {history.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-1">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-white/[0.02] transition-colors"
          >
            {showHistory ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
            <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
              {t('labHistory')}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-text-muted">{history.length}</span>
            <div className="flex-1" />
            <span className="text-[10.5px] text-text-muted">
              {t('labHistoryResulted', { count: history.filter((h) => h.resultFileName).length })}
            </span>
          </button>
          {showHistory && (
            <div className="divide-y divide-border/40 border-t border-border/60">
              {history.map((o) => studyRow(o, true))}
            </div>
          )}
        </div>
      )}

      <LabOrderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        userId={userId}
        defaultProviderId={defaultProviderId}
        onCreate={handleCreate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) void deleteOrder(deleteTarget.id); }}
        title={t('labRemoveTitle')}
        description={t('labRemoveConfirm', { study: deleteTarget?.studyName ?? '' })}
        confirmLabel={t('labRemove')}
        variant="danger"
      />
    </div>
  );
}
