import { cache } from 'react';
import { cookies } from 'next/headers';
import { db } from '@precision-medical/database';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';

/**
 * Resuelve el Provider (doctor) de la sesión actual.
 *
 * Puente por EMAIL: la sesión puede vivir en el proyecto Admin (login unificado)
 * mientras el Provider vive en la base Phoenix — el email corporativo (sincronizado
 * desde HR) es la llave común. Devuelve null si no hay sesión o no hay perfil.
 *
 * Modo "ver como" para admins: SUPER_ADMIN/ADMIN no tienen perfil de doctor, pero
 * el middleware los deja entrar al portal (soporte, demos, QA). Para ellos el
 * doctor se elige con un selector en el encabezado y la elección vive en la
 * cookie `pm_doctor_view`. Así el portal se ve tal como lo ve ese doctor, sin
 * inventar citas ni tocar su cuenta.
 */
export interface SessionProvider {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  specialty: string;
  status: string;
  employeeId: string | null;
  /** users.id en la base Phoenix — necesario para favoritos (templates, diagnósticos) */
  userId: string | null;
}

export const DOCTOR_VIEW_COOKIE = 'pm_doctor_view';

const PROVIDER_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  specialty: true,
  status: true,
  employeeId: true,
  userId: true,
} as const;

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

/** Perfil propio del usuario logueado (null si no es doctor). */
const getOwnProvider = cache(async (email: string): Promise<SessionProvider | null> =>
  db.provider.findFirst({
    where: { deletedAt: null, email: { equals: email, mode: 'insensitive' } },
    select: PROVIDER_FIELDS,
  }),
);

/**
 * Memorizado por request: el layout y la página del portal lo llamaban cada uno
 * por su cuenta, duplicando la llamada de Auth y la query del Provider.
 */
export const getSessionProvider = cache(async (): Promise<SessionProvider | null> => {
  const user = await getSessionUser();
  if (!user?.email) return null;

  // 1. Doctor real: su propio perfil
  const own = await getOwnProvider(user.email);
  if (own) return own;

  // 2. Admin en modo "ver como": el doctor elegido en la cookie
  const role = await fetchDbRole(user.email);
  if (!ADMIN_ROLES.has(role)) return null;

  const selectedId = (await cookies()).get(DOCTOR_VIEW_COOKIE)?.value;
  if (!selectedId) return null;

  return db.provider.findFirst({
    where: { id: selectedId, deletedAt: null },
    select: PROVIDER_FIELDS,
  });
});

export interface DoctorViewInfo {
  /** true si quien mira es admin sin perfil propio (modo "ver como") */
  isAdminView: boolean;
  /** Doctores entre los que puede elegir (solo se llena en modo admin) */
  options: Array<{ id: string; firstName: string; lastName: string; specialty: string }>;
}

/**
 * Contexto para el selector del encabezado. Va aparte de `getSessionProvider`
 * para no cambiar la firma que ya consumen todas las páginas del portal.
 */
export const getDoctorViewInfo = cache(async (): Promise<DoctorViewInfo> => {
  const user = await getSessionUser();
  if (!user?.email) return { isAdminView: false, options: [] };

  const own = await getOwnProvider(user.email);
  if (own) return { isAdminView: false, options: [] };

  const role = await fetchDbRole(user.email);
  if (!ADMIN_ROLES.has(role)) return { isAdminView: false, options: [] };

  const options = await db.provider.findMany({
    where: { deletedAt: null },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, specialty: true },
  });

  return { isAdminView: true, options };
});
