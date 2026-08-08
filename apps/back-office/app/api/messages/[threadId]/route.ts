/**
 * GET    /api/messages/[threadId] → hilo completo: entradas, destinatarios,
 *        contexto del paciente (próxima cita) para la cabecera del legacy.
 * DELETE /api/messages/[threadId] → borrado desde el historial del paciente.
 *        La ÚNICA eliminación real — solo admin, soft + AuditLog (criterio
 *        férulas: registro clínico-operativo, se marca, no se destruye).
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
      patient: {
        select: { id: true, firstName: true, lastName: true, patientCode: true },
      },
      case: { select: { id: true, caseCode: true } },
      recipients: {
        select: { userId: true, userName: true, kind: true, lastReadAt: true },
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
  if (!ADMIN_ROLES.includes(actor.actorRole as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'Solo un administrador puede borrar del historial' }, { status: 403 });
  }

  const { threadId } = await ctx.params;
  const updated = await db.messageThread.updateMany({
    where: { id: threadId, deletedAt: null },
    data: { deletedAt: new Date(), deletedByUserId: actor.actorUserId },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: 'Hilo no encontrado' }, { status: 404 });
  }

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'MESSAGE_THREAD_DELETED',
    entityType: 'MessageThread',
    entityId: threadId,
    metadata: { deletedByName: actor.actorName },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
