/**
 * B.25 — Bandeja de Brunella (Billing & Finance)
 * Server component: delegates rendering to BillingClient.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BillingClient } from './billing-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('billing') };
}

export default function BillingPage() {
  return <BillingClient />;
}
