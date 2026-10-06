/**
 * La lista de IPs echadas, y la puerta que la consulta.
 *
 * ── Qué agrega sobre el freno que ya existía ───────────────────────────────
 *
 * El freno por IP (`freno-ip.ts`) limita CUÁNTO puede hacer una dirección en
 * diez minutos. No la echa: quien prueba contraseñas despacio pasa sin
 * despeinarse, para siempre. Esto cierra la puerta.
 *
 * Erick, 2026-10-06, sobre lo que le faltaba al Centro de Seguridad: hoy ve el
 * ataque y no puede pararlo.
 *
 * ── Por qué se bloquea A MANO ──────────────────────────────────────────────
 *
 * Medido el 2026-10-06: `76.8.206.26` tiene 11 ingresos buenos y 4 fallidos —
 * es la salida a internet de la clínica, compartida por todo el personal. Un
 * bloqueo automático por "4 fallos" deja a la clínica entera afuera, y el
 * "ataque" habría sido alguien que no se acordaba la contraseña.
 *
 * Así que el sistema AVISA y la persona decide. Si algún día se automatiza, la
 * regla tiene que excluir toda IP con ingresos exitosos.
 *
 * ── La caché, y por qué es corta ───────────────────────────────────────────
 *
 * La puerta se consulta en cada intento de login. Sin caché son 137 ms de más
 * por intento, y la lista cambia una vez por mes. Con caché de 60 s, bloquear
 * tarda hasta un minuto en hacer efecto en cada instancia — aceptable para una
 * acción manual, y se puede forzar con `olvidarCache()` desde la misma
 * instancia que acaba de escribir.
 *
 * ⚠️ En Vercel cada instancia tiene su propia caché, igual que el freno por IP:
 * no hay un apagón instantáneo y coordinado. Para eso haría falta Redis. Con el
 * volumen de esta clínica (66 intentos en 7 días) no se justifica todavía.
 */

export interface IpBloqueada {
  id: string;
  ip: string;
  motivo: string | null;
  bloqueadaEl: string;
  /** `null` = hasta que alguien la saque. */
  hasta: string | null;
  porUserId: string | null;
  pais: string | null;
  ciudad: string | null;
}

function credenciales(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[ips] falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY — el bloqueo NO está operando');
    return null;
  }
  return { url, key };
}

/* ─────────────────────────────── la caché ──────────────────────────────── */

const VIDA_MS = 60_000;
let cache: { ips: Set<string>; vence: number } | null = null;

/** La tira la instancia que acaba de escribir, para no esperarse a sí misma. */
export function olvidarCache(): void {
  cache = null;
}

/**
 * Lee la lista vigente. Devuelve `null` si no se pudo leer.
 *
 * `null` y no un conjunto vacío a propósito: son cosas distintas. "No hay
 * ninguna bloqueada" deja pasar; "no pude preguntar" también deja pasar, pero
 * queda en los logs. Un bloqueo que falla abierto es la decisión correcta —
 * la alternativa es que un hipo de la base deje a la clínica sin entrar.
 */
async function leerVigentes(): Promise<Set<string> | null> {
  const c = credenciales();
  if (!c) return null;
  try {
    const ahora = new Date().toISOString();
    const res = await fetch(
      `${c.url}/rest/v1/blocked_ips?select=ip&or=(hasta.is.null,hasta.gt.${ahora})`,
      { headers: { apikey: c.key, Authorization: `Bearer ${c.key}` } },
    );
    if (!res.ok) {
      console.error('[ips] no se pudo leer la lista:', res.status);
      return null;
    }
    const filas = (await res.json()) as Array<{ ip: string }>;
    return new Set(filas.map((f) => f.ip));
  } catch (err) {
    console.error('[ips] error leyendo la lista:', err);
    return null;
  }
}

/**
 * ¿Esta dirección está echada ahora mismo?
 *
 * Nunca lanza. Ante cualquier duda contesta `false`: ver arriba por qué falla
 * abierto.
 */
export async function estaBloqueada(ip: string | undefined): Promise<boolean> {
  if (!ip) return false;

  if (cache && cache.vence > Date.now()) return cache.ips.has(ip);

  const ips = await leerVigentes();
  if (ips === null) {
    // No se pudo leer: no se cachea el fracaso, para reintentar al próximo.
    return false;
  }
  cache = { ips, vence: Date.now() + VIDA_MS };
  return ips.has(ip);
}

/* ───────────────────────────── administrar ─────────────────────────────── */

/** Toda la lista, vencidas incluidas, para la pantalla. */
export async function listarBloqueadas(): Promise<IpBloqueada[]> {
  const c = credenciales();
  if (!c) return [];
  try {
    const res = await fetch(
      `${c.url}/rest/v1/blocked_ips?select=*&order=bloqueadaEl.desc&limit=200`,
      { headers: { apikey: c.key, Authorization: `Bearer ${c.key}` } },
    );
    if (!res.ok) { console.error('[ips] no se pudo listar:', res.status); return []; }
    return (await res.json()) as IpBloqueada[];
  } catch (err) {
    console.error('[ips] error listando:', err);
    return [];
  }
}

export interface DatosBloqueo {
  motivo?: string;
  /** ISO. Sin esto el bloqueo no vence solo. */
  hasta?: string | null;
  porUserId?: string;
  pais?: string | null;
  ciudad?: string | null;
}

/**
 * Echa una IP, o actualiza la que ya estaba.
 *
 * `Prefer: resolution=merge-duplicates` sobre el UNIQUE de `ip`: bloquear dos
 * veces la misma dirección no explota, la pisa. Sin eso el segundo clic
 * devuelve un 409 que la pantalla tendría que saber interpretar.
 */
export async function bloquearIp(ip: string, datos: DatosBloqueo = {}): Promise<boolean> {
  const c = credenciales();
  if (!c) return false;
  try {
    const res = await fetch(`${c.url}/rest/v1/blocked_ips?on_conflict=ip`, {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: `Bearer ${c.key}`,
        'content-type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        ip,
        motivo: datos.motivo ?? null,
        hasta: datos.hasta ?? null,
        porUserId: datos.porUserId ?? null,
        pais: datos.pais ?? null,
        ciudad: datos.ciudad ?? null,
        bloqueadaEl: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      console.error('[ips] no se pudo bloquear:', res.status, await res.text());
      return false;
    }
    olvidarCache();
    return true;
  } catch (err) {
    console.error('[ips] error bloqueando:', err);
    return false;
  }
}

/** La saca de la lista. Devuelve false si no se pudo. */
export async function desbloquearIp(ip: string): Promise<boolean> {
  const c = credenciales();
  if (!c) return false;
  try {
    const res = await fetch(
      `${c.url}/rest/v1/blocked_ips?ip=eq.${encodeURIComponent(ip)}`,
      { method: 'DELETE', headers: { apikey: c.key, Authorization: `Bearer ${c.key}` } },
    );
    if (!res.ok) { console.error('[ips] no se pudo desbloquear:', res.status); return false; }
    olvidarCache();
    return true;
  } catch (err) {
    console.error('[ips] error desbloqueando:', err);
    return false;
  }
}
