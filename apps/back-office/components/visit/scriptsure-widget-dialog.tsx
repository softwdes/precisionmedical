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

export type WidgetKind =
  | 'drug-list'
  | 'pharmacy'
  | 'medcart'
  | 'allergy'
  | 'drug-history'
  | 'medicationdownload'
  | 'approve-queue';

/** Título del iframe — accesible y útil al depurar con varias ventanas abiertas. */
const WIDGET_TITLE: Record<WidgetKind, string> = {
  'drug-list': 'ScriptSure Drug List',
  pharmacy: 'ScriptSure Pharmacy',
  medcart: 'ScriptSure Med Cart',
  allergy: 'ScriptSure Allergies',
  'drug-history': 'ScriptSure Drug History',
  medicationdownload: 'ScriptSure Medication History Download',
  'approve-queue': 'ScriptSure Approval Queue',
};
/**
 * Encabezado del modal, por widget.
 *
 * Antes era un ternario entre "Prescribiendo vía" y "Farmacias vía", así que
 * CUATRO de los siete widgets se anunciaban como farmacias. Con el widget de
 * alergias colgado del lápiz de la barra lateral (2026-10-09) eso dejó de ser un
 * detalle: el médico aprieta Alergias y la ventana que se abre dice Farmacias.
 */
const HEADER_KEY: Record<WidgetKind, string> = {
  'drug-list': 'rxWidgetHeaderPre',
  medcart: 'rxWidgetHeaderPre',
  pharmacy: 'rxPharmacyHeaderPre',
  allergy: 'rxAllergiesHeaderPre',
  'drug-history': 'rxDrugHistoryHeaderPre',
  medicationdownload: 'rxMedDownloadHeaderPre',
  'approve-queue': 'rxApproveQueueHeaderPre',
};

export type WidgetStatus =
  | 'loading' | 'ready' | 'not_onboarded' | 'missing_address' | 'missing_dob' | 'no_refill'
  /**
   * Al paciente no le falta la dirección sino el TELÉFONO, que ScriptSure exige
   * (al menos uno) y se completa en otra parte de la ficha. Va aparte de
   * `missing_address` porque mandar a revisar la dirección cuando falta el
   * teléfono hace perder el mismo rato que hacía perder "no se pudo conectar".
   */
  | 'missing_phone'
  /**
   * Quien mira no tiene cuenta propia en ScriptSure. Es la ÚNICA traba que
   * queda del lado nuestro, y es de hecho: sin cuenta no hay sesión que abrir.
   * Lo que cada uno puede hacer adentro lo decide ScriptSure.
   */
  | 'no_scriptsure_user'
  /**
   * 403: quien mira NO puede prescribir en esta cita — prescribir exige ser el
   * doctor de la cita (o admin), y "ver como doctor" no alcanza: la receta la
   * firma una persona real.
   *
   * Va aparte de `error` porque antes cualquier respuesta no-OK mostraba "no se
   * pudo conectar con ScriptSure", y un tester perdió una tarde creyendo que era
   * la red cuando era un permiso.
   */
  | 'forbidden'
  | 'error';

export interface RefillLaunchResult {
  status: WidgetStatus;
  url: string | null;
  errorDetail: string | null;
  /**
   * Qué campos de la ficha faltan, cuando el corte fue por eso.
   *
   * El servidor los manda y acá se tiraban. Por eso REPETIR una receta llegaba
   * a pantalla como un cartel sin salida, mientras que prescribir de cero sí
   * abría el formulario para completarlos: dos caminos al mismo error, uno con
   * remedio y el otro no. Erick lo pegó el 2026-10-05 probando desde Day
   * Admission: *"eso debería mostrar la opción de poder agregarlo ahí"*.
   */
  missingFields: string[];
  /** El código crudo, para distinguir "falta" de "es demasiado larga". */
  errorCode: string | null;
}

/**
 * POST al refill y mapeo de las respuestas a estados del widget — la misma
 * traducción en la consulta y en el caso. Repetir ES prescribir: el server
 * valida que la sesión sea el doctor de la cita (checkAppointmentAccess).
 */
export async function launchRefill(prescriptionId: string): Promise<RefillLaunchResult> {
  try {
    const res = await fetch(`/api/admin/scriptsure/refill/${prescriptionId}`, { method: 'POST' });
    const sinDatos = { url: null, errorDetail: null, missingFields: [], errorCode: null };
    if (res.status === 403) return { status: 'forbidden', ...sinDatos };
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return {
        status: body?.error === 'NO_SCRIPTSURE_USER' ? 'no_scriptsure_user' : 'not_onboarded',
        ...sinDatos,
        errorCode: body?.error ?? null,
      };
    }
    if (res.status === 422) {
      const body = (await res.json().catch(() => null)) as
        { error?: string; missingFields?: string[] } | null;
      return {
        status: body?.error === 'PATIENT_MISSING_DOB' ? 'missing_dob'
          : body?.error === 'MISSING_DRUG_IDS' ? 'no_refill'
          : body?.error === 'PATIENT_MISSING_PHONE' ? 'missing_phone'
          : 'missing_address',
        url: null,
        errorDetail: null,
        // Lo que el servidor ya sabía y se perdía en el camino.
        missingFields: body?.missingFields ?? [],
        errorCode: body?.error ?? null,
      };
    }
    if (!res.ok) {
      // El detalle crudo de ScriptSure va a pantalla: sin esto hay que ir a
      // buscarlo al audit log cada vez que su formato no coincide.
      const body = (await res.json().catch(() => null)) as { raw?: unknown; message?: string } | null;
      const detail = typeof body?.raw === 'string' ? body.raw : body?.message ?? null;
      return { status: 'error', ...sinDatos, errorDetail: detail ? detail.slice(0, 400) : null };
    }
    const data = (await res.json()) as { url: string };
    return { status: 'ready', ...sinDatos, url: data.url };
  } catch {
    return { status: 'error', url: null, errorDetail: null, missingFields: [], errorCode: null };
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
            <ExternalLink className="w-4 h-4 text-violet-text shrink-0" />
            <span>
              {t(HEADER_KEY[kind])}{' '}
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

        {status === 'forbidden' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex items-start gap-3 max-w-md">
              <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/25 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-amber" />
              </div>
              <div className="text-[12.5px] text-text-2 leading-relaxed">
                <p className="text-text-1 font-medium mb-1">{t('rxForbiddenTitle')}</p>
                {/* El motivo exacto cuando el server lo manda — recetar SIN
                    visita se bloquea por una razón distinta que recetar en la
                    consulta de otro, y decir la genérica manda a buscar el
                    problema donde no está. */}
                <p>{errorDetail ?? t('rxForbiddenDesc')}</p>
              </div>
            </div>
          </div>
        )}

        {status === 'no_scriptsure_user' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex items-start gap-3 max-w-md">
              <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/25 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-amber" />
              </div>
              <div className="text-[12.5px] text-text-2 leading-relaxed">
                <p className="text-text-1 font-medium mb-1">{t('rxNoUserTitle')}</p>
                <p>{t('rxNoUserDesc')}</p>
              </div>
            </div>
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

        {(status === 'missing_address' || status === 'missing_dob' || status === 'missing_phone') && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex items-start gap-3 max-w-md">
              <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/25 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber" />
              </div>
              <div className="text-[12.5px] text-text-2 leading-relaxed">
                <p className="text-text-1 font-medium mb-1">
                  {t(status === 'missing_dob' ? 'rxMissingDobTitle'
                    : status === 'missing_phone' ? 'rxMissingPhoneTitle'
                    : 'rxMissingAddressTitle')}
                </p>
                <p>
                  {t(status === 'missing_dob' ? 'rxMissingDobDesc'
                    : status === 'missing_phone' ? 'rxMissingPhoneDesc'
                    : 'rxMissingAddressDesc')}
                </p>
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
            title={WIDGET_TITLE[kind]}
            className="w-full flex-1 border-0"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
