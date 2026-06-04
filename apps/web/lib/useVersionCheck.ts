'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Pollea /api/version cada 5 minutos. Devuelve isOutdated=true cuando
 * la version del server difiere de la que vimos al montar — significa
 * que hubo un deploy mientras el usuario tenia la app abierta.
 *
 * Mismo patron que el del timeclock (apps/timeclock/lib/useVersionCheck).
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useVersionCheck(): { isOutdated: boolean } {
  const [isOutdated, setIsOutdated] = useState(false);
  const initialVersionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      try {
        // Cache-bust en el query string — defensa contra cualquier SW que
        // pudiera intentar cachear el endpoint (workbox/serwist a veces
        // ignora Cache-Control). El admin actualmente tiene NetworkOnly
        // explicito, asi que este cache-bust es por defensa en profundidad.
        const res = await fetch(`/api/version?_=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { version: string };
        if (cancelled) return;

        if (initialVersionRef.current === null) {
          initialVersionRef.current = data.version;
        } else if (data.version !== initialVersionRef.current) {
          setIsOutdated(true);
        }
      } catch {
        // Offline o blip — reintentamos
      }
    }

    void check();
    const timer = setInterval(() => void check(), POLL_INTERVAL_MS);

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
