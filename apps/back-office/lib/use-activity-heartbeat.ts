'use client';

/**
 * Latido de USO ACTIVO — alimenta el tiempo de uso de las métricas por empleado
 * y por doctor.
 *
 * Cada ping marca el minuto en curso (ver `/api/activity/heartbeat`), así que
 * lo único que importa acá es pingear mientras la persona esté trabajando; que
 * un ping se repita o se pierda ya no cambia el resultado.
 *
 * Tres decisiones, todas por bugs medidos en producción (15 min reales se veían
 * como 5):
 *
 *  1. **Se pinga al montar, no al minuto.** Antes el primer ping salía a los
 *     60s, así que cada recarga de página regalaba hasta un minuto entero. Con
 *     la app abierta ya hay trabajo: abrirla ES actividad.
 *  2. **Se pinga cada 20s, no cada 60.** Con marcado idempotente sobra margen
 *     para que un ping falle sin perder el minuto, y un tramo de trabajo corto
 *     (entrar, cobrar, salir) queda registrado igual.
 *  3. **Leer cuenta como trabajar.** Se exige interacción reciente, pero con
 *     una ventana de gracia: nadie mueve el mouse mientras lee una nota
 *     clínica, y en iPad no existe `mousemove` — solo `touchstart`. Sin la
 *     ventana, los doctores leyendo en tablet marcaban cero.
 *
 * Lo que NO cuenta: pestaña en segundo plano, y cualquier lapso de más de
 * GRACE_MS sin tocar nada — la app abierta y abandonada no suma.
 */

import { useEffect, useRef } from 'react';

/** Cada cuánto se marca el minuto en curso. */
export const ACTIVITY_HEARTBEAT_MS = 20_000;

/**
 * Cuánto sigue contando una persona después de su última interacción.
 *
 * Es el precio de que leer cuente: al final de cada tramo de trabajo se pueden
 * sumar hasta 2 minutos de más. Se prefiere ese error —acotado y parejo para
 * todos— antes que descontar el tiempo de lectura, que en una clínica es
 * trabajo real y era la mayor fuente de subconteo.
 */
const GRACE_MS = 120_000;

export function useActivityHeartbeat(): void {
  const lastInteractionRef = useRef<number>(Date.now());

  useEffect(() => {
    const mark = () => { lastInteractionRef.current = Date.now(); };

    const events: (keyof WindowEventMap)[] = [
      'pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll',
    ];
    for (const ev of events) window.addEventListener(ev, mark, { passive: true });

    // keepalive: si el ping cae justo cuando la persona navega, igual sale.
    // Se manda la ruta, no el módulo: el mapeo vive en el servidor
    // (`lib/activity-modules.ts`) para que el cliente no pueda inventarse uno.
    // `location.pathname` se lee en cada ping, así que cambiar de pantalla
    // cambia el módulo sin necesidad de re-montar el hook.
    const ping = () => {
      fetch('/api/activity/heartbeat', {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: window.location.pathname }),
      }).catch(() => undefined);
    };

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastInteractionRef.current > GRACE_MS) return;
      ping();
    };

    // Abrir la página ya es trabajo: se marca el minuto sin esperar al tick.
    ping();

    // Volver a la pestaña también: cuenta desde ese instante, no desde el
    // próximo tick, y reinicia la ventana de gracia.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      mark();
      ping();
    };
    document.addEventListener('visibilitychange', onVisible);

    const interval = setInterval(tick, ACTIVITY_HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      for (const ev of events) window.removeEventListener(ev, mark);
    };
  }, []);
}
