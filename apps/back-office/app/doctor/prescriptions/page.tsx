/**
 * Portal Médico · Recetas
 *
 * Bandeja de recetas de ScriptSure a nivel practice: renovaciones que pide la
 * farmacia, cola de aprobación, cambios, anulaciones y errores de envío.
 *
 * Vive fuera de la consulta a propósito — nada de esto cuelga de una cita. Un
 * rechazo de farmacia llega horas después de que el paciente se fue, y hasta
 * ahora no había ningún lugar donde verlo.
 */

import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionProvider } from '@/lib/get-session-provider';
import { getSessionUser } from '@/lib/session';
import { PrescriptionsClient } from './prescriptions-client';

export const metadata = { title: 'Recetas · Portal Médico' };

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

export default async function DoctorPrescriptionsPage(): Promise<React.ReactElement> {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  // Solo para decidir si se dibuja la pestaña de configuración. El permiso real
  // lo aplica la ruta del widget, que responde 403 a quien no sea admin.
  const user = await getSessionUser();
  const role = user?.email ? await fetchDbRole(user.email) : null;

  return <PrescriptionsClient isAdmin={!!role && ADMIN_ROLES.has(role)} />;
}
