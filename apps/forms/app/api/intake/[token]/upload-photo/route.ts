/**
 * POST /api/intake/[token]/upload-photo
 * Sube una foto de identificación a Supabase Storage y guarda la URL en consentsData.photos
 *
 * Phase 1A: fotos de prueba en dev, no PHI real.
 * Phase 2: bucket privado + RLS + BAA antes de fotos reales.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';

type Ctx = { params: Promise<{ token: string }> };

const SUPABASE_URL   = process.env.SUPABASE_URL!;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET         = 'intake-photos';
const VALID_TYPES    = ['selfie', 'insuranceCardFront', 'insuranceCardBack', 'dlFront'] as const;
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
  const { token } = await ctx.params;

  const rec = await db.case.findUnique({
    where:  { portalToken: token },
    select: { id: true, consentsData: true },
  });
  if (!rec) return NextResponse.json({ error: 'TOKEN_NOT_FOUND' }, { status: 404 });

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
      Authorization:   `Bearer ${SERVICE_KEY}`,
      apikey:          SERVICE_KEY,
      'Content-Type':  file.type || 'image/jpeg',
      'x-upsert':      'true',
    },
    body: bytes,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error('[upload-photo] Supabase error:', errText);
    return NextResponse.json({ error: 'UPLOAD_FAILED', detail: errText }, { status: 500 });
  }

  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

  // Persist URL in consentsData.photos
  const prev   = (rec.consentsData ?? {}) as Record<string, unknown>;
  const photos = ((prev.photos ?? {}) as Record<string, string>);
  const updatedPhotos: Record<string, string> = { ...photos, [photoType as string]: url };
  await db.case.update({
    where: { id: rec.id },
    data:  { consentsData: { ...prev, photos: updatedPhotos } as object },
  });

  writeAuditLog(db, {
    actorType:   'SYSTEM',
    actorUserId: null,
    action:      'INTAKE_PHOTO_UPLOAD',
    entityType:  'Case',
    entityId:    rec.id,
    metadata:    { photoType, token: token.slice(0, 8) + '…' },
  }).catch(() => undefined);

  return NextResponse.json({ url });
}
