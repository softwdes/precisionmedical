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
 *
 * ── Firmado: se abre ACÁ, no en otra pestaña ───────────────────────────────
 *
 * Hasta el 28-sep-2026 el clic hacía `window.open`. Erick lo marcó: las demás
 * impresiones del sistema —resultados de laboratorio, documentos del
 * expediente, formulario de admisión— abren el visor en un modal, y esta era
 * la única que sacaba al usuario de la pantalla. Peor todavía acá, porque el
 * botón vive DENTRO del modal del caso: la pestaña nueva tapaba el caso y al
 * volver había que reabrirlo.
 *
 * Se usa el mismo `FileViewerDialog` que el resto, que además ya resuelve el
 * ir a la pestaña y el descargar como salidas del propio modal.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Lock, PenLine, Printer } from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import { FileViewerDialog, useFileViewer } from '@/components/ui-phoenix';

export function LienPrintButton({ caseId, caseCode, locked, onSign, portal = 'attorney' }: {
  caseId: string;
  /** Sólo para el nombre del archivo en el visor y en la descarga. */
  caseCode?: string;
  /** Falta la firma del abogado — el PDF todavía no se puede emitir. */
  locked: boolean;
  /** Abre el diálogo de firma. Ausente si esta cuenta no puede firmar. */
  onSign?: () => void;
  /**
   * Por qué puerta se pide el PDF.
   *
   * No se puede derivar de `locked`: el back office entra SIEMPRE destrabado, y
   * aun así necesita su propia ruta. La del portal legal exige sesión de abogado
   * —le daría 403— y además la firma del ABOGADO, que es una regla del bufete y
   * no de la clínica (Erick, 2026-09-17).
   */
  portal?: 'admin' | 'attorney';
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const tc = useTranslations('phoenix.common');
  const [preview, setPreview] = React.useState(false);
  const viewer = useFileViewer(t('lienOpenError'));

  /*
   * `show` y no `open`: `open` es para los archivos que hay que ir a buscar a
   * Storage —primero se pide la URL firmada y recién ahí se pinta—. Este PDF lo
   * genera nuestra propia ruta y la URL ya se conoce, así que el visor la recibe
   * hecha y no hay ni un fetch de ida y vuelta.
   *
   * El nombre TIENE que terminar en `.pdf`: el visor decide por la extensión si
   * embebe el documento o muestra "no se puede previsualizar".
   *
   * ⚠️ ESTE VISOR SE MONTA DENTRO DEL MODAL DEL CASO, y es el primero que lo
   * hace ahí: el diálogo de "previsualización bloqueada" de abajo nunca se abre
   * en el back office (`locked` entra siempre en `false` para la clínica), así
   * que hasta hoy esa pantalla no tenía ningún Dialog anidado.
   *
   * Un Dialog modal de Radix adentro de otro puede dejar el foco en la X del de
   * AFUERA, y entonces la barra espaciadora la aprieta y cierra las dos
   * ventanas. Es la causa raíz del buscador de cargos (`b001fd75`), y la vista
   * de caso por interceptor quedó como una de las tres candidatas sin confirmar
   * de ese mismo bug.
   *
   * Acá el riesgo es menor —este modal no tiene ningún campo de texto, que es
   * donde el robo de foco se nota— pero si aparece, el síntoma es ese: apretar
   * espacio cierra todo. El arreglo conocido es `modal={false}` en el Dialog de
   * AFUERA (el del caso), no en este.
   */
  function abrir(): void {
    viewer.show({
      fileName: `lien-${caseCode ?? caseId}.pdf`,
      url: `/api/${portal}/cases/${caseId}/lien`,
    });
  }

  return (
    <>
      <FileViewerDialog {...viewer.props} />

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
