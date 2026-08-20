/**
 * B.13 — Detalle de verificación de un caso (Edson)
 */

import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { db }       from '@precision-medical/database';
import { IntakeDetailClient } from './intake-detail-client';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const c = await db.case.findUnique({ where: { id }, select: { caseCode: true } });
  const t = await getTranslations('phoenix.pageTitles');
  return { title: c ? `${c.caseCode} · ${t('verification')}` : t('case') };
}

export default async function IntakeDetailPage({ params }: Props) {
  const { id } = await params;

  // Verificar que existe
  const exists = await db.case.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();

  return <IntakeDetailClient caseId={id} />;
}
