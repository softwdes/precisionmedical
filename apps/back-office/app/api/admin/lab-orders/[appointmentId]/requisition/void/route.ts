/**
 * POST /api/admin/lab-orders/[appointmentId]/requisition/void
 *
 * Anula la hoja de laboratorio vigente de un grupo. Después de esto el grupo
 * vuelve a quedar "sin emitir" y se puede generar otra, **con un número nuevo**.
 *
 * ── Por qué anular en vez de editar ────────────────────────────────────────
 * La hoja ya salió con su número impreso y su código de barras. Si el seguro o
 * el prescriptor estaban mal, cambiar la fila dejaría la base diciendo una cosa
 * y el papel otra — y ese papel puede estar pegado en una muestra.
 *
 * El número viejo NO se reusa. Dos hojas distintas con el mismo número no
 * identifican nada, que es exactamente lo que el número existe para hacer.
 *
 * ── Qué NO se borra ────────────────────────────────────────────────────────
 * Ni la fila ni el PDF. La fila queda como constancia de que ese número existió,
 * quién lo anuló y por qué; el documento se RENOMBRA a "(ANULADA)" para que en
 * Documentos del paciente se lea de un vistazo. Borrarlo escondería un papel que
 * puede estar circulando, y el laboratorio puede llamar preguntando por él.
 *
 * ── Quién puede ────────────────────────────────────────────────────────────
 * El mismo que puede emitirla: quien tiene acceso de escritura a la cita. Quien
 * entrega la hoja es quien se entera de que está mal, y mandarlo a buscar a un
 * administrador deja al paciente esperando con un papel que no sirve.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkAppointmentAccess } from '@/lib/appointment-access';

type Ctx = { params: Promise<{ appointmentId: string }> };

const BodySchema = z.object({
  groupId: z.string().min(1),
  /**
   * Obligatorio, y con un mínimo real.
   *
   * Un motivo vacío convierte el historial en una lista de números anulados sin
   * explicación, y el que atiende el teléfono del laboratorio seis semanas
   * después no tiene nada. 3 caracteres es poco, pero frena el Enter distraído.
   */
  motivo: z.string().trim().min(3).max(300),
});

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;
  const actor = await resolveActor(req.headers);

  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const vigente = await db.labRequisition.findFirst({
    where: { groupId: body.groupId, voidedAt: null },
    select: { id: true, number: true, documentId: true },
  });
  // Idempotente: si ya estaba anulada —dos clics, o dos personas a la vez— no
  // es un error, simplemente no hay nada vigente que anular.
  if (!vigente) {
    return NextResponse.json({ error: 'SIN_REQUISICION_VIGENTE' }, { status: 404 });
  }

  await db.labRequisition.update({
    where: { id: vigente.id },
    data: {
      voidedAt: new Date(),
      voidedById: actor.actorUserId,
      voidedByName: actor.actorName,
      voidReason: body.motivo,
    },
  });

  /*
   * El documento se renombra, no se borra.
   *
   * Se antepone la marca en vez de agregarla al final porque la lista de
   * Documentos trunca los nombres largos por la derecha: "(ANULADA)" al final
   * es justo lo que desaparece.
   */
  if (vigente.documentId) {
    const doc = await db.patientDocument.findUnique({
      where: { id: vigente.documentId },
      select: { name: true },
    });
    if (doc && !doc.name.startsWith('[ANULADA]')) {
      await db.patientDocument.update({
        where: { id: vigente.documentId },
        data: { name: `[ANULADA] ${doc.name}` },
      });
    }
  }

  await writeAuditLog(db, {
    ...actor,
    action: 'VOID_LAB_REQUISITION',
    entityType: 'lab_requisitions',
    entityId: body.groupId,
    metadata: {
      numero: vigente.number,
      motivo: body.motivo,
      appointmentId,
      documentId: vigente.documentId,
    },
  }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });

  return NextResponse.json({ ok: true, anulada: vigente.number });
}
