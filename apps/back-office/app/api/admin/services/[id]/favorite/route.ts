/**
 * B.33 — Toggle favorite del current user para un service code
 *
 * POST   /api/admin/services/[id]/favorite  → marcar favorito
 * DELETE /api/admin/services/[id]/favorite  → quitar favorito
 *
 * Phase 1A: userId hardcoded. Phase 1B usará auth real.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

const FAKE_USER_ID = 'erick-super-admin-stub';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: serviceCodeId } = await ctx.params;

  await db.userServiceFavorite.upsert({
    where: { userId_serviceCodeId: { userId: FAKE_USER_ID, serviceCodeId } },
    update: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    create: { userId: FAKE_USER_ID, serviceCodeId, usageCount: 1, lastUsedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: serviceCodeId } = await ctx.params;

  await db.userServiceFavorite.deleteMany({
    where: { userId: FAKE_USER_ID, serviceCodeId },
  });

  return NextResponse.json({ ok: true });
}
