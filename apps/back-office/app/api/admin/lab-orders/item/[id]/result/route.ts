/**
 * Resultado de un estudio (B.20 · L5)
 *
 * POST /api/admin/lab-orders/item/[id]/result   (multipart: file, notes?)
 *   Sube el PDF que llega del laboratorio y pasa el estudio a RESULTED.
 * GET  /api/admin/lab-orders/item/[id]/result
 *   Devuelve una URL firmada (15 min) para abrir el PDF.
 *
 * El bucket `lab-results` es PRIVADO — un resultado es PHI y no puede quedar
 * accesible por URL pública (a diferencia de intake-photos).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { checkOrderAccess } from '@/lib/lab-order-access';

type Ctx = { params: Promise<{ id: string }> };

// Storage vive en el proyecto Phoenix (kiqlh…) — vars dedicadas con fallback legacy.
const SUPABASE_URL = (process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY = (process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
const BUCKET = 'lab-results';
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

const storage = createClient(SUPABASE_URL, SERVICE_KEY);

/** Crea el bucket privado la primera vez. */
async function ensureBucket(): Promise<void> {
  const check = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  if (check.status === 200) return;
  await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const { deny, actor } = await checkOrderAccess(id);
  if (deny) return deny;

  const order = await db.labOrder.findUnique({
    where: { id },
    select: { id: true, studyName: true, status: true },
  });
  if (!order) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const notes = (form.get('notes') as string | null) ?? null;

  if (!file) return NextResponse.json({ error: 'MISSING_FILE' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
  if (file.type && !ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 415 });
  }

  await ensureBucket();

  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  // Nombre de archivo derivado del id — nunca del nombre subido (evita traversal).
  const path = `${order.id}/result.${ext}`;

  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': file.type || 'application/pdf',
      'x-upsert': 'true',
    },
    body: await file.arrayBuffer(),
  });

  if (!upload.ok) {
    const detail = await upload.text();
    console.error('[lab-result] Supabase error:', detail);
    return NextResponse.json({ error: 'UPLOAD_FAILED', detail }, { status: 500 });
  }

  const updated = await db.labOrder.update({
    where: { id: order.id },
    data: {
      resultFileUrl: path,                       // key privada, no URL pública
      resultFileName: file.name.slice(0, 200),
      resultUploadedAt: new Date(),
      resultUploadedByName: actor.name,
      status: 'RESULTED',
      ...(notes ? { resultNotes: notes } : {}),
    },
    select: {
      id: true, status: true, resultFileName: true,
      resultUploadedAt: true, resultUploadedByName: true, resultNotes: true,
    },
  });

  writeAuditLog(db, {
    ...actorFromHeaders(req.headers),
    action: 'UPLOAD_LAB_RESULT',
    entityType: 'LabOrder',
    entityId: order.id,
    metadata: { studyName: order.studyName, fileName: updated.resultFileName, uploadedBy: actor.name },
  }).catch(() => undefined);

  return NextResponse.json({ order: updated });
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const { deny } = await checkOrderAccess(id);
  if (deny) return deny;

  const order = await db.labOrder.findUnique({
    where: { id },
    select: { resultFileUrl: true, resultFileName: true, studyName: true },
  });
  if (!order?.resultFileUrl) return NextResponse.json({ error: 'NO_RESULT' }, { status: 404 });

  const { data, error } = await storage.storage.from(BUCKET).createSignedUrl(order.resultFileUrl, 900);
  if (error || !data) {
    console.error('[lab-result] signed url error:', error);
    return NextResponse.json({ error: 'STORAGE_ERROR', message: error?.message }, { status: 500 });
  }

  writeAuditLog(db, {
    ...actorFromHeaders(req.headers),
    action: 'VIEW_LAB_RESULT',
    entityType: 'LabOrder',
    entityId: id,
    metadata: { studyName: order.studyName },
  }).catch(() => undefined);

  return NextResponse.json({ url: data.signedUrl, name: order.resultFileName ?? 'resultado.pdf' });
}
