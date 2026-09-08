import { cache } from 'react';
import { fetchDbRole, fetchUserClinicModules } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';
import { FIRM_REQUESTS_MODULE } from './firm-requests-module';

export { FIRM_REQUESTS_MODULE };

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

/**
 * ¿Puede esta persona ver TODOS los pedidos de los bufetes (quién pidió, a quién
 * le llegó, si respondieron, quién y qué)?
 *
 * SUPER_ADMIN y ADMIN la tienen por rol. Cualquier otra cuenta la recibe POR
 * PERSONA, marcando la casilla en su ficha del admin, que la guarda en
 * `users.clinicModules.firmRequests`. Espejo exacto de `notes-audit-access.ts`.
 *
 * Memorizado por request: lo consultan el layout (menú), la página (puerta) y
 * las rutas de la API.
 */
export const canSeeFirmRequests = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user?.email) return false;
  return canSeeFirmRequestsFor(user.email);
});

export const canSeeFirmRequestsFor = cache(async (email: string): Promise<boolean> => {
  const role = await fetchDbRole(email);
  if (ADMIN_ROLES.has(role)) return true;
  const modules = await fetchUserClinicModules(email);
  return modules?.[FIRM_REQUESTS_MODULE] === true;
});
