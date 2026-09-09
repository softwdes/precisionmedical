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

import { NextResponse, after, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor, resolveRecipientUsers, reviveThread, sanitizeAttachments, verificarAbogadosEnAlcance, type AttachmentInput } from '@/lib/messaging';
import { archivarAdjuntosDelHilo } from '@/lib/messaging-documents';
import { avisarAbogadosPorEmail } from '@/lib/mensajeria/aviso-abogado';
import { avisarMensajeNuevo } from '@/lib/push';

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
    select: { id: true, subject: true, patientId: true, caseId: true, priority: true, recipients: { select: { userId: true } } },
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

  // Sumar un abogado a un hilo tiene la misma guarda que crearlo con él:
  // solo si el hilo está atado a un caso de su bufete.
  const alcance = await verificarAbogadosEnAlcance(
    [...newTo, ...newCc].map((u) => u.id),
    thread.caseId,
  );
  if (!alcance.ok) {
    return NextResponse.json({ error: alcance.motivo, nombres: alcance.nombres }, { status: 400 });
  }

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

  // Los abogados del hilo (los de siempre y los que se sumaron) se enteran por
  // correo — es la respuesta a su pedido, y no viven en nuestro portal.
  void avisarAbogadosPorEmail({
    threadId,
    userIds: [...existing, ...newTo.map((u) => u.id), ...newCc.map((u) => u.id)],
    autorUserId: actor.actorUserId,
    autorNombre: actor.actorName,
    caseId: thread.caseId,
    patientId: thread.patientId,
  }).catch((e) => { console.error('[messages/entries] aviso al abogado:', e); });

  /**
   * Y el staff se entera en el teléfono, aunque tenga la app cerrada. El autor
   * no se avisa a sí mismo.
   *
   * ── Va con `after()` y NO con `void`, y la diferencia importa ─────────────
   *
   * Acá estaba `void avisarMensajeNuevo(...)`, copiando el patrón del correo al
   * abogado de arriba. **En serverless eso pierde el aviso**: cuando la
   * respuesta se devuelve, la instancia puede congelarse antes de que la
   * promesa termine, y la petición a FCM se corta a medio camino. Como la
   * instancia a veces sigue viva lo suficiente, el aviso llega ALGUNAS veces —
   * que es peor que no llegar nunca, porque parece un problema del teléfono.
   *
   * Reportado el 2026-09-09: a una persona le llegó y a otras dos no, con la
   * misma versión y el mismo navegador.
   *
   * `after()` es el mecanismo de Next 15 para trabajo posterior a la respuesta:
   * la plataforma mantiene la función viva hasta que termina. El usuario no
   * espera por el push, pero el push tampoco se pierde.
   */
  after(async () => {
    await avisarMensajeNuevo(
      [...existing, ...newTo.map((u) => u.id), ...newCc.map((u) => u.id)]
        .filter((id) => id !== actor.actorUserId),
      actor.actorName,
      threadId,
      thread.priority === 'URGENT',
    ).catch((e) => { console.error('[messages/entries] aviso al celular:', e); });
  });

  return NextResponse.json({ id: entry.id }, { status: 201 });
}
