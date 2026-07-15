import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { redirect } from 'next/navigation';
import { DiagnosesClient } from './diagnoses-client';

// B.35 — Catálogo de Diagnósticos (ICD-10 + SNOMED CT dual coding)
export default async function DiagnosesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [total, piRelevant, withSnomed, favorites] = await Promise.all([
    db.diagnosis.count(),
    db.diagnosis.count({ where: { piRelevant: true } }),
    db.diagnosis.count({ where: { snomedCode: { not: null } } }),
    db.userDiagnosisFavorite.findMany({ where: { userId: user.id }, select: { diagnosisId: true } }),
  ]);

  return (
    <DiagnosesClient
      stats={{
        total,
        active: total,
        piRelevant,
        withSnomed,
        favorites: favorites.length,
      }}
      userId={user.id}
    />
  );
}
