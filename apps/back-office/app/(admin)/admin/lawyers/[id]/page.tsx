import { notFound } from 'next/navigation';
import { db } from '@precision-medical/database';
import { LawyerDetailClient } from './lawyer-detail-client';

// B.31 — Detalle de bufete con tabs (Resumen · Members · Notas)
export default async function LawyerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const firm = await db.lawyer.findUnique({
    where: { id },
    include: {
      members: {
        where: { deletedAt: null },
        orderBy: [{ memberRole: 'asc' }, { lastName: 'asc' }],
      },
    },
  });

  if (!firm || firm.entityType !== 'FIRM') {
    notFound();
  }

  return (
    <LawyerDetailClient
      firm={{
        id: firm.id,
        firmName: firm.firmName ?? '—',
        email: firm.email,
        phone: firm.phone,
        address: firm.address,
        city: firm.city,
        state: firm.state,
        notes: firm.notes,
        paymentSpeed: firm.paymentSpeed,
        caseflowFlags: firm.caseflowFlags,
        status: firm.status,
        createdAt: firm.createdAt,
      }}
      members={firm.members.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        phone: m.phone,
        address: m.address,
        city: m.city,
        state: m.state,
        zip: m.zip,
        memberRole: m.memberRole,
        status: m.status,
      }))}
    />
  );
}
