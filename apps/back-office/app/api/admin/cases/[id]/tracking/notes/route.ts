/**
 * Observaciones de Edson sobre el caso — la columna "Observations" del Excel.
 *
 * POST   /api/admin/cases/[id]/tracking/notes            → agrega una entrada
 * PATCH  /api/admin/cases/[id]/tracking/notes            → corrige una entrada (body.noteId)
 * DELETE /api/admin/cases/[id]/tracking/notes?noteId=... → borra una entrada
 *
 * Son entradas con fecha y autor, no una celda que se sobrescribe: lo que Edson
 * escribe es un registro de llamadas y en una sola celda cada llamada nueva
 * borraba la anterior.
 *
 * Paso 4 de la vista de tracking (docs/plan-vista-edson.md §3.4).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const CreateSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

const UpdateSchema = z.object({
  noteId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = CreateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const kase = await db.case.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!kase || kase.deletedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const created = await db.caseTrackingNote.create({
    data: {
      caseId: id,
      body: parsed.body,
      authorUserId: actor.actorUserId,
      authorName: actor.actorName,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'CREATE_CASE_TRACKING_NOTE',
    entityType: 'case_tracking_notes',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, note: created }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = UpdateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const before = await db.caseTrackingNote.findUnique({ where: { id: parsed.noteId } });
  // Se valida que la nota sea DE ESTE caso: sin esto, cualquiera con un noteId
  // podría editar la observación de otro caso desde una URL distinta.
  if (!before || before.caseId !== id) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const updated = await db.caseTrackingNote.update({
    where: { id: parsed.noteId },
    data: { body: parsed.body },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'UPDATE_CASE_TRACKING_NOTE',
    entityType: 'case_tracking_notes',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: updated as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, note: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);
  const noteId = new URL(req.url).searchParams.get('noteId');
  if (!noteId) return NextResponse.json({ error: 'MISSING_NOTE_ID' }, { status: 400 });

  const before = await db.caseTrackingNote.findUnique({ where: { id: noteId } });
  if (!before || before.caseId !== id) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  await db.caseTrackingNote.delete({ where: { id: noteId } });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'DELETE_CASE_TRACKING_NOTE',
    entityType: 'case_tracking_notes',
    entityId: before.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id: noteId });
}
