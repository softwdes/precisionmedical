import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getSessionProvider } from '@/lib/get-session-provider';
import { getCaseDetailData } from '@/lib/case-detail-data';
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('case') };
}

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

  /**
   * Sin recorte por provider desde 2026-09-16: el portal abre el caso de
   * cualquier paciente de la clínica, igual que el back-office. La puerta que
   * queda es la de la sesión —haber entrado al portal— y la sigue cuidando el
   * middleware. Ver `checkPatientAccess` y `CaseUrlModal`.
   */
  const data = await getCaseDetailData(id);
  if (!data) notFound();

  return (
    <CaseDetailClient
      caseInfo={data.caseInfo}
      auditEvents={data.auditEvents}
      currentUserId={data.currentUserId}
      variant="doctor"
      initialTab={parseCaseTab(tab)}
    />
  );
}
