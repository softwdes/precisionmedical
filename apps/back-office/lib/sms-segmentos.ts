/**
 * Cuántos segmentos SMS ocupa un texto — cada uno se factura aparte.
 *
 * Vive acá y no dentro del compositor por la razón de siempre: un módulo con
 * JSX no se puede importar en una prueba sin arrastrar React. Este archivo es
 * puro a propósito, igual que `lib/fechas`.
 *
 * ── Por qué el alfabeto importa más que la longitud ─────────────────────────
 *
 * Con el alfabeto GSM entran 160 caracteres en un segmento, y 153 por segmento
 * cuando son varios. Basta UN carácter fuera de ese alfabeto —una tilde, una
 * ñ, un emoji, una comilla curva de las que mete Word— para que el mensaje
 * entero pase a UCS-2, donde el segmento cae a 70 y 67. El mismo texto de 300
 * caracteres son 2 segmentos en GSM y 5 en UCS-2.
 *
 * Nadie lo ve en pantalla: el mensaje se lee igual. Por eso el compositor
 * muestra segmentos y no caracteres, y avisa cuando se fue a UCS-2.
 */

/** El alfabeto GSM 03.38 básico. Todo lo que no esté acá fuerza UCS-2. */
const GSM_BASICO =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/**
 * Los que SÍ entran en GSM pero cuestan DOS espacios (van con escape).
 *
 * Importa para el corte: un texto de 160 con tres llaves no entra en un
 * segmento aunque la cuenta de caracteres diga que sí.
 */
const GSM_EXTENDIDO = '^{}\\[~]|€';

export interface MedidaSms {
  /** true si el texto entra en el alfabeto GSM (el barato). */
  gsm: boolean;
  /** Longitud en "espacios" de la codificación, ya contando los escapes. */
  unidades: number;
  /** Cuántos segmentos se facturan. */
  segmentos: number;
  /** Los caracteres que rompen el GSM, sin repetir. Para poder señalarlos. */
  culpables: string[];
}

export function segmentosSms(texto: string): MedidaSms {
  const culpables: string[] = [];
  let unidades = 0;

  for (const ch of texto) {
    if (GSM_EXTENDIDO.includes(ch)) { unidades += 2; continue; }
    if (GSM_BASICO.includes(ch))    { unidades += 1; continue; }
    unidades += 1;
    if (!culpables.includes(ch)) culpables.push(ch);
  }

  const gsm = culpables.length === 0;

  /**
   * En UCS-2 la unidad no es el carácter sino el par subrogado: un emoji cuenta
   * como dos. `[...texto]` itera por code point, así que se recuenta en code
   * units, que es lo que factura el operador.
   */
  if (!gsm) unidades = texto.length;

  const simple = gsm ? 160 : 70;
  const multi  = gsm ? 153 : 67;

  const segmentos = unidades === 0 ? 0
    : unidades <= simple ? 1
    : Math.ceil(unidades / multi);

  return { gsm, unidades, segmentos, culpables };
}
