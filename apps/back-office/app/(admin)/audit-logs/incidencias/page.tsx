/**
 * Incidencias del equipo — lo que cada persona tiene por corregir y lo que ya corrigió.
 *
 * Vive junto al visor de auditoría (`/audit-logs`), que el middleware cierra con el módulo `settings`
 * y solo la ve quien administra. Los datos salen de `/api/admin/pendientes-equipo`,
 * que además vuelve a mirar el rol de la sesión.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { IncidenciasEquipoClient } from '@/components/pendientes/incidencias-equipo-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('incidencias') };
}

export default function IncidenciasPage(): React.ReactElement {
  return <IncidenciasEquipoClient />;
}
