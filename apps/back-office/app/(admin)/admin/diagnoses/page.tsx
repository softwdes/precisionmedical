import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { redirect } from 'next/navigation';
import { DiagnosesClient } from './diagnoses-client';

// B.35 — Catálogo de Diagnósticos (ICD-10 + SNOMED CT dual coding)
export default async function DiagnosesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const diagnoses = await db.diagnosis.findMany({
    where: {},
    orderBy: [{ isActive: 'desc' }, { piRelevant: 'desc' }, { icd10Code: 'asc' }],
  });

  const favorites = await db.userDiagnosisFavorite.findMany({
    where: { userId: user.id },
    select: { diagnosisId: true },
  });
  const favIds = new Set(favorites.map((f) => f.diagnosisId));

  return (
    <DiagnosesClient
      diagnoses={diagnoses.map((d) => ({
        id: d.id,
        icd10Code: d.icd10Code,
        icd10Description: d.icd10Description,
        snomedCode: d.snomedCode,
        snomedDescription: d.snomedDescription,
        category: d.category,
        bodySystem: d.bodySystem,
        piRelevant: d.piRelevant,
        isActive: d.isActive,
        isFavorite: favIds.has(d.id),
      }))}
      stats={{
        total: diagnoses.length,
        active: diagnoses.filter((d) => d.isActive).length,
        piRelevant: diagnoses.filter((d) => d.piRelevant).length,
        withSnomed: diagnoses.filter((d) => d.snomedCode).length,
        favorites: favIds.size,
      }}
    />
  );
}
