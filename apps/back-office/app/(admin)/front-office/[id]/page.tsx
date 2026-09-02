import { notFound } from 'next/navigation';
import { getCaseDetailData } from '@/lib/case-detail-data';
import { CaseDetailClient } from './case-detail-client';
import { parseCaseTab } from '@/lib/case-tabs';

// Front Office · Detalle del caso (página completa)
// La carga vive en lib/case-detail-data.ts — compartida con el modal
// interceptado desde Pacientes y con la vista del doctor.

interface PageProps {
  params: Promise<{ id: string }>;
  // `?tab=` abre directo en ese tab. Va también acá y no solo en el modal para
  // que un refresh sobre la URL interceptada aterrice en el mismo lugar.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CaseDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab } = await searchParams;

  const data = await getCaseDetailData(id);
  if (!data) notFound();

  return (
    <CaseDetailClient
      caseInfo={data.caseInfo}
      auditEvents={data.auditEvents}
      currentUserId={data.currentUserId}
      initialTab={parseCaseTab(tab)}
    />
  );
}
