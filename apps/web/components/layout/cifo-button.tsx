'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { EVENTO_ABRIR, MARCA_ABRIR } from '@precision-medical/agente/saludo';

/**
 * El muñequito de CIFO en la barra del Admin — trae de vuelta el saludo.
 *
 * El saludo se muestra una vez por día y se cierra solo; Erick pidió poder
 * llamarlo cuando lo necesite (2026-09-12). Es el mismo botón que ya existe en
 * la clínica y en el portal médico, y usa las mismas dos constantes del paquete
 * compartido: quien las escucha es el saludo, así que ahí viven.
 *
 * ── CIFO ENTERO y chiquito, no recortado ────────────────────────────────────
 *
 * En el back-office la primera versión lo metía en un círculo con zoom para
 * "encuadrar la cara", y en 28px eso no se leyó como una cara sino como una
 * mancha. Con el cuerpo completo se reconoce la silueta aunque sea diminuto.
 */
export function CifoButton(): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();

  const abrir = () => {
    // Si ya estamos en el panel, el saludo está montado y escucha el evento.
    if (pathname === '/dashboard') {
      window.dispatchEvent(new CustomEvent(EVENTO_ABRIR));
      return;
    }
    // Desde otra pantalla no hay quién lo escuche: se deja una marca que el
    // saludo levanta al montarse, y se navega.
    try { window.sessionStorage.setItem(MARCA_ABRIR, '1'); } catch { /* da igual */ }
    router.push('/dashboard');
  };

  return (
    <button
      type="button"
      onClick={abrir}
      title="Qué dice CIFO"
      aria-label="Qué dice CIFO"
      className="relative inline-flex items-center justify-center h-9 w-9 rounded-md bg-bg-2 border border-border hover:border-brand/40 transition-colors"
    >
      <img
        src="/cifo-saluda.gif"
        alt=""
        aria-hidden="true"
        className="h-8 w-8 object-contain select-none"
      />
    </button>
  );
}
