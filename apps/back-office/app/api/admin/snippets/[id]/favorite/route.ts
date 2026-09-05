/**
 * POST   /api/admin/snippets/[id]/favorite   → marcar snippet como favorito
 * DELETE /api/admin/snippets/[id]/favorite   → quitar de favoritos
 *
 * Los favoritos son PERSONALES: cada provider marca los suyos (SnippetFavorite).
 * El usuario se resuelve por email de sesión → users de Phoenix. Espejo exacto
 * de templates/[id]/favorite.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';

type Ctx = { params: Promise<{ id: string }> };

async function sessionUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const row = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const snippet = await db.snippet.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!snippet) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.snippetFavorite.upsert({
    where: { snippetId_userId: { snippetId: id, userId } },
    create: { snippetId: id, userId },
    update: { lastUsedAt: new Date() },
  });

  return NextResponse.json({ ok: true, favorite: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  await db.snippetFavorite.deleteMany({ where: { snippetId: id, userId } });

  return NextResponse.json({ ok: true, favorite: false });
}
