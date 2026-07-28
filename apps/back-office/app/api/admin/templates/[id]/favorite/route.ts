/**
 * POST   /api/admin/templates/[id]/favorite   → marcar plantilla como favorita
 * DELETE /api/admin/templates/[id]/favorite   → quitar de favoritas
 *
 * Los favoritos son PERSONALES: cada doctor marca los suyos (TemplateFavorite).
 * El usuario se resuelve por email de sesión → users de Phoenix.
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

  const template = await db.template.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!template) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.templateFavorite.upsert({
    where: { templateId_userId: { templateId: id, userId } },
    create: { templateId: id, userId },
    update: { lastUsedAt: new Date() },
  });

  return NextResponse.json({ ok: true, favorite: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  await db.templateFavorite.deleteMany({ where: { templateId: id, userId } });

  return NextResponse.json({ ok: true, favorite: false });
}
