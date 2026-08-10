import { notFound } from 'next/navigation';
import { getSessionProvider } from '@/lib/get-session-provider';
import { getCaseDetailData, providerHasCase } from '@/lib/case-detail-data';
import { CaseDetailModal } from '@/components/cases/case-detail-modal';

/**
 * Intercepción de /doctor/case/[id] al navegar desde Mis Pacientes: el caso se
 * abre como modal sobre la lista. Mismas reglas que la página completa del
 * doctor (solo casos con cita suya · Finanzas en solo lectura).
 */
export default async function DoctorCaseModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const provider = await getSessionProvider();
  if (!provider) return <></>;

  const { id } = await params;

  if (!(await providerHasCase(provider.id, id))) notFound();

  const data = await getCaseDetailData(id);
  if (!data) notFound();

  return (
    <CaseDetailModal
      caseInfo={data.caseInfo}
      auditEvents={data.auditEvents}
      variant="doctor"
    />
  );
}
