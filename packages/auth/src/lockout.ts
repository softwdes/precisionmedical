/**
 * El candado del login — el MISMO para las cinco apps.
 *
 * **Política (Erick, 2026-10-03): 3 intentos fallidos y la cuenta queda cerrada
 * hasta el día siguiente.** El contador se reinicia con un login correcto.
 *
 * Antes eran 5 intentos y 15 minutos, duplicando en cada reincidencia.
 *
 * ── Dónde vive el candado, y por qué se mudó ────────────────────────────────
 *
 * En la tabla `users` del proyecto **Admin**, que es donde está la cuenta con
 * la que la gente entra. Antes vivía en `users` de **Phoenix** (la base
 * clínica) y se escribía con Prisma, y eso dejaba afuera a dos de las cinco
 * apps:
 *
 *  · **timeclock** no tiene conexión a Phoenix — ni la dependencia ni la
 *    variable. No podía participar de ningún candado.
 *  · **el Admin** tampoco escribía ahí.
 *
 * Y había un agujero medido el 2026-10-03: de las 30 cuentas del Admin, **una
 * no tenía fila en Phoenix** (un abogado). `recordFailedAttempt` buscaba la
 * fila, no la encontraba y salía sin hacer nada: esa cuenta estaba exenta del
 * candado sin que nadie lo hubiera decidido.
 *
 * Con el candado del lado de la cuenta no hay nada que cruzar: si la persona
 * puede entrar, tiene fila acá. Las tres columnas se agregaron al Admin el
 * 2026-10-03.
 *
 * ── Por qué REST y no Prisma ────────────────────────────────────────────────
 *
 * Porque Prisma apunta a Phoenix, y éste es el otro proyecto. Las cinco apps ya
 * tienen `NEXT_PUBLIC_SUPABASE_URL` apuntando acá —es contra esto que se
 * autentican— y el Admin ya escribe en esta tabla por este mismo camino
 * (`api/auth/record-login`). Este módulo **no importa Prisma a propósito**: es
 * lo que permite que timeclock lo use.
 *
 * ── "Hasta el día siguiente" = medianoche de la clínica ─────────────────────
 *
 * No 24 horas. Si alguien se traba a las 9 de la mañana, 24 horas lo dejan
 * afuera TAMBIÉN la mañana siguiente — dos jornadas por un error. Medianoche
 * cumple lo que la frase promete: mañana podés entrar.
 *
 * Y es medianoche en `America/Denver`, no UTC. Con UTC el candado se levanta a
 * las 18:00 hora local, o sea en mitad de la tarde del MISMO día.
 *
 * ── ⚠️ Dos límites que hay que tener presentes ──────────────────────────────
 *
 * **1. No hay pantalla para desbloquear.** Verificado el 2026-10-03: no existe
 * endpoint ni botón que levante el candado. La salida real es
 * `recordSuccessfulLogin` —que limpia el contador—, a la que se llega por
 * "olvidé mi contraseña". Con 15 minutos de castigo eso daba igual; con "hasta
 * mañana", quien se traba a las 8 no trabaja en todo el día.
 *
 * **2. El chequeo lo dispara el NAVEGADOR.** La página pregunta antes de
 * mandar la contraseña a Supabase. Eso frena a quien se equivoca, no a quien
 * ataca: un cliente que le hable directo a Supabase Auth no pasa por acá. El
 * día que haga falta parar un ataque, el login tiene que mudarse al servidor en
 * las cinco apps — es otro trabajo y está dicho así a propósito, para que nadie
 * lea este archivo y crea que el login está blindado.
 */

import { randomUUID } from 'node:crypto';

const MAX_ATTEMPTS = 3;

/** La clínica está en Denver. El candado se mide en SU calendario, no en UTC. */
const ZONA_CLINICA = 'America/Denver';

export interface LockoutStatus {
  locked: boolean;
  lockedUntil?: Date;
  remainingMs?: number;
}

interface FilaUsuario {
  id: string;
  failedLoginAttempts: number | null;
  lockedUntil: string | null;
}

/* ── Acceso al proyecto Admin ──────────────────────────────────────────────── */

function credenciales(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Ruidoso a propósito: sin esto el candado no existe y nadie se entera.
    // Es exactamente lo que le falta hoy a timeclock.
    console.error('[candado] falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY — el candado NO está operando');
    return null;
  }
  return { url, key };
}

/**
 * `ilike` y no `eq`: el correo que la persona escribe no siempre coincide en
 * mayúsculas con el guardado. Con `eq`, un `Erick@…` contra un `erick@…`
 * guardado no encuentra la fila y el candado **no se aplica, en silencio** —
 * que es justo cómo se ve un candado roto. Sin comodines, así que sigue siendo
 * una coincidencia exacta, solo que sin distinguir mayúsculas. Es el mismo
 * patrón que usa `v2-apps.ts` contra esta misma tabla.
 */
async function buscarUsuario(email: string): Promise<FilaUsuario | null> {
  const c = credenciales();
  if (!c) return null;
  try {
    const res = await fetch(
      `${c.url}/rest/v1/users?select=id,failedLoginAttempts,lockedUntil` +
      `&email=ilike.${encodeURIComponent(email)}&limit=1`,
      { headers: { apikey: c.key, Authorization: `Bearer ${c.key}` } },
    );
    if (!res.ok) {
      console.error('[candado] no se pudo leer el usuario:', res.status);
      return null;
    }
    const filas = (await res.json()) as FilaUsuario[];
    return filas[0] ?? null;
  } catch (err) {
    console.error('[candado] error leyendo el usuario:', err);
    return null;
  }
}

async function actualizarUsuario(id: string, datos: Record<string, unknown>): Promise<void> {
  const c = credenciales();
  if (!c) return;
  try {
    const res = await fetch(`${c.url}/rest/v1/users?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: c.key,
        Authorization: `Bearer ${c.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ...datos, updatedAt: new Date().toISOString() }),
    });
    if (!res.ok) console.error('[candado] no se pudo actualizar el usuario:', res.status, await res.text());
  } catch (err) {
    console.error('[candado] error actualizando el usuario:', err);
  }
}

/**
 * Una línea en `audit_logs` del Admin.
 *
 * El `id` va explícito y es un UUID: la columna es `text NOT NULL` sin default
 * —el `cuid()` lo genera Prisma del lado del cliente, no Postgres—, así que un
 * insert por REST que lo omita **muere contra el NOT NULL**. Es la misma
 * trampa que documenta `packages/api/src/audit-log.ts`, donde ya hizo que no se
 * escribiera una sola línea de auditoría durante meses.
 *
 * No lanza nunca: auditar es un efecto lateral del intento de login, y si falla
 * no tiene sentido romperle la entrada a nadie por eso.
 */
async function auditar(entrada: Record<string, unknown> & { action: string }): Promise<void> {
  const c = credenciales();
  if (!c) return;
  try {
    const res = await fetch(`${c.url}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: `Bearer ${c.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ id: randomUUID(), createdAt: new Date().toISOString(), ...entrada }),
    });
    if (!res.ok) console.error(`[candado] auditoría ${entrada.action} no se registró:`, res.status);
  } catch (err) {
    console.error(`[candado] auditoría ${entrada.action} no se registró:`, err);
  }
}

/* ── La medianoche de la clínica ───────────────────────────────────────────── */

/**
 * Cuánto está adelantada o atrasada la zona respecto de UTC en ESE instante.
 * Se calcula por fecha y no con un número fijo porque el horario de verano
 * mueve a Denver entre UTC−6 y UTC−7.
 */
function desfaseMs(instante: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instante);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value])) as Record<string, string>;
  const comoSiFueraUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return comoSiFueraUtc - instante.getTime();
}

/**
 * La próxima medianoche de la clínica, en UTC (que es como se guarda).
 *
 * El segundo cálculo del desfase no es paranoia: en la madrugada del cambio de
 * horario, el desfase de HOY y el de MAÑANA difieren en una hora, y usando solo
 * el primero la medianoche caería a las 23:00 o a la 01:00. Se recalcula sobre
 * el instante candidato y se corrige una vez, que es todo lo que hace falta
 * porque el salto es de una hora como máximo.
 */
export function proximaMedianocheClinica(desde: Date): Date {
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(desde);
  const [anio, mes, dia] = hoy.split('-').map(Number);

  const medianocheIngenua = Date.UTC(anio, mes - 1, dia + 1, 0, 0, 0);
  let utc = medianocheIngenua - desfaseMs(desde, ZONA_CLINICA);
  utc = medianocheIngenua - desfaseMs(new Date(utc), ZONA_CLINICA);
  return new Date(utc);
}

/* ── La política ───────────────────────────────────────────────────────────── */

/**
 * ¿Está cerrada esta cuenta?
 *
 * Si no se puede averiguar —falta la credencial, la red falla, el correo no
 * existe— devuelve "abierta". Es **fail-open a propósito**: un hipo del Admin
 * dejaría a toda la clínica sin poder entrar a ninguna de las cinco apps, y eso
 * es peor que la ventana que abre. Por eso cada falla se escribe en consola con
 * el prefijo `[candado]`.
 */
export async function checkLockout(email: string): Promise<LockoutStatus> {
  const user = await buscarUsuario(email);
  if (!user?.lockedUntil) return { locked: false };

  const hasta = new Date(user.lockedUntil);
  const ahora = new Date();
  if (hasta > ahora) {
    return { locked: true, lockedUntil: hasta, remainingMs: hasta.getTime() - ahora.getTime() };
  }

  // Ya pasó la medianoche: se limpia en silencio y se entra.
  await actualizarUsuario(user.id, { lockedUntil: null, failedLoginAttempts: 0 });
  return { locked: false };
}

/**
 * El resultado de un intento fallido, para que la pantalla pueda AVISAR.
 *
 * Existe porque el candado sorprendía: todas las pantallas decían "contraseña
 * incorrecta" y ninguna decía cuántos intentos quedaban. Erick lo vivió el
 * 2026-10-03 probándolo — llegó a 2 de 3 sin enterarse, y el tercero le costaba
 * el día entero.
 *
 * Y el contador es UNO para las cinco apps, así que el que gasta dos intentos
 * en el reloj a la mañana puede quedarse afuera en el back-office a la tarde
 * sin haber visto nunca un aviso.
 */
export interface ResultadoIntento {
  /** Cuántos lleva acumulados. */
  intentos: number;
  /** Cuántos le quedan antes de que se cierre. 0 = ya se cerró. */
  restantes: number;
  locked: boolean;
  lockedUntil?: Date;
}

/**
 * ⚠️ Esto revela si un correo existe.
 *
 * A una cuenta real le contesta "te queda 1 intento"; a un correo inventado, el
 * resultado neutro de abajo. Quien pruebe correos puede distinguirlos.
 *
 * Se acepta a sabiendas: son ~30 cuentas de personal conocido, el mensaje de
 * "cuenta bloqueada" ya revelaba lo mismo desde antes, y la alternativa —que la
 * gente se quede afuera un día sin aviso— es peor para una clínica. Si algún
 * día esto se abre a pacientes, hay que volver sobre esta decisión.
 */
const NEUTRO: ResultadoIntento = { intentos: 0, restantes: MAX_ATTEMPTS, locked: false };

export async function recordFailedAttempt(email: string, ipAddress?: string): Promise<ResultadoIntento> {
  const user = await buscarUsuario(email);
  if (!user) return NEUTRO; // Correo desconocido — no se delata si existe o no.

  const cuenta = (user.failedLoginAttempts ?? 0) + 1;
  const cerrar = cuenta >= MAX_ATTEMPTS;
  // Sin escala progresiva: al tercer fallo se cierra hasta mañana, sea la
  // primera vez o la quinta. La escala existía para que el primer tropiezo
  // costara poco; con "hasta mañana" ya no hay nada que graduar.
  const lockedUntil = cerrar ? proximaMedianocheClinica(new Date()) : null;

  await actualizarUsuario(user.id, {
    failedLoginAttempts: cuenta,
    lastFailedAttemptAt: new Date().toISOString(),
    ...(cerrar && { lockedUntil: lockedUntil?.toISOString() }),
  });

  await auditar({
    actorUserId: user.id,
    action:      cerrar ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
    entityType:  'user',
    entityId:    user.id,
    ipAddress,
    metadata: {
      failedAttempts: cuenta,
      ...(cerrar && { lockedUntil: lockedUntil?.toISOString() }),
    },
  });

  return {
    intentos:  cuenta,
    restantes: Math.max(0, MAX_ATTEMPTS - cuenta),
    locked:    cerrar,
    ...(cerrar && lockedUntil ? { lockedUntil } : {}),
  };
}

/**
 * Desbloquear a mano. Lo usa un administrador desde la ficha del usuario.
 *
 * Es la pieza que faltaba para que la política sea operable. Hasta hoy la única
 * salida de un candado era esperar a la medianoche o acertar la contraseña —
 * imposible si justamente no te la acordás—, así que alguien que se trababa a
 * las 8 de la mañana perdía el día entero.
 *
 * Queda asentado QUIÉN desbloqueó a quién: por eso pide el id del que ejecuta
 * la acción y no se puede llamar sin él.
 */
export async function unlockAccount(
  email: string,
  actorUserId: string,
  ipAddress?: string,
): Promise<boolean> {
  const user = await buscarUsuario(email);
  if (!user) return false;

  await actualizarUsuario(user.id, {
    failedLoginAttempts: 0,
    lockedUntil:         null,
    lastFailedAttemptAt: null,
  });

  await auditar({
    actorUserId,
    action:     'ACCOUNT_UNLOCKED',
    entityType: 'user',
    entityId:   user.id,
    ipAddress,
    metadata: { email, intentosPrevios: user.failedLoginAttempts ?? 0, estabaBloqueadoHasta: user.lockedUntil },
  });

  return true;
}

/**
 * Login correcto: se limpia todo.
 *
 * Esto es, hoy, **la única forma de salir de un candado** — se llega por
 * "olvidé mi contraseña". Ver el aviso de la cabecera.
 */
export async function recordSuccessfulLogin(email: string, ipAddress?: string): Promise<void> {
  const user = await buscarUsuario(email);
  if (!user) return;

  await actualizarUsuario(user.id, {
    failedLoginAttempts: 0,
    lockedUntil:         null,
    lastFailedAttemptAt: null,
    lastLoginAt:         new Date().toISOString(),
    lastLoginIp:         ipAddress ?? null,
  });

  await auditar({
    actorUserId: user.id,
    action:      'LOGIN_SUCCESS',
    entityType:  'user',
    entityId:    user.id,
    ipAddress,
  });
}
