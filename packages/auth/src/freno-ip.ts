/**
 * Freno por IP para las puertas de entrada de las cinco apps.
 *
 * ── Qué agujero cierra ──────────────────────────────────────────────────────
 *
 * `POST /api/auth/lockout` estaba **abierto a internet, sin autenticación**, y
 * aceptaba el correo que le mandaras. Medido el 2026-10-05 contra producción:
 *
 *     POST https://<cualquiera>/api/auth/lockout {"email":"…","success":false}
 *     → 200 {"ok":true,"intentos":0,"restantes":3,"locked":false}
 *
 * Tres de esos con el correo de una persona real y esa persona quedaba afuera
 * de las cinco apps **hasta la medianoche**. Treinta correos conocidos = la
 * clínica entera parada un día, desde una laptop, sin una sola contraseña.
 *
 * Y la política de "3 intentos y hasta mañana" (2026-10-03) lo empeoró: antes
 * el daño máximo eran 15 minutos.
 *
 * ── Qué es y qué NO es ──────────────────────────────────────────────────────
 *
 * Es un contador EN MEMORIA del proceso. Encarece el ataque y lo hace visible;
 * no lo vuelve imposible:
 *
 *  · No se comparte entre instancias. En serverless cada lambda tiene la suya,
 *    así que el techo real es `max × instancias vivas`.
 *  · Se pierde en cada arranque en frío.
 *  · No frena a alguien con muchas IP.
 *
 * **El arreglo completo es otro**: que el login ocurra en el SERVIDOR, para que
 * nadie pueda *declarar* un fallo que no ocurrió. Mientras el navegador sea
 * quien avisa, esto es un freno, no una puerta. Está dicho así a propósito para
 * que nadie lea este archivo y crea que el problema está resuelto.
 *
 * Es gemelo de `apps/forms/lib/rate-limit.ts`, que nació antes para las rutas
 * públicas de formularios. Vive acá y no allá porque `@precision-medical/auth`
 * es la única dependencia que comparten las cinco apps. Cuando alguien toque
 * forms, conviene que pase a usar éste y quede uno solo.
 */

/** Marcas de tiempo de los intentos recientes, por clave. */
const intentos = new Map<string, number[]>();

/**
 * Cada cuántas escrituras se barre el mapa.
 *
 * Sin esto, una IP distinta por request deja su entrada para siempre y el mapa
 * crece hasta que el proceso muere. No hay `setInterval`: en serverless el
 * timer mantiene viva una instancia que debería poder apagarse.
 */
const BARRIDO_CADA = 500;
let escrituras = 0;

function barrer(ahora: number, ventanaMs: number): void {
  for (const [clave, marcas] of intentos) {
    if (marcas.length === 0 || ahora - marcas[marcas.length - 1]! > ventanaMs) {
      intentos.delete(clave);
    }
  }
}

export interface Veredicto {
  ok: boolean;
  /** Intentos que quedan en la ventana actual. */
  restantes: number;
  /** Cuánto falta para que se libere el más viejo, en segundos (`Retry-After`). */
  reintentarEnSeg: number;
}

/**
 * ¿Puede esta clave hacer un intento más?
 *
 * Ventana deslizante: se cuentan los intentos de los últimos `ventanaMs`, no
 * los de un bloque fijo. Con bloques fijos se cuelan `2 × max` intentos juntos
 * cruzando el borde.
 */
export function frenoIp(
  clave: string,
  { max, ventanaMs }: { max: number; ventanaMs: number },
): Veredicto {
  const ahora = Date.now();
  if (++escrituras % BARRIDO_CADA === 0) barrer(ahora, ventanaMs);

  const previos = intentos.get(clave) ?? [];
  const vivos = previos.filter((t) => ahora - t < ventanaMs);

  if (vivos.length >= max) {
    const masViejo = vivos[0]!;
    // El intento rechazado NO se registra: si contara, quien insiste se
    // extiende el castigo solo y el freno pasa de "esperá" a "nunca más".
    intentos.set(clave, vivos);
    return {
      ok: false,
      restantes: 0,
      reintentarEnSeg: Math.max(1, Math.ceil((ventanaMs - (ahora - masViejo)) / 1000)),
    };
  }

  vivos.push(ahora);
  intentos.set(clave, vivos);
  return { ok: true, restantes: max - vivos.length, reintentarEnSeg: 0 };
}

/**
 * La IP de quien pide.
 *
 * `x-forwarded-for` trae la cadena de proxies y la del cliente es la **primera**.
 * Tomar la última da la del proxy, y entonces todos comparten contador: un solo
 * atacante frenaría a la clínica entera.
 */
export function ipDe(h: Headers): string {
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip')?.trim() ||
    'local'
  );
}

/** Clave de freno, con el ámbito adentro para que una ruta no gaste el cupo de otra. */
export function claveDeIp(h: Headers, ambito: string): string {
  return `${ambito}:${ipDe(h)}`;
}

/**
 * ¿La petición viene de una de nuestras pantallas?
 *
 * Mira `Origin` y, si falta, `Referer`. **No es una defensa fuerte** — las dos
 * se falsifican con una línea de `curl` — pero corta en seco el caso que de
 * verdad pasa: un script genérico que descubre el endpoint y lo machaca sin
 * molestarse en imitar un navegador.
 *
 * Sin ninguna de las dos cabeceras devuelve `false`. Un navegador siempre manda
 * `Origin` en un POST `fetch` con `content-type: application/json`, así que la
 * ausencia es señal de que no hay navegador del otro lado.
 *
 * Acepta cualquier subdominio de `lienmaster.net`, los previews de Vercel y
 * `localhost` para desarrollo.
 */
const HOSTS_PROPIOS = /^https?:\/\/([a-z0-9-]+\.)*(lienmaster\.net|vercel\.app|localhost(:\d+)?)$/i;

export function vieneDeNuestrasPantallas(h: Headers): boolean {
  const origen = h.get('origin');
  if (origen) return HOSTS_PROPIOS.test(origen);

  const ref = h.get('referer');
  if (!ref) return false;
  try {
    return HOSTS_PROPIOS.test(new URL(ref).origin);
  } catch {
    return false;
  }
}

/* ── De dónde viene ────────────────────────────────────────────────────────
 *
 * Vercel resuelve la geografía en su borde y la manda como cabeceras en CADA
 * petición. Es gratis, no sale una consulta a ningún tercero y ningún dato de
 * la clínica viaja a un servicio de geolocalización.
 *
 * ⚠️ QUÉ TAN EXACTO ES, porque importa no exagerarlo:
 *
 *  · **País**: muy confiable. Es el dato con el que se decide algo.
 *  · **Ciudad y región**: aproximadas. Suelen dar la central del proveedor de
 *    internet, no dónde está la persona — con datos móviles puede caer a
 *    cientos de kilómetros, y con VPN directamente a otro país.
 *  · **Dirección exacta**: NO EXISTE. Una IP no da una calle, y cualquier
 *    servicio que lo prometa está adivinando.
 *
 * Sirve para "estos intentos vienen de un país donde no trabaja nadie", que es
 * una señal fuerte. No sirve para señalar a una persona.
 */
export interface Ubicacion {
  pais?: string;
  region?: string;
  ciudad?: string;
}

export function ubicacionDe(h: Headers): Ubicacion {
  const limpio = (v: string | null): string | undefined => {
    if (!v) return undefined;
    // Vercel percent-codifica los nombres con espacios o acentos.
    try { return decodeURIComponent(v) || undefined; } catch { return v; }
  };
  return {
    pais:   limpio(h.get('x-vercel-ip-country')),
    region: limpio(h.get('x-vercel-ip-country-region')),
    ciudad: limpio(h.get('x-vercel-ip-city')),
  };
}

/** Todo lo que se sabe de quien toca la puerta, para el registro y la pantalla. */
export interface Contexto extends Ubicacion {
  ip?: string;
  /** El navegador. Es la señal más barata para distinguir a una persona de un script. */
  navegador?: string;
  /** Cuál de las cinco apps. Sin esto el registro no se puede partir por módulo. */
  app?: string;
}

export function contextoDe(h: Headers, app: string): Contexto {
  const ip = ipDe(h);
  return {
    ip: ip === 'local' ? undefined : ip,
    ...ubicacionDe(h),
    navegador: h.get('user-agent')?.slice(0, 300) ?? undefined,
    app,
  };
}
