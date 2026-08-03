'use client';

/**
 * RxIntegrationStatus — tab Prescripción (D4 · ScriptSure / DAW Systems).
 *
 * La conexión real (login + Set Practice/Prescriber + Create Patient) ya
 * funciona contra staging. Pero solo el prescriptor que ya tiene
 * `Provider.scriptsureUserId` cargado puede abrir los widgets reales — los
 * demás doctores todavía no fueron invitados/aprobados como prescriptores en
 * ScriptSure, así que ven un aviso claro en vez de un error feo.
 *
 * Los widgets abren en un MODAL casi fullscreen (pedido de Erick 2026-08-02):
 * el preview de prescripción de ScriptSure necesita más espacio del que da la
 * card inline del tab.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { Lock, ShieldCheck, ExternalLink, Loader2, AlertTriangle, Pill, ArrowRight } from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';

type WidgetKind = 'drug-list' | 'pharmacy';
type Status = 'loading' | 'ready' | 'not_onboarded' | 'missing_address' | 'missing_dob' | 'error';

export function RxIntegrationStatus({ appointmentId }: { appointmentId: string }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const [active, setActive] = React.useState<WidgetKind | null>(null);
  const [status, setStatus] = React.useState<Status>('loading');
  const [url, setUrl] = React.useState<string | null>(null);

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

  function close(): void {
    setActive(null);
    setStatus('loading');
    setUrl(null);
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

      <div className="px-5 pb-5 pt-1">
        {/* CTA principal — la farmacia se elige DENTRO del widget (SET PHARMACY),
            por eso ya no hay botón aparte (decisión Erick 2026-08-02) */}
        <button
          type="button"
          onClick={() => openWidget('drug-list')}
          className="group relative w-full flex items-center gap-4 text-left rounded-xl px-5 py-4 overflow-hidden transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg,#7C3AED 0%,#8B5CF6 55%,#A78BFA 100%)',
            boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
          }}
        >
          {/* brillo sutil al pasar el mouse */}
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
      </div>

      {active && (
        <Dialog open onOpenChange={(v) => { if (!v) close(); }}>
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
