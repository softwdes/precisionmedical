/**
 * GET /api/visit/diagnoses?q=cervical
 *
 * Búsqueda de diagnósticos (ICD-10 + SNOMED) para el selector de B.18.
 * Prioriza piRelevant=true y ordena por usageCount.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    // Sin query → devolver los más usados
    const top = await db.diagnosis.findMany({
      where: { isActive: true },
      orderBy: [{ piRelevant: 'desc' }, { usageCount: 'desc' }],
      take: 20,
      select: {
        id: true, icd10Code: true, icd10Description: true,
        snomedCode: true, snomedDescription: true,
        category: true, piRelevant: true,
      },
    });
    return NextResponse.json({ ok: true, diagnoses: top });
  }

  const diagnoses = await db.diagnosis.findMany({
    where: {
      isActive: true,
      OR: [
        { icd10Code:        { contains: q, mode: 'insensitive' } },
        { icd10Description: { contains: q, mode: 'insensitive' } },
        { snomedDescription:{ contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ piRelevant: 'desc' }, { usageCount: 'desc' }],
    take: 15,
    select: {
      id: true, icd10Code: true, icd10Description: true,
      snomedCode: true, snomedDescription: true,
      category: true, piRelevant: true,
    },
  });

  return NextResponse.json({ ok: true, diagnoses });
}
