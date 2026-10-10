'use client';

/**
 * Consentimientos del paciente, POR CASO.
 *
 * Solo lectura: dice qué firmó y qué falta en cada caso, para revisarlo sin tener
 * una cita abierta. Los consentimientos son del caso (una cita de seguimiento
 * hereda los ya firmados), por eso se muestran por caso y no sumados. Cómo se
 * firman no cambia: sigue siendo desde el formulario del caso.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ShieldAlert, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@precision/ui';
import { CONSENTIMIENTOS, consentimientosFaltantes } from '@/lib/estado-consentimientos';
import type { PatientRow } from './patients-client';

interface CasoConsent {
  id: string;
  caseCode: string | null;
  status: string;
  consentsData: unknown;
}

export function ConsentsDialog({ patient, onClose }: { patient: PatientRow; onClose: () => void }) {
  const t  = useTranslations('phoenix.patients');
  const tc = useTranslations('phoenix.calendar');
  const [casos, setCasos] = useState<CasoConsent[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/patients/${patient.id}/cases`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { cases: CasoConsent[] }) => { if (vivo) setCasos(d.cases); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [patient.id]);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-[14px]">{t('consentsTitle')}</DialogTitle>
          <DialogDescription className="text-[11.5px]">{t('consentsSubtitle')}</DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {!casos && !error && (
            <div className="flex items-center gap-2 text-[12px] text-text-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('consentsLoading')}
            </div>
          )}
          {error && <p className="text-[12px] text-rose">{t('consentsError')}</p>}
          {casos && casos.length === 0 && <p className="text-[12px] text-text-muted">{t('consentsNoCases')}</p>}

          {casos?.map((c) => {
            const faltan = consentimientosFaltantes(c.consentsData);
            return (
              <div key={c.id} className="rounded-md bg-bg-2/40 p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <span className="text-[13px] font-semibold text-text-1">{c.caseCode ?? '—'}</span>
                  <span className={`text-[10px] font-semibold ${faltan.length ? 'text-rose' : 'text-emerald'}`}>
                    {faltan.length
                      ? tc('consentsMissingBadge', { n: faltan.length, total: CONSENTIMIENTOS.length })
                      : t('consentsComplete')}
                  </span>
                </div>
                <ul className="space-y-1">
                  {CONSENTIMIENTOS.map((k) => {
                    const falta = faltan.includes(k);
                    return (
                      <li key={k} className="flex items-center gap-2 text-[12px]">
                        {falta
                          ? <ShieldAlert className="w-3.5 h-3.5 text-rose shrink-0" />
                          : <Check className="w-3.5 h-3.5 text-emerald shrink-0" />}
                        <span className={falta ? 'text-text-1' : 'text-text-2'}>
                          {tc(`consentName_${k}` as 'consentName_hipaa')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
