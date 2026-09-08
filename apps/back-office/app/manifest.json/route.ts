/**
 * GET /manifest.json → el manifest de la PWA, distinto POR HOST.
 *
 * Un solo deployment sirve tres portales en tres dominios, y hasta acá los tres
 * recibían el mismo archivo estático: el provider y el abogado instalaban una
 * app llamada "PM Clinical", con el azul de administración, que arrancaba en
 * `/dashboard` — ruta que el middleware les rebota a `/doctor` y `/attorney`.
 * Nombre ajeno en la pantalla de inicio y un salto visible en cada arranque.
 *
 * ── Por qué una ruta y no `app/manifest.ts` ──────────────────────────────────
 * La convención de Next sirve en `/manifest.webmanifest`, y el `<link>` del
 * layout —más los WebAPK ya instalados— apuntan a `/manifest.json`. Cambiar la
 * URL obligaría a Chrome a re-descubrir el manifest de todas las instalaciones
 * existentes, que es exactamente el riesgo que esta ruta evita.
 *
 * ── Por qué desapareció `public/manifest.json` ───────────────────────────────
 * Los archivos de `public/` tienen prioridad sobre las rutas: mientras existía,
 * esta nunca se ejecutaba. El de la clínica quedó acá con los MISMOS valores,
 * campo por campo, para que Chrome no vea diferencia y no regenere nada de lo
 * que ya está instalado y funcionando.
 *
 * `/manifest.json` está excluido del matcher del middleware (ver el final de
 * `middleware.ts`), así que sigue siendo público: si pidiera sesión, Chrome
 * recibiría un 307 a `/login`, diría "no hay manifest" y el botón de instalar
 * desaparecería.
 */

import { headers } from 'next/headers';

/** Los iconos son los mismos para los tres: el arte todavía no está separado. */
const ICONS = [
  { src: '/icons/icon-72.png',  sizes: '72x72',   type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-96.png',  sizes: '96x96',   type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const;

const BASE = {
  scope: '/',
  display: 'standalone',
  orientation: 'portrait-primary',
  background_color: '#0A0E1A',
  lang: 'es',
  categories: ['business', 'medical'],
  icons: ICONS,
} as const;

/**
 * Host principal. Campo por campo igual al `public/manifest.json` que había
 * antes — el `start_url` sigue siendo `/dashboard` a propósito: es donde entra
 * el staff de la clínica, y cambiarlo movería instalaciones que ya funcionan.
 */
const CLINICA = {
  name: 'Precision Medical — Clinical Management',
  short_name: 'PM Clinical',
  description: 'Precision Medical — Clinical management & operations platform',
  start_url: '/dashboard',
  theme_color: '#2563EB',
  ...BASE,
};

/**
 * providers.* — el portal médico. Arranca en `/doctor`, no en el dashboard.
 *
 * El `theme_color` es `violet-600`, el mismo `--violet-text` que el tema claro
 * de `globals.css` declara como identidad del portal médico (y el tono que ya
 * usa el login en este host). Pinta la barra de estado de Android y el fondo
 * del splash, así que tiene que ser el color del portal y no uno elegido aparte.
 */
const PROVIDERS = {
  name: 'Precision Medical — Providers',
  short_name: 'PM Providers',
  description: 'Portal de providers — Precision Medical',
  start_url: '/doctor',
  theme_color: '#7C3AED',
  ...BASE,
};

/**
 * attorney.* — el portal legal. Arranca en `/attorney`.
 *
 * Usa `brand` (indigo-600, `--brand-text` en claro): el portal legal no tiene
 * un tono propio — sus 40 usos de color son `text-brand-*`, así que su
 * identidad ES la marca.
 */
const LEGAL = {
  name: 'Precision Medical — Legal',
  short_name: 'PM Legal',
  description: 'Portal legal — Precision Medical',
  start_url: '/attorney',
  theme_color: '#4F46E5',
  ...BASE,
};

/**
 * Mismos patrones que las puertas por host del middleware (`isProvidersHost` e
 * `isAttorneyHost`). Si allá cambia el dominio de un portal, acá también:
 * un manifest que no coincide con el ruteo instala una app que arranca mal.
 */
function manifestFor(host: string): typeof CLINICA {
  if (/^providers?\./.test(host)) return PROVIDERS;
  if (/^attorney\./.test(host))   return LEGAL;
  return CLINICA;
}

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const host = (await headers()).get('host') ?? '';

  return new Response(JSON.stringify(manifestFor(host), null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // Sin caché compartida: la respuesta depende del host, y un intermediario
      // que guardara una sola copia le daría a un portal el manifest del otro.
      'Cache-Control': 'no-store',
    },
  });
}
