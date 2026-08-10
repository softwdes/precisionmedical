/**
 * Resolución del actor para el audit log — Fase 1 de métricas por empleado.
 *
 * `actorFromHeaders()` lee `x-actor-user-id`, un header que solo mandan los
 * hooks del AI Receptionist. El front del back-office nunca lo manda, así que
 * 59 de 66 rutas escribían `actorUserId: null` y el audit log no sabía QUIÉN
 * hizo cada cosa. Este helper mantiene el contrato de headers (AI/SYSTEM
 * declaran su identidad y se respeta) y cae a la sesión de Supabase para
 * humanos: email → users.id (cuid de Phoenix, el FK que espera AuditLog).
 *
 * Drop-in del patrón viejo:
 *   const actor = actorFromHeaders(req.headers)   →  const actor = await resolveActor(req.headers)
 *   ...actorFromHeaders(req.headers)              →  ...(await resolveActor(req.headers))
 * El spread ya incluye actorType/actorUserId/actorRole/ipAddress/userAgent/
 * idempotencyKey, exactamente los campos que consume writeAuditLog.
 */

import { cache } from 'react';
import { db, actorFromHeaders, type ActorType, type UserRole } from '@precision-medical/database';
import { fetchDirectoryUser } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';

export interface ResolvedActor {
  actorType: ActorType;
  actorUserId: string | null;
  actorRole: UserRole | null;
  /** "Nombre Apellido" del usuario; email como fallback. Para snapshots tipo `chargedByName`. */
  actorName: string | null;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string | null;
}

/**
 * users.id/role/nombre por email, UNA vez por request (mismo criterio que
 * getSessionUser: cache() de React memoiza dentro del render/handler).
 */
export const getDbUserByEmail = cache(async (email: string) => {
  const existing = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, role: true, firstName: true, lastName: true },
  });
  if (existing) return existing;
  return provisionFromDirectory(email);
});

/** Roles del directorio que la app conoce — cualquier otro no se provisiona. */
const KNOWN_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'EMPLOYEE', 'FRONT_DESK',
  'DOCTOR', 'LAWYER', 'PROVIDER', 'AUDITOR_AI',
];

/**
 * Provisión al vuelo: el usuario autenticó (existe en el directorio Admin) pero
 * no tenía fila en Phoenix, así que la app no lo reconocía — mensajería le
 * devolvía 401 y su actividad no quedaba registrada en ninguna parte.
 *
 * Se crea con id cuid propio de Phoenix (NUNCA el UUID de Supabase Auth: es la
 * trampa que ya nos costó `CallLog.agentUserId`) y sin passwordHash, porque la
 * autenticación sigue viviendo en el directorio Admin.
 *
 * Sin esto, cada usuario nuevo que crea RRHH queda invisible para la app hasta
 * que alguien recuerde correr un script de sincronización.
 */
async function provisionFromDirectory(email: string) {
  const dir = await fetchDirectoryUser(email);
  if (!dir || dir.status !== 'ACTIVE') return null;
  if (!KNOWN_ROLES.includes(dir.role as UserRole)) return null;

  try {
    return await db.user.create({
      data: {
        email: dir.email,
        firstName: dir.firstName || dir.email.split('@')[0]!,
        lastName: dir.lastName || '',
        role: dir.role as UserRole,
        status: 'ACTIVE',
      },
      select: { id: true, role: true, firstName: true, lastName: true },
    });
  } catch {
    // Carrera entre dos requests del mismo usuario (email es @unique): el otro
    // ya la creó, así que se relee en vez de fallar.
    return db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, role: true, firstName: true, lastName: true },
    });
  }
}

export async function resolveActor(headers: Headers): Promise<ResolvedActor> {
  const fromHeaders = actorFromHeaders(headers);

  // AI_AGENT / SYSTEM (o un caller que ya declaró su user id) — el header manda.
  if (fromHeaders.actorType !== 'HUMAN_USER' || fromHeaders.actorUserId) {
    return { ...fromHeaders, actorRole: null, actorName: null, email: null };
  }

  const user = await getSessionUser();
  if (!user?.email) {
    return { ...fromHeaders, actorRole: null, actorName: null, email: null };
  }

  const dbUser = await getDbUserByEmail(user.email);
  const actorName =
    `${dbUser?.firstName ?? ''} ${dbUser?.lastName ?? ''}`.trim() || user.email;

  return {
    ...fromHeaders,
    actorUserId: dbUser?.id ?? null,
    actorRole: dbUser?.role ?? null,
    actorName,
    email: user.email,
  };
}
