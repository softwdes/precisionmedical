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
 *
 * Hoy es un envoltorio de [PrintSheetDialog]: los tres visores de hoja eran el
 * mismo componente repetido. Conserva su nombre y sus props para que ninguna
 * pantalla tuviera que cambiar.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { PrintSheetDialog } from './print-sheet-dialog';

export function VisitNotePrintDialog({ appointmentId, onClose }: {
  /** Cita cuya nota se muestra — null cierra el visor */
  appointmentId: string | null;
  onClose: () => void;
}): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');
  return (
    <PrintSheetDialog
      src={appointmentId ? `/doctor-print/visit-note/${appointmentId}` : null}
      title={t('sumPrintNote')}
      onClose={onClose}
    />
  );
}
