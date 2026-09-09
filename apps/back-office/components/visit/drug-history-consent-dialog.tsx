'use client';

/**
 * DrugHistoryConsentDialog — el permiso del paciente para bajar su historial de
 * farmacia.
 *
 * El widget `medicationdownload` trae por Surescripts 12 meses de lo que el
 * paciente retiró en CUALQUIER farmacia: lo que le recetaron otros médicos, en
 * otras clínicas. Eso no se consulta sin su permiso, y el server lo corta con
 * 428 hasta que quede registrado.
 *
 * Lo que se muestra es una ATESTACIÓN, no una casilla de trámite: quien abre el
 * diálogo declara que ya se lo preguntó al paciente. Por eso el texto dice qué
 * se va a traer, y por eso queda en la auditoría con nombre y hora — si después
 * alguien pregunta con qué permiso se consultó la red de farmacias, la respuesta
 * tiene que existir.
 *
 * Se muestra DESPUÉS del 428, no antes de pedir: el permiso lo decide el
 * servidor y la pantalla no adivina si hace falta.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import { ShieldCheck, Loader2, AlertTriangle, Check } from 'lucide-react';

interface Props {
  open: boolean;
  appointmentId: string;
  onCancel: () => void;
  /** Consentimiento guardado: quien llama vuelve a intentar abrir el widget. */
  onGranted: () => void;
}

export function DrugHistoryConsentDialog({
  open, appointmentId, onCancel, onGranted,
}: Props): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);

  if (!open) return null;

  async function confirmar(): Promise<void> {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/patients/drug-history-consent/${appointmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granted: true }),
      });
      if (!res.ok) { setError(true); return; }
      onGranted();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !saving) onCancel(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[88vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-violet-text shrink-0" />
            {t('rxConsentTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          <p className="text-[12.5px] text-text-2 leading-relaxed">{t('rxConsentWhat')}</p>

          <div className="rounded-md bg-bg-2/40 px-3 py-2.5 space-y-1.5">
            {['rxConsentScope1', 'rxConsentScope2', 'rxConsentScope3'].map((k) => (
              <div key={k} className="flex items-start gap-2 text-[11.5px] text-text-2">
                <Check className="w-3 h-3 text-emerald shrink-0 mt-[3px]" />
                <span className="leading-relaxed">{t(k)}</span>
              </div>
            ))}
          </div>

          <p className="text-[11.5px] text-text-muted leading-relaxed">{t('rxConsentAttest')}</p>

          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {t('rxConsentError')}
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving} className="h-9 w-full sm:w-auto">
            {t('rxConsentCancel')}
          </Button>
          <Button onClick={() => void confirmar()} disabled={saving} className="h-9 w-full sm:w-auto gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {t('rxConsentConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
