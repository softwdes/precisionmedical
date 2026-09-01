import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { fetchDbUserAccess, isBlockedStatus } from '@precision-medical/auth/v2-apps';
import ClockPage from '@/components/ClockPage';

export default async function Page() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  /**
   * Puerta por ESTADO de la cuenta.
   *
   * Va acá y no en el middleware porque el de esta app solo refresca la sesión
   * —no gatea nada— y esta página ES la app entera. Sin esto, alguien dado de
   * baja seguía fichando su jornada.
   *
   * Es una consulta por carga y no se cachea: el reloj se abre una vez por
   * turno, no es una pantalla que se navegue.
   */
  if (user.email && isBlockedStatus((await fetchDbUserAccess(user.email)).status)) {
    redirect('/login?reason=inactive');
  }

  return <ClockPage userId={user.id} />;
}
