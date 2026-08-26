/**
 * El texto del SMS que le manda el portal al paciente. Fuente única.
 *
 * Existía DOS veces: una en el route que envía y otra en el diálogo, para la
 * vista previa. Se desincronizaron apenas se tocó una — el 2026-08-25 el
 * servidor ya mandaba el texto nuevo con el prefijo y el opt-out, y la vista
 * previa seguía mostrando el viejo. Recepción veía una cosa y el paciente
 * recibía otra, y lo que faltaba era justo la parte que evita que el operador
 * filtre el mensaje.
 *
 * Es un armador de strings sin dependencias de servidor, así que lo importan
 * los dos lados y no puede volver a divergir.
 *
 * ⚠️ El texto tiene que PARECERSE a los "sample messages" registrados en la
 * campaña A2P 10DLC — los operadores comparan. Dos piezas no son opcionales:
 *   · el prefijo "Precision Medical:" — identifica al remitente
 *   · "STOP para no recibir más mensajes" — requisito TCPA; sin eso filtran el
 *     primer mensaje a un número
 * Y va SIN ACENTOS a propósito: un solo acento pasa el SMS a codificación
 * UCS-2, y los segmentos bajan de 153 a 67 caracteres (cada uno se cobra).
 */

export type PortalMessageLang = 'es' | 'en';

/** Marcador que usa la vista previa donde después va el link real. */
export const MAGIC_LINK_PLACEHOLDER = '[magic-link]';

export function buildPortalSms(args: {
  lang: PortalMessageLang;
  caseCode: string;
  /** Nombre del menor cuando el destinatario es el apoderado. */
  minorName?: string | null;
  /** El link real, o `MAGIC_LINK_PLACEHOLDER` para la vista previa. */
  portalUrl: string;
}): string {
  const { lang, caseCode, minorName, portalUrl } = args;

  if (minorName) {
    return lang === 'es'
      ? `Precision Medical: Complete el formulario de registro de ${minorName} (caso ${caseCode}) con este enlace seguro: ${portalUrl} (expira en 24 h). Responda HELP para ayuda o STOP para no recibir mas mensajes.`
      : `Precision Medical: Please complete the registration form for ${minorName} (case ${caseCode}) using this secure link: ${portalUrl} (expires in 24h). Reply HELP for assistance or STOP to opt out.`;
  }

  return lang === 'es'
    ? `Precision Medical: Complete su formulario de registro (caso ${caseCode}) con este enlace seguro: ${portalUrl} (expira en 24 h). Responda HELP para ayuda o STOP para no recibir mas mensajes.`
    : `Precision Medical: Please complete your registration form (case ${caseCode}) using this secure link: ${portalUrl} (expires in 24h). Reply HELP for assistance or STOP to opt out.`;
}

/**
 * Cuántos segmentos SMS ocupa un texto — cada uno se factura aparte.
 *
 * Con alfabeto GSM entran 160 en un segmento y 153 por segmento si son varios;
 * con UCS-2 (cualquier acento o emoji) baja a 70 y 67. La vista previa lo
 * muestra para que nadie descubra el costo real recién en la factura.
 */
export function smsSegments(text: string): { chars: number; segments: number; gsm: boolean } {
  const gsm = !/[^\x00-\x7F]/.test(text);
  const single = gsm ? 160 : 70;
  const multi  = gsm ? 153 : 67;
  const segments = text.length <= single ? 1 : Math.ceil(text.length / multi);
  return { chars: text.length, segments, gsm };
}
