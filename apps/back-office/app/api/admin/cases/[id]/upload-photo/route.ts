/**
 * POST /api/admin/cases/[id]/upload-photo
 * Sube una foto de identificación del paciente a Supabase Storage
 * y persiste la URL en consentsData.photos del caso.
 *
 * Autenticado por caseId (staff del back-office).
 * Bucket: intake-photos (mismo que usa el portal del paciente).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

type Ctx = { params: Promise<{ id: string }> };

// Storage vive en el proyecto Phoenix (kiqlh…) — vars dedicadas con fallback legacy.
// Auth de la app puede apuntar a otro proyecto (unificación de login sobre Admin).
const SUPABASE_URL = (process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY  = (process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
const BUCKET       = 'intake-photos';
const VALID_TYPES  = ['selfie', 'insuranceCardFront', 'insuranceCardBack', 'dlFront'] as const;
type PhotoType = typeof VALID_TYPES[number];

async function ensureBucket(): Promise<void> {
  const check = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  if (check.status !== 200) {
    await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    });
  }
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;

  const rec = await db.case.findUnique({
    where:  { id: caseId },
    select: { id: true, consentsData: true },
  });
  if (!rec) return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });

  const formData  = await req.formData();
  const file      = formData.get('file') as File | null;
  const photoType = formData.get('photoType') as string | null;

  if (!file || !photoType) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }
  if (!(VALID_TYPES as readonly string[]).includes(photoType)) {
    return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
  }

  await ensureBucket();

  const ext  = file.type.includes('png') ? 'png' : 'jpg';
  const path = `${rec.id}/${photoType}.${ext}`;

  const bytes     = await file.arrayBuffer();
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${SERVICE_KEY}`,
      apikey:         SERVICE_KEY,
      'Content-Type': file.type || 'image/jpeg',
      'x-upsert':     'true',
    },
    body: bytes,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error('[upload-photo] Supabase error:', errText);
    return NextResponse.json({ error: 'UPLOAD_FAILED', detail: errText }, { status: 500 });
  }

  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

  const prev   = (rec.consentsData ?? {}) as Record<string, unknown>;
  const photos = ((prev.photos ?? {}) as Record<string, string>);
  await db.case.update({
    where: { id: rec.id },
    data:  { consentsData: { ...prev, photos: { ...photos, [photoType]: url } } as object },
  });

  const actor = await resolveActor(req.headers);
  writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'STAFF_PHOTO_UPLOAD',
    entityType:  'Case',
    entityId:    rec.id,
    metadata:    { photoType },
  }).catch(() => undefined);

  return NextResponse.json({ url });
}
