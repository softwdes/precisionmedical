import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

/**
 * GET /api/admin/catalog/search?kind=DME&q=rodilla&limit=20
 *
 * Búsqueda del catálogo para los selectores de la visita. Existe aparte del CRUD
 * (`/api/admin/catalog`), que devuelve los 269 items completos sin filtro ni
 * paginación: eso sirve para administrar el catálogo, no para elegir un item
 * dentro de una consulta.
 *
 * Solo devuelve lo necesario para agregar el item a la cita: nombre, precio
 * público, talla y código de facturación.
 */

const KINDS = ['LAB', 'INJECTION', 'SERVICE', 'DME'] as const;
type Kind = (typeof KINDS)[number];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const kindParam = sp.get('kind');
  const q = (sp.get('q') ?? '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(sp.get('limit') ?? '20', 10) || 20));

  if (kindParam && !KINDS.includes(kindParam as Kind)) {
    return NextResponse.json({ error: 'INVALID_KIND' }, { status: 400 });
  }

  const items = await db.catalogItem.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(kindParam ? { kind: kindParam as Kind } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: limit,
    select: {
      id: true,
      kind: true,
      code: true,
      name: true,
      sizeLabel: true,
      publicPrice: true,
      hcpcsCode: true,
      cptCode: true,
      alwaysFullPayment: true,
    },
  });

  // Decimal no serializa a JSON — se manda como número
  return NextResponse.json({
    items: items.map((i) => ({
      ...i,
      publicPrice: i.publicPrice === null ? null : Number(i.publicPrice),
    })),
  });
}
