import { db } from '@precision-medical/database';
import { LawyersClient } from './lawyers-client';

// B.30 — Catálogo de Bufetes (lista)
export default async function LawyersPage() {
  // Traemos solo las FIRMs (entityType=FIRM). Sus members vienen via include.
  const firms = await db.lawyer.findMany({
    where: { entityType: 'FIRM', deletedAt: null },
    orderBy: [{ status: 'asc' }, { firmName: 'asc' }],
    include: {
      _count: { select: { members: true } },
    },
  });

  const activeCount   = firms.filter((f) => f.status === 'ACTIVE').length;
  const inactiveCount = firms.filter((f) => f.status === 'INACTIVE').length;
  const totalMembers  = firms.reduce((n, f) => n + f._count.members, 0);
  const slowPayers    = firms.filter((f) => f.paymentSpeed === 'SLOW').length;

  return (
    <LawyersClient
      firms={firms.map((f) => ({
        id: f.id,
        firmName: f.firmName ?? '—',
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
      }))}
      stats={{
        total: firms.length,
        active: activeCount,
        inactive: inactiveCount,
        totalMembers,
        slowPayers,
      }}
    />
  );
}
