/**
 * Subida de fotos de identificación al bucket `intake-photos`.
 *
 * Vive en un archivo propio porque la misma subida estaba escrita TRES veces —
 * `cases/[id]/upload-photo`, `patients/[id]/upload-photo` y la del portal del
 * paciente en `apps/forms`— y las tres copias compartían los mismos tres
 * agujeros. Mismo criterio que `portal-token.ts`: lo que custodia un documento
 * de identidad no puede depender de que alguien se acuerde de arreglar las tres.
 *
 * ── Lo que faltaba en las tres copias ───────────────────────────────────────
 *
 *  1. **Nada validaba el archivo.** `formData.get('file')` entraba tal cual: sin
 *     tipo y sin techo de tamaño. El `Content-Type` que se le mandaba a Storage
 *     era el que declaraba el cliente, así que un `.exe` o un `.svg` con script
 *     quedaba servido desde nuestro dominio de Storage con su tipo original.
 *  2. **La extensión se adivinaba** con `file.type.includes('png') ? 'png' : 'jpg'`.
 *     Un HEIC de iPhone se guardaba como `.jpg` y no lo abría nadie.
 *  3. **`ensureBucket()` corría en CADA subida** — dos fetches a Supabase para
 *     preguntar por un bucket que existe desde la primera vez.
 *
 * ── Lo que NO resuelve este archivo ────────────────────────────────────────
 *
 * El bucket sigue siendo PÚBLICO (`public: true`), y lo que guarda son licencias
 * de conducir, tarjetas de seguro y selfies. La URL que queda en
 * `consentsData.photos` abre sin sesión y no vence. El patrón correcto ya existe
 * en este repo —`lab-results` es privado y se sirve con URL firmada de 15 min
 * (ver `lab-orders/item/[id]/result`)— pero cambiarlo acá invalida todas las
 * URLs ya guardadas y obliga a migrar los objetos existentes: es una decisión de
 * proyecto, no un detalle de implementación. Queda anotado a propósito.
 */

/** Storage vive en el proyecto Phoenix (kiqlh…) — vars dedicadas con fallback legacy. */
const SUPABASE_URL = (process.env.SUPABASE_STORAGE_URL
  ?? process.env.SUPABASE_URL
  ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY = (process.env.SUPABASE_STORAGE_SERVICE_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;

export const BUCKET = 'intake-photos';

/** Los cuatro documentos que pide el intake. */
export const VALID_PHOTO_TYPES = [
  'selfie', 'insuranceCardFront', 'insuranceCardBack', 'dlFront',
] as const;
export type PhotoType = typeof VALID_PHOTO_TYPES[number];

export function esPhotoType(v: unknown): v is PhotoType {
  return typeof v === 'string' && (VALID_PHOTO_TYPES as readonly string[]).includes(v);
}

/**
 * Tipos aceptados → extensión con la que se guarda.
 *
 * HEIC/HEIF entran porque es lo que manda el selector de fotos de iPhone cuando
 * Safari no convierte. Antes también entraban, pero con nombre `.jpg`: el
 * archivo quedaba guardado y no se veía en ninguna pantalla. Ahora al menos
 * conserva su extensión real. Lo que queda fuera es todo lo que no es una
 * imagen —incluido `image/svg+xml`, que es un documento con scripts, no una
 * foto, y desde un bucket público sería XSS servido por nosotros.
 */
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** 10 MB. Una foto de un documento con la cámara del teléfono pesa 2–4 MB. */
export const MAX_BYTES = 10 * 1024 * 1024;

export interface FotoValida {
  ok: true;
  /** Ya estrechado a `PhotoType` — quien llama no vuelve a castear. */
  photoType: PhotoType;
  tipo: string;
  ext: string;
  bytes: ArrayBuffer;
}

export type ValidacionFoto =
  | FotoValida
  | { ok: false; error: 'MISSING_FIELDS' | 'INVALID_TYPE' | 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE' };

/**
 * Valida el par (archivo, photoType) del `FormData` y devuelve los bytes.
 *
 * El tamaño se mira con `file.size` ANTES de leer el archivo a memoria: leerlo
 * primero para después rechazarlo es exactamente el gasto que el techo evita.
 */
export async function validarFoto(
  file: File | null,
  photoType: string | null,
): Promise<ValidacionFoto> {
  if (!file || !photoType) return { ok: false, error: 'MISSING_FIELDS' };
  if (!esPhotoType(photoType)) return { ok: false, error: 'INVALID_TYPE' };

  const ext = TIPOS[file.type.toLowerCase()];
  if (!ext) return { ok: false, error: 'INVALID_FILE_TYPE' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'FILE_TOO_LARGE' };

  return {
    ok: true,
    photoType,
    tipo:  file.type.toLowerCase(),
    ext,
    bytes: await file.arrayBuffer(),
  };
}

/**
 * Crea el bucket la primera vez.
 *
 * La promesa se memoriza en el módulo: corría en cada subida, y son dos fetches
 * a Supabase para preguntar por algo que no cambia durante la vida del proceso.
 * Se guarda la promesa y no un booleano para que dos subidas simultáneas en el
 * arranque en frío no disparen dos creaciones.
 */
let bucketListo: Promise<void> | null = null;

export function asegurarBucket(): Promise<void> {
  bucketListo ??= (async () => {
    const check = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (check.status === 200) return;
    await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${SERVICE_KEY}`,
        apikey:         SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      // ⚠️ público — ver el encabezado de este archivo.
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    });
  })().catch((e) => {
    // Un fallo no puede quedar cacheado como "listo": la próxima subida reintenta.
    bucketListo = null;
    throw e;
  });
  return bucketListo;
}

export type ResultadoSubida =
  | { ok: true;  url: string }
  | { ok: false; detalle: string };

/**
 * Sube la foto y devuelve su URL pública.
 *
 * @param caseId Carpeta del objeto — una por caso, un archivo por `photoType`.
 */
export async function subirFoto(
  caseId: string,
  foto: FotoValida,
): Promise<ResultadoSubida> {
  await asegurarBucket();

  const path = `${caseId}/${foto.photoType}.${foto.ext}`;
  const res  = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method:  'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey:        SERVICE_KEY,
      // El tipo VALIDADO, no el que declaró el cliente.
      'Content-Type': foto.tipo,
      'x-upsert':     'true',
    },
    body: foto.bytes,
  });

  if (!res.ok) return { ok: false, detalle: await res.text() };

  return { ok: true, url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}` };
}

/**
 * Borra el objeto de Storage a partir de la URL guardada. Best-effort.
 *
 * La ruta dentro del bucket se recupera de la URL y no se recalcula: la
 * extensión con la que se guardó puede no ser la que produciría hoy `TIPOS`
 * (las fotos viejas se subieron todas como `.jpg`), así que reconstruirla
 * dejaría el archivo huérfano en el bucket.
 */
export function borrarObjeto(urlGuardada: string | undefined): void {
  const path = urlGuardada?.split(`/object/public/${BUCKET}/`)[1];
  if (!path) return;
  void fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  }).catch(() => undefined);
}

/**
 * Mezcla la URL nueva en `consentsData.photos` sin pisar el resto del JSON.
 *
 * Las tres rutas repetían este spread de dos niveles; equivocarse en el de
 * afuera borra los consentimientos del caso enteros.
 */
export function conFotoNueva(
  consentsData: unknown,
  photoType: PhotoType,
  url: string,
): object {
  const prev   = (consentsData ?? {}) as Record<string, unknown>;
  const photos = (prev.photos ?? {}) as Record<string, string>;
  return { ...prev, photos: { ...photos, [photoType]: url } };
}

/** Las fotos guardadas en el `consentsData` de un caso. */
export function fotosDe(consentsData: unknown): Record<string, string> {
  return ((consentsData ?? {}) as Record<string, unknown>).photos as Record<string, string> ?? {};
}

/** El mismo JSON sin esa foto. Devuelve también la URL que había, para borrarla. */
export function sinFoto(
  consentsData: unknown,
  photoType: PhotoType,
): { consents: object; urlPrevia: string | undefined } {
  const prev   = (consentsData ?? {}) as Record<string, unknown>;
  const photos = { ...fotosDe(consentsData) };
  const urlPrevia = photos[photoType];
  delete photos[photoType];
  return { consents: { ...prev, photos }, urlPrevia };
}
