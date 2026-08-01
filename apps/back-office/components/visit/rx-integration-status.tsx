'use client';

/**
 * RxIntegrationStatus — tab Prescripción (D4 · ScriptSure / DAW Systems).
 *
 * La conexión real (login + Set Practice/Prescriber + Create Patient) ya
 * funciona contra staging. Pero solo el prescriptor que ya tiene
 * `Provider.scriptsureUserId` cargado puede abrir los widgets reales — los
 * demás doctores todavía no fueron invitados/aprobados como prescriptores en
 * ScriptSure, así que ven un aviso claro en vez de un error feo.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Lock, ShieldCheck, ExternalLink, X, Plus, MapPin, Loader2, AlertTriangle } from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';

export function RxIntegrationStatus({ appointmentId }: { appointmentId: string }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const [active, setActive] = React.useState<'drug-list' | 'pharmacy' | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'not_onboarded' | 'missing_address' | 'missing_dob' | 'error'>('idle');
  const [url, setUrl] = React.useState<string | null>(null);

  async function openWidget(widget: 'drug-list' | 'pharmacy'): Promise<void> {
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
    setStatus('idle');
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

      <div className="px-5 pb-5 pt-1 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => openWidget('drug-list')}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-violet text-white rounded-md px-4 py-2.5 hover:bg-violet/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> {t('rxNewPrescription')}
        </button>
        <button
          type="button"
          onClick={() => openWidget('pharmacy')}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-bg-2/60 border border-border text-text-1 rounded-md px-4 py-2.5 hover:bg-bg-2 transition-colors"
        >
          <MapPin className="w-4 h-4 text-cyan" /> {t('rxOpenPharmacy')}
        </button>
      </div>

      {active && (
        <div className="mx-5 mb-5 rounded-md border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-bg-1 border-b border-border flex-wrap">
            <ExternalLink className="w-3.5 h-3.5 text-violet shrink-0" />
            <span className="text-[12px] font-semibold text-text-2">
              {active === 'drug-list' ? t('rxWidgetHeaderPre') : t('rxPharmacyHeaderPre')} <b className="text-text-1">ScriptSure</b>
            </span>
            {status === 'ready' && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[10.5px] text-emerald">
                <ShieldCheck className="w-3 h-3" /> {t('rxWidgetSecure')}
              </span>
            )}
            <button
              type="button"
              onClick={close}
              className={status === 'ready' ? 'text-text-muted hover:text-text-1 p-0.5' : 'ml-auto text-text-muted hover:text-text-1 p-0.5'}
              aria-label={t('rxWidgetClose')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {status === 'loading' && (
            <div className="p-8 flex items-center justify-center gap-2 text-[12.5px] text-text-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('rxWidgetLoading')}
            </div>
          )}

          {status === 'not_onboarded' && (
            <div className="p-5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/25 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-amber" />
              </div>
              <div className="text-[12.5px] text-text-2 leading-relaxed">
                <p className="text-text-1 font-medium mb-1">{t('rxNotOnboardedTitle')}</p>
                <p>{t('rxNotOnboardedDesc')}</p>
              </div>
            </div>
          )}

          {status === 'missing_address' && (
            <div className="p-5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/25 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber" />
              </div>
              <div className="text-[12.5px] text-text-2 leading-relaxed">
                <p className="text-text-1 font-medium mb-1">{t('rxMissingAddressTitle')}</p>
                <p>{t('rxMissingAddressDesc')}</p>
              </div>
            </div>
          )}

          {status === 'missing_dob' && (
            <div className="p-5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/25 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber" />
              </div>
              <div className="text-[12.5px] text-text-2 leading-relaxed">
                <p className="text-text-1 font-medium mb-1">{t('rxMissingDobTitle')}</p>
                <p>{t('rxMissingDobDesc')}</p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="p-5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-rose/10 border border-rose/25 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose" />
              </div>
              <p className="text-[12.5px] text-text-2 leading-relaxed">{t('rxWidgetError')}</p>
            </div>
          )}

          {status === 'ready' && url && (
            <iframe
              src={url}
              title={active === 'drug-list' ? 'ScriptSure Drug List' : 'ScriptSure Pharmacy'}
              className="w-full border-0"
              style={{ height: 560 }}
            />
          )}
        </div>
      )}
    </div>
  );
}
