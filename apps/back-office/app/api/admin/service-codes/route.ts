/**
 * GET /api/admin/service-codes
 *
 * Lista de códigos de servicio activos del catálogo.
 * Usado por admisión (B.15) para pre-seleccionar servicios planificados.
 *
 * Query params:
 *   ?category=CHIROPRACTIC  — filtrar por categoría
 *   ?search=98941           — buscar por código o descripción
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const category = searchParams.get('category') ?? undefined;
  const search   = searchParams.get('search')   ?? undefined;

  try {
    const codes = await db.serviceCode.findMany({
      where: {
        isActive:       true,
        isInternalOnly: false,
        ...(category ? { category: category as never } : {}),
        ...(search ? {
          OR: [
            { code:             { contains: search, mode: 'insensitive' } },
            { shortDescription: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id:               true,
        code:             true,
        type:             true,
        shortDescription: true,
        category:         true,
        currentFee:       true,
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
      take: 100,
    });

    return NextResponse.json({
      ok:    true,
      codes: codes.map(c => ({
        id:          c.id,
        code:        c.code,
        type:        c.type,
        description: c.shortDescription,
        category:    c.category,
        fee:         Number(c.currentFee),
      })),
    });
  } catch (err) {
    console.error('[GET /api/admin/service-codes]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
