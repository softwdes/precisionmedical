/**
 * GET /api/law-firms
 * Endpoint público — devuelve firmas de abogados activas para el dropdown del wizard.
 * Solo expone id + firmName, sin PHI.
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(): Promise<NextResponse> {
  const firms = await db.lawyer.findMany({
    where: { entityType: 'FIRM', status: 'ACTIVE', deletedAt: null },
    select: { id: true, firmName: true },
    orderBy: { firmName: 'asc' },
  });

  return NextResponse.json(firms);
}
