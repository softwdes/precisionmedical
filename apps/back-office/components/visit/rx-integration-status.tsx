'use client';

/**
 * RxIntegrationStatus — vista previa de la prescripción electrónica
 * (D4 · ScriptSure / DAW Systems) mientras se espera el apiKey y secret.
 *
 * NO está conectada a nada real: "Nueva prescripción" solo abre/cierra esta
 * vista ilustrativa con datos de ejemplo, para que se vea el diseño ya
 * terminado — el catálogo, las interacciones y la firma EPCS reales los va a
 * entregar el widget en vivo de ScriptSure apenas lleguen las credenciales.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Lock, Pill, ShieldCheck, ExternalLink, Search, X, Plus } from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';

export function RxIntegrationStatus(): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-lg border border-dashed border-violet/30 bg-violet/[0.04]">
      {/* Estado de la integración */}
      <div className="flex items-start gap-3 p-5 pb-4">
        <div className="w-9 h-9 rounded-lg bg-violet/10 border border-violet/25 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-violet" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-text-1 font-semibold text-sm">{t('rxStatusTitle')}</div>
          <p className="text-[12.5px] text-text-2 mt-1 leading-relaxed">{t('rxStatusDesc')}</p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber bg-amber/10 border border-amber/25 rounded-full px-2.5 py-1">
              <Lock className="w-3 h-3" /> {t('rxStatusBlocked')}
            </span>
            <span className="text-[11px] text-text-muted">{t('rxStatusMeta')}</span>
          </div>
        </div>
      </div>

      {/* Ejemplo: lista de recetas de la visita + botón real que abre la vista previa */}
      <div className="px-5 pb-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] text-text-muted">{t('rxPreviewListLabel')}</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold bg-violet text-white rounded-md px-3.5 py-2 hover:bg-violet/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t('rxNewPrescription')}
          </button>
        </div>

        <div className="rounded-md border border-border bg-bg-1 px-3.5 py-3 flex items-start gap-3">
          <div className="w-7 h-7 rounded-md bg-bg-2 flex items-center justify-center shrink-0">
            <Pill className="w-4 h-4 text-emerald" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-text-1">Cyclobenzaprine 10mg Tab</span>
              <TagPill label={t('rxSampleSent')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
            </div>
            <div className="text-[12px] text-text-2 mt-0.5">1 tableta por vía oral cada 8h — 10 días</div>
            <div className="text-[11px] text-text-muted mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-cyan">NDC 00093-0157</span>
              <span>CVS Pharmacy — Provo</span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-bg-1 px-3.5 py-3 flex items-start gap-3">
          <div className="w-7 h-7 rounded-md bg-bg-2 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-amber" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-text-1">Hydrocodone/APAP 5/325mg Tab</span>
              <TagPill label={t('rxSampleSchedule')} colorClass="bg-rose/15 text-rose border-rose/30" />
              <TagPill label={t('rxSampleEpcs')} colorClass="bg-amber/15 text-amber border-amber/30" />
            </div>
            <div className="text-[12px] text-text-2 mt-0.5">1 tableta por vía oral cada 6h PRN dolor — 5 días</div>
            <div className="text-[11px] text-text-muted mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-cyan">NDC 00406-0512</span>
              <span>{t('rxSampleEpcsNote')}</span>
            </div>
          </div>
        </div>

        <div className="text-[10.5px] text-text-muted italic">{t('rxPreviewSampleHint')}</div>
      </div>

      {/* Vista previa del widget — se abre con "Nueva prescripción" */}
      {open && (
        <div className="mx-5 mb-5 rounded-md border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-bg-1 border-b border-border flex-wrap">
            <ExternalLink className="w-3.5 h-3.5 text-violet shrink-0" />
            <span className="text-[12px] font-semibold text-text-2">
              {t('rxWidgetHeaderPre')} <b className="text-text-1">ScriptSure</b>
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10.5px] text-emerald">
              <ShieldCheck className="w-3 h-3" /> {t('rxWidgetSecure')}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-text-muted hover:text-text-1 p-0.5"
              aria-label={t('rxWidgetClose')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3.5 bg-bg-2/40 space-y-2.5">
            <div className="flex items-center gap-2 bg-bg-0 border border-border rounded-md px-3 py-2 text-[12.5px] text-text-muted">
              <Search className="w-3.5 h-3.5 shrink-0" /> hydro
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <div className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] bg-bg-0 border-b border-border">
                <span className="font-mono text-[11px] text-cyan w-[76px] shrink-0">00185-0447</span>
                <span className="text-text-2">Hydroxyzine 25mg Cap</span>
              </div>
              <div className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] bg-violet/[0.08]">
                <span className="font-mono text-[11px] text-cyan w-[76px] shrink-0">00406-0512</span>
                <span className="text-text-1 font-semibold flex-1 min-w-0">Hydrocodone/APAP 5/325mg Tab</span>
                <TagPill label={t('rxSampleSchedule')} colorClass="bg-rose/15 text-rose border-rose/30" />
              </div>
              <div className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] bg-bg-0 border-t border-border">
                <span className="font-mono text-[11px] text-cyan w-[76px] shrink-0">00591-2225</span>
                <span className="text-text-2">Hydrochlorothiazide 25mg Tab</span>
              </div>
            </div>

            <div className="rounded-md border border-border bg-bg-0 p-3.5">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-text-1">
                <Lock className="w-3.5 h-3.5 text-amber shrink-0" /> Hydrocodone/APAP 5/325mg Tab
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                <div className="rounded-sm bg-bg-1 border border-border px-2 py-1.5">
                  <div className="text-[9.5px] uppercase tracking-wide text-text-muted">{t('rxFieldDose')}</div>
                  <div className="text-[12.5px] font-semibold text-text-2 mt-0.5">1 tableta</div>
                </div>
                <div className="rounded-sm bg-bg-1 border border-border px-2 py-1.5">
                  <div className="text-[9.5px] uppercase tracking-wide text-text-muted">{t('rxFieldFreq')}</div>
                  <div className="text-[12.5px] font-semibold text-text-2 mt-0.5">c/6h PRN</div>
                </div>
                <div className="rounded-sm bg-bg-1 border border-border px-2 py-1.5">
                  <div className="text-[9.5px] uppercase tracking-wide text-text-muted">{t('rxFieldDuration')}</div>
                  <div className="text-[12.5px] font-semibold text-text-2 mt-0.5">5 días</div>
                </div>
                <div className="rounded-sm bg-bg-1 border border-border px-2 py-1.5">
                  <div className="text-[9.5px] uppercase tracking-wide text-text-muted">{t('rxFieldRefills')}</div>
                  <div className="text-[12.5px] font-semibold text-text-2 mt-0.5">0 (Sched. II)</div>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-2 text-[11.5px] text-rose bg-rose/10 border border-rose/25 rounded-sm px-3 py-2">
                <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {t('rxEpcsNote')}
              </div>
            </div>
          </div>

          <div className="px-3.5 py-2 text-[11px] text-text-muted bg-bg-1 border-t border-border">
            {t('rxWidgetFootNote')}
          </div>
        </div>
      )}
    </div>
  );
}
