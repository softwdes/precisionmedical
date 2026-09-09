import { cache } from 'react';
import { fetchDbRole, fetchUserClinicModules } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';
import { SENTINEL_MODULE } from './sentinel-module';

export { SENTINEL_MODULE };

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

/**
 * ¿Puede esta persona preguntarle a Sentinel?
 *
 * SUPER_ADMIN y ADMIN la tienen por rol. Cualquier otra cuenta la recibe POR
 * PERSONA, marcando la capacidad en su ficha del admin, que la guarda en
 * `users.clinicModules.sentinel`.
 *
 * Es OPT-IN — ver `sentinel-module.ts`. El dashboard lo cruzan las 12 personas
 * que entran al back-office, y Sentinel contesta sobre saldos, notas pendientes
 * y el padrón completo por código de caso: no puede caer de la regla "se ve
 * salvo false" que gobierna los menús.
 *
 * Memorizado por request: lo consultan la página (para dibujar o no la caja) y
 * la ruta (para cerrarse), y detrás hay dos llamadas de red al proyecto Admin.
 */
export const canAskSentinel = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user?.email) return false;
  return canAskSentinelFor(user.email);
});

/** La misma pregunta cuando el email ya se resolvió — evita repetir la sesión. */
export const canAskSentinelFor = cache(async (email: string): Promise<boolean> => {
  const role = await fetchDbRole(email);
  if (ADMIN_ROLES.has(role)) return true;

  const modules = await fetchUserClinicModules(email);
  return modules?.[SENTINEL_MODULE] === true;
});
