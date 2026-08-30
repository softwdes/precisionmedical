/**
 * B.14 — Check-in del día (Admisión · Recepción)
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CaseUrlModal } from '@/components/cases/case-url-modal';
import { AdmissionClient } from './admission-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.nav');
  return { title: t('admission') };
}

export default async function AdmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; tab?: string }>;
}) {
  const { case: caseId, tab } = await searchParams;
  return (
    <>
      <AdmissionClient />
      {/* Cobrar una penalidad abre el caso en Finanzas SOBRE esta URL: recargar
          vuelve a Admisión con el caso encima, no a la página del caso. Mismo
          patrón que el calendario y Mensajes. */}
      <CaseUrlModal caseId={caseId} tab={tab} />
    </>
  );
}
