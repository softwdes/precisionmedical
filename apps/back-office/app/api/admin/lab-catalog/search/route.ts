/**
 * GET /api/admin/lab-catalog/search?q=&category=&limit=
 *   Busca en LabCatalog (lab_catalog) para autocomplete.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);

  const results = await db.labCatalog.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(q ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    },
    select: { id: true, code: true, name: true, category: true },
    orderBy: { name: 'asc' },
    take: limit,
  });

  return NextResponse.json({ results });
}
