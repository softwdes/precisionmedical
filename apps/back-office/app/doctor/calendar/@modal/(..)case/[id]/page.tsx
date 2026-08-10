import { notFound } from 'next/navigation';
import { getSessionProvider } from '@/lib/get-session-provider';
import { getCaseDetailData, providerHasCase } from '@/lib/case-detail-data';
import { parseCaseTab } from '@/lib/case-tabs';
import { CaseDetailModal } from '@/components/cases/case-detail-modal';

/**
 * Intercepción de /doctor/case/[id] al navegar desde Mi Calendario: el caso se
 * abre como modal sobre el calendario. Mismas reglas que la página completa del
 * doctor (solo casos con cita suya · Finanzas en solo lectura).
 */
export default async function DoctorCaseModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const provider = await getSessionProvider();
  if (!provider) return <></>;

  const { id } = await params;
  const { tab } = await searchParams;

  if (!(await providerHasCase(provider.id, id))) notFound();

  const data = await getCaseDetailData(id);
  if (!data) notFound();

  return (
    <CaseDetailModal
      caseInfo={data.caseInfo}
      auditEvents={data.auditEvents}
      variant="doctor"
      initialTab={parseCaseTab(tab)}
    />
  );
}
