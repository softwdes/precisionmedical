/**
 * GET /api/visit/cpt-catalog?q=&category=
 *
 * Busca el catálogo de ServiceCode para el picker de B.21.
 * Sin query → devuelve los más usados (top 30).
 * Con query → búsqueda por código o descripción (top 20).
 * Prioriza: type=CPT, ordenado por usageCount DESC.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import type { ServiceCategory } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q        = (searchParams.get('q') ?? '').trim();
  const category = searchParams.get('category') ?? '';

  const where = {
    isActive: true,
    deletedAt: null,
    ...(category ? { category: category as ServiceCategory } : {}),
    ...(q.length >= 2 ? {
      OR: [
        { code:             { contains: q, mode: 'insensitive' as const } },
        { shortDescription: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
  };

  const codes = await db.serviceCode.findMany({
    where,
    select: {
      id:               true,
      code:             true,
      type:             true,
      shortDescription: true,
      currentFee:       true,
      category:         true,
      modifiersAllowed: true,
      isInternalOnly:   true,
    },
    orderBy: [
      { type: 'asc' },       // CPT before HCPCS before CUSTOM_PM
      { sortOrder: 'asc' },
      { code: 'asc' },
    ],
    take: q.length >= 2 ? 20 : 30,
  });

  return NextResponse.json({
    ok: true,
    codes: codes.map(c => ({
      ...c,
      currentFee: Number(c.currentFee),
    })),
  });
}
