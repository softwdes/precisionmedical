/**
 * POST /api/intake/[token]/upload-photo
 * Sube una foto de identificación a Supabase Storage y guarda la URL en consentsData.photos
 *
 * Phase 1A: fotos de prueba en dev, no PHI real.
 * Phase 2: bucket privado + RLS + BAA antes de fotos reales.
 *
 * ── Esta ruta es PÚBLICA ────────────────────────────────────────────────────
 *
 * Es la única escritura de `forms` que acepta un ARCHIVO de un desconocido, y
 * hasta ahora no miraba ni el tipo ni el tamaño: el `Content-Type` que se le
 * mandaba a Storage era el que declaraba el cliente, así que cualquier archivo
 * quedaba servido desde nuestro dominio con su tipo original — y el bucket es
 * público. Un `image/svg+xml` ahí es XSS alojado por nosotros.
 *
 * El gemelo de esta lógica en el back-office vive en `lib/intake-photos.ts`
 * (dos rutas lo comparten). No se comparte entre las dos apps porque no hay un
 * paquete de storage en el workspace y crearlo es una decisión aparte; lo que
 * sí tiene que estar igual son las tres reglas: tipos permitidos, techo de
 * tamaño y el `Content-Type` validado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { rateLimit, claveDeIp, cabeceras429 } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };

const SUPABASE_URL   = process.env.SUPABASE_URL!;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET         = 'intake-photos';
const VALID_TYPES    = ['selfie', 'insuranceCardFront', 'insuranceCardBack', 'dlFront'] as const;
type PhotoType = typeof VALID_TYPES[number];

/**
 * Tipos aceptados → extensión con la que se guarda.
 *
 * HEIC/HEIF entran porque es lo que manda el selector de fotos de iPhone cuando
 * Safari no convierte; antes también entraban, pero guardados como `.jpg`, y así
 * no los abría ninguna pantalla. Fuera queda todo lo que no es una imagen,
 * `image/svg+xml` incluido: es un documento con scripts, no una foto.
 */
const TIPOS_IMAGEN: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** 10 MB. Una foto de un documento con la cámara del teléfono pesa 2–4 MB. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Freno por IP.
 *
 * Son cuatro fotos por intake y se pueden repetir si salen movidas, así que el
 * techo es holgado: lo que corta es la subida automatizada, no al paciente que
 * reintenta. Sin esto, un token válido es una carga ilimitada a nuestro Storage.
 */
const LIMITE = { max: 40, ventanaMs: 10 * 60 * 1000 };

/**
 * Crea el bucket la primera vez.
 *
 * La promesa se memoriza: corría en CADA subida, y son dos fetches a Supabase
 * para preguntar por algo que no cambia durante la vida del proceso. Se guarda
 * la promesa y no un booleano para que dos subidas simultáneas en el arranque en
 * frío no disparen dos creaciones.
 */
let bucketListo: Promise<void> | null = null;

function ensureBucket(): Promise<void> {
  bucketListo ??= (async () => {
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
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    });
  })().catch((e) => {
    // Un fallo no puede quedar cacheado como "listo": la próxima subida reintenta.
    bucketListo = null;
    throw e;
  });
  return bucketListo;
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;

  const freno = rateLimit(claveDeIp(req, 'upload-photo'), LIMITE);
  if (!freno.ok) {
    return NextResponse.json(
      { error: 'TOO_MANY_REQUESTS' },
      { status: 429, headers: cabeceras429(freno) },
    );
  }

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

  const tipo = file.type.toLowerCase();
  const ext  = TIPOS_IMAGEN[tipo];
  if (!ext) {
    return NextResponse.json({ error: 'INVALID_FILE_TYPE' }, { status: 400 });
  }
  // Con `file.size`, ANTES de leer el archivo a memoria: leerlo primero para
  // después rechazarlo es justo el gasto que el techo evita.
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'FILE_TOO_LARGE', maxBytes: MAX_BYTES }, { status: 400 });
  }

  await ensureBucket();

  const path = `${rec.id}/${photoType}.${ext}`;

  const bytes     = await file.arrayBuffer();
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization:   `Bearer ${SERVICE_KEY}`,
      apikey:          SERVICE_KEY,
      // El tipo VALIDADO, no el que declaró el cliente.
      'Content-Type':  tipo,
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
  const updatedPhotos: Record<string, string> = { ...photos, [photoType as PhotoType]: url };
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
