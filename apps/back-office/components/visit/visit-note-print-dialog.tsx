'use client';

/**
 * VisitNotePrintDialog — visor de la hoja imprimible de la nota clínica.
 *
 * Gemelo de `LabOrderPrintDialog`, y existe por el mismo motivo: la hoja se abría
 * en OTRA PESTAÑA desde los cuatro lugares que la imprimen, y eso saca al médico
 * —o al asistente, con el paciente enfrente— de la pantalla donde está
 * trabajando. Volver implica cerrar la pestaña y encontrar de nuevo dónde
 * estaba (Erick, 2026-09-07).
 *
 * El síntoma que lo delató fue la incoherencia, no la pestaña en sí: la orden de
 * laboratorio ya abría en modal desde el Resumen y el caso, pero en pestaña
 * desde el tab de Labs. La misma orden, del mismo paciente, se comportaba de dos
 * maneras según por dónde entraras.
 *
 * El botón "Imprimir" del navegador vive DENTRO de la hoja (ver el layout de
 * `doctor-print/`), así que el modal no necesita uno propio: el `iframe` trae el
 * suyo y el `Ctrl+P` del usuario imprime el documento enfocado.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { Printer } from 'lucide-react';

export function VisitNotePrintDialog({ appointmentId, onClose }: {
  /** Cita cuya nota se muestra — null cierra el visor */
  appointmentId: string | null;
  onClose: () => void;
}): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');

  if (!appointmentId) return null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl w-[96vw] p-0 overflow-hidden flex flex-col h-[92vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <Printer className="w-4 h-4 text-violet-text" /> {t('sumPrintNote')}
          </DialogTitle>
        </DialogHeader>
        <iframe
          src={`/doctor-print/visit-note/${appointmentId}`}
          title={t('sumPrintNote')}
          className="w-full flex-1 border-0 bg-white"
        />
      </DialogContent>
    </Dialog>
  );
}
