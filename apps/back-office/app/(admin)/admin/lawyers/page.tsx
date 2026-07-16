import { db } from '@precision-medical/database';
import { LawyersClient } from './lawyers-client';

// B.30 — Catálogo de Bufetes / Externos (lista)
export default async function LawyersPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const firms = await db.lawyer.findMany({
    where: { entityType: { in: ['FIRM', 'INDEPENDENT'] }, deletedAt: null },
    orderBy: [{ status: 'asc' }, { firmName: 'asc' }],
    include: { _count: { select: { members: true } } },
  });

  const activeCount      = firms.filter((f) => f.status === 'ACTIVE').length;
  const inactiveCount    = firms.filter((f) => f.status === 'INACTIVE').length;
  const totalMembers     = firms.reduce((n, f) => n + f._count.members, 0);
  const slowPayers       = firms.filter((f) => f.paymentSpeed === 'SLOW').length;
  const independentCount = firms.filter((f) => f.entityType === 'INDEPENDENT').length;
  const newLast30        = firms.filter((f) => f.createdAt >= thirtyDaysAgo).length;

  return (
    <LawyersClient
      firms={firms.map((f) => ({
        id: f.id,
        firmName: f.firmName ?? '—',
        entityType: f.entityType,
        email: f.email,
        phone: f.phone,
        address: f.address,
        city: f.city,
        state: f.state,
        notes: f.notes,
        paymentSpeed: f.paymentSpeed,
        caseflowFlags: f.caseflowFlags,
        status: f.status,
        memberCount: f._count.members,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }))}
      stats={{
        total: firms.length,
        active: activeCount,
        inactive: inactiveCount,
        totalMembers,
        slowPayers,
        independentCount,
        newLast30,
      }}
    />
  );
}
