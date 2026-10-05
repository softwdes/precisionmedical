/**
 * Las cabeceras de seguridad de las cinco apps, en UN solo lugar.
 *
 * ── Por qué existe este archivo ─────────────────────────────────────────────
 *
 * Porque estaban en una sola app. Medido el 2026-10-05 leyendo los cinco
 * `next.config.mjs`: **solo `back-office` las declaraba**. `attorney`,
 * `clinical`, `timeclock` y el Admin no tenían ninguna — ni HSTS, ni protección
 * contra que nos metan en un iframe ajeno, ni anti-sniffing.
 *
 * Y no fue un descuido puntual: fue lo que pasa cuando una decisión de
 * seguridad se escribe copiada en cada app. Alguien la puso donde estaba
 * trabajando y las otras cuatro se quedaron atrás sin que nadie se enterara,
 * porque nada falla cuando una cabecera no está.
 *
 * Ahora hay un solo origen. Agregar una cabecera es tocar este archivo.
 *
 * ── Por qué un `.mjs` en la raíz y no un paquete ───────────────────────────
 *
 * Los `next.config.mjs` se cargan antes de que exista cualquier build, así que
 * no pueden importar un paquete de TypeScript del workspace sin compilarlo
 * primero. Un archivo plano al que llegan por ruta relativa no necesita nada.
 */

/**
 * Las que son iguales para todos.
 *
 * `X-Frame-Options: SAMEORIGIN` y no `DENY`: las apps se embeben a sí mismas en
 * algún visor interno. `DENY` rompería eso sin avisar.
 *
 * El HSTS son dos años, con subdominios y `preload`. Todos los hosts de
 * `lienmaster.net` son nuestros y todos van por HTTPS, así que no hay un
 * subdominio viejo en HTTP al que esto pueda dejar afuera.
 */
const COMUNES = [
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/**
 * `Permissions-Policy` NO es igual para todos, y copiarla a ciegas rompe cosas.
 *
 * Es la cabecera que apaga cámara, micrófono y ubicación. El navegador la
 * obedece **aunque la persona ya le haya dado permiso al sitio**, así que una
 * de más no da error: da una función que deja de andar sin explicación.
 *
 * Ya nos pasó: con `microphone=()` en el back-office, Twilio moría con un
 * `PermissionDeniedError 31401` y nadie entendía por qué no sonaba el teléfono.
 *
 * Medido el 2026-10-05, app por app:
 *  · `back-office` llama por Twilio desde el navegador → micrófono.
 *  · `timeclock` pide la ubicación al fichar (`ClockPage.tsx` usa
 *    `navigator.geolocation`) → ubicación.
 *  · `attorney`, `clinical` y el Admin no usan ninguna de las tres.
 *
 * Antes de agregar una app acá, buscá `getUserMedia`, `twilio` y `geolocation`
 * en su código. Si no usa nada, va con las tres cerradas.
 */
const PERMISOS = {
  'back-office': 'camera=(), microphone=(self), geolocation=()',
  timeclock:     'camera=(), microphone=(), geolocation=(self)',
  attorney:      'camera=(), microphone=(), geolocation=()',
  clinical:      'camera=(), microphone=(), geolocation=()',
  web:           'camera=(), microphone=(), geolocation=()',
};

/**
 * Las cabeceras de una app, listas para el `headers()` de su `next.config.mjs`:
 *
 *     import { cabecerasDeSeguridad } from '../../security-headers.mjs';
 *     async headers() { return cabecerasDeSeguridad('timeclock'); }
 *
 * Si el nombre no está en la tabla, lanza. Es a propósito: un error de tipeo
 * que dejara una app sin `Permissions-Policy` sería invisible, y el build
 * rompiéndose es mucho más barato que descubrirlo seis meses después.
 */
export function cabecerasDeSeguridad(app) {
  const permisos = PERMISOS[app];
  if (!permisos) {
    throw new Error(
      `security-headers: no conozco la app "${app}". ` +
      `Agregala a PERMISOS en security-headers.mjs después de revisar si usa cámara, micrófono o ubicación.`,
    );
  }
  return [{
    source: '/(.*)',
    headers: [...COMUNES, { key: 'Permissions-Policy', value: permisos }],
  }];
}
