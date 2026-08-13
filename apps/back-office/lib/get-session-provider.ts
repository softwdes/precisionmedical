import { cache } from 'react';
import { cookies } from 'next/headers';
import { db } from '@precision-medical/database';
import { fetchDbRole, fetchUserClinicModules } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';
import { DOCTOR_VIEW_MODULE } from './doctor-view-module';

export { DOCTOR_VIEW_MODULE };

/**
 * Resuelve el Provider (doctor) de la sesión actual.
 *
 * Puente por EMAIL: la sesión puede vivir en el proyecto Admin (login unificado)
 * mientras el Provider vive en la base Phoenix — el email corporativo (sincronizado
 * desde HR) es la llave común. Devuelve null si no hay sesión o no hay perfil.
 *
 * Modo "ver como": quien no tiene perfil de doctor propio pero sí la capacidad
 * (ver `canViewAsDoctor`) elige un médico con el selector del encabezado, y la
 * elección vive en la cookie `pm_doctor_view`. Así el portal se ve tal como lo ve
 * ese doctor, sin inventar citas ni tocar su cuenta.
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

/**
 * ¿Puede este usuario abrir el portal de OTRO médico ("ver como")?
 *
 * SUPER_ADMIN y ADMIN la tienen por rol (soporte, demos). Cualquier otra cuenta
 * la recibe por persona, marcando "Portal Médico" en su ficha del admin, que la
 * guarda en `users.clinicModules.doctor`. Es opt-in — ver `DOCTOR_VIEW_MODULE`.
 *
 * Memorizado por request: el layout, el selector y cada página del portal la
 * consultan, y detrás hay dos fetch al proyecto Admin.
 */
export const canViewAsDoctor = cache(async (email: string): Promise<boolean> => {
  const role = await fetchDbRole(email);
  if (ADMIN_ROLES.has(role)) return true;

  const modules = await fetchUserClinicModules(email);
  return modules?.[DOCTOR_VIEW_MODULE] === true;
});

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

  // 2. Modo "ver como": el doctor elegido en la cookie
  if (!(await canViewAsDoctor(user.email))) return null;

  const selectedId = (await cookies()).get(DOCTOR_VIEW_COOKIE)?.value;
  if (!selectedId) return null;

  return db.provider.findFirst({
    where: { id: selectedId, deletedAt: null },
    select: PROVIDER_FIELDS,
  });
});

export interface DoctorViewInfo {
  /** true si quien mira no tiene perfil propio y entra en modo "ver como" */
  isViewAs: boolean;
  /** Doctores entre los que puede elegir (solo se llena en modo "ver como") */
  options: Array<{ id: string; firstName: string; lastName: string; specialty: string }>;
}

/**
 * Contexto para el selector del encabezado. Va aparte de `getSessionProvider`
 * para no cambiar la firma que ya consumen todas las páginas del portal.
 */
export const getDoctorViewInfo = cache(async (): Promise<DoctorViewInfo> => {
  const user = await getSessionUser();
  if (!user?.email) return { isViewAs: false, options: [] };

  const own = await getOwnProvider(user.email);
  if (own) return { isViewAs: false, options: [] };

  if (!(await canViewAsDoctor(user.email))) return { isViewAs: false, options: [] };

  const options = await db.provider.findMany({
    where: { deletedAt: null },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, specialty: true },
  });

  return { isViewAs: true, options };
});
