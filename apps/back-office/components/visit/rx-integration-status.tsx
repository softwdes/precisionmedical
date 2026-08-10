'use client';

/**
 * RxIntegrationStatus — tab Prescripción (D4 · ScriptSure / DAW Systems).
 *
 * Dos acciones lado a lado (diseño pedido por Erick 2026-08-03): a la izquierda
 * el CTA para prescribir (widget Drug List de ScriptSure en modal casi
 * fullscreen), a la derecha el acceso a las recetas ya enviadas (modal de
 * lectura). El historial de medicamentos queda abajo, como referencia — incluye
 * tanto lo que recetó el doctor como lo que el paciente refiere tomar.
 *
 * Las recetas las llena el webhook de ScriptSure (`/api/scriptsure/webhook`)
 * cuando el doctor las envía a la farmacia. El refresco es al cerrar el modal
 * del widget — pull atado a acción del usuario, nunca polling (regla de DAW).
 *
 * Solo el prescriptor con `Provider.scriptsureUserId` cargado puede abrir los
 * widgets; los demás doctores ven un aviso claro en vez de un error feo.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import {
  ShieldCheck, Loader2, AlertTriangle, Pill, ArrowRight, Send, MapPin, RotateCcw,
} from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';
import { useTransitionProgress } from '@/components/layout/navigation-progress';
import {
  ScriptSureWidgetDialog, launchRefill, type WidgetKind, type WidgetStatus,
} from './scriptsure-widget-dialog';

type Status = WidgetStatus;

interface SentRx {
  id: string;
  drugName: string;
  deaSchedule: string | null;
  dose: string;
  frequency: string;
  quantityTotal: number;
  refills: number;
  pharmacyName: string | null;
  status: 'DRAFT' | 'SENT' | 'PENDING_DAW' | 'VOIDED' | 'ERROR';
  dawSentAt: string | null;
  createdAt: string;
  /** false en recetas anteriores a que guardáramos los ids del fármaco */
  canRefill: boolean;
  /** solo en las de OTRAS citas — fecha de esa visita */
  visitDate?: string;
}

/**
 * Recetas que llegaron (o van en camino) a la farmacia.
 *
 * El mostrador solo debe ver estas: un borrador o una anulada no le sirven, y
 * la que falló es peor que ruido — casi siempre está DUPLICADA por el reenvío
 * que sí salió, así que el asistente ve dos veces el mismo remedio y no sabe
 * cuál cuenta. Los errores los ve el doctor, que es el único que puede reenviar.
 */
export const RX_ENTREGADAS: ReadonlySet<string> = new Set(['SENT', 'PENDING_DAW']);
export const soloEntregadas = <T extends { status: string }>(rows: T[]): T[] =>
  rows.filter((r) => RX_ENTREGADAS.has(r.status));

/** Estado de la receta → clave i18n y color. ERROR va en rose: no llegó a la farmacia.
 *  Exportados para que el Resumen pinte los estados igual y no haya dos verdades. */
export const STATUS_KEY: Record<SentRx['status'], string> = {
  SENT: 'sent',
  DRAFT: 'draft',
  PENDING_DAW: 'pending',
  VOIDED: 'voided',
  ERROR: 'error',
};

export const STATUS_CLASS: Record<SentRx['status'], string> = {
  SENT: 'bg-emerald/15 text-emerald border-emerald/30',
  DRAFT: 'bg-white/5 text-text-muted border-border',
  PENDING_DAW: 'bg-amber/15 text-amber border-amber/30',
  VOIDED: 'bg-white/5 text-text-muted border-border',
  ERROR: 'bg-rose/15 text-rose border-rose/30',
};

/**
 * `readOnly` — Day Admission: el asistente VE las recetas de la visita pero no
 * prescribe ni repite. Prescribir es firmar una orden médica y no se delega
 * (misma regla que `canSign` en la nota clínica). Lo que sí necesita es poder
 * responder "¿se le mandó la receta a la farmacia?" en el checkout.
 */
export function RxIntegrationStatus({ appointmentId, readOnly = false }: {
  appointmentId: string;
  readOnly?: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  useTransitionProgress(isPending);

  const [active, setActive] = React.useState<WidgetKind | null>(null);
  const [status, setStatus] = React.useState<Status>('loading');
  const [url, setUrl] = React.useState<string | null>(null);
  const [showSent, setShowSent] = React.useState(false);
  const [sent, setSent] = React.useState<SentRx[]>([]);
  const [previous, setPrevious] = React.useState<SentRx[]>([]);
  const [syncing, setSyncing] = React.useState(false);
  const [refillingId, setRefillingId] = React.useState<string | null>(null);
  const [errorDetail, setErrorDetail] = React.useState<string | null>(null);

  const loadPrescriptions = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/scriptsure/prescriptions/${appointmentId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { prescriptions: SentRx[]; previous?: SentRx[] };
      setSent(data.prescriptions);
      setPrevious(data.previous ?? []);
    } catch { /* la lista es informativa — sin toast de error acá */ }
  }, [appointmentId]);

  React.useEffect(() => { void loadPrescriptions(); }, [loadPrescriptions]);

  async function openWidget(widget: WidgetKind): Promise<void> {
    setActive(widget);
    setStatus('loading');
    setUrl(null);
    setErrorDetail(null);
    try {
      const res = await fetch(`/api/admin/scriptsure/widget/${appointmentId}?widget=${widget}`);
      if (res.status === 409) { setStatus('not_onboarded'); return; }
      if (res.status === 422) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus(body?.error === 'PATIENT_MISSING_DOB' ? 'missing_dob' : 'missing_address');
        return;
      }
      if (!res.ok) { setStatus('error'); return; }
      const data = (await res.json()) as { url: string };
      setUrl(data.url);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  /**
   * Repetir una receta del historial: ScriptSure abre con el medicamento ya
   * cargado y el doctor decide si la envía. Nosotros nunca enviamos por él.
   */
  async function refill(rx: SentRx): Promise<void> {
    setRefillingId(rx.id);
    setShowSent(false);
    setActive('drug-list'); // reusa el modal grande del widget
    setStatus('loading');
    setUrl(null);
    setErrorDetail(null);
    // El POST y el mapeo de respuestas viven en el helper compartido — misma
    // traducción de errores acá y en el tab de recetas del detalle de caso.
    const result = await launchRefill(rx.id);
    setStatus(result.status);
    setUrl(result.url);
    setErrorDetail(result.errorDetail);
    setRefillingId(null);
  }

  function closeWidget(): void {
    const wasDrugList = active === 'drug-list';
    setActive(null);
    setStatus('loading');
    setUrl(null);
    setErrorDetail(null);

    // El doctor pudo enviar una receta dentro del widget. Le preguntamos a
    // ScriptSure qué recetas tiene el paciente y las guardamos — pull disparado
    // por esta acción del usuario, nunca en bucle (regla de uso de DAW).
    void (async () => {
      if (wasDrugList) {
        setSyncing(true);
        try {
          await fetch(`/api/admin/scriptsure/sync/${appointmentId}`, { method: 'POST' });
        } catch { /* la lista queda como estaba; el webhook es la otra vía */ }
        setSyncing(false);
      }
      await loadPrescriptions();
      // refresca el server component del historial de medicamentos
      startTransition(() => { router.refresh(); });
    })();
  }

  return (
    <div className="rounded-lg border border-border bg-bg-1">
      <div className="flex items-start gap-3 p-5">
        <div className="w-9 h-9 rounded-lg bg-violet/10 border border-violet/25 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4 text-violet" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-text-1 font-semibold text-sm">{t('rxStatusTitle')}</span>
            <TagPill label={t('rxConnected')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
          </div>
          <p className="text-[12.5px] text-text-2 mt-1 leading-relaxed">{t('rxStatusDesc')}</p>
        </div>
      </div>

      {/* Prescribir (izquierda) · Recetas enviadas (derecha).
          La farmacia se elige DENTRO del widget (SET PHARMACY). */}
      <div className={`px-5 pb-5 grid gap-2.5 ${readOnly ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-[1.6fr_1fr]'}`}>
        {!readOnly && (
        <button
          type="button"
          onClick={() => openWidget('drug-list')}
          className="group relative flex items-center gap-4 text-left rounded-xl px-5 py-4 overflow-hidden transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg,#7C3AED 0%,#8B5CF6 55%,#A78BFA 100%)',
            boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
          }}
        >
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.06] transition-colors" />
          <div className="relative w-11 h-11 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center shrink-0 backdrop-blur-sm">
            <Pill className="w-5 h-5 text-white" />
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="text-[15px] font-bold text-white tracking-tight">{t('rxNewPrescription')}</div>
            <div className="text-[11.5px] text-white/75 mt-0.5">{t('rxNewPrescriptionHint')}</div>
          </div>
          <ArrowRight className="relative w-5 h-5 text-white/80 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
        )}

        <button
          type="button"
          onClick={() => setShowSent(true)}
          className="group flex items-center gap-3 text-left rounded-xl border border-border bg-bg-2/40 px-4 py-4 hover:bg-bg-2 hover:border-violet/40 transition-colors"
        >
          <div className="w-11 h-11 rounded-lg bg-violet/10 border border-violet/25 flex items-center justify-center shrink-0">
            {syncing
              ? <Loader2 className="w-4.5 h-4.5 text-violet animate-spin" />
              : <Send className="w-4.5 h-4.5 text-violet" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[13.5px] font-semibold text-text-1">{t('rxSentTitle')}</span>
              {sent.length > 0 && (
                <span className="text-[10px] font-bold text-violet bg-violet/15 border border-violet/30 rounded-full px-1.5 py-px">
                  {sent.length}
                </span>
              )}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              {syncing ? t('rxSyncing') : t('rxSentHint')}
            </div>
          </div>
        </button>
      </div>

      {/* Modal — recetas enviadas en esta consulta */}
      {showSent && (
        <Dialog open onOpenChange={(v) => { if (!v) setShowSent(false); }}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
            <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
              <DialogTitle className="text-[14px] flex items-center gap-2 flex-wrap">
                <Send className="w-4 h-4 text-violet shrink-0" />
                <span>{t('rxSentTitle')}</span>
                {sent.length > 0 && <span className="text-text-muted font-normal">· {sent.length}</span>}
              </DialogTitle>
            </DialogHeader>

            <div className="overflow-y-auto p-5 space-y-5">
              {sent.length === 0 ? (
                <div className="py-8 text-center">
                  <Send className="w-8 h-8 text-text-muted/40 mx-auto mb-3" />
                  <p className="text-[13px] text-text-2">{t('rxSentEmptyTitle')}</p>
                  <p className="text-[11.5px] text-text-muted mt-1">{t('rxSentEmptyHint')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sent.map((rx) => (
                    <SentRxRow
                      key={rx.id}
                      rx={rx}
                      readOnly={readOnly}
                      refilling={refillingId === rx.id}
                      onRefill={() => void refill(rx)}
                    />
                  ))}
                </div>
              )}

              {/* Recetas de OTRAS citas. Sin esto, el paciente que vuelve porque
                  la farmacia no tenía las pastillas obliga al doctor a irse al
                  detalle del caso para repetir. */}
              {previous.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">
                    {t('rxPreviousTitle')}
                  </div>
                  <div className="space-y-2">
                    {previous.map((rx) => (
                      <SentRxRow
                        key={rx.id}
                        rx={rx}
                        readOnly={readOnly}
                        refilling={refillingId === rx.id}
                        onRefill={() => void refill(rx)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal del widget — compartido con el tab de recetas del detalle de caso */}
      <ScriptSureWidgetDialog
        open={!!active}
        kind={active ?? 'drug-list'}
        status={status}
        url={url}
        errorDetail={errorDetail}
        onClose={closeWidget}
      />
    </div>
  );
}

/** Una receta en el modal de enviadas — misma fila para las de esta consulta y
 *  las de citas anteriores (esas además muestran de qué visita salieron). */
function SentRxRow({ rx, readOnly, refilling, onRefill }: {
  rx: SentRx; readOnly: boolean; refilling: boolean; onRefill: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  return (
    <div className="rounded-md bg-bg-2/40 p-3 flex items-start gap-3 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-text-1">{rx.drugName}</span>
          {rx.deaSchedule && (
            <TagPill label={`DEA ${rx.deaSchedule}`} colorClass="bg-amber/15 text-amber border-amber/30" />
          )}
          <TagPill label={t(`rxStatus_${STATUS_KEY[rx.status]}`)} colorClass={STATUS_CLASS[rx.status]} />
        </div>
        {/* Con error la farmacia NUNCA la recibió — decirlo, no dejar que el
            doctor lo deduzca de un color */}
        {rx.status === 'ERROR' && (
          <p className="text-[11px] text-rose mt-1 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            {t('rxErrorNotice')}
          </p>
        )}
        <div className="text-[11.5px] text-text-2 mt-1">
          {[rx.dose !== '—' ? rx.dose : null, rx.frequency !== '—' ? rx.frequency : null]
            .filter(Boolean).join(' · ') || null}
        </div>
        <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-3 flex-wrap">
          {rx.quantityTotal > 0 && <span>{t('rxQty')}: {rx.quantityTotal}</span>}
          <span>{t('rxRefills')}: {rx.refills}</span>
          {rx.pharmacyName && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {rx.pharmacyName}
            </span>
          )}
          {/* De qué consulta salió — solo en las de otras citas */}
          {rx.visitDate && (
            <span>
              {t('rxFromVisit', {
                date: new Date(rx.visitDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
              })}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="text-[10.5px] text-text-muted">
          {new Date(rx.dawSentAt ?? rx.createdAt).toLocaleString(undefined, {
            day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
          })}
        </span>
        {/* Repetir: sirve para cualquier receta del historial, no solo las que
            fallaron. Repetir ES prescribir, así que en modo lectura no aparece. */}
        {rx.canRefill && !readOnly && (
          <button
            type="button"
            onClick={onRefill}
            disabled={refilling}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-violet hover:underline disabled:opacity-60"
          >
            {refilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            {t('rxRefill')}
          </button>
        )}
      </div>
    </div>
  );
}
