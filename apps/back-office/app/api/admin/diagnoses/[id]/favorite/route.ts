/**
 * B.35 — Toggle favorite del current user para un diagnóstico
 * Phase 1A: userId hardcoded
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

const FAKE_USER_ID = 'erick-super-admin-stub';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: diagnosisId } = await ctx.params;
  await db.userDiagnosisFavorite.upsert({
    where: { userId_diagnosisId: { userId: FAKE_USER_ID, diagnosisId } },
    update: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    create: { userId: FAKE_USER_ID, diagnosisId, usageCount: 1, lastUsedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: diagnosisId } = await ctx.params;
  await db.userDiagnosisFavorite.deleteMany({ where: { userId: FAKE_USER_ID, diagnosisId } });
  return NextResponse.json({ ok: true });
}
