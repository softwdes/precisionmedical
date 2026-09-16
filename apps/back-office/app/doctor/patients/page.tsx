/**
 * Portal Médico · Mis Pacientes (D2)
 *
 * Reúsa la lista de pacientes B.4 (PatientsData/PatientsClient). Las acciones
 * administrativas (crear, archivar, enviar portal) quedan ocultas y la ficha se
 * monta en solo lectura.
 *
 * DESDE 2026-09-16 el provider ve TODA la clínica, igual que el mostrador, y
 * "mis pacientes" es un filtro opcional en `?mine=1` (Erick: "el provider ve
 * todo sin restricción, la única diferencia es que podrá filtrar sus
 * pacientes"). Antes de eso la lista salía recortada siempre, y un provider sin
 * citas —los 12 de prueba de los 21 que hay— veía la pantalla vacía sin que
 * nada le explicara por qué.
 *
 * El recorte del expediente cambió con esto: ver `checkPatientAccess`. La lista
 * y el guard tienen que contar la misma historia o el provider ve filas que no
 * puede abrir.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PatientsData, PatientsTableSkeleton } from '@/app/(admin)/patients/patients-data';
import { getSessionProvider } from '@/lib/get-session-provider';
import { CaseUrlModal } from '@/components/cases/case-url-modal';
import { tamanoDePagina } from '@/lib/patients-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.nav');
  return { title: t('myPatients') };
}

export default async function DoctorPatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; showInactive?: string; size?: string; case?: string; tab?: string; mine?: string }>;
}) {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const { q, page: pageParam, showInactive, size: sizeParam, case: caseId, tab, mine } = await searchParams;
  const page = Math.max(0, parseInt(pageParam ?? '0', 10) || 0);
  const inactiveOnly = showInactive === '1';
  const PAGE_SIZE = tamanoDePagina(sizeParam);

  return (
    <div className="p-0 sm:p-2">
      <Suspense fallback={<PatientsTableSkeleton />}>
        <PatientsData
          q={q}
          page={page}
          inactiveOnly={inactiveOnly}
          PAGE_SIZE={PAGE_SIZE}
          scopeProviderId={provider.id}
          soloMisPacientes={mine === '1'}
          basePath="/doctor/patients"
        />
      </Suspense>

      {/* `?case=` en la URL de la lista: recargar vuelve con la búsqueda y el
          caso abierto. El portal abre el caso de cualquier paciente. */}
      <CaseUrlModal caseId={caseId} tab={tab} variant="doctor" />
    </div>
  );
}
