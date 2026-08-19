'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Pollea /api/version y avisa cuando el SHA del server difiere del que vimos
 * al montar — o sea, hubo un deploy mientras el usuario tenia la app abierta.
 *
 * Devuelve tambien `bootVersion`: el SHA con el que arranco esta pestaña.
 * Es el `since` que necesita el changelog para saber que cambio, porque el
 * bundle viejo solo conoce su propia version.
 *
 * Una vez que `isOutdated` pasa a true no vuelve atras: si el deploy se
 * revierte, el usuario igual necesita recargar para salir del bundle viejo.
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export interface VersionCheck {
  isOutdated: boolean;
  /** SHA con el que se cargo esta pestaña. `null` hasta el primer fetch. */
  bootVersion: string | null;
  /**
   * Hora del SERVER cuando arranco esta pestaña — el ancla del changelog.
   *
   * El sha no alcanza: con `turbo-ignore` salteando builds, Vercel crea
   * deployments para commits que nunca buildearon esta app, asi que el sha en
   * runtime puede no tener fila en `releases` y el changelog volvia vacio. Este
   * timestamp no depende de eso.
   */
  bootAt: string | null;
}

export function useVersionCheck(): VersionCheck {
  const [isOutdated, setIsOutdated] = useState(false);
  const [bootVersion, setBootVersion] = useState<string | null>(null);
  const [bootAt, setBootAt] = useState<string | null>(null);
  const bootRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      try {
        // Cache-bust en el query string ADEMAS del `no-store`: workbox/serwist
        // a veces ignora Cache-Control. Los SW de estas apps tienen /api/* en
        // NetworkOnly, asi que esto es defensa en profundidad.
        const res = await fetch(`/api/version?_=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { version: string; now?: string };
        if (cancelled) return;

        if (bootRef.current === null) {
          bootRef.current = data.version;
          setBootVersion(data.version);
          // `now` puede faltar si el bundle es viejo o el server no lo manda.
          setBootAt(data.now ?? null);
        } else if (data.version !== bootRef.current) {
          setIsOutdated(true);
        }
      } catch {
        // Offline o blip de red — reintentamos en el proximo tick.
      }
    }

    void check();
    const timer = setInterval(() => void check(), POLL_INTERVAL_MS);

    // Volver a la pestaña dispara chequeo inmediato: es el caso mas comun en
    // PWA, donde la app queda horas en background.
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

  return { isOutdated, bootVersion, bootAt };
}
