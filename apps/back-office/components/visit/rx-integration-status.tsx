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
  Lock, ShieldCheck, ExternalLink, Loader2, AlertTriangle, Pill, ArrowRight, Send, MapPin,
} from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';
import { useTransitionProgress } from '@/components/layout/navigation-progress';

type WidgetKind = 'drug-list' | 'pharmacy';
type Status = 'loading' | 'ready' | 'not_onboarded' | 'missing_address' | 'missing_dob' | 'error';

interface SentRx {
  id: string;
  drugName: string;
  deaSchedule: string | null;
  dose: string;
  frequency: string;
  quantityTotal: number;
  refills: number;
  pharmacyName: string | null;
  status: 'DRAFT' | 'SENT' | 'PENDING_DAW' | 'VOIDED';
  dawSentAt: string | null;
  createdAt: string;
}

export function RxIntegrationStatus({ appointmentId }: { appointmentId: string }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  useTransitionProgress(isPending);

  const [active, setActive] = React.useState<WidgetKind | null>(null);
  const [status, setStatus] = React.useState<Status>('loading');
  const [url, setUrl] = React.useState<string | null>(null);
  const [showSent, setShowSent] = React.useState(false);
  const [sent, setSent] = React.useState<SentRx[]>([]);
  const [syncing, setSyncing] = React.useState(false);

  const loadPrescriptions = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/scriptsure/prescriptions/${appointmentId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { prescriptions: SentRx[] };
      setSent(data.prescriptions);
    } catch { /* la lista es informativa — sin toast de error acá */ }
  }, [appointmentId]);

  React.useEffect(() => { void loadPrescriptions(); }, [loadPrescriptions]);

  async function openWidget(widget: WidgetKind): Promise<void> {
    setActive(widget);
    setStatus('loading');
    setUrl(null);
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

  function closeWidget(): void {
    const wasDrugList = active === 'drug-list';
    setActive(null);
    setStatus('loading');
    setUrl(null);

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
      <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-[1.6fr_1fr] gap-2.5">
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

            <div className="overflow-y-auto p-5">
              {sent.length === 0 ? (
                <div className="py-8 text-center">
                  <Send className="w-8 h-8 text-text-muted/40 mx-auto mb-3" />
                  <p className="text-[13px] text-text-2">{t('rxSentEmptyTitle')}</p>
                  <p className="text-[11.5px] text-text-muted mt-1">{t('rxSentEmptyHint')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sent.map((rx) => (
                    <div key={rx.id} className="rounded-md bg-bg-2/40 p-3 flex items-start gap-3 flex-wrap">
                      <div className="flex-1 min-w-[180px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-text-1">{rx.drugName}</span>
                          {rx.deaSchedule && (
                            <TagPill label={`DEA ${rx.deaSchedule}`} colorClass="bg-amber/15 text-amber border-amber/30" />
                          )}
                          <TagPill
                            label={rx.status === 'VOIDED' ? t('rxStatusVoided') : t('rxStatusSent')}
                            colorClass={rx.status === 'VOIDED'
                              ? 'bg-rose/15 text-rose border-rose/30'
                              : 'bg-emerald/15 text-emerald border-emerald/30'}
                          />
                        </div>
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
                        </div>
                      </div>
                      <span className="text-[10.5px] text-text-muted shrink-0">
                        {new Date(rx.dawSentAt ?? rx.createdAt).toLocaleString(undefined, {
                          day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal — widget de ScriptSure (casi fullscreen: su preview necesita espacio) */}
      {active && (
        <Dialog open onOpenChange={(v) => { if (!v) closeWidget(); }}>
          <DialogContent className="max-w-6xl w-[96vw] p-0 overflow-hidden flex flex-col h-[92vh]">
            <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
              <DialogTitle className="text-[14px] flex items-center gap-2 flex-wrap">
                <ExternalLink className="w-4 h-4 text-violet shrink-0" />
                <span>
                  {active === 'drug-list' ? t('rxWidgetHeaderPre') : t('rxPharmacyHeaderPre')}{' '}
                  <b className="text-text-1">ScriptSure</b>
                </span>
                {status === 'ready' && (
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] text-emerald font-normal">
                    <ShieldCheck className="w-3 h-3" /> {t('rxWidgetSecure')}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            {status === 'loading' && (
              <div className="flex-1 flex items-center justify-center gap-2 text-[12.5px] text-text-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('rxWidgetLoading')}
              </div>
            )}

            {status === 'not_onboarded' && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="flex items-start gap-3 max-w-md">
                  <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/25 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-amber" />
                  </div>
                  <div className="text-[12.5px] text-text-2 leading-relaxed">
                    <p className="text-text-1 font-medium mb-1">{t('rxNotOnboardedTitle')}</p>
                    <p>{t('rxNotOnboardedDesc')}</p>
                  </div>
                </div>
              </div>
            )}

            {(status === 'missing_address' || status === 'missing_dob') && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="flex items-start gap-3 max-w-md">
                  <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/25 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber" />
                  </div>
                  <div className="text-[12.5px] text-text-2 leading-relaxed">
                    <p className="text-text-1 font-medium mb-1">
                      {t(status === 'missing_dob' ? 'rxMissingDobTitle' : 'rxMissingAddressTitle')}
                    </p>
                    <p>{t(status === 'missing_dob' ? 'rxMissingDobDesc' : 'rxMissingAddressDesc')}</p>
                  </div>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="flex items-start gap-3 max-w-md">
                  <div className="w-8 h-8 rounded-md bg-rose/10 border border-rose/25 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-rose" />
                  </div>
                  <p className="text-[12.5px] text-text-2 leading-relaxed">{t('rxWidgetError')}</p>
                </div>
              </div>
            )}

            {status === 'ready' && url && (
              <iframe
                src={url}
                title={active === 'drug-list' ? 'ScriptSure Drug List' : 'ScriptSure Pharmacy'}
                className="w-full flex-1 border-0"
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
