/**
 * B.4 · Lista de pacientes
 * Accesible desde el sidebar → /patients
 *
 * Título + conteo se muestran dentro de PatientsClient (donde localTotal está disponible).
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PatientsData, PatientsTableSkeleton } from './patients-data';

// ---------------------------------------------------------------------------
// Page — shell renderiza de inmediato, datos hacen streaming
// ---------------------------------------------------------------------------
export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; showInactive?: string; size?: string }>;
}) {
  const t = await getTranslations('phoenix.patients');
  const { q, page: pageParam, showInactive, size: sizeParam } = await searchParams;
  const page   = Math.max(0, parseInt(pageParam ?? '0', 10) || 0);
  const inactiveOnly = showInactive === '1';
  const PAGE_SIZE = Math.min(50, Math.max(5, parseInt(sizeParam ?? '15', 10) || 15));

  return (
    <div className="p-4 sm:p-6">
      {/* Tabla hace streaming cuando Prisma completa */}
      <Suspense fallback={<PatientsTableSkeleton />}>
        <PatientsData q={q} page={page} inactiveOnly={inactiveOnly} PAGE_SIZE={PAGE_SIZE} />
      </Suspense>
    </div>
  );
}
