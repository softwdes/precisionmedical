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
 *
 * Hoy es un envoltorio de [PrintSheetDialog]: los tres visores de hoja eran el
 * mismo componente repetido. Conserva su nombre y sus props para que ninguna
 * pantalla tuviera que cambiar.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { PrintSheetDialog } from './print-sheet-dialog';

export function LabOrderPrintDialog({ groupId, onClose }: {
  /** groupId de la orden — null cierra el visor */
  groupId: string | null;
  onClose: () => void;
}): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');
  return (
    <PrintSheetDialog
      src={groupId ? `/doctor-print/lab-order/${groupId}` : null}
      title={t('labPrintOrder')}
      onClose={onClose}
    />
  );
}
