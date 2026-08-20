/**
 * B.25 — Detalle de caso para Brunella (Billing)
 * Ruta: /billing/[caseId]
 */

import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { db }       from '@precision-medical/database';
import { BillingDetailClient } from './billing-detail-client';

interface Props {
  params: Promise<{ caseId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { caseId } = await params;
  const c = await db.case.findUnique({ where: { id: caseId }, select: { caseCode: true } });
  const t = await getTranslations('phoenix.pageTitles');
  return { title: c ? `${c.caseCode} · ${t('billing')}` : t('case') };
}

export default async function BillingDetailPage({ params }: Props) {
  const { caseId } = await params;

  const exists = await db.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!exists) notFound();

  return <BillingDetailClient caseId={caseId} />;
}
