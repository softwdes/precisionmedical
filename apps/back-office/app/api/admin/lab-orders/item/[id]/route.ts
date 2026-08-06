/**
 * Un estudio de una orden de laboratorio (B.20 · L2)
 *
 * PATCH /api/admin/lab-orders/item/[id]
 *   Cambia estado (ORDERED → IN_PROGRESS → RESULTED), anula (VOIDED) o edita la
 *   nota del resultado. Una orden con resultado cargado NO se puede anular:
 *   el resultado es parte del expediente.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkOrderAccess } from '@/lib/appointment-access';

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  status: z.enum(['ORDERED', 'IN_PROGRESS', 'RESULTED', 'VOIDED']).optional(),
  resultNotes: z.string().max(4000).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const { deny } = await checkOrderAccess(id);
  if (deny) return deny;

  let body;
  try { body = PatchSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const current = await db.labOrder.findUnique({
    where: { id },
    select: { id: true, status: true, resultFileUrl: true, studyName: true, appointmentId: true },
  });
  if (!current) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (body.status === 'VOIDED' && current.resultFileUrl) {
    return NextResponse.json({ error: 'HAS_RESULT' }, { status: 409 });
  }

  const order = await db.labOrder.update({
    where: { id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.resultNotes !== undefined ? { resultNotes: body.resultNotes } : {}),
    },
    select: {
      id: true, status: true, resultNotes: true, studyName: true,
      resultFileName: true, resultUploadedAt: true, resultUploadedByName: true,
    },
  });

  if (body.status && body.status !== current.status) {
    writeAuditLog(db, {
      ...(await resolveActor(req.headers)),
      action: body.status === 'VOIDED' ? 'VOID_LAB_ORDER' : 'UPDATE_LAB_ORDER_STATUS',
      entityType: 'LabOrder',
      entityId: id,
      metadata: { studyName: current.studyName, from: current.status, to: body.status },
    }).catch(() => undefined);
  }

  return NextResponse.json({ order });
}
