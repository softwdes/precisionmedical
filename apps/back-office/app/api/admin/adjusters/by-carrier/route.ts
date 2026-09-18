/**
 * Ajustadores de UNA aseguradora — para el selector del modal de tracking.
 *
 * GET /api/admin/adjusters/by-carrier?carrierId=...
 *
 * Va aparte del catálogo completo porque el modal solo necesita los de la
 * compañía del caso: mostrarle a Edson los de otras es ruido, y elegir uno
 * equivocado es un error real que después nadie detecta.
 *
 * OJO — el selector de `case-adjusters.tsx` NO usa esta ruta, y no es un olvido.
 * Medido el 2026-09-17: solo 177 de las 1.053 filas de la cola caen en una
 * aseguradora que tenga gente en el catálogo, así que filtrar por aseguradora
 * deja el selector vacío en el 83% de los casos — por eso ya se lo había
 * quitado una vez. El selector usa `GET /api/admin/adjusters`, que trae el
 * catálogo entero y sube primero los de la aseguradora del caso. Si alguna vez
 * la cobertura de aseguradora sube de verdad, esta ruta vuelve a tener sentido.
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
