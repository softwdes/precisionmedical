'use client';

/**
 * RevertirPagoDialog — deshacer un cobro mal hecho.
 *
 * Vive aparte porque lo usan las DOS pantallas donde se cobra: el tab de
 * Finanzas del caso y el desplegable de la lista de Finanzas. Darrell trabaja
 * sobre todo en la lista (Erick, 2026-09-23), así que tenerlo en una sola no
 * alcanzaba — y duplicar el diálogo es como las dos terminan diciendo cosas
 * distintas sobre la misma plata.
 *
 * Reemplaza a un `confirm()` del navegador colgado de un tacho de 12px. Dos
 * problemas con eso: el tacho dice "borrar" y lo que pasa es "revertir" —el pago
 * queda anulado, no se borra, y el saldo vuelve entero—, y no se registraba POR
 * QUÉ. Darrell está aprendiendo a cobrar en v3 y equivocarse es parte del
 * aprendizaje; revertir tiene que ser obvio y dejar dicho qué pasó.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button, Dialog, DialogContent, DialogTitle } from '@precision/ui';
import { Undo2, Loader2 } from 'lucide-react';

export interface PagoARevertir {
  caseId: string;
  billingId: string;
  payId: string;
  /** Lo cobrado. */
  monto: number;
  /** Lo perdonado, si el pago descontó parte de la deuda. Vuelve junto. */
  descuento: number;
}

export function RevertirPagoDialog({ pago, onClose, onDone }: {
  pago: PagoARevertir | null;
  onClose: () => void;
  /** Se llama con el revert ya hecho: quien monta decide qué recargar. */
  onDone: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.caseTabs.finanzas');
  const tc = useTranslations('phoenix.common');

  const [motivo, setMotivo] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // El motivo no se arrastra de un pago al siguiente: es de ESTE revert.
  React.useEffect(() => {
    if (pago) { setMotivo(''); setError(null); }
  }, [pago?.payId]);

  const fmt$ = (n: number): string =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const revertir = async (): Promise<void> => {
    if (!pago) return;
    const razon = motivo.trim();
    if (!razon) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/cases/${pago.caseId}/billing/${pago.billingId}/payments/${pago.payId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: razon }),
        });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('alertErrorCancel'));
    } finally {
      setEnviando(false);
    }
  };

  const vuelve = (pago?.monto ?? 0) + (pago?.descuento ?? 0);

  return (
    <Dialog open={!!pago} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <DialogTitle className="text-text-1 font-semibold text-base flex items-center gap-2">
            <Undo2 className="w-4 h-4 text-rose" />
            {t('payRevertTitle')}
          </DialogTitle>
          <p className="text-text-muted text-xs mt-0.5">{t('payRevertBody')}</p>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Lo que vuelve, ANTES de confirmar. Es lo que hay que mirar para
              saber si este es el pago que se quería deshacer. */}
          <div className="rounded-lg bg-bg-2 border border-border px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-text-muted text-xs">{t('payRevertReturns')}</span>
              <span className="font-mono font-bold text-emerald tabular-nums">{fmt$(vuelve)}</span>
            </div>
            {/* El desglose solo cuando hay descuento: si el pago perdonó parte
                de la deuda, eso también regresa y no es evidente. */}
            {!!pago?.descuento && (
              <div className="text-[11px] text-text-muted mt-1">
                {t('payRevertBreakdown', {
                  paid: fmt$(pago.monto),
                  discount: fmt$(pago.descuento),
                })}
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="motivo-reversion"
              className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
            >
              {t('payRevertReason')}
            </label>
            <textarea
              id="motivo-reversion"
              autoFocus
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={t('payRevertReasonPlaceholder')}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand resize-none"
            />
            <p className="text-[11px] text-text-muted mt-1">{t('payRevertReasonHint')}</p>
          </div>

          {error && <p className="text-[11px] text-rose">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={enviando}>
            {tc('cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => void revertir()}
            disabled={!motivo.trim() || enviando}
            className="gap-1.5 bg-rose hover:bg-rose/90 text-white border-0"
          >
            {enviando
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('payRevertDoing')}</>
              : <><Undo2 className="w-3.5 h-3.5" /> {t('payRevertConfirm')}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** El botón de la fila. Con TEXTO: un ícono solo obliga a adivinar, y acá lo
 *  que se adivina es plata. */
export function RevertirPagoButton({ onClick, disabled }: {
  onClick: () => void; disabled?: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.caseTabs.finanzas');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={t('payRevertTitle')}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-text-muted hover:text-rose hover:bg-rose/10 transition-colors disabled:opacity-50 whitespace-nowrap"
    >
      <Undo2 className="w-3.5 h-3.5" />
      {t('payRevert')}
    </button>
  );
}
