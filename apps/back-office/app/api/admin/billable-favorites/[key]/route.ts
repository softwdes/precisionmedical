/**
 * Favorito de un ítem cobrable, de cualquiera de los dos catálogos.
 *
 * POST   /api/admin/billable-favorites/[key]  → marcar favorito
 * DELETE /api/admin/billable-favorites/[key]  → quitar favorito
 *
 * `key` es la clave que ya usa el picker: `s<cuid>` para `service_codes` y
 * `c<id>` para `catalog_items`. Un solo endpoint, igual que `billable-items`
 * unificó la búsqueda: el cliente marca un favorito sin tener que saber de qué
 * tabla salió el ítem.
 *
 * Escribe en la MISMA tabla que `/api/admin/services/[id]/favorite` (que sigue
 * existiendo porque lo usa el catálogo de servicios del admin), así que los
 * favoritos son los mismos vistos desde las dos puertas.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { db } from '@precision-medical/database';

type Ctx = { params: Promise<{ key: string }> };

interface Target {
  serviceCodeId: string | null;
  catalogItemId: number | null;
}

/** `s<cuid>` → service_codes · `c<int>` → catalog_items */
function parseKey(key: string): Target | null {
  const kind = key.slice(0, 1);
  const rest = key.slice(1);
  if (!rest) return null;
  if (kind === 's') return { serviceCodeId: rest, catalogItemId: null };
  if (kind === 'c') {
    const id = Number.parseInt(rest, 10);
    return Number.isFinite(id) && id > 0 ? { serviceCodeId: null, catalogItemId: id } : null;
  }
  return null;
}

async function userIdOr401(): Promise<string | NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  return user.id;
}

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { key } = await ctx.params;
  const target = parseKey(key);
  if (!target) return NextResponse.json({ error: 'INVALID_KEY' }, { status: 400 });

  const userId = await userIdOr401();
  if (typeof userId !== 'string') return userId;

  // `upsert` con el unique compuesto que corresponda a la fuente. No se puede
  // usar uno solo: son dos índices distintos y el otro campo va en null.
  if (target.serviceCodeId) {
    await db.userServiceFavorite.upsert({
      where: { userId_serviceCodeId: { userId, serviceCodeId: target.serviceCodeId } },
      update: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      create: { userId, serviceCodeId: target.serviceCodeId, usageCount: 1, lastUsedAt: new Date() },
    });
  } else {
    await db.userServiceFavorite.upsert({
      where: { userId_catalogItemId: { userId, catalogItemId: target.catalogItemId! } },
      update: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      create: { userId, catalogItemId: target.catalogItemId, usageCount: 1, lastUsedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { key } = await ctx.params;
  const target = parseKey(key);
  if (!target) return NextResponse.json({ error: 'INVALID_KEY' }, { status: 400 });

  const userId = await userIdOr401();
  if (typeof userId !== 'string') return userId;

  await db.userServiceFavorite.deleteMany({
    where: {
      userId,
      ...(target.serviceCodeId
        ? { serviceCodeId: target.serviceCodeId }
        : { catalogItemId: target.catalogItemId }),
    },
  });

  return NextResponse.json({ ok: true });
}
