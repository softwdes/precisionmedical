/**
 * B.14 — Check-in del día (Admisión · Recepción)
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdmissionClient } from './admission-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.nav');
  return { title: t('admission') };
}

export default function AdmissionPage() {
  return <AdmissionClient />;
}
