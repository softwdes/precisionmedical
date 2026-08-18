/**
 * Ajustadores de UNA aseguradora — para el selector del modal de tracking.
 *
 * GET /api/admin/adjusters/by-carrier?carrierId=...
 *
 * Va aparte del catálogo completo porque el modal solo necesita los de la
 * compañía del caso: mostrarle a Edson los de otras es ruido, y elegir uno
 * equivocado es un error real que después nadie detecta.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const carrierId = req.nextUrl.searchParams.get('carrierId');
  if (!carrierId) return NextResponse.json({ error: 'MISSING_CARRIER_ID' }, { status: 400 });

  const adjusters = await db.insuranceAdjuster.findMany({
    where: { insuranceCarrierId: carrierId, deletedAt: null, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, phone: true, extension: true },
  });

  return NextResponse.json({ ok: true, adjusters });
}
