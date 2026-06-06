/**
 * Autocomplete de bufetes para B.2.
 * GET /api/admin/lawyers/autocomplete?q=...&firmId=<id>
 * Sin firmId: devuelve solo FIRMs. Con firmId: devuelve members de ese firm.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const firmId = searchParams.get('firmId');

  if (firmId) {
    // Members del firm específico
    const members = await db.lawyer.findMany({
      where: {
        parentFirmId: firmId,
        deletedAt: null,
        ...(q.length >= 1 && {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      take: 10,
      select: { id: true, firstName: true, lastName: true, memberRole: true, email: true },
    });
    return NextResponse.json({
      results: members.map((m) => ({
        id: m.id,
        label: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.email,
        subtitle: m.memberRole ?? 'Member',
      })),
    });
  }

  // Solo FIRMs
  const firms = await db.lawyer.findMany({
    where: {
      entityType: 'FIRM',
      deletedAt: null,
      status: 'ACTIVE',
      ...(q.length >= 1 && {
        firmName: { contains: q, mode: 'insensitive' },
      }),
    },
    take: 10,
    orderBy: { firmName: 'asc' },
    select: { id: true, firmName: true, city: true, paymentSpeed: true },
  });

  return NextResponse.json({
    results: firms.map((f) => ({
      id: f.id,
      label: f.firmName ?? '—',
      subtitle: f.city ? `${f.city}${f.paymentSpeed === 'SLOW' ? ' · ⚠ Pago lento' : ''}` : '',
    })),
  });
}
