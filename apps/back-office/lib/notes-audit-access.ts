import { cache } from 'react';
import { fetchDbRole, fetchUserClinicModules } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';
import { NOTES_AUDIT_MODULE } from './notes-audit-module';

export { NOTES_AUDIT_MODULE };

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

/**
 * ¿Puede esta persona supervisar las notas de todos los providers?
 *
 * SUPER_ADMIN y ADMIN la tienen por rol. Cualquier otra cuenta la recibe POR
 * PERSONA, marcando la capacidad en su ficha del admin, que la guarda en
 * `users.clinicModules.notesAudit`.
 *
 * Es OPT-IN — ver `notes-audit-module.ts`. La pantalla lista al paciente de
 * todos los providers, así que no puede caer de la regla "se ve salvo false"
 * que gobierna los menús: solo cuenta un `true` explícito.
 *
 * Memorizado por request: lo consultan el layout (para el menú) y la propia
 * página (para cerrarse), y detrás hay dos llamadas de red al proyecto Admin.
 */
export const canAuditNotes = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user?.email) return false;
  return canAuditNotesFor(user.email);
});

/** La misma pregunta cuando el email ya se resolvió — evita repetir la sesión. */
export const canAuditNotesFor = cache(async (email: string): Promise<boolean> => {
  const role = await fetchDbRole(email);
  if (ADMIN_ROLES.has(role)) return true;

  const modules = await fetchUserClinicModules(email);
  return modules?.[NOTES_AUDIT_MODULE] === true;
});
