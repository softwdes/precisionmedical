/**
 * GET /api/admin/diagnoses/search?q=&limit=
 *   Busca en Diagnosis (ICD-10) para autocomplete.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q     = searchParams.get('q') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);

  const results = await db.diagnosis.findMany({
    where: {
      isActive: true,
      ...(q ? {
        OR: [
          { icd10Description: { contains: q, mode: 'insensitive' } },
          { icd10Code:        { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    },
    select: { id: true, icd10Code: true, icd10Description: true },
    orderBy: [{ usageCount: 'desc' }, { icd10Description: 'asc' }],
    take: limit,
  });

  return NextResponse.json({
    results: results.map(r => ({ id: r.id, code: r.icd10Code, label: r.icd10Description })),
  });
}
