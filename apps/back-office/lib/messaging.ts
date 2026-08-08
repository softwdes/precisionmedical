/**
 * Mensajería interna (M1) — helpers compartidos por las rutas /api/messages.
 *
 * Autorización: cualquier usuario logueado del staff interno participa; no hay
 * restricciones por rol para enviar/leer (decisión de Erick 2026-08-07 —
 * "todos los roles envían a todos", y cualquiera puede ver el inbox de otro,
 * auditado). Lo único gateado por rol es el borrado desde el historial del
 * paciente (admin).
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { resolveActor, type ResolvedActor } from '@/lib/actor';

/** Roles internos que aparecen como destinatarios y pueden usar el módulo. */
export const MESSAGING_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'CONTADOR',
  'EMPLOYEE',
  'FRONT_DESK',
  'DOCTOR',
] as const;

export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export interface MessagingActor extends ResolvedActor {
  actorUserId: string;
  actorName: string;
}

/** Actor humano logueado con users.id resuelto, o el 401 listo para devolver. */
export async function requireMessagingActor(
  headers: Headers,
): Promise<{ actor: MessagingActor; deny: null } | { actor: null; deny: NextResponse }> {
  const actor = await resolveActor(headers);
  if (!actor.actorUserId || !actor.actorName) {
    return { actor: null, deny: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  return { actor: actor as MessagingActor, deny: null };
}

/**
 * Nombres reales de destinatarios desde la DB — nunca se confía en el nombre
 * que manda el cliente (el snapshot userName es evidencia, tiene que ser cierto).
 * Devuelve solo los userIds que existen y están activos.
 */
export async function resolveRecipientUsers(
  userIds: string[],
): Promise<Array<{ id: string; name: string }>> {
  if (userIds.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: userIds }, status: 'ACTIVE', deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() }));
}

export interface AttachmentInput {
  /** Key devuelta por POST /api/messages/attachments (archivo subido nuevo) */
  path?: string;
  /** "Attach From Chart": referencia a un patient_documents existente */
  patientDocumentId?: string;
  fileName?: string;
  documentType?: string | null;
  description?: string | null;
}

/**
 * Dos orígenes de adjunto, ambos validados server-side:
 *  · subida nueva — solo keys que salieron de nuestro endpoint de upload
 *    (prefijo uploads/), nada de referenciar objetos arbitrarios de Storage.
 *  · del expediente — solo documentos REALES del paciente del hilo
 *    (patientId debe coincidir); guarda la referencia, no duplica el archivo.
 * Vive acá y no en el route handler porque los route files no admiten exports
 * extra (la trampa documentada: tsc no lo detecta, el build sí).
 */
export interface SanitizedAttachment {
  fileUrl: string | null;
  patientDocumentId: string | null;
  fileName: string;
  documentType: string | null;
  description: string | null;
}

export async function sanitizeAttachments(
  raw: AttachmentInput[] | undefined,
  patientId?: string | null,
): Promise<SanitizedAttachment[]> {
  const list = (raw ?? []).slice(0, 20);

  const uploads: SanitizedAttachment[] = list
    .filter((a) => typeof a.path === 'string' && /^uploads\/[a-f0-9-]+\.(pdf|jpg|png)$/.test(a.path))
    .map((a) => ({
      fileUrl: a.path!,
      patientDocumentId: null,
      fileName: (a.fileName || 'archivo').slice(0, 200),
      documentType: a.documentType?.slice(0, 60) || null,
      description: a.description?.slice(0, 300) || null,
    }));

  const chartIds = list
    .map((a) => a.patientDocumentId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  let chart: SanitizedAttachment[] = [];
  if (chartIds.length > 0 && patientId) {
    const docs = await db.patientDocument.findMany({
      where: { id: { in: chartIds }, patientId, isFolder: false, s3Key: { not: null } },
      select: { id: true, name: true },
    });
    chart = docs.map((d) => {
      const input = list.find((a) => a.patientDocumentId === d.id);
      return {
        fileUrl: null,
        patientDocumentId: d.id,
        fileName: d.name.slice(0, 200),
        documentType: input?.documentType?.slice(0, 60) || null,
        description: input?.description?.slice(0, 300) || null,
      };
    });
  }

  return [...uploads, ...chart];
}

/**
 * Una entrada nueva REVIVE el hilo en los inboxes de todos: limpia el
 * "Delete From All" y los deletes personales, y adelanta lastEntryAt — con lo
 * que el hilo vuelve en negrita para todos (lastEntryAt > lastReadAt).
 * El sello NO se toca: lo previo sigue inmutable, solo es visual.
 */
export async function reviveThread(threadId: string, lastEntryAt: Date): Promise<void> {
  await db.$transaction([
    db.messageThread.update({
      where: { id: threadId },
      data: { lastEntryAt, removedFromInboxesAt: null },
    }),
    db.messageRecipient.updateMany({
      where: { threadId, deletedAt: { not: null } },
      data: { deletedAt: null },
    }),
  ]);
}
