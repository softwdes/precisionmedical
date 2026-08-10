/**
 * Un estudio de una orden de laboratorio (B.20 · L2)
 *
 * PATCH  /api/admin/lab-orders/item/[id]
 *   Cambia estado (ORDERED → IN_PROGRESS → RESULTED), anula (VOIDED) o edita la
 *   nota del resultado. Una orden con resultado cargado NO se puede anular:
 *   el resultado es parte del expediente.
 *
 * DELETE /api/admin/lab-orders/item/[id]
 *   Borra el estudio de verdad. Lo puede hacer el médico Y el asistente
 *   (decisión de Erick 2026-08-08): la hoja la imprime la clínica DESPUÉS de
 *   cobrar, así que mientras la visita está abierta no salió ningún papel y
 *   quitar un estudio que el paciente no quiso es corregir el pedido, no
 *   borrar un hecho consumado.
 *
 *   La UI expone el borrado solo en la VISITA (consulta y Day Admission). En
 *   el detalle del caso, días después, la hoja ya se entregó: ahí la vía es
 *   anular (VOIDED), para que un resultado que llegue no quede huérfano.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkOrderAccess } from '@/lib/appointment-access';
import { syncLabBilling } from '@/lib/lab-billing';

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
    // Anular saca el estudio del pedido → su cobro se retira y el total baja.
    await syncLabBilling(current.appointmentId);

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

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  // Sin requireProvider: el asistente también quita estudios (es quien está
  // con el paciente cuando decide no hacérselos). Queda en el audit log.
  const { deny } = await checkOrderAccess(id);
  if (deny) return deny;

  const current = await db.labOrder.findUnique({
    where: { id },
    select: {
      id: true, studyName: true, studyCode: true, status: true,
      resultFileUrl: true, appointmentId: true, groupId: true, orderedByName: true,
    },
  });
  if (!current) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Con resultado cargado NO se borra ni siquiera el doctor: el PDF es parte
  // del expediente y llegó de afuera. Ahí la vía es anular (misma regla del PATCH).
  if (current.resultFileUrl) {
    return NextResponse.json({ error: 'HAS_RESULT' }, { status: 409 });
  }

  // El audit log va ANTES del delete y con los datos completos: la fila
  // desaparece, así que este registro es la única traza de que existió.
  await writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'DELETE_LAB_ORDER',
    entityType: 'LabOrder',
    entityId: id,
    metadata: {
      studyName: current.studyName,
      studyCode: current.studyCode,
      status: current.status,
      groupId: current.groupId,
      appointmentId: current.appointmentId,
      orderedFor: current.orderedByName,
    },
  }).catch(() => undefined);

  await db.labOrder.delete({ where: { id } });

  // Quitar el estudio DESCUENTA su cobro del pago final (pedido de Erick):
  // el paciente no se lo hace, no lo paga.
  await syncLabBilling(current.appointmentId);

  return NextResponse.json({ ok: true, deletedId: id });
}
