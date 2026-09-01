'use client';

/**
 * F4 — Vista previa del impreso de confirmación, en modal.
 *
 * Muestra `/print/appointment/[id]` dentro de un `iframe` en vez de duplicar el
 * documento en un componente aparte. Es a propósito: el impreso es un papel con
 * valor legal (lleva el hash de la firma y la cláusula ESIGN), y tener dos
 * versiones del mismo documento es la forma segura de que un día digan cosas
 * distintas. Una sola fuente, dos superficies — el modal y la pestaña.
 */

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@precision/ui';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appointmentId: string;
  patientName: string;
}

export function AppointmentPrintDialog({ open, onOpenChange, appointmentId, patientName }: Props) {
  const t = useTranslations('phoenix.calendar');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const url = `/print/appointment/${appointmentId}`;
  /**
   * `embed=1` apaga la barra de imprimir DENTRO del documento: acá esa acción ya
   * está en la cabecera del modal, y dos botones que hacen lo mismo a 40px de
   * distancia no ayudan. En la pestaña completa la barra sigue.
   */
  const urlEmbed = `${url}?embed=1`;

  /**
   * Imprime SOLO el documento.
   *
   * `contentWindow.print()` corre en el contexto del iframe, así que el
   * navegador arma la hoja con el documento y nada del modal ni del calendario
   * detrás. Es mismo origen, así que se puede.
   *
   * **Este es también el "descargar PDF"**: en el diálogo del navegador, el
   * destino "Guardar como PDF" hace exactamente eso. No hay forma de generar un
   * PDF desde el navegador sin sumar una librería — y una hecha con html2canvas
   * produce una imagen, no texto seleccionable, que para un documento legal es
   * peor que el diálogo nativo.
   */
  const imprimir = () => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden gap-0">
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <Printer className="w-4 h-4 text-cyan" /> {t('printTitle')}
            </DialogTitle>
            <p className="text-text-muted text-xs mt-1.5">{patientName}</p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {/* Acción primaria: es lo que el mostrador viene a hacer. En el
                diálogo del navegador, "Guardar como PDF" es el mismo botón. */}
            <button
              type="button"
              onClick={imprimir}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-cyan/15 border border-cyan/40 text-cyan hover:bg-cyan/20 text-xs font-semibold transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> {t('printNow')}
            </button>
            {/* Salida al documento completo: para mandarlo por correo o
                imprimirlo sin el modal encima. */}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title={t('printOpenTab')}
              aria-label={t('printOpenTab')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-text-2 hover:bg-white/5 text-xs font-medium transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Alto fijo en vh: el documento es una hoja larga y necesita scroll propio
            dentro del modal, no estirar el modal hasta salirse de la pantalla. */}
        <iframe
          ref={iframeRef}
          src={urlEmbed}
          title={t('printTitle')}
          className="w-full border-0 bg-white"
          style={{ height: '72vh' }}
        />
      </DialogContent>
    </Dialog>
  );
}
