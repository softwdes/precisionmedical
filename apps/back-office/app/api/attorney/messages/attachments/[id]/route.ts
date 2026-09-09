/**
 * GET /api/attorney/messages/attachments/[id] → URL firmada de un adjunto,
 * para el abogado.
 *
 * Facturación responde con archivos —el ledger, las HCFA, la copia de las
 * notas— y hasta ahora el portal legal no tenía por dónde abrirlos: la ruta de
 * la clínica está detrás del middleware que solo deja pasar `/api/attorney/*`.
 *
 * La llave es la misma que la del hilo: ser DESTINATARIO del hilo al que
 * pertenece el adjunto. Un id adivinado devuelve 404, no 403 — decir "existe
 * pero no podés verlo" ya es contar algo.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { resolveActor } from '@/lib/actor';
import { firmarAdjunto } from '@/lib/messaging-attachments';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'SIN_IDENTIDAD' }, { status: 401 });

  const att = await db.messageAttachment.findUnique({
    where: { id },
    select: { entry: { select: { threadId: true } } },
  });
  if (!att) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const participa = await db.messageRecipient.findFirst({
    where: {
      threadId: att.entry.threadId,
      userId: actor.actorUserId,
      deletedAt: null,
      thread: { deletedAt: null, removedFromInboxesAt: null },
    },
    select: { threadId: true },
  });
  if (!participa) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const firmado = await firmarAdjunto(id);
  if (!firmado.ok) return NextResponse.json({ error: firmado.error }, { status: firmado.status });

  await writeAuditLog(db, {
    ...actor,
    action: 'VIEW_MESSAGE_ATTACHMENT',
    entityType: 'MessageThread',
    entityId: firmado.threadId,
    metadata: { attachmentId: firmado.attachmentId, fileName: firmado.name, comoBufete: lawyer.firmName ?? lawyer.id },
  }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });

  return NextResponse.json({ url: firmado.url, downloadUrl: firmado.downloadUrl, name: firmado.name });
}
