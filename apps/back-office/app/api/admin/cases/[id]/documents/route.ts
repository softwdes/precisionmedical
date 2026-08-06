/**
 * GET  /api/admin/cases/[id]/documents?parentId=xxx
 *   Lista archivos y carpetas del caso. Si parentId se omite, retorna la raíz.
 *
 * POST /api/admin/cases/[id]/documents
 *   Crea una carpeta (isFolder=true) o registra un documento ya subido a S3.
 *   body: { name, isFolder?, parentId?, s3Key?, mimeType?, size? }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const CreateSchema = z.object({
  name:     z.string().trim().min(1).max(255),
  isFolder: z.boolean().default(false),
  parentId: z.string().nullable().default(null),
  s3Key:    z.string().nullable().default(null),
  mimeType: z.string().nullable().default(null),
  size:     z.number().int().nullable().default(null),
});

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const parentId = searchParams.get('parentId') ?? null;

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, deletedAt: true },
  });
  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const docs = await db.patientDocument.findMany({
    where: { caseId, parentId },
    orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      isFolder: true,
      s3Key: true,
      mimeType: true,
      size: true,
      parentId: true,
      createdAt: true,
      _count: { select: { children: true } },
    },
  });

  return NextResponse.json({ documents: docs });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { id: caseId } = await ctx.params;

  let parsed;
  try {
    parsed = CreateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, caseCode: true, deletedAt: true },
  });
  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  if (parsed.parentId) {
    const parent = await db.patientDocument.findUnique({
      where: { id: parsed.parentId },
      select: { id: true, isFolder: true, caseId: true },
    });
    if (!parent || parent.caseId !== caseId || !parent.isFolder) {
      return NextResponse.json({ error: 'INVALID_PARENT' }, { status: 400 });
    }
  }

  const doc = await db.patientDocument.create({
    data: {
      name:     parsed.name,
      isFolder: parsed.isFolder,
      parentId: parsed.parentId,
      caseId,
      s3Key:    parsed.s3Key,
      mimeType: parsed.mimeType,
      size:     parsed.size,
      createdByUserId: actor.actorUserId,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: parsed.isFolder ? 'CREATE_DOCUMENT_FOLDER' : 'UPLOAD_DOCUMENT',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { caseCode: caseRecord.caseCode, documentId: doc.id, name: doc.name },
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
