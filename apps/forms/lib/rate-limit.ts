/**
 * Freno por IP para las rutas públicas de `forms`.
 *
 * Esta app no tiene sesión: todo lo que responde lo responde a un desconocido.
 * Sin un freno, cada endpoint que recibe un código o un token es un oráculo que
 * se puede consultar miles de veces por segundo — que es lo que convertía a
 * `/api/cita/[code]` en un listado del padrón (ver el comentario de esa ruta).
 *
 * ── Qué es y qué NO es ──────────────────────────────────────────────────────
 *
 * Es un contador EN MEMORIA del proceso. Eso alcanza para lo que se necesita
 * acá —encarecer la fuerza bruta lo suficiente como para que deje de ser
 * gratis— y no alcanza para nada más:
 *
 *  · No se comparte entre instancias. En serverless cada lambda tiene la suya,
 *    así que el techo real es `max × instancias vivas`.
 *  · Se pierde en cada arranque en frío.
 *  · No frena a alguien con muchas IPs.
 *
 * Se eligió así a propósito: la alternativa es Redis (Upstash), y meter una
 * dependencia de infraestructura nueva para esto es una decisión de proyecto,
 * no un detalle de implementación. Cuando exista ese Redis, la firma de
 * `rateLimit` no cambia — cambia el cuerpo.
 *
 * **El freno es la segunda línea, nunca la primera.** La primera es que el dato
 * no sea enumerable: un código secuencial con freno sigue siendo enumerable, y
 * más despacio no es lo mismo que no.
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
  /** Cuánto falta para que se libere el más viejo, en segundos (para `Retry-After`). */
  reintentarEnSeg: number;
}

/**
 * ¿Puede esta clave hacer un intento más?
 *
 * Ventana deslizante: se cuentan los intentos de los últimos `ventanaMs`, no
 * los de un bloque fijo. Con bloques fijos se pasan `2 × max` intentos juntos
 * cruzando el borde.
 *
 * @param clave Identificador del que consulta. Usar `claveDeIp(req, 'ruta')` —
 *   con el nombre de la ruta adentro, para que el freno de una no gaste el
 *   presupuesto de la otra.
 */
export function rateLimit(
  clave: string,
  { max, ventanaMs }: { max: number; ventanaMs: number },
): Veredicto {
  const ahora = Date.now();

  if (++escrituras % BARRIDO_CADA === 0) barrer(ahora, ventanaMs);

  const previos = intentos.get(clave) ?? [];
  const vivos   = previos.filter((t) => ahora - t < ventanaMs);

  if (vivos.length >= max) {
    const masViejo = vivos[0]!;
    // No se registra el intento rechazado: si contara, quien insiste se
    // extiende el castigo solo, y el freno pasa de "esperá" a "nunca más".
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
 * Clave de freno para una request.
 *
 * `x-forwarded-for` trae la cadena de proxies; la IP del cliente es la
 * PRIMERA. Tomar la última da la del proxy y hace que todos compartan un mismo
 * contador — es decir, que un solo atacante frene a la clínica entera.
 *
 * Sin ninguna cabecera (local, o un proxy que no las manda) devuelve `local`:
 * todos comparten contador, que es lo correcto cuando no se puede distinguir.
 *
 * Acepta una `Request` o directamente sus `Headers`: las páginas (server
 * components) no tienen `Request`, solo el `headers()` de Next, y sin esto cada
 * una tendría que reimplementar la regla de la PRIMERA IP de la cadena — que es
 * justo el detalle que se puede equivocar.
 */
export function claveDeIp(reqOHeaders: Request | Headers, ambito: string): string {
  const h = reqOHeaders instanceof Headers ? reqOHeaders : reqOHeaders.headers;
  const fwd = h.get('x-forwarded-for');
  const ip  = fwd?.split(',')[0]?.trim()
    || h.get('x-real-ip')?.trim()
    || 'local';
  return `${ambito}:${ip}`;
}

/** Cabeceras estándar para una respuesta 429. */
export function cabeceras429(v: Veredicto): Record<string, string> {
  return { 'Retry-After': String(v.reintentarEnSeg) };
}
