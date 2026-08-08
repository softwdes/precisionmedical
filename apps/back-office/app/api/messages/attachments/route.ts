/**
 * POST /api/messages/attachments — sube UN archivo adjunto (multipart: file).
 *
 * Se llama al elegir cada archivo en el compose, ANTES de que exista el hilo:
 * devuelve la key de Storage y el POST /api/messages la referencia después.
 * Los huérfanos (subió y nunca envió) quedan en `uploads/` — inofensivos en un
 * bucket privado; se pueden barrer con un cleanup si algún día pesa.
 *
 * El bucket `message-attachments` es PRIVADO (criterio lab-results): un
 * adjunto clínico es PHI y no puede quedar accesible por URL pública. La
 * lectura va por GET /api/messages/attachments/[id] con URL firmada.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { requireMessagingActor } from '@/lib/messaging';

const SUPABASE_URL = (process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY = (process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
const BUCKET = 'message-attachments';
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'MISSING_FILE' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 415 });

  await ensureBucket();

  // Key derivada de un UUID — nunca del nombre subido (evita traversal).
  const path = `uploads/${randomUUID()}.${ext}`;

  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': file.type,
    },
    body: await file.arrayBuffer(),
  });

  if (!upload.ok) {
    const detail = await upload.text();
    console.error('[message-attachment] Supabase error:', detail);
    return NextResponse.json({ error: 'UPLOAD_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ path, fileName: file.name.slice(0, 200) }, { status: 201 });
}
