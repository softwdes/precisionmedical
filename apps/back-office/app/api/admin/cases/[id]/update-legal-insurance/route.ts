import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  primaryInsuranceId:  z.string().cuid().nullable().optional(),
  primaryPolicyNumber: z.string().max(60).nullable().optional(),
  lawFirmId:           z.string().cuid().nullable().optional(),
  attorneyId:          z.string().cuid().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;

  const existing = await db.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });

  const { primaryInsuranceId, primaryPolicyNumber, lawFirmId, attorneyId } = parsed.data;

  await db.case.update({
    where: { id: caseId },
    data: {
      ...(primaryInsuranceId  !== undefined ? { primaryInsuranceId }  : {}),
      ...(primaryPolicyNumber !== undefined ? { primaryPolicyNumber } : {}),
      ...(lawFirmId           !== undefined ? { lawFirmId }           : {}),
      ...(attorneyId          !== undefined ? { attorneyId }          : {}),
    },
  });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'UPDATE_CASE_INSURANCE_LEGAL',
    entityType:  'cases',
    entityId:    caseId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { fields: Object.keys(parsed.data), source: 'back-office' },
  });

  return NextResponse.json({ ok: true });
}
