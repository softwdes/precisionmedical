'use client';

/**
 * Latido de USO ACTIVO — Fase 2 de métricas por empleado.
 *
 * Cada minuto revisa si hubo interacción real (mouse/teclado/touch/scroll) con
 * la pestaña visible, y solo entonces pega a `/api/activity/heartbeat`, que
 * acumula el minuto en `user_activity`. Dejar la app abierta en otra pestaña o
 * alejarse del equipo NO suma tiempo — eso lo distingue del heartbeat de
 * presencia de Twilio (lib/twilio-presence.ts), que mide "disponible para
 * recibir llamadas", no "trabajando".
 *
 * Registrar interacción = escribir un ref; nada de estado ni re-renders. El
 * dedup entre pestañas vive en el servidor (upsert atómico), así que acá no
 * hace falta coordinar nada.
 */

import { useEffect, useRef } from 'react';

/** Mismo compás que el heartbeat de presencia: 1 latido por minuto. */
export const ACTIVITY_HEARTBEAT_MS = 60_000;

export function useActivityHeartbeat(): void {
  const lastInteractionRef = useRef<number>(0);

  useEffect(() => {
    const markInteraction = () => { lastInteractionRef.current = Date.now(); };

    const events: (keyof WindowEventMap)[] = [
      'pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove',
    ];
    for (const ev of events) {
      window.addEventListener(ev, markInteraction, { passive: true });
    }

    const interval = setInterval(() => {
      const activeThisMinute =
        document.visibilityState === 'visible' &&
        Date.now() - lastInteractionRef.current <= ACTIVITY_HEARTBEAT_MS;
      if (!activeThisMinute) return;

      // keepalive: si el usuario navega justo cuando dispara, el ping igual sale.
      fetch('/api/activity/heartbeat', { method: 'POST', keepalive: true })
        .catch(() => undefined);
    }, ACTIVITY_HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      for (const ev of events) window.removeEventListener(ev, markInteraction);
    };
  }, []);
}
