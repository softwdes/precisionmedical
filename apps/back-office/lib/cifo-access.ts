import { cache } from 'react';
import { fetchDbRole, fetchUserClinicModules } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';
import { CIFO_MODULE } from './cifo-module';

export { CIFO_MODULE };

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

/**
 * ¿Puede esta persona preguntarle a CIFO?
 *
 * La tiene TODO el back-office desde el 2026-09-10. SUPER_ADMIN y ADMIN por rol;
 * el resto por la regla de los menús — se ve salvo que su ficha del Admin diga
 * `clinicModules.cifo: false`.
 *
 * Ya NO es opt-in — ver `cifo-module.ts` para por qué cambió. El agente trabaja
 * por código de caso y sin nombres de paciente, que es lo que hace que abrirlo
 * a las 12 personas del back-office sea razonable.
 *
 *
 * Memorizado por request: lo consultan la página (para dibujar o no la caja) y
 * la ruta (para cerrarse), y detrás hay dos llamadas de red al proyecto Admin.
 */
export const canAskCifo = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user?.email) return false;
  return canAskCifoFor(user.email);
});

/** La misma pregunta cuando el email ya se resolvió — evita repetir la sesión. */
export const canAskCifoFor = cache(async (email: string): Promise<boolean> => {
  const role = await fetchDbRole(email);
  if (ADMIN_ROLES.has(role)) return true;

  const modules = await fetchUserClinicModules(email);
  return modules?.[CIFO_MODULE] !== false;
});
