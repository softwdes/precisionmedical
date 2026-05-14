import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { AgentDetailClient } from './agent-detail-client';

interface Props { params: Promise<{ id: string }> }

export default async function AgentDetailPage({ params }: Props) {
  const { id } = await params;
  try {
    const [agent, actions, conversations] = await Promise.all([
      api.aiAgents.getById({ id }),
      api.aiAgents.listActions({ agentId: id }),
      api.aiAgents.listConversations({ agentId: id }),
    ]);
    return <AgentDetailClient agent={agent} initialActions={actions} initialConversations={conversations} />;
  } catch {
    notFound();
  }
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations();
  try {
    const agent = await api.aiAgents.getById({ id });
    return { title: agent.name };
  } catch {
    return { title: t('aiAgents.title') };
  }
}
