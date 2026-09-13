/**
 * DELETE /api/admin/cases/[id]/documents/[docId]
 *   Manda a la PAPELERA un documento o una carpeta vacía.
 *
 * POST /api/admin/cases/[id]/documents/[docId]
 *   Lo restaura. Lo puede hacer cualquiera que vea la pantalla (Erick,
 *   2026-09-13): el que se equivoca es el que se da cuenta, y mandarlo a pedir
 *   una restauración convierte cada error en un ticket.
 *
 * ── El borrado es LÓGICO ───────────────────────────────────────────────────
 * Antes era `db.patientDocument.delete()` y la fila desaparecía. El archivo del
 * bucket, en cambio, nunca se borró —este endpoint no lo toca— así que el PDF
 * quedaba ocupando espacio para siempre y **nadie podía recuperarlo**: el
 * nombre, el paciente, el caso y la carpeta se habían ido con la fila. Era lo
 * peor de los dos mundos.
 *
 * ── Las carpetas con contenido siguen sin poder eliminarse ─────────────────
 * Aunque ahora sea recuperable. Mandar 17 archivos a la papelera con un clic es
 * mucho poder para un botón chico; primero se vacía.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { VIGENTES } from '@/lib/documentos';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { id: caseId, docId } = await ctx.params;

  const doc = await db.patientDocument.findUnique({
    where: { id: docId },
    select: {
      id: true,
      name: true,
      isFolder: true,
      caseId: true,
      deletedAt: true,
      // Los hijos se cuentan SIN los que ya están en la papelera: una carpeta
      // cuyos archivos se borraron uno por uno está vacía, y seguir pidiendo
      // "vaciala primero" sería pedir algo que ya se hizo.
      _count: { select: { children: { where: VIGENTES } } },
    },
  });

  if (!doc || doc.caseId !== caseId) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Idempotente: dos clics seguidos, o dos personas a la vez, no son un error.
  if (doc.deletedAt) return NextResponse.json({ ok: true, yaEstaba: true });

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

  // A la papelera, NO al borrado. El archivo del bucket tampoco se toca: es lo
  // que hace posible restaurarlo entero.
  await db.patientDocument.update({
    where: { id: docId },
    data: {
      deletedAt: new Date(),
      deletedById: actor.actorUserId,
      deletedByName: actor.actorName,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'DELETE_DOCUMENT',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { caseCode: caseRecord?.caseCode, documentId: docId, name: doc.name },
  });

  return NextResponse.json({ ok: true });
}

/**
 * Restaurar desde la papelera.
 *
 * Sin restricción de rol más allá de la de la pantalla: la papelera vive en el
 * tab Documentos, que ven back office y providers. El portal del abogado NO
 * llega acá —usa `/api/attorney/*` y su lista excluye los borrados— así que un
 * documento que la clínica eliminó no le reaparece ni lo puede devolver.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { id: caseId, docId } = await ctx.params;

  const doc = await db.patientDocument.findUnique({
    where: { id: docId },
    select: { id: true, name: true, caseId: true, deletedAt: true, parentId: true },
  });
  if (!doc || doc.caseId !== caseId) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!doc.deletedAt) return NextResponse.json({ ok: true, yaEstaba: true });

  /*
   * Si la carpeta que lo contenía también está en la papelera, restaurar el
   * archivo solo lo dejaría invisible: colgado de un padre que nadie ve. Se
   * avisa en vez de restaurar a medias — la pantalla ofrece restaurar la
   * carpeta primero.
   */
  if (doc.parentId) {
    const padre = await db.patientDocument.findUnique({
      where: { id: doc.parentId },
      select: { name: true, deletedAt: true },
    });
    if (padre?.deletedAt) {
      return NextResponse.json(
        { error: 'CARPETA_ELIMINADA', carpeta: padre.name },
        { status: 409 },
      );
    }
  }

  await db.patientDocument.update({
    where: { id: docId },
    data: { deletedAt: null, deletedById: null, deletedByName: null },
  });

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { caseCode: true },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'RESTORE_DOCUMENT',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { caseCode: caseRecord?.caseCode, documentId: docId, name: doc.name },
  });

  return NextResponse.json({ ok: true });
}
