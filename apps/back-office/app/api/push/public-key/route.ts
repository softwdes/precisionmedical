/**
 * GET /api/push/public-key → la clave pública VAPID.
 *
 * Existe solo para el Service Worker. El cliente la recibe inlineada en el
 * bundle (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`), pero **el worker no**: next-pwa lo
 * compila aparte y su `EnvironmentPlugin` inyecta únicamente las claves de los
 * fallbacks, no las variables de Next. Verificado en el `dist` del paquete.
 *
 * El worker la necesita para rehacer la suscripción solo cuando el navegador
 * avisa que la rotó (`pushsubscriptionchange`) — ver `worker/index.js`.
 *
 * No lleva autenticación **a propósito**: es la clave PÚBLICA de VAPID, la
 * misma que ya sale en el HTML de cada página para cualquiera que mire el
 * código fuente. Firmar los envíos requiere la privada, que nunca sale del
 * servidor. Pedir sesión acá no protegería nada y rompería al worker, que
 * corre sin las cookies de la página.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET(): NextResponse {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  return NextResponse.json(
    { key },
    // Cacheable: cambia una vez en la vida del proyecto, y cambiarla invalida
    // todas las suscripciones existentes de todos modos.
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
