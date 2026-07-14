/**
 * DELETE /api/admin/cases/[id]/documents/[docId]
 *   Elimina un documento o carpeta (vacía). Las carpetas con contenido se rechazan.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { id: caseId, docId } = await ctx.params;

  const doc = await db.patientDocument.findUnique({
    where: { id: docId },
    select: {
      id: true,
      name: true,
      isFolder: true,
      caseId: true,
      _count: { select: { children: true } },
    },
  });

  if (!doc || doc.caseId !== caseId) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  if (doc.isFolder && doc._count.children > 0) {
    return NextResponse.json(
      { error: 'FOLDER_NOT_EMPTY', message: 'Vacía la carpeta antes de eliminarla.' },
      { status: 409 },
    );
  }

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { caseCode: true },
  });

  await db.patientDocument.delete({ where: { id: docId } });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'DELETE_DOCUMENT',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { caseCode: caseRecord?.caseCode, documentId: docId, name: doc.name },
  });

  return NextResponse.json({ ok: true });
}
