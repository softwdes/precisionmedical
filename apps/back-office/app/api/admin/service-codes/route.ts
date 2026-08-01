/**
 * GET /api/admin/service-codes
 *
 * Catálogo paginado de códigos de servicio activos, con favoritos del
 * usuario actual primero (ver UserServiceFavorite / B.33).
 *
 * Query params:
 *   ?category=CHIROPRACTIC   — filtrar por categoría
 *   ?search=98941            — buscar por código o descripción
 *   ?favoritesOnly=true      — solo favoritos del usuario
 *   ?page=1                  — página (1-indexed, 10 por página)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { db } from '@precision-medical/database';

const PAGE_SIZE = 10;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const category      = searchParams.get('category') ?? undefined;
  const search         = searchParams.get('search')   ?? undefined;
  const favoritesOnly  = searchParams.get('favoritesOnly') === 'true';
  const pageRaw        = parseInt(searchParams.get('page') ?? '1', 10);
  const page           = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const [codes, favoriteIds] = await Promise.all([
      db.serviceCode.findMany({
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
      }),
      user
        ? db.userServiceFavorite.findMany({ where: { userId: user.id }, select: { serviceCodeId: true } })
        : Promise.resolve([]),
    ]);

    const favIdSet = new Set(favoriteIds.map(f => f.serviceCodeId));

    let list = codes.map(c => ({
      id:          c.id,
      code:        c.code,
      type:        c.type,
      description: c.shortDescription,
      category:    c.category,
      fee:         Number(c.currentFee),
      isFavorite:  favIdSet.has(c.id),
    }));

    if (favoritesOnly) list = list.filter(c => c.isFavorite);

    // Favoritos primero — sort estable, conserva el orden (categoría/sortOrder/código) dentro de cada grupo
    list = [...list].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

    const total      = list.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageClamped = Math.min(page, totalPages);
    const paged      = list.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

    return NextResponse.json({
      ok:    true,
      codes: paged,
      total,
      page:  pageClamped,
      pageSize: PAGE_SIZE,
      totalPages,
    });
  } catch (err) {
    console.error('[GET /api/admin/service-codes]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
