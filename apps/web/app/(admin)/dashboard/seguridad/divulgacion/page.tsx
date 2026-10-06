import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { leerDivulgacion } from './datos';
import { DivulgacionClient } from './divulgacion-client';

/**
 * Admin → Seguridad → Registro de divulgación (2026-10-06).
 *
 * Quién de los nuestros miró la ficha, la foto, la cobranza o la bandeja de
 * otro. Es lo primero que pide un auditor de HIPAA y es lo único de todo el
 * bloque de seguridad que lee la base **clínica** en vez de la del Admin.
 *
 * ── Por qué `super_admin` y nada más ──────────────────────────────────────
 *
 * Porque la pantalla MUESTRA PHI: nombres de pacientes junto a quién los miró.
 * Un registro de divulgación sin decir de quién no sirve, así que no hay forma
 * de anonimizarlo sin inutilizarlo. Entonces se cierra el acceso en vez de
 * recortar el dato.
 *
 * Abrir esta pantalla es, en sí mismo, acceder a PHI. Vale la pena tenerlo
 * presente antes de darle el permiso a alguien más.
 */
export async function generateMetadata() {
  return { title: 'Disclosure log' };
}

export const dynamic = 'force-dynamic';

const VENTANAS = [1, 7, 30] as const;

export default async function DivulgacionPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const { data } = await createAdminClient()
    .from('users').select('role').eq('email', user.email).single();
  if (data?.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const pedido = Number((await searchParams).dias);
  const dias = (VENTANAS as readonly number[]).includes(pedido) ? pedido : 7;

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86_400_000);

  const datos = await leerDivulgacion(desde.toISOString(), hasta.toISOString());
  return <DivulgacionClient datos={datos} dias={dias} />;
}
