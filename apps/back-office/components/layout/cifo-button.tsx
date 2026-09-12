'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * El botón de CIFO en la barra — trae de vuelta el saludo del día.
 *
 * El saludo se muestra una vez por día y se cierra solo; Erick pidió poder
 * abrirlo cuando lo necesite, y acá: entre Mensajes y el ícono del celular.
 *
 * ── Cómo le habla al saludo, y por qué así ──────────────────────────────────
 *
 * El botón vive en el Topbar (dentro del layout) y el saludo vive en la página
 * del dashboard. No comparten árbol de React, así que no hay props ni contexto
 * que los una sin subir el estado hasta el layout — y el layout no tiene por
 * qué saber que existe un saludo.
 *
 * Un `CustomEvent` en `window` resuelve eso con dos líneas y sin acoplar nada:
 * el botón grita, y el saludo escucha SI está montado. Alternativas descartadas:
 *
 *  · un `?saludo=1` en la URL — ensucia el enlace que la gente copia y pega, y
 *    deja el saludo reabriéndose en cada refresh mientras el parámetro esté;
 *  · un store global — infraestructura nueva para un botón.
 *
 * Desde OTRA pantalla el evento no tiene quién lo escuche, así que primero
 * navegamos y dejamos una marca en `sessionStorage` que el saludo levanta al
 * montarse. `session` y no `local` a propósito: si el navegador se cierra con la
 * marca puesta, no queremos que el saludo salte solo en la próxima sesión.
 */
/**
 * Se IMPORTAN y se reexportan: un `export … from` suelto publica los nombres
 * pero no los trae al ámbito de este archivo, y acá abajo se usan los dos.
 *
 * La reexportación se queda para no romper a quien los importaba desde este
 * archivo, que era su casa hasta que el saludo se mudó al paquete.
 */
import { EVENTO_ABRIR, MARCA_ABRIR } from '@precision-medical/agente/saludo';
export { EVENTO_ABRIR, MARCA_ABRIR };


export function CifoButton({ destino }: {
  /**
   * Dónde vive el saludo en ESTE portal: `/dashboard` para recepción,
   * `/doctor` para el provider. Va por prop y no se deduce de la ruta actual
   * porque desde `/doctor/notes` la ruta no dice a cuál de los dos volver.
   */
  destino: string;
}): React.ReactElement {
  const t = useTranslations('phoenix.dashboard');
  const router = useRouter();
  const pathname = usePathname();

  const abrir = () => {
    if (pathname === destino) {
      window.dispatchEvent(new CustomEvent(EVENTO_ABRIR));
      return;
    }
    try { window.sessionStorage.setItem(MARCA_ABRIR, '1'); } catch { /* da igual */ }
    router.push(destino);
  };

  return (
    <button
      type="button"
      onClick={abrir}
      title={t('saludoAbrir')}
      aria-label={t('saludoAbrir')}
      /* 36px como el resto de la barra. El GIF va dentro de un círculo con el
         fondo de la barra: recortado así, CIFO se lee como un avatar y no como
         una calcomanía pegada entre dos íconos de línea. */
      className="relative inline-flex items-center justify-center h-9 w-9 rounded-md bg-bg-2 border border-border hover:border-brand/40 hover:bg-bg-2/60 transition-colors"
    >
      {/*
        CIFO ENTERO y chiquito, no recortado.

        La primera versión lo metía en un círculo con `object-cover` y
        `scale-[1.7]` para "encuadrar la cara": en pantalla eso no se leyó como
        una cara sino como una mancha blanca y azul (Erick, 2026-09-10). Con el
        cuerpo completo se reconoce la silueta del robot aunque sea chico, que
        es lo que hace que el botón se entienda de un vistazo.

        Sin recorte y sin fondo propio: el dibujo es transparente y se apoya
        directo sobre el botón, igual que los íconos de línea de al lado.
      */}
      <img
        src="/cifo-saluda.gif"
        alt=""
        aria-hidden="true"
        className="h-8 w-8 object-contain select-none"
      />
    </button>
  );
}
