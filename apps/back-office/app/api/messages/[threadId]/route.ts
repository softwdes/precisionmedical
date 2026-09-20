/**
 * GET    /api/messages/[threadId] → hilo completo: entradas, destinatarios,
 *        contexto del paciente (próxima cita) para la cabecera del legacy.
 * DELETE /api/messages/[threadId] → saca el hilo del historial del paciente.
 *
 *        Es un borrado LOGICO: marca `deletedAt` + `deletedByUserId` y escribe
 *        AuditLog. Nada se destruye nunca — el hilo y sus entradas siguen en la
 *        base y un admin puede devolverlos con el POST de abajo.
 *
 *        Lo puede hacer CUALQUIERA que participe del hilo, y eso es un cambio
 *        deliberado (Erick, 2026-09-20). Antes era solo admin y el boton ni se
 *        mostraba, asi que 25 de 28 personas no tenian forma de limpiar un
 *        mensaje de prueba: quedaba en el expediente de una paciente para
 *        siempre. El reporte que lo destapo fue textual — "no quiero que
 *        permanezca en el chart de la paciente, solo fue para hacer una prueba".
 *
 *        Abrirlo es seguro PORQUE es recuperable y queda registrado: el riesgo
 *        de que alguien esconda algo legitimo se paga con un boton de restaurar,
 *        no con un candado que deja basura clinica adentro del expediente.
 *
 * POST   /api/messages/[threadId] → lo devuelve al historial. Solo admin: el
 *        que limpia es cualquiera, el que revisa lo limpiado es el admin.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor, ADMIN_ROLES } from '@/lib/messaging';

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { threadId } = await ctx.params;

  const thread = await db.messageThread.findFirst({
    where: { id: threadId, deletedAt: null },
    select: {
      id: true,
      subject: true,
      type: true,
      category: true,
      priority: true,
      createdByUserId: true,
      createdByName: true,
      sealedAt: true,
      sealedByName: true,
      removedFromInboxesAt: true,
      lastEntryAt: true,
      createdAt: true,
      // Origen: un hilo con `firmId` lo abrió un bufete (pedido o referido).
      firmId: true,
      desk: true,
      referral: { select: { id: true, status: true, convertedByName: true, caseId: true } },
      patient: {
        select: { id: true, firstName: true, lastName: true, patientCode: true },
      },
      case: { select: { id: true, caseCode: true, accidentDate: true } },
      recipients: {
        // `archivedAt`/`deletedAt` van para que el diálogo sepa si el hilo está
        // archivado PARA quien lo mira y ofrezca "Desarchivar" en vez de "Archivar".
        select: { userId: true, userName: true, kind: true, lastReadAt: true, archivedAt: true, deletedAt: true },
      },
      entries: {
        orderBy: { sentAt: 'asc' },
        select: {
          id: true,
          kind: true,
          authorUserId: true,
          authorName: true,
          body: true,
          sentAt: true,
          editedAt: true,
          attachments: {
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              patientDocumentId: true,
              documentType: true,
              description: true,
            },
          },
        },
      },
    },
  });

  if (!thread) return NextResponse.json({ error: 'Hilo no encontrado' }, { status: 404 });

  // Contexto del paciente para la cabecera (Next Appointment del legacy).
  let nextAppointment: { id: string; scheduledFor: Date } | null = null;
  if (thread.patient) {
    nextAppointment = await db.appointment.findFirst({
      where: {
        patientId: thread.patient.id,
        scheduledFor: { gte: new Date() },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
      orderBy: { scheduledFor: 'asc' },
      select: { id: true, scheduledFor: true },
    });
  }

  return NextResponse.json({ thread: { ...thread, nextAppointment } });
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  // Sin candado de rol a proposito — ver la nota de arriba. La pertenencia al
  // hilo ya la impone `requireMessagingActor` mas las bandejas: solo se puede
  // abrir un hilo del que se participa.

  const { threadId } = await ctx.params;
  const updated = await db.messageThread.updateMany({
    where: { id: threadId, deletedAt: null },
    data: { deletedAt: new Date(), deletedByUserId: actor.actorUserId },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: 'Hilo no encontrado' }, { status: 404 });
  }

  await writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'MESSAGE_THREAD_DELETED',
    entityType: 'MessageThread',
    entityId: threadId,
    metadata: { deletedByName: actor.actorName },
  }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });

  return NextResponse.json({ ok: true });
}

/**
 * Devuelve al historial un hilo que alguien saco.
 *
 * Solo admin, y esa asimetria es el corazon del diseño: limpiar lo puede hacer
 * cualquiera porque es barato y reversible; deshacer el error ajeno es una
 * revision, y la revision tiene dueño. Sin esto, "eliminacion logica" seria una
 * promesa vacia: el dato quedaba en la base pero no habia forma de traerlo.
 */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  if (!ADMIN_ROLES.includes(actor.actorRole as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json(
      { error: 'Solo un administrador puede restaurar del historial' },
      { status: 403 },
    );
  }

  const { threadId } = await ctx.params;
  // `deletedAt: { not: null }` y no `{ id }` a secas: restaurar algo que nunca
  // se borro no es un error del usuario, pero tampoco es una operacion — que
  // devuelva 404 evita escribir un AuditLog de algo que no paso.
  const updated = await db.messageThread.updateMany({
    where: { id: threadId, deletedAt: { not: null } },
    data: { deletedAt: null, deletedByUserId: null },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: 'Hilo no encontrado o no estaba eliminado' }, { status: 404 });
  }

  await writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'MESSAGE_THREAD_RESTORED',
    entityType: 'MessageThread',
    entityId: threadId,
    metadata: { restoredByName: actor.actorName },
  }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });

  return NextResponse.json({ ok: true });
}
