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

/** Roles que NO tienen back-office: su única casa es el portal medico. */
export const PORTAL_ONLY_ROLES = new Set(['DOCTOR', 'PROVIDER']);

/**
 * Rol de la base Admin, memorizado por request. Detrás hay una llamada de red
 * (~180ms): la consultan `canViewAsDoctor` y el layout, y antes cada uno pagaba
 * la suya.
 */
const getRole = cache(async (email: string): Promise<string> => fetchDbRole(email));

/**
 * Rol de la sesión actual, o null si no hay sesión.
 *
 * Sale de `roles_config` en la base **Admin** — la MISMA fuente que consulta el
 * middleware. Es a propósito: `users.role` de Phoenix se provisiona desde el
 * directorio y casi siempre coincide, pero cuando no, quien manda es la que
 * gobierna el ruteo. Una API que decide alcance por rol tiene que estar de
 * acuerdo con el portero, no con una copia.
 *
 * Comparte el `cache()` de `getRole`, así que en un request que ya resolvió
 * `canViewAsDoctor` o `getSessionProvider` no cuesta una llamada más.
 */
export const getSessionRole = cache(async (): Promise<string | null> => {
  const user = await getSessionUser();
  if (!user?.email) return null;
  return getRole(user.email);
});

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
  const role = await getRole(email);
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

  // 1. Si eligió ver como otro doctor, eso gana — incluso si tiene perfil
  //    propio. Antes el perfil propio cortaba acá y el selector quedaba muerto:
  //    en cuanto un admin tiene ficha de doctor (los testers de QA, por ejemplo)
  //    perdía la única forma de revisar el portal de los demás. La capacidad
  //    sigue siendo opt-in y no se toca: sin `canViewAsDoctor` la cookie se
  //    ignora, así que un doctor común no puede suplantar a otro poniéndola.
  const selectedId = (await cookies()).get(DOCTOR_VIEW_COOKIE)?.value;
  if (selectedId && await canViewAsDoctor(user.email)) {
    const elegido = await db.provider.findFirst({
      where: { id: selectedId, deletedAt: null },
      select: PROVIDER_FIELDS,
    });
    if (elegido) return elegido;
  }

  // 2. Su propio perfil de doctor
  const own = await getOwnProvider(user.email);
  if (own) return own;

  return null;
});

/**
 * Perfil propio del usuario, IGNORANDO la cookie de "ver como otro".
 *
 * Existe porque `pm_doctor_view` es pegajosa: se pone una vez en el selector del
 * portal y sigue viva en todas las pantallas. Fuera del portal eso no es "ver
 * como", es contaminación — un admin que alguna vez revisó el portal del Dr. X
 * quedaba, en el DETALLE DEL CASO, atado a las citas del Dr. X. El botón de
 * imprimir la nota le tiraba 404 (pestaña nueva con error) para toda nota de
 * otro doctor, y el de imprimir la orden de laboratorio le dejaba el iframe en
 * blanco, sin decir nada.
 *
 * Regla: la suplantación vale SOLO dentro de `/doctor/*`. Todo lo que se abra
 * desde una pantalla administrativa usa esta función, no `getSessionProvider`.
 */
export const getOwnSessionProvider = cache(async (): Promise<SessionProvider | null> => {
  const user = await getSessionUser();
  if (!user?.email) return null;
  return getOwnProvider(user.email);
});

export interface DoctorViewInfo {
  /** true cuando lo que se está viendo es el portal de OTRO doctor */
  isViewAs: boolean;
  /** Doctores entre los que puede elegir (vacío si no tiene la capacidad) */
  options: Array<{ id: string; firstName: string; lastName: string; specialty: string }>;
  /** true si además tiene ficha propia — habilita "volver a mi portal" */
  hasOwnProfile: boolean;
  /**
   * true si tiene la capacidad de elegir doctor, esté o no suplantando a alguien.
   *
   * Va aparte de `isViewAs` porque son preguntas distintas: `isViewAs` es "lo que
   * veo ahora es de otro", y esto es "puedo cambiar de doctor". Un tester con
   * ficha propia arrancaba con las dos en false y quedaba encerrado en su propio
   * portal, sin forma de abrir el del médico que sí está dado de alta en DAW.
   */
  canSelect: boolean;
  /**
   * true si tiene back-office al que volver. Un rol DOCTOR/PROVIDER no: el
   * middleware lo devuelve a /doctor, así que el botón sería un callejón.
   */
  canReturnToAdmin: boolean;
}

/**
 * Contexto para el selector del encabezado. Va aparte de `getSessionProvider`
 * para no cambiar la firma que ya consumen todas las páginas del portal.
 *
 * `isViewAs` mira la COOKIE, no la ausencia de ficha propia: quien tiene las dos
 * cosas (ficha de doctor y permiso de admin) alterna entre su portal y el de
 * otro, así que "estoy viendo a un ajeno" solo lo dice la selección vigente.
 */
export const getDoctorViewInfo = cache(async (): Promise<DoctorViewInfo> => {
  const user = await getSessionUser();
  const vacio: DoctorViewInfo = {
    isViewAs: false, options: [], hasOwnProfile: false, canSelect: false, canReturnToAdmin: false,
  };
  if (!user?.email) return vacio;

  const own = await getOwnProvider(user.email);
  if (!(await canViewAsDoctor(user.email))) {
    return { ...vacio, hasOwnProfile: !!own };
  }

  const canReturnToAdmin = !PORTAL_ONLY_ROLES.has(await getRole(user.email));

  const selectedId = (await cookies()).get(DOCTOR_VIEW_COOKIE)?.value;

  const options = await db.provider.findMany({
    where: { deletedAt: null },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, specialty: true },
  });

  // Elegirse a sí mismo no es "ver como otro"
  const viendoAjeno = !!selectedId && selectedId !== own?.id;

  return { isViewAs: viendoAjeno, options, hasOwnProfile: !!own, canSelect: true, canReturnToAdmin };
});
