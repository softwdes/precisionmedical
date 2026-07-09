/**
 * POST /api/admin/patients/[id]/upload-photo
 * Sube una foto de identificación del paciente a Supabase Storage.
 * Busca el caso más reciente del paciente y persiste la URL en consentsData.photos.
 * Bucket: intake-photos (mismo que usa el portal del paciente y la route de casos).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';

type Ctx = { params: Promise<{ id: string }> };

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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
  const { id: patientId } = await ctx.params;

  const patient = await db.patient.findUnique({
    where:  { id: patientId },
    select: { id: true },
  });
  if (!patient) return NextResponse.json({ error: 'PATIENT_NOT_FOUND' }, { status: 404 });

  // Busca el caso más reciente del paciente
  const latestCase = await db.case.findFirst({
    where:   { patientId },
    orderBy: { createdAt: 'desc' },
    select:  { id: true, consentsData: true },
  });
  if (!latestCase) return NextResponse.json({ error: 'NO_CASE_FOUND' }, { status: 404 });

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
  const path = `${latestCase.id}/${photoType}.${ext}`;

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
    console.error('[patient/upload-photo] Supabase error:', errText);
    return NextResponse.json({ error: 'UPLOAD_FAILED', detail: errText }, { status: 500 });
  }

  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

  const prev   = (latestCase.consentsData ?? {}) as Record<string, unknown>;
  const photos = ((prev.photos ?? {}) as Record<string, string>);
  await db.case.update({
    where: { id: latestCase.id },
    data:  { consentsData: { ...prev, photos: { ...photos, [photoType]: url } } as object },
  });

  writeAuditLog(db, {
    actorType:   'HUMAN_USER',
    actorUserId: null,
    action:      'STAFF_PHOTO_UPLOAD',
    entityType:  'Case',
    entityId:    latestCase.id,
    metadata:    { photoType, uploadedVia: 'patient-dialog', patientId },
  }).catch(() => undefined);

  return NextResponse.json({ url, caseId: latestCase.id });
}
