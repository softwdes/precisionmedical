import { notFound } from 'next/navigation';
import { getSessionProvider } from '@/lib/get-session-provider';
import { getCaseDetailData, providerHasCase } from '@/lib/case-detail-data';
import { CaseDetailClient } from '@/app/(admin)/front-office/[id]/case-detail-client';
import { parseCaseTab } from '@/lib/case-tabs';

/**
 * Portal Médico · Detalle del caso (página completa).
 *
 * El doctor ve LO MISMO que la clínica — con una diferencia: en Finanzas solo
 * el summary (pagó/no pagó/saldo), sin acciones de cobro; el cobro es del
 * asistente. Solo puede abrir casos donde tiene al menos una cita.
 * Desde Mis Pacientes esta ruta se intercepta y se muestra como modal.
 */

export const metadata = { title: 'Caso · Portal Médico' };

export default async function DoctorCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const { id } = await params;
  const { tab } = await searchParams;

  if (!(await providerHasCase(provider.id, id))) notFound();

  const data = await getCaseDetailData(id);
  if (!data) notFound();

  return (
    <CaseDetailClient
      caseInfo={data.caseInfo}
      auditEvents={data.auditEvents}
      variant="doctor"
      initialTab={parseCaseTab(tab)}
    />
  );
}
