/**
 * El candado del login.
 *
 * **Política (Erick, 2026-10-03): 3 intentos fallidos y la cuenta queda cerrada
 * hasta el día siguiente.** El contador se reinicia con un login correcto.
 *
 * Antes eran 5 intentos y 15 minutos, duplicando en cada reincidencia. El
 * cambio no es de grado: 15 minutos es un bache y "hasta mañana" deja a alguien
 * sin trabajar el resto del día.
 *
 * ── "Hasta el día siguiente" = medianoche de la clínica ─────────────────────
 *
 * No 24 horas. Si alguien se traba a las 9 de la mañana, 24 horas lo dejan
 * afuera TAMBIÉN la mañana siguiente — dos jornadas por un error. Medianoche
 * cumple lo que la frase promete: mañana podés entrar.
 *
 * Y es medianoche en `America/Denver`, no UTC. Con UTC el candado se levanta a
 * las 18:00 hora local, o sea en mitad de la tarde del MISMO día: no sería
 * "hasta el día siguiente" en ningún sentido útil.
 *
 * ── ⚠️ No hay forma de desbloquear a mano ───────────────────────────────────
 *
 * Verificado el 2026-10-03: no existe pantalla ni endpoint que levante el
 * candado. La única salida es que pase la medianoche. Con 15 minutos eso era
 * tolerable; con esta política, alguien que se traba a las 8 de la mañana no
 * trabaja en todo el día salvo que alguien le edite la base a mano.
 *
 * Por eso `recordSuccessfulLogin` —que ya limpiaba el contador— se vuelve la
 * salida real: el camino de "olvidé mi contraseña" termina en un login
 * correcto, y eso levanta el candado. Está dicho acá porque es la pieza que
 * hace operable a la política, no un detalle.
 */

import type { PrismaClient } from '@precision-medical/database';
import { writeAuditLog } from '@precision-medical/database';

const MAX_ATTEMPTS = 3;

/** La clínica está en Denver. El candado se mide en SU calendario, no en UTC. */
const ZONA_CLINICA = 'America/Denver';

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

export interface LockoutStatus {
  locked: boolean;
  lockedUntil?: Date;
  remainingMs?: number;
}

export async function checkLockout(
  db: PrismaClient,
  email: string,
): Promise<LockoutStatus> {
  const user = await db.user.findUnique({
    where: { email },
    select: { lockedUntil: true },
  });

  if (!user?.lockedUntil) return { locked: false };

  const now = new Date();
  if (user.lockedUntil > now) {
    return {
      locked: true,
      lockedUntil: user.lockedUntil,
      remainingMs: user.lockedUntil.getTime() - now.getTime(),
    };
  }

  // Lock expired — clear it silently
  await db.user.update({
    where: { email },
    data: { lockedUntil: null },
  });
  return { locked: false };
}

export async function recordFailedAttempt(
  db: PrismaClient,
  email: string,
  ipAddress?: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, failedLoginAttempts: true },
  });

  if (!user) return; // Unknown email — don't leak existence

  const newCount = user.failedLoginAttempts + 1;
  const shouldLock = newCount >= MAX_ATTEMPTS;
  // Sin escala progresiva: al tercer fallo se cierra hasta mañana, sea la
  // primera vez o la quinta. La escala existía para que el primer tropiezo
  // costara poco; con "hasta mañana" ya no hay nada que graduar.
  const lockedUntil = shouldLock ? proximaMedianocheClinica(new Date()) : null;

  await db.user.update({
    where: { email },
    data: {
      failedLoginAttempts: newCount,
      lastFailedAttemptAt: new Date(),
      ...(shouldLock && { lockedUntil }),
    },
  });

  await writeAuditLog(db, {
    actorType:   'HUMAN_USER',
    actorUserId: user.id,
    action:      shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
    entityType:  'user',
    entityId:    user.id,
    ipAddress,
    metadata: {
      failedAttempts: newCount,
      ...(shouldLock && { lockedUntil: lockedUntil?.toISOString() }),
    },
  });
}

export async function recordSuccessfulLogin(
  db: PrismaClient,
  email: string,
  ipAddress?: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return;

  await db.user.update({
    where: { email },
    data: {
      failedLoginAttempts: 0,
      lockedUntil:         null,
      lastFailedAttemptAt: null,
      lastLoginAt:         new Date(),
      lastLoginIp:         ipAddress ?? null,
    },
  });

  await writeAuditLog(db, {
    actorType:   'HUMAN_USER',
    actorUserId: user.id,
    action:      'LOGIN_SUCCESS',
    entityType:  'user',
    entityId:    user.id,
    ipAddress,
  });
}
