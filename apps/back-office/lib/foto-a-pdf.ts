/**
 * Dejar una foto de identidad lista para meterla en un PDF.
 *
 * ── Por qué existe este archivo ─────────────────────────────────────────────
 *
 * Porque en este almacenamiento **ni la extensión ni el `Content-Type` dicen la
 * verdad**, y creerles no da un error: da una hoja en blanco. La migración del
 * v2 guardó WebP con nombre `.jpg`, y Storage los sirve como `image/jpeg`
 * porque mira la extensión. El navegador olfatea el contenido y los muestra
 * igual —por eso la licencia de Sandra Ramos se veía y se bajaba bien—, pero
 * `@react-pdf/renderer` le cree a la etiqueta, no encuentra la marca de
 * arranque del JPEG y dibuja la página vacía **sin tirar ningún error**.
 * Medido el 27-sep-2026: el PDF salía de 1.166 bytes, con `200 OK`.
 *
 * Vive en `lib/` y no dentro de la ruta por una razón concreta: acá se puede
 * EJECUTAR contra archivos de verdad. La primera versión de esto vivía en la
 * ruta, compilaba limpio y cortaba con 415 justo antes de convertir — o sea que
 * el WebP, que es el caso que vino a arreglar, seguía fallando. `tsc` no lo vio
 * porque `'otro'` es un valor legítimo del tipo.
 */

/** Los formatos que `@react-pdf/renderer` sabe dibujar. Son estos dos y nada más. */
export type FormatoDibujable = 'jpeg' | 'png';

/** Lo que puede ser un archivo de estos, mirando los bytes. */
export type FormatoReal = FormatoDibujable | 'pdf' | 'otro';

/**
 * Qué es el archivo DE VERDAD, por sus primeros bytes.
 *
 * `'otro'` NO quiere decir "está roto": quiere decir "no lo dibuja el renderer
 * tal como viene". El WebP cae ahí, y el WebP es la mitad del problema — en una
 * muestra de 40 fotos de identidad había 27 JPEG, 12 WebP disfrazados y 1 PDF.
 */
export function formatoReal(b: Buffer): FormatoReal {
  if (b.length < 12) return 'otro';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'png';
  if (b.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  return 'otro';
}

/**
 * La imagen en un formato que el renderer entienda.
 *
 * JPEG y PNG pasan derecho. Todo lo demás —el WebP del v2, y el HEIC que manda
 * un iPhone cuando Safari no convierte— se re-codifica a JPEG con `sharp`.
 *
 * ── Por qué `sharp` y por qué con `import()` adentro ───────────────────────
 *
 * Es la única dependencia que suma este arreglo. Se carga BAJO DEMANDA, solo
 * cuando hay algo que convertir: no engorda una descarga que la mayoría de las
 * veces no la necesita —27 de cada 40 fotos ya son JPEG— y, si algún día falta
 * en el runtime, lo que se rompe es esa descarga, con un error claro, y no la
 * ruta entera. Next la trata como paquete externo del servidor por defecto, así
 * que el `import()` no la empaqueta.
 *
 * Calidad 90 y sin redimensionar: es un documento de identidad y lo que se lee
 * son números de póliza y de licencia. Achicarlo para ahorrar unos KB es
 * exactamente lo que no se puede hacer acá.
 *
 * Devuelve `null` si no se pudo, y quien llama **tiene que cortar ahí**: seguir
 * de largo es volver a la hoja en blanco con `200 OK`, que es el peor resultado
 * posible porque nadie se entera hasta que abre el archivo.
 */
export async function paraElRenderer(
  b: Buffer,
  formato: FormatoDibujable | 'otro',
): Promise<{ bytes: Buffer; formato: FormatoDibujable } | null> {
  if (formato !== 'otro') return { bytes: b, formato };

  try {
    const sharp = (await import('sharp')).default;
    return { bytes: await sharp(b).jpeg({ quality: 90 }).toBuffer(), formato: 'jpeg' };
  } catch (e) {
    console.error('[foto-a-pdf] no se pudo convertir la foto a JPEG', {
      bytes: b.byteLength, cabecera: b.subarray(0, 12).toString('hex'),
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
