/**
 * Autocomplete de aseguradoras para B.2.
 * GET /api/admin/insurances/autocomplete?q=...&omitType=1
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  /** Ver el comentario del `subtitle` más abajo. */
  const omitType = searchParams.get('omitType') === '1';

  const insurances = await db.insuranceCarrier.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(q.length >= 1 && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { legalName: { contains: q, mode: 'insensitive' } },
          { shortCode: { contains: q, mode: 'insensitive' } },
        ],
      }),
    },
    take: 10,
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, shortCode: true, color: true, type: true, responseSpeed: true },
  });

  return NextResponse.json({
    results: insurances.map((i) => ({
      id: i.id,
      label: i.name,
      shortCode: i.shortCode,
      color: i.color,
      /**
       * `omitType=1` deja fuera el tipo de cobertura y conserva el aviso de
       * aseguradora lenta.
       *
       * Lo pide la sección "Seguro de auto" del alta de caso, donde el tipo es
       * redundante —hay UN solo slot y el rótulo ya dice de qué seguro se
       * habla— y además "PIP" es jerga que recepción no debería tener delante
       * mientras habla con el paciente. El tab de seguros del caso NO lo manda,
       * porque ahí conviven PIP y Med Pay y el tipo es lo que los distingue.
       *
       * El aviso de lenta se queda en los dos casos: 6 aseguradoras están
       * marcadas SLOW y las 6 son PIP (Progressive, Liberty Mutual,
       * Nationwide…), o sea justo las que recepción va a elegir seguido.
       */
      subtitle: [
        omitType ? null : i.type,
        i.responseSpeed === 'SLOW' ? '⚠ Lenta' : null,
      ].filter(Boolean).join(' · '),
    })),
  });
}
