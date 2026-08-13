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

import { getSessionProvider } from '@/lib/get-session-provider';
import { PrescriptionsClient } from './prescriptions-client';

export const metadata = { title: 'Recetas · Portal Médico' };

export default async function DoctorPrescriptionsPage(): Promise<React.ReactElement> {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  return <PrescriptionsClient />;
}
