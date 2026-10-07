/**
 * Mis pendientes de corrección — lo que la persona creó y hoy conviene arreglar.
 *
 * Los datos salen de `/api/pendientes/mios`, que devuelve solo lo de quien
 * pregunta. Plan: docs/plan-mis-pendientes.html.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MisPendientesClient } from '@/components/pendientes/mis-pendientes-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('pendientes') };
}

export default function MisPendientesPage(): React.ReactElement {
  return <MisPendientesClient />;
}
