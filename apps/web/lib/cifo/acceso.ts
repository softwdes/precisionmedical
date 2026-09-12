import { cache } from 'react';
import { getCurrentUserRole } from '@/lib/auth/get-role';
import type { Role } from '@/lib/permissions';

/**
 * ¿Quién puede preguntarle a CIFO en el Admin?
 *
 * ── Por qué acá el candado es por ROL y no la regla de la clínica ───────────
 *
 * En el back-office CIFO es **opt-out**: se ve salvo que la ficha diga `false`.
 * Esa regla es razonable allá, donde el agente contesta sobre citas y códigos de
 * caso, sin un solo nombre de paciente, y lo usan las doce personas de la
 * clínica.
 *
 * Acá contesta sobre **sueldos, bonos, pagos a freelancers, cajas y billeteras**.
 * Copiar el opt-out significaría que cualquiera con ficha en el Admin puede
 * preguntar cuánto cobra cada empleado. Así que es al revés: **lista blanca de
 * roles, y nada más**.
 *
 * Es exactamente el agujero que encontramos el 2026-09-11 del otro lado: la
 * regla se volvió opt-out por buenas razones y abrió una puerta en una ruta que
 * nadie había mapeado. Acá se elige la regla estricta desde el principio.
 */
const ROLES_CON_CIFO: readonly Role[] = ['super_admin', 'admin'];

/**
 * Memorizado por request: lo consultan la página (para dibujar o no la caja) y
 * la ruta (para cerrarse), y detrás hay una resolución de sesión.
 */
export const puedePreguntarACifo = cache(async (): Promise<boolean> => {
  const rol = await getCurrentUserRole();
  return ROLES_CON_CIFO.includes(rol);
});
