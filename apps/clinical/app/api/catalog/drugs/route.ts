/**
 * GET /api/catalog/drugs?q=&category=
 * Devuelve el catálogo de medicamentos desde BD.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get('q')?.trim() ?? '';
  const category = searchParams.get('category') ?? undefined;

  const drugs = await db.drug.findMany({
    where: {
      ...(category && { category }),
      ...(q && {
        OR: [
          { name:    { contains: q, mode: 'insensitive' } },
          { generic: { contains: q, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: 100,
  });

  return NextResponse.json({ drugs });
}
