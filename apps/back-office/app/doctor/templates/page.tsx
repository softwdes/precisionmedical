import { getTranslations } from 'next-intl/server';
import { FileText } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui-phoenix';

// Portal Médico · Plantillas (B.17.7) — placeholder D0
export default async function DoctorTemplatesPage(): Promise<React.ReactElement> {
  const t = await getTranslations('phoenix.doctor');
  return (
    <div className="space-y-6">
      <PageHeader title={t('templatesTitle')} subtitle={t('templatesSubtitle')} />
      <EmptyState.Rich icon={FileText} title={t('comingSoonTitle')} subtitle={t('comingSoonSubtitle')} />
    </div>
  );
}
