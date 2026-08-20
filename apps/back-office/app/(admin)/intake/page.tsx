/**
 * B.12 — Bandeja de Edson (Intake Specialist)
 *
 * Server component: no pre-fetches los casos (se cargan client-side para
 * poder filtrar/refrescar sin full page reload).
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { IntakeClient } from './intake-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('edsonInbox') };
}

export default function IntakePage() {
  return <IntakeClient />;
}
