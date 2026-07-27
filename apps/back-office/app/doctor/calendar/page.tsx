import { getTranslations } from 'next-intl/server';
import { CalendarDays } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui-phoenix';

// Portal Médico · Mi Calendario — placeholder D0 (calendario compartido llega en D1)
export default async function DoctorCalendarPage(): Promise<React.ReactElement> {
  const t = await getTranslations('phoenix.doctor');
  return (
    <div className="space-y-6">
      <PageHeader title={t('calendarTitle')} subtitle={t('calendarSubtitle')} />
      <EmptyState.Rich icon={CalendarDays} title={t('comingSoonTitle')} subtitle={t('comingSoonSubtitle')} />
    </div>
  );
}
