'use client';

/**
 * LabOrderPrintDialog — visor de la hoja de la orden de laboratorio.
 *
 * La orden se imprime y el paciente la lleva al laboratorio (no hay fax ni API
 * con LabCorp), y quien imprime es la CLÍNICA, después de cobrar. Por eso el
 * visor vive donde el asistente termina la visita (Resumen) y también en el
 * detalle de caso, para reimprimir días después.
 *
 * Se abre en modal en vez de otra pestaña: el asistente está con el paciente
 * enfrente y no debe perder la pantalla donde está trabajando. El botón
 * "Imprimir" del navegador vive dentro de la hoja.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { Printer } from 'lucide-react';

export function LabOrderPrintDialog({ groupId, onClose }: {
  /** groupId de la orden — null cierra el visor */
  groupId: string | null;
  onClose: () => void;
}): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');

  if (!groupId) return null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl w-[96vw] p-0 overflow-hidden flex flex-col h-[92vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <Printer className="w-4 h-4 text-violet" /> {t('labPrintOrder')}
          </DialogTitle>
        </DialogHeader>
        <iframe
          src={`/doctor-print/lab-order/${groupId}`}
          title={t('labPrintOrder')}
          className="w-full flex-1 border-0 bg-white"
        />
      </DialogContent>
    </Dialog>
  );
}
