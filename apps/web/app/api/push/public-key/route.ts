/**
 * GET /api/push/public-key → la clave pública VAPID.
 *
 * Existe solo para el Service Worker. El cliente la recibe inlineada en el
 * bundle (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`), pero el worker lo compila serwist
 * aparte y no hay garantía de que la variable entre ahí. Pedirla por HTTP es
 * una llamada y no depende de cómo compile nadie.
 *
 * La usa `app/sw.ts` para rehacer la suscripción sola cuando el navegador avisa
 * que la rotó (`pushsubscriptionchange`).
 *
 * No lleva autenticación **a propósito**: es la clave PÚBLICA de VAPID, la
 * misma que ya sale en el HTML de cada página para cualquiera que mire el
 * código fuente. Firmar los envíos requiere la privada, que nunca sale del
 * servidor. Pedir sesión acá no protegería nada y rompería al worker, que corre
 * sin las cookies de la página — y justo cuando más falta hace, que es con la
 * sesión vencida.
 *
 * Gemela de `apps/back-office/app/api/push/public-key/route.ts`. Las dos apps
 * tienen que servir **la misma clave** o una suscripción creada en un dominio
 * queda atada a una pública distinta de la privada con la que firma el que
 * empuja, y el envío responde 403 en silencio.
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
