'use client';

/**
 * ScriptSureWidgetDialog — modal casi fullscreen del widget de ScriptSure, con
 * todos sus estados (cargando · sin onboarding · datos faltantes del paciente ·
 * sin ids para repetir · error con detalle crudo · iframe listo).
 *
 * Compartido entre el tab Prescripción de la consulta (My Day) y el tab de
 * recetas del detalle de caso: la MISMA pantalla en los dos lados, para que un
 * fix en una no deje a la otra atrás.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { Lock, ShieldCheck, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';

export type WidgetKind = 'drug-list' | 'pharmacy';
export type WidgetStatus =
  | 'loading' | 'ready' | 'not_onboarded' | 'missing_address' | 'missing_dob' | 'no_refill' | 'error';

export interface RefillLaunchResult {
  status: WidgetStatus;
  url: string | null;
  errorDetail: string | null;
}

/**
 * POST al refill y mapeo de las respuestas a estados del widget — la misma
 * traducción en la consulta y en el caso. Repetir ES prescribir: el server
 * valida que la sesión sea el doctor de la cita (checkAppointmentAccess).
 */
export async function launchRefill(prescriptionId: string): Promise<RefillLaunchResult> {
  try {
    const res = await fetch(`/api/admin/scriptsure/refill/${prescriptionId}`, { method: 'POST' });
    if (res.status === 409) return { status: 'not_onboarded', url: null, errorDetail: null };
    if (res.status === 422) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return {
        status: body?.error === 'PATIENT_MISSING_DOB' ? 'missing_dob'
          : body?.error === 'MISSING_DRUG_IDS' ? 'no_refill'
          : 'missing_address',
        url: null,
        errorDetail: null,
      };
    }
    if (!res.ok) {
      // El detalle crudo de ScriptSure va a pantalla: sin esto hay que ir a
      // buscarlo al audit log cada vez que su formato no coincide.
      const body = (await res.json().catch(() => null)) as { raw?: unknown; message?: string } | null;
      const detail = typeof body?.raw === 'string' ? body.raw : body?.message ?? null;
      return { status: 'error', url: null, errorDetail: detail ? detail.slice(0, 400) : null };
    }
    const data = (await res.json()) as { url: string };
    return { status: 'ready', url: data.url, errorDetail: null };
  } catch {
    return { status: 'error', url: null, errorDetail: null };
  }
}

export function ScriptSureWidgetDialog({
  open, kind, status, url, errorDetail, onClose,
}: {
  open: boolean;
  kind: WidgetKind;
  status: WidgetStatus;
  url: string | null;
  errorDetail: string | null;
  onClose: () => void;
}): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-6xl w-[96vw] p-0 overflow-hidden flex flex-col h-[92vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2 flex-wrap">
            <ExternalLink className="w-4 h-4 text-violet shrink-0" />
            <span>
              {kind === 'drug-list' ? t('rxWidgetHeaderPre') : t('rxPharmacyHeaderPre')}{' '}
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

        {status === 'no_refill' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex items-start gap-3 max-w-md">
              <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/25 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber" />
              </div>
              <div className="text-[12.5px] text-text-2 leading-relaxed">
                <p className="text-text-1 font-medium mb-1">{t('rxNoRefillTitle')}</p>
                <p>{t('rxNoRefillDesc')}</p>
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
              <div className="min-w-0">
                <p className="text-[12.5px] text-text-2 leading-relaxed">{t('rxWidgetError')}</p>
                {errorDetail && (
                  <pre className="mt-2 text-[10.5px] text-text-muted bg-bg-2/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-40">
                    {errorDetail}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}

        {status === 'ready' && url && (
          <iframe
            src={url}
            title={kind === 'drug-list' ? 'ScriptSure Drug List' : 'ScriptSure Pharmacy'}
            className="w-full flex-1 border-0"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
