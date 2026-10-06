import { createServerClient } from './server';
import { checkLockout, recordFailedAttempt, recordSuccessfulLogin } from './lockout';
import { estaBloqueada } from './ips-bloqueadas';
import type { Contexto } from './freno-ip';

/**
 * El login, hecho en el SERVIDOR.
 *
 * ── Qué arregla, y por qué era lo que faltaba ───────────────────────────────
 *
 * Hasta hoy el navegador le hablaba directo a Supabase y después le AVISABA a
 * nuestra API si había fallado. Todo el candado colgaba de esa confesión:
 *
 *  · quien ataca puede **no avisar** — prueba contraseñas sin gastar intentos;
 *  · quien ataca puede **avisar de más** — declara fallos ajenos y traba
 *    cuentas (eso se tapó el 2026-10-05 con el freno por IP y el chequeo de
 *    origen, pero tapado no es cerrado: las dos cosas se falsifican).
 *
 * Acá el servidor **intenta la autenticación él mismo**. Ya no hay nada que
 * creerle a nadie: el fallo lo vio quien lo cuenta. Es la diferencia entre un
 * freno y una puerta.
 *
 * ── Qué NO cambia ───────────────────────────────────────────────────────────
 *
 * La sesión sigue viviendo en las mismas cookies: `createServerClient` las
 * escribe desde la ruta igual que las escribía el navegador, así que el
 * middleware, `getUser()` y el resto del sistema no se enteran de nada.
 *
 * El segundo factor sigue resolviéndose del lado del cliente. Esta función
 * dice SI hace falta; el desafío y la verificación los hace la pantalla con la
 * sesión que acá quedó abierta. Se dejó así a propósito: mover también el MFA
 * sería cambiar dos cosas a la vez en el único camino por donde entra todo el
 * mundo.
 */

export interface ResultadoLogin {
  ok: boolean;
  /** La cuenta está cerrada: ni se intentó la contraseña. */
  locked?: boolean;
  lockedUntil?: string;
  /** Intentos que quedan antes de que se cierre. Solo cuando la contraseña falló. */
  restantes?: number;
  /** El login fue bueno pero falta el segundo factor. */
  mfaRequerido?: boolean;
  /** El factor con el que seguir el desafío, si hace falta. */
  factorId?: string;
}

export async function iniciarSesionEnServidor(
  email: string,
  password: string,
  ctx: Contexto = {},
): Promise<ResultadoLogin> {
  /*
   * 0. ¿Esta dirección está echada?
   *
   * Antes del candado: una IP bloqueada no debería ni poder averiguar si una
   * cuenta existe o está cerrada.
   *
   * Se contesta lo MISMO que una contraseña mala, sin decir "estás
   * bloqueado": que el atacante no sepa si lo detectaron es la mitad de la
   * defensa. El costo es que, si alguna vez bloqueamos por error la IP de la
   * clínica, el personal va a ver "contraseña incorrecta" sin entender nada —
   * por eso la pantalla que bloquea AVISA cuando la IP tiene ingresos buenos,
   * y por eso la lista de bloqueadas se ve ahí mismo.
   */
  if (await estaBloqueada(ctx.ip)) {
    console.warn('[login] intento desde una IP bloqueada:', ctx.ip, '· app:', ctx.app);
    return { ok: false };
  }

  /*
   * 1. El candado, ANTES de tocar la contraseña.
   *
   * Si la cuenta está cerrada no se intenta nada: así un candado no se puede
   * usar como oráculo para probar contraseñas igual.
   */
  const candado = await checkLockout(email);
  if (candado.locked && candado.lockedUntil) {
    return { ok: false, locked: true, lockedUntil: candado.lockedUntil.toISOString() };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  /*
   * 2. El fallo lo vio el servidor. Nadie se lo contó.
   *
   * `recordFailedAttempt` devuelve neutro para un correo que no existe, así que
   * la respuesta no delata si la cuenta existe o no.
   */
  if (error) {
    const r = await recordFailedAttempt(email, ctx);
    return { ok: false, restantes: r.restantes, locked: r.locked,
             ...(r.lockedUntil ? { lockedUntil: r.lockedUntil.toISOString() } : {}) };
  }

  await recordSuccessfulLogin(email, ctx);

  /*
   * 3. ¿Falta el segundo factor?
   *
   * `aal1` con un `nextLevel` de `aal2` significa que la cuenta tiene un factor
   * inscripto y todavía no lo usó en esta sesión. Si algo de esto falla se
   * devuelve que NO hace falta: la sesión ya está abierta y dejar a la persona
   * trabada en una pantalla de código por un error de red sería peor.
   */
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      const { data: factores } = await supabase.auth.mfa.listFactors();
      const totp = factores?.totp?.find((f) => f.status === 'verified');
      if (totp) return { ok: true, mfaRequerido: true, factorId: totp.id };
    }
  } catch (err) {
    console.error('[login] no se pudo consultar el segundo factor:', err);
  }

  return { ok: true };
}
