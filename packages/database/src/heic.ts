/**
 * HEIC → JPEG. Compartido por las DOS vías por las que entra una foto.
 *
 * ── Por qué vive acá y no en una app ────────────────────────────────────────
 *
 * Porque una foto de identidad entra por dos puertas distintas y las dos tienen
 * que convertir:
 *
 *   · el back-office — recepción sube desde la ficha del paciente o del caso
 *     (`apps/back-office/lib/intake-photos.ts`)
 *   · el formulario de admisión — **el paciente sube desde su propio teléfono**
 *     (`apps/forms/app/api/intake/[token]/upload-photo/route.ts`)
 *
 * El 2026-09-30 se arregló sólo la primera y el problema siguió igual, porque
 * Stephanie Poulson subía por la segunda. Tener la conversión en un solo lugar
 * es lo que evita que la próxima puerta nazca sin ella — misma lección que
 * `foto-identidad.ts`, que está en este paquete por el mismo motivo.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 *
 * El iPhone guarda en HEIC y **no lo lee ninguna de las piezas que el sistema
 * usaba**: el navegador no lo dibuja en un `<canvas>` —por eso falla la
 * conversión del lado del cliente— y `sharp` tampoco, porque su binario no trae
 * el decodificador de HEVC por patentes (probado: `source: bad seek to …`).
 *
 * Sin esto el archivo se guardaba igual y quedaba ilegible para siempre: la
 * ficha mostraba "A photo is on file, but it could not be loaded" y ni el PDF ni
 * el portal legal podían hacer nada con él.
 *
 * ── Por qué también pasa por sharp ─────────────────────────────────────────
 *
 * Porque el JPEG que sale del decodificador es MÁS grande que el HEIC de
 * entrada (HEIC comprime mejor). Se achica al mismo criterio que usa el
 * navegador cuando la conversión sí funciona: 1600 px de lado y calidad 85. Con
 * eso una foto de 1,3 MB queda en 342 KB, o sea menos que el original.
 */

/** Los `ftyp` con los que arranca un HEIC. */
const MARCAS_HEIC = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'];

/**
 * ¿Estos bytes son un HEIC?
 *
 * Se decide por los BYTES y nunca por la extensión ni por el `Content-Type`: en
 * este proyecto los dos mienten —hay WebP guardados como `.jpg` y servidos como
 * `image/jpeg`—, así que confiar en la etiqueta deja pasar justo el caso que
 * hay que atrapar.
 */
export function esHeic(b: Buffer): boolean {
  if (b.length < 12) return false;
  if (b.subarray(4, 8).toString('latin1') !== 'ftyp') return false;
  return MARCAS_HEIC.includes(b.subarray(8, 12).toString('latin1'));
}

/**
 * Convierte a JPEG. Devuelve `null` si no era HEIC o si no se pudo convertir.
 *
 * Falla CERRADO a propósito: devolver el original ante un error volvería a
 * guardar el archivo ilegible, que es exactamente el bug que esto cierra. Quien
 * llame tiene que rechazar la subida y decirle a la persona qué hacer.
 */
export async function heicAJpeg(bytes: ArrayBuffer | Buffer): Promise<Buffer | null> {
  const crudo = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (!esHeic(crudo)) return null;
  try {
    const convert = (await import('heic-convert')).default;
    const jpeg = await convert({ buffer: crudo, format: 'JPEG', quality: 0.9 });
    const sharp = (await import('sharp')).default;
    return await sharp(Buffer.from(jpeg))
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (e) {
    console.error('[heic] no se pudo convertir', {
      bytes: crudo.byteLength,
      marca: crudo.subarray(4, 12).toString('latin1'),
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
