/**
 * La puerta de staging: contraseña compartida que protege el entorno de pruebas.
 *
 * Solo importa si `STAGING_PASSWORD` está definida en el entorno; sin ella la
 * puerta no existe. Vive en un módulo aparte porque la usan DOS lugares que
 * corren en runtimes distintos —el middleware (edge) y la ruta de login (node)—
 * y tienen que estar de acuerdo en qué es una cookie válida. Solo usa Web
 * Crypto, que existe en los dos.
 *
 * ── Qué arregla ─────────────────────────────────────────────────────────────
 *
 *  · La cookie guardaba la CONTRASEÑA tal cual. Quien la leyera (una extensión,
 *    un log, un backup del navegador) tenía la clave de staging para siempre.
 *    Ahora guarda un hash derivado: sirve para entrar, no para saber la clave.
 *  · Las comparaciones eran `===`, que corta en el primer carácter distinto y
 *    deja medir de a poco cuánto acertó cada intento. Se comparan hashes, byte
 *    a byte, sin cortar antes.
 *  · El `callbackUrl` iba directo a un redirect: una URL absoluta mandaba al
 *    usuario, ya autenticado, a un sitio de un tercero. Ahora solo se acepta una
 *    ruta de ESTE sitio.
 *
 * Cambiar de cookie desloguea a quien tenía la vieja: entran una vez más.
 */

const SAL = 'pm-staging-gate-v1:';

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** El valor que lleva la cookie cuando la contraseña es la correcta. */
export async function cookieDeStaging(password: string): Promise<string> {
  const datos = new TextEncoder().encode(SAL + password);
  return hex(await crypto.subtle.digest('SHA-256', datos));
}

/** Comparación sin cortar en la primera diferencia. */
export function igualesSinCortar(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** ¿La contraseña tipeada es la de staging? Se comparan los hashes, que miden lo mismo siempre. */
export async function passwordCorrecta(tipeada: string, real: string): Promise<boolean> {
  return igualesSinCortar(await cookieDeStaging(tipeada), await cookieDeStaging(real));
}

/**
 * A dónde se vuelve después de entrar: solo una ruta de este sitio.
 *
 * Rechaza `//evil.com` (el navegador lo lee como otro dominio), `/\evil.com` (lo
 * normaliza a lo mismo), `https://…` y todo lo que no empiece con una sola `/`.
 */
export function destinoSeguro(raw: string | null | undefined): string {
  if (!raw) return '/';
  let d = raw;
  try { d = decodeURIComponent(raw); } catch { return '/'; }
  if (!d.startsWith('/') || d.startsWith('//') || d.includes('\\') || /[\u0000-\u001f]/.test(d)) return '/';
  return d;
}
