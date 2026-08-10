/**
 * GET /api/messages/patient/[patientId] → historial de mensajes del paciente
 * ("Messages & Requests" del legacy). A diferencia del inbox, lista TODOS los
 * hilos anclados al paciente sin importar quién los mire ni si salieron de
 * las bandejas (sellados y Delete From All incluidos): esta capa es el
 * registro permanente. Solo excluye los borrados del historial (deletedAt).
 *
 * `?caseId=` acota al historial de UN caso — es lo que abre el ícono de
 * mensaje en la fila de un caso.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { requireMessagingActor } from '@/lib/messaging';

type Ctx = { params: Promise<{ patientId: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { patientId } = await ctx.params;

  const caseId = req.nextUrl.searchParams.get('caseId');

  const rows = await db.messageThread.findMany({
    where: { patientId, deletedAt: null, ...(caseId ? { caseId } : {}) },
    orderBy: { lastEntryAt: 'desc' },
    select: {
      id: true,
      subject: true,
      type: true,
      category: true,
      priority: true,
      createdByName: true,
      lastEntryAt: true,
      sealedAt: true,
      case: { select: { id: true, caseCode: true, accidentDate: true } },
      recipients: {
        where: { userId: actor.actorUserId },
        select: { lastReadAt: true },
      },
      entries: {
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { authorName: true, kind: true },
      },
    },
  });

  const threads = rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    type: r.type,
    category: r.category,
    priority: r.priority,
    createdByName: r.createdByName,
    lastEntryAt: r.lastEntryAt,
    sealedAt: r.sealedAt,
    case: r.case,
    lastAuthorName: r.entries[0]?.authorName ?? null,
    // Bold solo aplica si YO soy destinatario; para terceros va sin negrita.
    unread:
      r.recipients.length > 0 &&
      (!r.recipients[0].lastReadAt || r.lastEntryAt > r.recipients[0].lastReadAt),
  }));

  return NextResponse.json({ threads });
}
