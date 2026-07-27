import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui-phoenix';

// Portal Médico · Mis Pacientes — placeholder D0 (lista compartida filtrada llega en D2)
export default async function DoctorPatientsPage(): Promise<React.ReactElement> {
  const t = await getTranslations('phoenix.doctor');
  return (
    <div className="space-y-6">
      <PageHeader title={t('patientsTitle')} subtitle={t('patientsSubtitle')} />
      <EmptyState.Rich icon={Users} title={t('comingSoonTitle')} subtitle={t('comingSoonSubtitle')} />
    </div>
  );
}
