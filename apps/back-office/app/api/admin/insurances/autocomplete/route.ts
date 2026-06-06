/**
 * Autocomplete de aseguradoras para B.2.
 * GET /api/admin/insurances/autocomplete?q=...
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  const insurances = await db.insuranceCarrier.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(q.length >= 1 && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { legalName: { contains: q, mode: 'insensitive' } },
          { shortCode: { contains: q, mode: 'insensitive' } },
        ],
      }),
    },
    take: 10,
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, shortCode: true, color: true, type: true, responseSpeed: true },
  });

  return NextResponse.json({
    results: insurances.map((i) => ({
      id: i.id,
      label: i.name,
      shortCode: i.shortCode,
      color: i.color,
      subtitle: `${i.type}${i.responseSpeed === 'SLOW' ? ' · ⚠ Lenta' : ''}`,
    })),
  });
}
