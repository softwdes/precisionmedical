/**
 * GET /api/law-firms
 * Endpoint público — devuelve firmas de abogados activas para el dropdown del wizard.
 * Solo expone id + firmName, sin PHI.
 *
 * Sin PHI no quiere decir sin costo: es una consulta a la DB sin sesión y sin
 * parámetros, o sea la más barata de repetir en bucle que tiene la app, y
 * devuelve el directorio entero de bufetes con los que trabaja la clínica. El
 * freno es holgado a propósito —el wizard la llama una vez por paso 3— y lo que
 * corta es el raspado, no al paciente.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { rateLimit, claveDeIp, cabeceras429 } from '@/lib/rate-limit';

const LIMITE = { max: 30, ventanaMs: 10 * 60 * 1000 };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const freno = rateLimit(claveDeIp(req, 'law-firms'), LIMITE);
  if (!freno.ok) {
    return NextResponse.json(
      { error: 'TOO_MANY_REQUESTS' },
      { status: 429, headers: cabeceras429(freno) },
    );
  }

  const firms = await db.lawyer.findMany({
    where: { entityType: 'FIRM', status: 'ACTIVE', deletedAt: null },
    select: { id: true, firmName: true },
    orderBy: { firmName: 'asc' },
  });

  return NextResponse.json(firms);
}
