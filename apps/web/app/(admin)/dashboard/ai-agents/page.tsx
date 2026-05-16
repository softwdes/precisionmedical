import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { AiAgentsClient } from './ai-agents-client';

export async function generateMetadata(): Promise<{ title: string }> {
  const t = await getTranslations();
  return { title: t('aiAgents.title') };
}

export default async function AiAgentsPage(): Promise<React.ReactElement> {
  const [settings, findings, runs, costs, lastRun] = await Promise.allSettled([
    api.aiAgents.getAuditSettings(),
    api.aiAgents.listFindings({ status: 'pending' }),
    api.aiAgents.listAuditRuns({ limit: 10 }),
    api.aiAgents.getAgentCosts(),
    api.aiAgents.getLastAuditRun(),
  ]);

  return (
    <AiAgentsClient
      initialSettings={settings.status === 'fulfilled' ? settings.value : null}
      initialFindings={findings.status === 'fulfilled' ? findings.value : []}
      initialRuns={runs.status === 'fulfilled' ? runs.value : []}
      initialCosts={costs.status === 'fulfilled' ? costs.value : null}
      initialLastRun={lastRun.status === 'fulfilled' ? lastRun.value : null}
    />
  );
}
