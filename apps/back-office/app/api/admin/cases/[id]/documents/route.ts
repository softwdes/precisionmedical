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
import { VIGENTES, ELIMINADOS } from '@/lib/documentos';

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
  /** La papelera es la MISMA lista con el filtro dado vuelta, no otra pantalla. */
  const verPapelera = searchParams.get('papelera') === '1';

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, deletedAt: true },
  });
  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const docs = await db.patientDocument.findMany({
    // `papelera=1` invierte el filtro: es la misma lista, viendo los eliminados.
    where: { caseId, parentId, ...(verPapelera ? ELIMINADOS : VIGENTES) },
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
      /**
       * ⚠️ El `where` NO es opcional: sin él se cuentan también los hijos que
       * están en la PAPELERA.
       *
       * El síntoma, reportado por Erick el 2026-09-16 sobre el expediente de
       * Héctor Cáceres: la carpeta "Imaging Reports" se veía vacía y decía (1),
       * y "MRI Results" mostraba 2 archivos diciendo (3). El número contaba un
       * documento borrado que la lista —que sí filtra con `VIGENTES`— no
       * muestra.
       *
       * Y no era solo cosmético: el tab bloquea el borrado de una carpeta con
       * `_count.children > 0`, así que una carpeta cuyos únicos hijos están en
       * la papelera quedaba **imposible de borrar**. El servidor la habría
       * dejado borrar —el DELETE de `[docId]` ya cuenta con `VIGENTES`, bien—;
       * quien la frenaba era esta pantalla, con este número.
       *
       * Es el caso exacto que avisa el comentario de `lib/documentos.ts`:
       * olvidarse del filtro no falla, muestra de más. Acá el olvido no estaba
       * en una lista sino en un CONTEO, que es donde no se ve.
       */
      _count: { select: { children: { where: VIGENTES } } },
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
    // `patientId` es nuevo acá: sin él la fila del documento quedaba sin dueño.
    select: { id: true, caseCode: true, deletedAt: true, patientId: true },
  });
  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  if (parsed.parentId) {
    // `findFirst` y no `findUnique`: hay que exigir además que la carpeta no
    // esté en la papelera, y `findUnique` solo acepta campos únicos. Crear algo
    // dentro de una carpeta eliminada lo dejaría invisible al instante.
    const parent = await db.patientDocument.findFirst({
      where: { id: parsed.parentId, ...VIGENTES },
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
      /**
       * El PACIENTE, que faltaba — y no era cosmético.
       *
       * `PatientDocument` tiene las dos relaciones, pero esta vía —por la que el
       * staff sube TODO desde el tab Documentos— solo escribía el caso. Así que
       * `patientId` quedaba en `NULL` y cualquier consulta por paciente no veía
       * nada. Dos consecuencias, la segunda ya estaba viva:
       *
       *  · La nueva vista de "Archivos personales" tiene que buscar por CASO en
       *    vez de por paciente (ver `patients/[id]/documents/route.ts`).
       *  · **El picker "Attach From Chart" de mensajería filtra por `patientId`**
       *    (`api/messages/chart-documents/route.ts`), así que a quien quería
       *    adjuntarle a un abogado un archivo del expediente le salía la lista
       *    vacía, sin nada que lo explicara.
       *
       * Esto arregla las filas NUEVAS. Las viejas siguen en `NULL` hasta que se
       * corra el backfill — está anotado en los pendientes con el SQL.
       */
      patientId: caseRecord.patientId,
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
