import { db } from '@precision-medical/database';
import { SpecialtiesClient } from './specialties-client';

// B.36 — Catálogo de Especialidades (Service lines)
// Server Component fetches data, passes to Client Component para interactividad.

export default async function SpecialtiesPage() {
  const specialties = await db.specialtyCatalog.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: { doctorAssignments: true },
      },
    },
  });

  // Stats agregados para los KPIs
  const activeCount = specialties.filter((s) => s.isActive).length;
  const inactiveCount = specialties.filter((s) => !s.isActive).length;
  const totalDoctors = specialties.reduce((sum, s) => sum + s._count.doctorAssignments, 0);

  return (
    <SpecialtiesClient
      specialties={specialties.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        color: s.color,
        caseType: s.caseType,
        cptSuggested: s.cptSuggested,
        workflowType: s.workflowType,
        isActive: s.isActive,
        sortOrder: s.sortOrder,
        doctorCount: s._count.doctorAssignments,
      }))}
      stats={{
        total: specialties.length,
        active: activeCount,
        inactive: inactiveCount,
        totalDoctors,
      }}
    />
  );
}
