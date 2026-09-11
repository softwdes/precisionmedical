/**
 * El código PDF417 de la hoja de laboratorio.
 *
 * Es el código 2D que LabCorp escanea para no tipear la orden a mano. NO lleva
 * un enlace: lleva la orden entera en texto plano — ver `lib/ereq-payload.ts`,
 * que arma esa carga y reconstruye las dos órdenes reales carácter por carácter.
 *
 * ── Por qué una librería y no a mano ───────────────────────────────────────
 * PDF417 lleva corrección de errores Reed-Solomon sobre GF(929), modos de
 * compactación y una tabla de 2.787 patrones de 17 módulos. Escribí un Code 128
 * a mano para la primera versión de esta hoja: ahí la tabla es de 107 entradas y
 * **igual me equivoqué en una**, y la encontró un invariante, no una prueba de
 * lectura. Con 2.787 y sin un escáner para probar, hacerlo a mano sería
 * complejidad inverificable.
 * `bwip-js` es la implementación de referencia (BWIPP), corre en el servidor y
 * no necesita navegador ni canvas.
 *
 * ── La geometría sale de MEDIR el código de ellos ──────────────────────────
 * La imagen del código en las órdenes reales es de **546 × 90 px** a 1 bit. Con
 * 2 px por módulo eso da 273 módulos de ancho, y como un PDF417 mide
 * `17·(columnas+4)+1`, sale **12 columnas** exactas. No es una preferencia
 * estética: si el laboratorio tiene su escáner o su recorte calibrado para ese
 * tamaño, uno de otra forma puede no leerse.
 *
 * ⚠️ **Esto NO está probado contra un escáner real.** El símbolo es correcto
 * según la librería de referencia, pero el ancho de barra, el contraste y los
 * márgenes dependen de la impresora. Antes de que la clínica dependa de esto hay
 * que imprimir UNA hoja y pasarla por el lector.
 */

import bwipjs from 'bwip-js/node';

/** Columnas de datos, medidas en el código de LabCorp (546 px / 2 px por módulo). */
export const COLUMNAS = 12;

/**
 * Nivel de corrección de errores.
 *
 * 5 es el que recomienda el estándar para cargas de 321 a 863 codewords, y las
 * nuestras rondan los 700 caracteres. Más nivel = más redundancia = símbolo más
 * grande; menos = un símbolo que una mancha de tóner vuelve ilegible. No se
 * pudo medir el de ellos (la imagen no dice su nivel), así que se elige por el
 * estándar y no por imitación.
 */
export const NIVEL_CORRECCION = 5;

/**
 * Devuelve el PDF417 como PNG en base64, listo para `<Image src=…>` de
 * `@react-pdf/renderer`.
 *
 * `null` si la librería no pudo generarlo — el llamador decide qué hacer, y en
 * la hoja eso significa imprimir sin código en vez de no imprimir: una
 * requisición sin código se carga a mano en el laboratorio, una hoja que no sale
 * deja al paciente sin nada.
 */
export async function pdf417Base64(texto: string): Promise<string | null> {
  if (!texto) return null;
  try {
    /*
     * `columns` y `eclevel` son opciones PROPIAS del PDF417: BWIPP las acepta en
     * ejecución, pero los tipos que publica `bwip-js` solo declaran las comunes
     * a todas las simbologías. Por eso el objeto se arma aparte y se convierte
     * una sola vez, acá: así el resto del archivo sigue con tipos de verdad y la
     * conversión queda a la vista, con su motivo, en vez de un `any` suelto.
     */
    const opciones = {
      bcid: 'pdf417',
      text: texto,
      columns: COLUMNAS,
      eclevel: NIVEL_CORRECCION,
      /**
       * `scale` en píxeles por módulo y `height` en módulos de alto por fila.
       * 2 y 3 reproducen la proporción del código real: ancho de 2 px por módulo
       * y filas bajas, que es lo que da ese bloque chato y ancho.
       */
      scale: 2,
      height: 3,
      /** Sin texto debajo: el código de ellos tampoco lo lleva. */
      includetext: false,
    };
    const png = await bwipjs.toBuffer(opciones as unknown as Parameters<typeof bwipjs.toBuffer>[0]);
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}
