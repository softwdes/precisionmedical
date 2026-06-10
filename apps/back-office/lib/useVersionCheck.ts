'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Pollea /api/version cada 5 minutos. Devuelve isOutdated=true cuando
 * el servidor reporta un SHA distinto al que vimos al montar — significa
 * que hubo un deploy mientras el usuario tenía la app abierta.
 */

const POLL_MS = 5 * 60 * 1000;

export function useVersionCheck(): { isOutdated: boolean } {
  const [isOutdated, setIsOutdated] = useState(false);
  const initialRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      try {
        const res = await fetch(`/api/version?_=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { version: string };
        if (cancelled) return;

        if (initialRef.current === null) {
          initialRef.current = data.version;
        } else if (data.version !== initialRef.current) {
          setIsOutdated(true);
        }
      } catch {
        // Offline o blip de red — reintentamos en el siguiente ciclo
      }
    }

    void check();
    const timer = setInterval(() => void check(), POLL_MS);

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
