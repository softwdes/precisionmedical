/**
 * POST /api/messages/[threadId]/entries → agregar entrada al hilo:
 *   · REPLY   — responde; el cliente decide a quién (Reply = solo autor,
 *               Reply All = sin cambios de lista). Destinatarios nuevos que
 *               vengan en to/cc se suman al hilo.
 *   · FORWARD — reenvío, típicamente suma destinatarios.
 *   · NOTE    — Add Note: anotación sobre el hilo. Notifica a todos igual que
 *               un mensaje (decisión de Erick 2026-08-07).
 *
 * Cualquier entrada REVIVE el hilo: vuelve a los inboxes de todos y re-embolda
 * (reviveThread). Sobre un hilo SELLADO se puede escribir — el sello solo hace
 * inmutable lo previo, no bloquea entradas nuevas.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor, resolveRecipientUsers, reviveThread, sanitizeAttachments, type AttachmentInput } from '@/lib/messaging';
import { archivarAdjuntosDelHilo } from '@/lib/messaging-documents';

type Ctx = { params: Promise<{ threadId: string }> };

interface EntryBody {
  body?: string;
  kind?: 'REPLY' | 'FORWARD' | 'NOTE';
  to?: string[];
  cc?: string[];
  attachments?: AttachmentInput[];
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { threadId } = await ctx.params;

  const raw = (await req.json().catch(() => null)) as EntryBody | null;
  const body = raw?.body?.trim();
  const kind = raw?.kind ?? 'REPLY';
  if (!body) return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 });
  if (!['REPLY', 'FORWARD', 'NOTE'].includes(kind)) {
    return NextResponse.json({ error: 'Tipo de entrada inválido' }, { status: 400 });
  }

  const thread = await db.messageThread.findFirst({
    where: { id: threadId, deletedAt: null },
    select: { id: true, subject: true, patientId: true, recipients: { select: { userId: true } } },
  });
  if (!thread) return NextResponse.json({ error: 'Hilo no encontrado' }, { status: 404 });

  // Destinatarios nuevos (Reply al autor original, Forward a más gente).
  const existing = new Set(thread.recipients.map((r) => r.userId));
  const newToIds = [...new Set(raw?.to ?? [])].filter((id) => !existing.has(id));
  const newCcIds = [...new Set(raw?.cc ?? [])].filter(
    (id) => !existing.has(id) && !newToIds.includes(id),
  );
  const [newTo, newCc] = await Promise.all([
    resolveRecipientUsers(newToIds),
    resolveRecipientUsers(newCcIds),
  ]);

  const now = new Date();
  const entry = await db.messageEntry.create({
    data: {
      threadId,
      kind,
      authorUserId: actor.actorUserId,
      authorName: actor.actorName,
      body,
      sentAt: now,
      attachments: { create: await sanitizeAttachments(raw?.attachments, thread.patientId) },
    },
    select: { id: true },
  });

  // El que escribe también participa: responder desde un hilo ajeno (o desde la
  // bandeja de otro) no puede dejarte sin rastro de lo que escribiste.
  // skipDuplicates respeta su fila si ya era TO/CC/SENDER.
  await db.messageRecipient.createMany({
    data: [
      ...newTo.map((u) => ({ threadId, userId: u.id, userName: u.name, kind: 'TO' as const })),
      ...newCc.map((u) => ({ threadId, userId: u.id, userName: u.name, kind: 'CC' as const })),
      {
        threadId,
        userId: actor.actorUserId,
        userName: actor.actorName,
        kind: 'SENDER' as const,
        lastReadAt: now,
      },
    ],
    skipDuplicates: true,
  });

  await reviveThread(threadId, now);

  // Escribir cuenta como leer: sin esto el hilo le vuelve en negrita al propio
  // autor, porque reviveThread adelanta lastEntryAt para TODOS los participantes.
  await db.messageRecipient.updateMany({
    where: { threadId, userId: actor.actorUserId },
    data: { lastReadAt: now },
  });

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: `MESSAGE_ENTRY_${kind}`,
    entityType: 'MessageThread',
    entityId: threadId,
    metadata: {
      entryId: entry.id,
      subject: thread.subject,
      addedRecipients: [...newTo, ...newCc].map((u) => u.name),
    },
  }).catch(() => undefined);

  // Los adjuntos de esta respuesta también pasan al expediente. La función es
  // idempotente (se salta los que ya tienen `patientDocumentId`), así que no
  // vuelve a copiar lo de las entradas anteriores del hilo.
  await archivarAdjuntosDelHilo(threadId, actor.actorUserId)
    .catch((e) => { console.error('[messages/entries] archivado de adjuntos:', e); });

  return NextResponse.json({ id: entry.id }, { status: 201 });
}
