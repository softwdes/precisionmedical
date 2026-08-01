/**
 * B.33 — Toggle favorite del usuario actual para un service code
 *
 * POST   /api/admin/services/[id]/favorite  → marcar favorito
 * DELETE /api/admin/services/[id]/favorite  → quitar favorito
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { db } from '@precision-medical/database';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: serviceCodeId } = await ctx.params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  await db.userServiceFavorite.upsert({
    where: { userId_serviceCodeId: { userId: user.id, serviceCodeId } },
    update: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    create: { userId: user.id, serviceCodeId, usageCount: 1, lastUsedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: serviceCodeId } = await ctx.params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  await db.userServiceFavorite.deleteMany({
    where: { userId: user.id, serviceCodeId },
  });

  return NextResponse.json({ ok: true });
}
