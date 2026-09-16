'use client';

/**
 * La foto de una persona, en grande.
 *
 * Existe porque la carita de una lista mide 24px y con eso no se reconoce a
 * nadie: sirve para distinguir filas, no para confirmar que el que está
 * enfrente es quien dice ser. Un clic la abre al tamaño en que sí se ve
 * (Erick, 2026-09-16).
 *
 * Es un primitivo y no una función local de la lista de pacientes porque lo
 * usan DOS pantallas que no comparten código: `/patients` (back office y portal
 * del provider) y `/attorney/cases` (el portal del bufete).
 *
 * ── Redonda, como el avatar ────────────────────────────────────────────────
 *
 * La foto grande conserva la forma de la chiquita a propósito: es la misma cosa
 * agrandada, y un cuadrado haría dudar de si es otra imagen. Es un `<img>` y no
 * el visor de archivos porque acá no hay nada que descargar ni paginar — es
 * mirar una cara y cerrar.
 *
 * ⚠️ La URL que recibe está FIRMADA y vence a los 15 minutos. Si el diálogo
 * queda abierto más que eso la imagen ya está cargada y se sigue viendo; lo que
 * no hay que hacer es guardar esa URL para después.
 */

import { X } from 'lucide-react';
import { useEffect } from 'react';

export interface FotoGrande {
  url: string;
  /** Para el `alt`, el título y que se sepa de quién es la cara. */
  nombre: string;
}

export function FotoGrandeDialog({
  foto,
  onClose,
  cerrarLabel,
}: {
  foto: FotoGrande | null;
  onClose: () => void;
  /** Rótulo accesible del botón de cerrar — viene traducido de la pantalla. */
  cerrarLabel: string;
}) {
  /**
   * Escape cierra.
   *
   * No es un `Dialog` de Radix —no hace falta foco atrapado ni scroll lock para
   * mirar una foto— pero sí tiene que cerrarse con la tecla que todo el mundo
   * aprieta. El listener se agrega solo cuando hay foto: sin esto quedaría uno
   * vivo en cada fila de la lista.
   */
  useEffect(() => {
    if (!foto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    /**
     * En CAPTURA (`true`) por precaución, no por un bug conocido.
     *
     * Las dos pantallas donde vive esto tienen tablas y paneles con sus propios
     * manejadores de teclado; en captura el evento pasa por `document` antes
     * que por ninguno de ellos, así que nadie puede quedárselo con un
     * `stopPropagation`. Verificado con una tecla real en las dos listas
     * (16-sep): cierra.
     */
    document.addEventListener('keydown', alTeclear, true);
    return () => document.removeEventListener('keydown', alTeclear, true);
  }, [foto, onClose]);

  if (!foto) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={foto.nombre}
    >
      <div className="flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={foto.url}
          alt={foto.nombre}
          /**
           * El alto entra en el `min()`, NO en un `max-h` aparte.
           *
           * Con `max-h` el alto se recortaba y el ancho se quedaba en 320: la
           * "foto redonda" salía ovalada — 320×231 medidos en una ventana baja
           * (16-sep). Metiendo `70vh` dentro del mismo `min()`, el lado chico
           * manda sobre los dos y `aspect-square` garantiza el círculo en
           * cualquier ventana.
           */
          className="w-[min(78vw,70vh,320px)] aspect-square rounded-full object-cover shadow-2xl ring-2 ring-white/10"
        />
        <p className="text-text-1 text-sm font-medium text-center">{foto.nombre}</p>
      </div>

      <button
        type="button"
        onClick={onClose}
        title={cerrarLabel}
        aria-label={cerrarLabel}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white/80 hover:text-white transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
