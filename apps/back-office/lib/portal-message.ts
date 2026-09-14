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

/**
 * El idioma REAL en el que hay que hablarle a un paciente. Última palabra.
 *
 * El último recurso es **inglés**, y hasta el 2026-09-14 era español. Eso no
 * era una preferencia: era un default heredado que contradecía a los pacientes.
 * Medido ese día sobre los 5.726 de la base:
 *
 *     en            3.371   58,9%
 *     (sin cargar)  2.284   39,9%   ← éstos caían a español
 *     pt/fr/it         47    0,8%   ← y éstos también
 *     es               22    0,4%
 *
 * Y desde que arrancó el sistema nuevo, **ni un solo paciente se registró en
 * español**: 49 en inglés y 43 sin idioma en los últimos 30 días, cero en
 * español. O sea que la regla vieja le mandaba todo en español a casi la mitad
 * de los pacientes nuevos de una clínica donde nadie habla español por defecto.
 *
 * Los 47 de portugués, francés e italiano también ganan con esto: el inglés no
 * es su idioma, pero es el de la clínica — el español era una tercera lengua
 * elegida al azar.
 *
 * El paciente que SÍ tiene `es` cargado sigue recibiendo español. Esto sólo
 * decide qué pasa cuando no hay dato, que es el 40% de las veces.
 *
 * Vive acá, con `buildPortalSms` y `buildAppointmentReminderSms`, porque la
 * regla estaba copiada en tres archivos: el link del portal, el alta rápida y
 * el recordatorio. Tres copias de una decisión es una decisión que se va a
 * desincronizar — ya pasó con el texto del SMS, que es por lo que este archivo
 * existe.
 */
export function idiomaDelPaciente(preferido: string | null | undefined): PortalMessageLang {
  return normalizarIdioma(preferido) ?? 'en';
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
 * El SMS de recordatorio de la cita.
 *
 * Se manda AL AGENDAR, no el día antes (decisión de Erick 2026-09-14). El
 * pedido vino de una prueba real: se creó un paciente y su cita, llegó el SMS
 * del formulario y ningún aviso de la cita — "I got the text to fill out the
 * paperwork but no reminder of the appointment I created".
 *
 * ── Por qué NO pide confirmar ───────────────────────────────────────────────
 * El mensaje que la clínica usaba de modelo terminaba con "To confirm your
 * appointment please reply YES". Se sacó a propósito: **nadie lee los SMS
 * entrantes**. `/api/twilio/incoming` ni siquiera mira el cuerpo del mensaje,
 * así que el paciente que contestara YES le estaría hablando a un buzón que no
 * existe. Pedir una acción que no se procesa es peor que no pedirla.
 *
 * Por eso dice que es automático y que no se responda. El HELP/STOP se queda
 * igual — ése no es opcional, lo exige el operador (ver la cabecera del
 * archivo): sin él filtran el primer mensaje a un número y no llega nada.
 *
 * ── Todo es opcional menos la fecha ─────────────────────────────────────────
 * `direccion` y `telefono` pueden faltar y la frase se omite entera en vez de
 * quedar colgada. No es defensivo por gusto: hoy mismo `Murray - Surgery` no
 * tiene dirección cargada, y sin esto el paciente recibiría "oficina Murray -
 * Surgery, ." con el hueco a la vista.
 *
 * Los textos ya vienen formateados y SIN ACENTOS. Este archivo no sabe de
 * zonas horarias a propósito —es un armador de strings— y el acento importa:
 * uno solo pasa el SMS a UCS-2 y el segmento cae de 153 a 67 caracteres.
 */
export function buildAppointmentReminderSms(args: {
  lang: PortalMessageLang;
  /** Ya formateado en la zona de la clínica y sin acentos: "mar 15 de sep de 2026 a las 4:00 PM". */
  cuando: string;
  /** Hora a la que tiene que llegar, 15 min antes: "3:45 PM". */
  horaLlegada: string;
  clinica: string;
  /** Sin cargar en algunas sedes: si falta, no se nombra. */
  direccion?: string | null;
  /** Teléfono de la sede. Si falta, se omite la invitación a llamar. */
  telefono?: string | null;
  /** Nombre del menor cuando el destinatario es el apoderado o el canal es compartido. */
  nombrePaciente?: string | null;
}): string {
  const { lang, cuando, horaLlegada, clinica, direccion, telefono, nombrePaciente } = args;

  const lugar = direccion ? `${clinica}, ${direccion}` : clinica;

  if (lang === 'es') {
    const deQuien = nombrePaciente ? `Cita de ${nombrePaciente}` : 'Su cita es';
    return [
      `Precision Medical: ${deQuien} el ${cuando}, ${lugar}.`,
      `Llegue ${horaLlegada} para el registro; 15+ min tarde puede reprogramarse.`,
      telefono ? `Consultas: ${telefono}.` : null,
      'Mensaje automatico, no responda. HELP ayuda, STOP para salir.',
    ].filter(Boolean).join(' ');
  }

  const deQuien = nombrePaciente ? `Appointment for ${nombrePaciente}` : 'Your appointment is';
  return [
    `Precision Medical: ${deQuien} ${cuando}, ${lugar}.`,
    `Arrive at ${horaLlegada} for check-in; 15+ min late may be rescheduled.`,
    telefono ? `Questions: ${telefono}.` : null,
    'Automated message, do not reply. HELP for help, STOP to opt out.',
  ].filter(Boolean).join(' ');
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
 * Asunto y cuerpo por defecto del correo del portal.
 *
 * Vive acá y no en el diálogo por la misma razón que el SMS: el diálogo lo
 * muestra para que recepción lo edite, y el servidor lo usa cuando el envío
 * viene de un caller que no abre diálogo (el alta de caso, el registro
 * rápido). Con una copia en cada lado, el día que se corrija el texto se
 * corrige la mitad de los envíos.
 *
 * NO es el texto del SMS. El SMS lleva el prefijo del remitente y el "STOP
 * para no recibir mas mensajes" que exige el operador; meter eso en un correo
 * es mandarle al paciente una instrucción que no aplica —no hay nada a lo que
 * responder STOP— y que además lo hace parecer publicidad. El correo tiene su
 * propio cuerpo, y el link va en el botón.
 */
export function buildPortalEmail(args: {
  lang: PortalMessageLang;
  /** A quién se saluda: el paciente, o el apoderado del menor. */
  nombreDestinatario: string;
  /** Nombre del menor cuando el destinatario es el apoderado. */
  nombrePaciente?: string | null;
}): { subject: string; body: string } {
  const { lang, nombreDestinatario, nombrePaciente } = args;

  if (nombrePaciente) {
    return lang === 'es'
      ? {
          subject: `Recordatorio: completa el formulario de ${nombrePaciente}`,
          body: `Hola ${nombreDestinatario},\n\nComo responsable legal de ${nombrePaciente}, tu clínica te recuerda completar su formulario de información antes de la próxima cita.\n\nUsa el enlace seguro que llegará a continuación para completar el registro.\n\nGracias,\nPrecision Medical`,
        }
      : {
          subject: `Reminder: complete the information form for ${nombrePaciente}`,
          body: `Hello ${nombreDestinatario},\n\nAs the legal guardian of ${nombrePaciente}, your clinic is reminding you to complete their information form before the next visit.\n\nUse the secure link that will follow to complete the registration.\n\nThank you,\nPrecision Medical`,
        };
  }

  return lang === 'es'
    ? {
        subject: `Recordatorio: completa tu formulario, ${nombreDestinatario}`,
        body: `Hola ${nombreDestinatario},\n\nTu clínica te recuerda completar tu formulario de información antes de tu próxima cita.\n\nUsa el enlace seguro que llegará a continuación para completar tu registro.\n\nGracias,\nPrecision Medical`,
      }
    : {
        subject: `Reminder: complete your information form, ${nombreDestinatario}`,
        body: `Hello ${nombreDestinatario},\n\nYour clinic is reminding you to complete your information form before your next visit.\n\nUse the secure link that will follow to complete your registration.\n\nThank you,\nPrecision Medical`,
      };
}

/**
 * Cuerpo HTML del correo del portal.
 *
 * Deliberadamente sobrio: un correo de clínica con gradientes y logos grandes
 * se parece más a marketing, y los filtros lo tratan peor. Texto claro, un
 * botón, y el link visible abajo para quien no vea el botón.
 *
 * `cuerpo` es texto plano con saltos de línea —el que arma `buildPortalEmail`,
 * o el que escribió recepción en el diálogo—. Los párrafos se respetan: antes
 * esto colapsaba todo a una sola línea con un `replace(/\s{2,}/g, ' ')`, que
 * para el cuerpo del SMS daba igual (es una sola oración) pero convertía una
 * carta de cuatro párrafos en un ladrillo.
 */
export function portalEmailHtml(
  cuerpo: string,
  portalUrl: string,
  lang: PortalMessageLang,
): string {
  const cta      = lang === 'es' ? 'Completar el formulario' : 'Complete the form';
  const fallback = lang === 'es'
    ? 'Si el botón no funciona, copie este enlace en su navegador:'
    : 'If the button does not work, copy this link into your browser:';

  // El link va en el botón. Si el cuerpo ya lo trae (pasa cuando el caller
  // manda el texto del SMS), se saca para no repetirlo dos veces.
  const texto = cuerpo.split(portalUrl).join('').trim();

  // Un párrafo por bloque separado con línea en blanco; los saltos sueltos de
  // adentro (la firma, por ejemplo) quedan como <br/>.
  const parrafos = texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#111827;">${escapeHtml(p).replaceAll('\n', '<br/>')}</p>`)
    .join('');

  return [
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">',
    '<div style="max-width:520px;margin:0 auto;padding:28px 18px;">',
    '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:26px;">',
    '<p style="margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;">Precision Medical Care</p>',
    parrafos,
    `<p style="margin:8px 0 22px;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;">${cta}</a></p>`,
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
