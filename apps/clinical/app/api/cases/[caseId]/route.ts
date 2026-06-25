/**
 * PATCH /api/cases/[caseId]
 *
 * Actualiza seguro primario y/o datos legales de un caso desde la app clínica.
 * Usado por los modales de edición en triage y visita.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ caseId: string }> };

const PatchSchema = z.object({
  primaryInsuranceId:  z.string().cuid().nullable().optional(),
  primaryPolicyNumber: z.string().max(60).nullable().optional(),
  lawFirmId:           z.string().cuid().nullable().optional(),
  attorneyId:          z.string().cuid().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { caseId } = await ctx.params;

  const existing = await db.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }

  const { primaryInsuranceId, primaryPolicyNumber, lawFirmId, attorneyId } = parsed.data;

  const updated = await db.case.update({
    where: { id: caseId },
    data: {
      ...(primaryInsuranceId  !== undefined ? { primaryInsuranceId }  : {}),
      ...(primaryPolicyNumber !== undefined ? { primaryPolicyNumber } : {}),
      ...(lawFirmId           !== undefined ? { lawFirmId }           : {}),
      ...(attorneyId          !== undefined ? { attorneyId }          : {}),
    },
    select: {
      id: true, caseCode: true,
      primaryInsurance: { select: { id: true, name: true, claimsPhone: true } },
      primaryPolicyNumber: true,
      lawFirm:  { select: { id: true, firmName: true } },
      attorney: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const actor = actorFromHeaders(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:      'UPDATE_CASE_INSURANCE_LEGAL',
    entityType:  'cases',
    entityId:    caseId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true, case: updated });
}
