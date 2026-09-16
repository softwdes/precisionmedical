/**
 * Cobranzas — la cola del encargado de cobranza.
 *
 * Server component: delega el render a CobranzasClient, que pagina y busca
 * contra `/api/admin/cobranzas`.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CobranzasClient } from './cobranzas-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('collections') };
}

export default function CobranzasPage() {
  return <CobranzasClient />;
}
