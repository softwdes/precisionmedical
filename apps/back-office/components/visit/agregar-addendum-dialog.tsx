'use client';

/**
 * AgregarAddendumDialog — escribir y firmar un addendum sobre una nota cerrada,
 * desde el expediente del caso.
 *
 * Existe porque la nota firmada se busca donde está el paciente. Devin abrió el
 * caso de Aaron Black, fue a la nota y no encontró dónde agregarlo (2026-09-29):
 * la única puerta era la pantalla de supervisión de notas, que ni se llama ni se
 * parece al lugar donde uno va a corregir una visita.
 *
 * ── Por qué esto NO rompe la inmutabilidad ──────────────────────────────────
 *
 * El cuerpo de la nota sigue siendo intocable desde acá. Un addendum no edita
 * nada: es un bloque nuevo al pie, numerado, con su propia firma y su propia
 * hora, y con el nombre de QUIEN LO ESCRIBE — que puede no ser el autor de la
 * nota. Así funciona una enmienda en una historia clínica: no se corrige lo
 * escrito, se agrega diciendo quién agregó y cuándo.
 *
 * ── Quién puede ─────────────────────────────────────────────────────────────
 *
 * Lo decide el SERVIDOR (dueño de la nota o admin, sobre una nota firmada y no
 * reabierta) y la pantalla solo obedece: el listado del caso ya viene con
 * `puedeAgregarAddendum` calculado allá. Acá no se vuelve a razonar la regla —
 * dos lugares decidiendo lo mismo terminan discrepando, y el que pierde es el
 * que ve el botón y recibe un 403.
 *
 * ── Se firma al enviar, no hay borrador ─────────────────────────────────────
 *
 * Por eso el botón dice "Firmar", el aviso está ARRIBA del campo —donde todavía
 * se puede cambiar de idea— y no hay autoguardado: lo que entra acá queda
 * inmutable en el acto.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import { FilePlus2, Loader2, AlertTriangle } from 'lucide-react';
import { RichTextEditor } from '@/components/ui-phoenix/rich-text-editor';

interface Props {
  /** Cita cuya nota recibe el addendum. `null` = cerrado. */
  appointmentId: string | null;
  onClose: () => void;
  /** Firmado: quien llama recarga el documento para que aparezca. */
  onFirmado: () => void;
}

export function AgregarAddendumDialog({
  appointmentId, onClose, onFirmado,
}: Props): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');
  const [texto, setTexto] = React.useState('');
  const [firmando, setFirmando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Cada apertura arranca en blanco: arrastrar el texto del addendum anterior a
  // la nota de otro paciente sería el peor error posible de esta pantalla.
  React.useEffect(() => {
    if (appointmentId) { setTexto(''); setError(null); }
  }, [appointmentId]);

  if (!appointmentId) return null;

  const vacio = texto.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';

  const firmar = async (): Promise<void> => {
    if (vacio) return;
    setFirmando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/visit-notes/${appointmentId}/addenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}) as { error?: string });
        /* Los tres rechazos que el servidor distingue se dicen con su motivo. El
           resto cae en el genérico: inventarle una causa a un error que no
           conocemos manda a buscar en el lugar equivocado. */
        setError(
          d.error === 'FORBIDDEN'        ? t('addFbForbidden')
          : d.error === 'NOTE_REOPENED'  ? t('addFbReopened')
          : d.error === 'NOTE_NOT_SIGNED' ? t('addFbNotSigned')
          : t('addFbError'),
        );
        return;
      }
      onFirmado();
    } catch {
      setError(t('addFbError'));
    } finally {
      setFirmando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="w-4 h-4 text-violet-text" /> {t('addTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-3">
          {/* Arriba del campo a propósito: se lee antes de escribir, que es
              cuando todavía se puede no hacerlo. */}
          <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11.5px] text-amber flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {t('addWarning')}
          </div>

          <RichTextEditor
            value={texto}
            onChange={setTexto}
            placeholder={t('addPlaceholder')}
            minHeight={160}
          />

          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11.5px] text-rose flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={firmando}>
            {t('addCancel')}
          </Button>
          <Button
            className="w-full sm:w-auto gap-1.5"
            onClick={() => void firmar()}
            disabled={firmando || vacio}
          >
            {firmando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}
            {t('addSign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
