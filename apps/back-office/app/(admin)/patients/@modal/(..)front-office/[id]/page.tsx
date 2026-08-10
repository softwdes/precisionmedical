import { notFound } from 'next/navigation';
import { getCaseDetailData } from '@/lib/case-detail-data';
import { CaseDetailModal } from '@/components/cases/case-detail-modal';

/**
 * Intercepción de /front-office/[id] al navegar desde Pacientes: el detalle
 * del caso se abre como modal sobre la lista. Misma carga que la página
 * completa (lib/case-detail-data.ts).
 */
export default async function CaseDetailModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;

  const data = await getCaseDetailData(id);
  if (!data) notFound();

  return <CaseDetailModal caseInfo={data.caseInfo} auditEvents={data.auditEvents} />;
}
