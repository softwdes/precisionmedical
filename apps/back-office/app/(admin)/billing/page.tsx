/**
 * B.25 — Bandeja de Brunella (Billing & Finance)
 * Server component: delegates rendering to BillingClient.
 */

import { BillingClient } from './billing-client';

export const metadata = { title: 'Billing · Brunella · LienMaster' };

export default function BillingPage() {
  return <BillingClient />;
}
