/**
 * GET /api/catalog/labs?q=&category=
 * Devuelve el catálogo de labs/imaging desde BD.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get('q')?.trim() ?? '';
  const category = searchParams.get('category') ?? undefined;

  const labs = await db.labCatalog.findMany({
    where: {
      ...(category && { category }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json({ labs });
}
