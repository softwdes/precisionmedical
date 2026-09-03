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

/**
 * `patient.preferredLanguage` (un `string | null` cualquiera) → idioma del mensaje.
 *
 * Existe para que cada pantalla no repita el estrechamiento a mano. Devuelve
 * `undefined` y no `'es'` cuando no hay idioma cargado: quien recibe esto es el
 * diálogo de envío, y un `'es'` acá volvería a tapar el problema que se está
 * arreglando —el idioma del paciente reemplazado por español silenciosamente—.
 * El último recurso lo pone el servidor, en un solo lugar.
 */
export function normalizarIdioma(preferido: string | null | undefined): PortalMessageLang | undefined {
  return preferido === 'en' || preferido === 'es' ? preferido : undefined;
}

/** Marcador que usa la vista previa donde después va el link real. */
export const MAGIC_LINK_PLACEHOLDER = '[magic-link]';

export function buildPortalSms(args: {
  lang: PortalMessageLang;
  caseCode: string;
  /** Nombre del menor cuando el destinatario es el apoderado. */
  nombrePaciente?: string | null;
  /** El link real, o `MAGIC_LINK_PLACEHOLDER` para la vista previa. */
  portalUrl: string;
}): string {
  const { lang, caseCode, nombrePaciente, portalUrl } = args;

  if (nombrePaciente) {
    return lang === 'es'
      ? `Precision Medical: Complete el formulario de registro de ${nombrePaciente} (caso ${caseCode}) con este enlace seguro: ${portalUrl} (expira en 24 h). Responda HELP para ayuda o STOP para no recibir mas mensajes.`
      : `Precision Medical: Please complete the registration form for ${nombrePaciente} (case ${caseCode}) using this secure link: ${portalUrl} (expires in 24h). Reply HELP for assistance or STOP to opt out.`;
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

/**
 * Cuerpo HTML del correo del portal.
 *
 * Deliberadamente sobrio: un correo de clínica con gradientes y logos grandes
 * se parece más a marketing, y los filtros lo tratan peor. Texto claro, un
 * botón, y el link visible abajo para quien no vea el botón.
 *
 * El `text` plano que acompaña es el MISMO cuerpo del SMS. No se duplica el
 * mensaje: si algún día cambia, cambia en un solo lado.
 */
export function portalEmailHtml(
  body: string,
  portalUrl: string,
  lang: PortalMessageLang,
): string {
  const cta      = lang === 'es' ? 'Completar el formulario' : 'Complete the form';
  const fallback = lang === 'es'
    ? 'Si el botón no funciona, copie este enlace en su navegador:'
    : 'If the button does not work, copy this link into your browser:';

  // El cuerpo lleva el link al final; en el correo va en el botón, no repetido.
  const intro = body.replace(portalUrl, '').replace(/\s{2,}/g, ' ').trim();

  return [
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">',
    '<div style="max-width:520px;margin:0 auto;padding:28px 18px;">',
    '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:26px;">',
    '<p style="margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;">Precision Medical Care</p>',
    `<p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#111827;">${escapeHtml(intro)}</p>`,
    `<p style="margin:0 0 22px;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;">${cta}</a></p>`,
    `<p style="margin:0;font-size:11px;line-height:1.6;color:#6b7280;">${fallback}<br/><span style="color:#4f46e5;word-break:break-all;">${escapeHtml(portalUrl)}</span></p>`,
    '</div></div></body></html>',
  ].join('');
}

/** El caseCode y el nombre entran al HTML: nunca sin escapar. */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
