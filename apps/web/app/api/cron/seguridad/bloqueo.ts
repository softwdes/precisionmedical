/**
 * A quién echaría el bloqueo automático, mirando solo los eventos.
 *
 * ── Por qué vive en su propio archivo ──────────────────────────────────────
 *
 * Para poder CORRERLO. Dentro de la ruta solo se podía llegar con un HTTP que
 * pide `CRON_SECRET`, y el registro real nunca tuvo un ataque: medido el
 * 2026-10-07, los 10 `LOGIN_FAILED` de toda la historia están en direcciones
 * que también tienen ingresos buenos. O sea que con datos reales esta decisión
 * **no se puede ejercitar**, ni bajando los umbrales al piso.
 *
 * Partido así, se le pueden dar eventos inventados y ver qué contesta — y lo
 * que se prueba es ESTA función, la que usa la ruta, no una copia tipeada al
 * lado. Esa distinción ya nos costó una vez con `trailerEn`, donde la prueba
 * pasaba sobre una copia mientras la de verdad tenía la regex rota.
 *
 * Lo que NO está acá: las dos condiciones que piden la base —que la IP nunca
 * haya tenido un ingreso bueno en toda la historia, y que no esté ya echada—.
 * Esas las resuelve la ruta, para las pocas que lleguen hasta ahí.
 */

export interface EventoDeAcceso {
  action: string;
  ipAddress?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface Candidata {
  ip: string;
  fallos: number;
  /** Cuántas cuentas DISTINTAS se probaron desde ahí. */
  cuentas: number;
  pais: string | null;
  ciudad: string | null;
}

export interface Umbrales {
  /** Desde cuántos fallos la dirección merece un aviso. */
  aviso: number;
  /** Desde cuántos fallos se la echaría. */
  fallos: number;
  /** Cuántas cuentas distintas tiene que haber probado. */
  cuentas: number;
}

/**
 * Las direcciones que pasan las condiciones visibles en los eventos.
 *
 * Tres filtros, y el orden importa: primero el del aviso, porque toda echada
 * tiene que haber sido antes un aviso —si no, se echaría a alguien sin que
 * nadie se hubiera enterado de que estaba pasando algo—.
 *
 * ⚠️ `cuentas` solo cuenta correos que EXISTEN en el directorio: un
 * `LOGIN_FAILED` no se registra para un correo inventado. Así que esto ve el
 * relleno de credenciales contra gente real, no el barrido a ciegas.
 */
export function candidatasDeBloqueo(
  eventos: EventoDeAcceso[],
  u: Umbrales,
): Candidata[] {
  const porIp = new Map<string, {
    fallos: number; exitos: number; cuentas: Set<string>; pais: string | null; ciudad: string | null;
  }>();

  for (const e of eventos) {
    const ip = e.ipAddress ?? null;
    if (ip === null || ip === '') continue;
    const m = e.metadata ?? {};
    const x = porIp.get(ip) ?? { fallos: 0, exitos: 0, cuentas: new Set<string>(), pais: null, ciudad: null };
    if (e.action === 'LOGIN_FAILED') {
      x.fallos += 1;
      if (typeof e.actorUserId === 'string') x.cuentas.add(e.actorUserId);
    }
    if (e.action === 'LOGIN_SUCCESS') x.exitos += 1;
    x.pais ??= (m.pais as string | undefined) ?? null;
    x.ciudad ??= (m.ciudad as string | undefined) ?? null;
    porIp.set(ip, x);
  }

  const salida: Candidata[] = [];
  for (const [ip, x] of porIp) {
    // 1 · ya tiene que estar avisada, y no haber entrado nadie en la ventana
    if (x.fallos < u.aviso || x.exitos > 0) continue;
    // 2 · más fallos que para avisar
    if (x.fallos < u.fallos) continue;
    // 3 · varias cuentas: una persona con su propia contraseña no cuenta
    if (x.cuentas.size < u.cuentas) continue;
    salida.push({ ip, fallos: x.fallos, cuentas: x.cuentas.size, pais: x.pais, ciudad: x.ciudad });
  }
  return salida;
}
