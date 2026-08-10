/**
 * GET /api/admin/lab-catalog/search?q=&category=&limit=
 *   Catálogo de estudios para la orden de laboratorio.
 *
 * Lee `catalog_items` (kind=LAB), NO la vieja `lab_catalog` (2026-08-08):
 * eran dos catálogos del mismo dominio y `catalog_items` es un superconjunto
 * estricto — los 96 estudios de `lab_catalog` están ahí por código, más otros
 * 147 que solo existían en la lista de precios del Excel de LabCorp. Buscar en
 * la vieja dejaba fuera de la orden justamente a los que tienen precio.
 *
 * Devuelve `publicPrice` porque la clínica cobra el estudio: quien lo pide
 * tiene que ver cuánto sale ANTES de agregarlo (el paciente suele declinar por
 * el precio en el mostrador).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);

  const rows = await db.catalogItem.findMany({
    where: {
      kind: 'LAB',
      deletedAt: null,
      isActive: true,
      // El catálogo distingue "existe" de "se puede pedir" (ej. un HIV sin p24
      // que quedó reemplazado por otro código). No ofrecer los no-ordenables.
      isOrderable: true,
      ...(category ? { category } : {}),
      ...(q ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    },
    select: { id: true, code: true, name: true, category: true, loinc: true, publicPrice: true, priceNote: true },
    orderBy: { name: 'asc' },
    take: limit,
  });

  const results = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category ?? 'LABORATORY',
    loinc: r.loinc,
    // number | null — el precio puede no estar cargado (los de imagen y
    // cardiología no lo tienen todavía). null = "sin precio en el catálogo".
    price: r.publicPrice !== null ? Number(r.publicPrice) : null,
    priceNote: r.priceNote,
  }));

  return NextResponse.json({ results });
}
