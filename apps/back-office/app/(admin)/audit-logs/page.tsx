import { db } from '@precision-medical/database';
import { AuditLogsClient } from './audit-logs-client';

// B.44 — Visor de Audit Log (HIPAA compliance)
// Server component: carga KPIs iniciales + primera página de logs.

export const metadata = { title: 'Audit Log · Back-office' };

export default async function AuditLogsPage() {
  const [total, todayCount, humanCount, systemCount, recentLogs] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    db.auditLog.count({ where: { actorType: 'HUMAN_USER' } }),
    db.auditLog.count({ where: { actorType: 'SYSTEM' } }),
    db.auditLog.findMany({
      select: {
        id: true, actorType: true, actorUserId: true, actorRole: true,
        action: true, entityType: true, entityId: true,
        ipAddress: true, metadata: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return (
    <AuditLogsClient
      kpis={{ total, todayCount, humanCount, systemCount }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialLogs={recentLogs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })) as any}
    />
  );
}
