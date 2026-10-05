import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { leerSeguridad } from './datos';
import { SeguridadClient } from './seguridad-client';

/**
 * Admin → Security Center (2026-10-05).
 *
 * ── Por qué SOLO super_admin ───────────────────────────────────────────────
 *
 * Esta pantalla no muestra únicamente quién ataca: muestra **dónde estamos
 * flojos** — qué app no tiene cabeceras, cuántas cuentas no tienen segundo
 * factor, cuáles entran sin estar activas. Leída al revés, esa lista es un plan
 * de ataque. Por eso el permiso es aparte de `configuracion` y más cerrado que
 * el resto del Admin: ni siquiera los `admin` entran.
 *
 * El guardia va acá Y en `permissions.ts`: el menú esconde el enlace, pero
 * escribir la URL a mano tiene que chocar contra algo real. Sin esto, esconder
 * el ítem sería decoración (ver `feedback-no-esconder-la-accion-bloqueada`).
 *
 * ── Por qué en inglés ──────────────────────────────────────────────────────
 *
 * Erick, 2026-10-03: las vistas de seguridad hablan inglés, igual que los
 * logins. Los textos están en el componente y no en `messages/`, como ya hace
 * la pantalla de login del Admin.
 */
export async function generateMetadata() {
  return { title: 'Security Center' };
}

export const dynamic = 'force-dynamic';

export default async function SeguridadPage(): Promise<React.ReactElement> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const { data } = await createAdminClient()
    .from('users').select('role').eq('email', user.email).single();
  if (data?.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const datos = await leerSeguridad();
  return <SeguridadClient datos={datos} />;
}
