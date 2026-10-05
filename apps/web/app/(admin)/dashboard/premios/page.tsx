import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { ModuleTabs } from '@/components/module-tabs';
import { api } from '@/lib/trpc/server';
import { PremiosClient, type PremiosTab } from './premios-client';

/**
 * Admin → Premios del Staff (2026-09-29).
 *
 * Solo SUPER_ADMIN / ADMIN: son montos de nómina. El router ya exige lo mismo
 * (`adminProcedure`), pero la página también, para que un rol sin permiso no
 * vea la pantalla vacía con errores en vez de un redirect.
 */
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('nav.rewards') };
}

async function esAdmin(): Promise<boolean> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return false;
  const { data } = await createAdminClient().from('users').select('role').eq('email', user.email).single();
  return data?.role === 'SUPER_ADMIN' || data?.role === 'ADMIN';
}

/** El mes de la clínica que corre hoy, `YYYY-MM`. */
function mesActual(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit' })
    .format(new Date()).slice(0, 7);
}

/**
 * Verificar ya no va en las pestañas: las metas son automáticas (Erick, 2026-09-29)
 * y no hay registros manuales que aprobar uno por uno. La vista sigue por URL
 * para los registros viejos; a fin de mes se aprueba con el reporte del Tablero.
 */
const TABS: PremiosTab[] = ['mes', 'carrera', 'tablero'];
const TODAS: PremiosTab[] = ['mes', 'carrera', 'verificar', 'tablero'];

export default async function PremiosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  if (!(await esAdmin())) redirect('/dashboard');
  const t = await getTranslations('rewards');
  const params = await searchParams;
  const pedido = typeof params.tab === 'string' ? params.tab : '';
  const tab: PremiosTab = (TODAS as string[]).includes(pedido) ? (pedido as PremiosTab) : 'mes';
  // Sin mes en la URL: el que se está armando (si hay uno abierto posterior) o el actual.
  const mesParam = typeof params.mes === 'string' && /^\d{4}-\d{2}$/.test(params.mes)
    ? params.mes
    : (await api.premios.defaultMonth({ current: mesActual() }).catch(() => ({ month: mesActual() }))).month;

  const tabs = TABS.map((k) => ({
    key: k,
    label: t(`tab.${k}`),
    href: `/dashboard/premios?tab=${k}&mes=${mesParam}`,
  }));

  return (
    <>
      <ModuleTabs tabs={tabs} activeTab={tab} />
      <PremiosClient tab={tab} month={mesParam} />
    </>
  );
}
