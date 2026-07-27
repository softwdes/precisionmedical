/**
 * Portal Médico · Mis Pacientes (D2)
 *
 * Reúsa la lista de pacientes B.4 (PatientsData/PatientsClient) con
 * scopeProviderId: solo pacientes con al menos una cita del doctor de sesión.
 * Acciones administrativas (crear, archivar, enviar portal) ocultas.
 */

import { Suspense } from 'react';
import { PatientsData, PatientsTableSkeleton } from '@/app/(admin)/patients/patients-data';
import { getSessionProvider } from '@/lib/get-session-provider';

export const metadata = { title: 'Mis Pacientes · Portal Médico' };

export default async function DoctorPatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; showInactive?: string; size?: string }>;
}) {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const { q, page: pageParam, showInactive, size: sizeParam } = await searchParams;
  const page = Math.max(0, parseInt(pageParam ?? '0', 10) || 0);
  const inactiveOnly = showInactive === '1';
  const PAGE_SIZE = Math.min(50, Math.max(5, parseInt(sizeParam ?? '15', 10) || 15));

  return (
    <div className="p-0 sm:p-2">
      <Suspense fallback={<PatientsTableSkeleton />}>
        <PatientsData
          q={q}
          page={page}
          inactiveOnly={inactiveOnly}
          PAGE_SIZE={PAGE_SIZE}
          scopeProviderId={provider.id}
          basePath="/doctor/patients"
        />
      </Suspense>
    </div>
  );
}
