/**
 * GET /api/catalog/drug-interactions?drug=Cyclobenzaprine
 * GET /api/catalog/drug-interactions?generics=Cyclobenzaprine,Tramadol
 *
 * Single-drug: returns all interactions where that drug appears on either side.
 * Multi-drug: returns interactions between any pair in the provided list.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params  = req.nextUrl.searchParams;
  const drug    = params.get('drug')?.trim();
  const raw     = params.get('generics') ?? '';
  const generics = raw.split(',').map(g => g.trim()).filter(Boolean);

  if (drug) {
    const interactions = await db.drugInteraction.findMany({
      where: {
        OR: [
          { drug:          drug },
          { interactsWith: drug },
        ],
      },
    });
    return NextResponse.json({ interactions });
  }

  if (generics.length < 2) {
    return NextResponse.json({ interactions: [] });
  }

  const interactions = await db.drugInteraction.findMany({
    where: {
      drug:          { in: generics },
      interactsWith: { in: generics },
    },
  });

  return NextResponse.json({ interactions });
}
