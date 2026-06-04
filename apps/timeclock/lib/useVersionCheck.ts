'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Pollea /api/version cada 5 minutos. Devuelve isOutdated=true cuando
 * la version actual del server difiere de la que vimos al montar — eso
 * significa que hubo un deploy mientras el usuario estaba con la app
 * abierta y debe recargar para agarrar el bundle nuevo.
 *
 * Resuelve el caso real reportado: usuarios iOS PWA quedan con bundle
 * cacheado por el Service Worker y no se enteran de los fixes nuevos
 * hasta que matan la app manualmente.
 *
 * Usamos useRef para la version inicial — sin esto el useEffect se
 * re-monta cada vez que la guardamos en state y reinicia el polling.
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

export function useVersionCheck(): { isOutdated: boolean } {
  const [isOutdated, setIsOutdated] = useState(false);
  const initialVersionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { version: string };
        if (cancelled) return;

        if (initialVersionRef.current === null) {
          // Primera lectura — guardamos esto como nuestra "version actual"
          initialVersionRef.current = data.version;
        } else if (data.version !== initialVersionRef.current) {
          // El SHA cambio → hubo deploy. Mostramos el banner.
          setIsOutdated(true);
        }
      } catch {
        // Offline o blip de red — sin problema, reintentamos en el proximo tick
      }
    }

    void check();
    const timer = setInterval(() => void check(), POLL_INTERVAL_MS);

    // Re-checkear cuando la pestaña vuelve a foreground — captura casos
    // donde el celular estuvo dormido varias horas y el setInterval se
    // pauso (iOS Safari hace esto agresivamente con PWAs en background).
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { isOutdated };
}
