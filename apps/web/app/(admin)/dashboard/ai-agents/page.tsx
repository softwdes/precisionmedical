import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { AiAgentsClient } from './ai-agents-client';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('aiAgents.title') };
}

export default async function AiAgentsPage() {
  const agents = await api.aiAgents.list();
  return <AiAgentsClient initialAgents={agents} />;
}
