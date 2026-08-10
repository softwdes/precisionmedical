import { notFound } from 'next/navigation';
import { getCaseDetailData } from '@/lib/case-detail-data';
import { parseCaseTab } from '@/lib/case-tabs';
import { CaseDetailModal } from '@/components/cases/case-detail-modal';

/**
 * Intercepción de /front-office/[id] al navegar desde el Calendario: el detalle
 * del caso se abre como modal sobre el calendario. Misma carga que la página
 * completa y que el modal de Pacientes (lib/case-detail-data.ts).
 */
export default async function CaseDetailModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const { tab } = await searchParams;

  const data = await getCaseDetailData(id);
  if (!data) notFound();

  return (
    <CaseDetailModal
      caseInfo={data.caseInfo}
      auditEvents={data.auditEvents}
      initialTab={parseCaseTab(tab)}
    />
  );
}
