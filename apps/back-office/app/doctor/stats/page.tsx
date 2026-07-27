import { getTranslations } from 'next-intl/server';
import { BarChart3 } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui-phoenix';

// Portal Médico · Mis Estadísticas — placeholder D0 (API métricas compartida llega en D5)
export default async function DoctorStatsPage(): Promise<React.ReactElement> {
  const t = await getTranslations('phoenix.doctor');
  return (
    <div className="space-y-6">
      <PageHeader title={t('statsTitle')} subtitle={t('statsSubtitle')} />
      <EmptyState.Rich icon={BarChart3} title={t('comingSoonTitle')} subtitle={t('comingSoonSubtitle')} />
    </div>
  );
}
