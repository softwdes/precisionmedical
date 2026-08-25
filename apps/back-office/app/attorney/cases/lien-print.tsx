'use client';

/**
 * LienPrintButton — "Imprimir acuerdo" en el bloque de firmas del caso.
 *
 * El botón está SIEMPRE visible, incluso sin firmar. Esconderlo hasta que el
 * abogado firmara parecía que la función no existía —o que la pantalla estaba
 * rota—, y el bufete no tenía forma de saber que era la firma lo que faltaba.
 *
 * Sin firma, el clic abre la previsualización BLOQUEADA: se ve que el documento
 * está ahí y el aviso explica que hay que firmar, con el botón de firmar a mano.
 * El obstáculo enseña; el botón ausente solo confunde.
 *
 * El bloqueo de acá es de interfaz. El de verdad está en el endpoint del PDF,
 * que devuelve 409 sin la firma: si alguien pega la URL a mano, no hay papel.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Lock, PenLine, Printer } from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';

export function LienPrintButton({ caseId, locked, onSign }: {
  caseId: string;
  /** Falta la firma del abogado — el PDF todavía no se puede emitir. */
  locked: boolean;
  /** Abre el diálogo de firma. Ausente si esta cuenta no puede firmar. */
  onSign?: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const tc = useTranslations('phoenix.common');
  const [preview, setPreview] = React.useState(false);

  // Firmado: el PDF se abre en una pestaña, que ya trae el visor del navegador
  // con previsualización, impresión y descarga. No hace falta un visor propio.
  function abrir(): void {
    window.open(`/api/attorney/cases/${caseId}/lien`, '_blank', 'noopener');
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => (locked ? setPreview(true) : abrir())}>
        <Printer className="w-3.5 h-3.5 mr-1.5" />
        {t('lienPrint')}
      </Button>

      {preview && (
        <Dialog open onOpenChange={() => setPreview(false)}>
          <DialogContent className="max-w-2xl w-[95vw]">
            <DialogHeader>
              <DialogTitle>{t('lienPrint')}</DialogTitle>
            </DialogHeader>

            <div className="relative rounded-md bg-bg-2/40 overflow-hidden">
              {/* La hoja detrás del aviso. Va borrosa y sin poder seleccionarse:
                  muestra que el documento existe y tiene forma de documento, sin
                  dejar leer un acuerdo que todavía no está firmado. */}
              <div aria-hidden className="blur-[3px] opacity-50 select-none pointer-events-none px-8 py-7">
                <div className="text-center text-text-1 font-semibold text-sm mb-4">Medical Lien Agreement</div>
                <div className="space-y-1.5">
                  {[
                    'w-11/12', 'w-full', 'w-10/12', 'w-full', 'w-9/12',
                    'w-full', 'w-11/12', 'w-8/12',
                  ].map((w, i) => (
                    <div key={i} className={`h-1.5 rounded-full bg-text-muted/30 ${w}`} />
                  ))}
                </div>
              </div>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-bg-1/70">
                <Lock className="w-7 h-7 text-amber mb-2" />
                <div className="text-text-1 font-semibold text-sm">{t('lienLockedTitle')}</div>
                <div className="text-text-2 text-xs mt-1 max-w-sm">{t('lienLockedBody')}</div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setPreview(false)}>
                {tc('cancel')}
              </Button>
              {onSign && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => { setPreview(false); onSign(); }}
                >
                  <PenLine className="w-3.5 h-3.5 mr-1.5" />
                  {t('signNow')}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
