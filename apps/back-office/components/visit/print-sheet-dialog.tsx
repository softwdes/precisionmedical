'use client';

/**
 * PrintSheetDialog — el visor de CUALQUIER hoja de `doctor-print/`.
 *
 * ## Por qué existe
 *
 * `VisitNotePrintDialog` y `LabOrderPrintDialog` eran el mismo componente dos
 * veces: cambiaban la URL y el título, y nada más. Al ir a sumar el tercero —la
 * lista de medicación— tocaba elegir entre una tercera copia o un solo lugar.
 *
 * Es exactamente la forma del problema que este código ya pagó varias veces: el
 * mismo arreglo aplicado a uno solo de los caminos (la dirección del paciente,
 * tres botones y un remedio). Con tres copias, la próxima mejora del visor
 * —recordar el zoom, un aviso de carga, lo que sea— nace coja.
 *
 * Los dos de antes siguen existiendo con su nombre y sus props: son envoltorios
 * de dos líneas sobre éste, así que ninguna de las pantallas que los usan tuvo
 * que cambiar.
 *
 * El botón "Imprimir" vive DENTRO de la hoja (ver `doctor-print/`), así que el
 * modal no lleva uno propio: el `iframe` trae el suyo y el `Ctrl+P` del usuario
 * imprime el documento enfocado.
 *
 * Y se abre en modal y no en otra pestaña: quien imprime está con el paciente
 * enfrente, y volver implicaría cerrar la pestaña y buscar de nuevo dónde estaba
 * (Erick, 2026-09-07).
 */

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { Printer } from 'lucide-react';

export function PrintSheetDialog({ src, title, onClose }: {
  /** Ruta de la hoja dentro de `doctor-print/` — null cierra el visor */
  src: string | null;
  /** Ya traducido: el visor no elige la clave, la recibe hecha */
  title: string;
  onClose: () => void;
}): React.ReactElement | null {
  if (!src) return null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl w-[96vw] p-0 overflow-hidden flex flex-col h-[92vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <Printer className="w-4 h-4 text-violet-text" /> {title}
          </DialogTitle>
        </DialogHeader>
        <iframe src={src} title={title} className="w-full flex-1 border-0 bg-white" />
      </DialogContent>
    </Dialog>
  );
}
