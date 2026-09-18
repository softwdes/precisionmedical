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
  /**
   * Telemedicina. Cambia el mensaje ENTERO, no una palabra.
   *
   * Una cita en línea igual tiene sede guardada —define de qué clínica se cuenta
   * y quién atiende— pero al paciente no le sirve de nada: no va a ninguna parte.
   * Nombrársela, y encima pedirle que llegue 15 minutos antes, es hacerlo
   * manejar hasta una oficina para una videollamada.
   */
  enLinea?: boolean;
  /** El link de la videollamada. Suele faltar: ver el comentario de abajo. */
  enlace?: string | null;
}): string {
  const { lang, cuando, horaLlegada, clinica, direccion, telefono, nombrePaciente, enLinea, enlace } = args;

  const es = lang === 'es';
  const deQuien = nombrePaciente
    ? (es ? `Cita de ${nombrePaciente}` : `Appointment for ${nombrePaciente}`)
    : (es ? 'Su cita es' : 'Your appointment is');
  const cierre = es
    ? 'Mensaje automatico, no responda. HELP ayuda, STOP para salir.'
    : 'Automated message, do not reply. HELP for help, STOP to opt out.';
  const consultas = telefono
    ? (es ? `Consultas: ${telefono}.` : `Questions: ${telefono}.`)
    : null;

  // ── En línea ──────────────────────────────────────────────────────────────
  // Ni dirección ni hora de llegada. Y el enlace NO se da por hecho: medido el
  // 2026-09-14, 28 de las 29 citas de telemedicina no lo tienen cargado. Sin
  // enlace, el mensaje dice que la clínica llama — prometer un link que no
  // existe deja al paciente esperando frente a una pantalla en blanco.
  if (enLinea) {
    const conector = es ? 'por videollamada el' : 'is a video visit on';
    return [
      es ? `Precision Medical: ${deQuien} ${conector} ${cuando}.`
         : `Precision Medical: ${deQuien.replace(' is', '')} ${conector} ${cuando}.`,
      enlace
        ? (es ? `Conectese desde: ${enlace}` : `Join from: ${enlace}`)
        : (es ? 'La clinica lo contactara a esta hora.' : 'The clinic will contact you at that time.'),
      consultas,
      cierre,
    ].filter(Boolean).join(' ');
  }

  // ── Presencial ────────────────────────────────────────────────────────────
  const lugar = direccion ? `${clinica}, ${direccion}` : clinica;
  return [
    es ? `Precision Medical: ${deQuien} el ${cuando}, ${lugar}.`
       : `Precision Medical: ${deQuien} ${cuando}, ${lugar}.`,
    es ? `Llegue ${horaLlegada} para el registro; 15+ min tarde puede reprogramarse.`
       : `Arrive at ${horaLlegada} for check-in; 15+ min late may be rescheduled.`,
    consultas,
    cierre,
  ].filter(Boolean).join(' ');
}

/**
 * Cuántos segmentos SMS ocupa un texto — cada uno se factura aparte.
 *
 * Con alfabeto GSM entran 160 en un segmento y 153 por segmento si son varios;
 * con UCS-2 (cualquier acento o emoji) baja a 70 y 67. La vista previa lo
 * muestra para que nadie descubra el costo real recién en la factura.
 */
/**
 * Los datos de la cita que necesita cualquier aviso sobre ella.
 *
 * Los tres avisos —el de agendar (SMS), el de 24 h antes (correo) y el de
 * reprogramación (correo)— dicen lo mismo con distinto envoltorio: cuándo,
 * dónde, a qué hora llegar. Compartir la forma evita que el de correo diga
 * "llegue 15 minutos antes" el día que el de SMS pase a 20.
 */
export interface DatosDeCita {
  lang: PortalMessageLang;
  /** A quién se saluda: el paciente, o el apoderado del menor. */
  nombreDestinatario?: string | null;
  /** Ya formateado en la zona de la clínica: "mar 15 de sep de 2026 a las 4:00 PM". */
  cuando: string;
  /** Solo la fecha, para el correo: "viernes 18 de sep. de 2026". */
  fechaSola?: string;
  /** Solo la hora de la cita: "12:00 PM". */
  horaCita?: string;
  /** Hora a la que tiene que llegar, 15 min antes: "3:45 PM". */
  horaLlegada: string;
  clinica: string;
  direccion?: string | null;
  telefono?: string | null;
  /** Nombre del paciente cuando el destinatario es el apoderado o el canal es compartido. */
  nombrePaciente?: string | null;
  enLinea?: boolean;
  enlace?: string | null;
}

/**
 * ─── El correo de una cita, como estructura ─────────────────────────────────
 *
 * Los tres correos de cita —recordatorio, reprogramación, cancelación— dicen lo
 * mismo con distinto encabezado: cuándo, a qué hora, a qué hora llegar, dónde.
 * La clínica pidió (2026-09-18) que eso deje de ser prosa y pase a campos
 * etiquetados, y tiene razón: un paciente no LEE un correo de la clínica, lo
 * escanea buscando la hora y la dirección. En un párrafo esos dos datos están
 * escondidos entre palabras; en una lista con etiquetas saltan solos.
 *
 * Por eso el armador devuelve ESTRUCTURA y no un string. Con texto plano habría
 * que elegir entre un correo que se ve bien en HTML —con las etiquetas en
 * negrita, alineadas— y uno que se lee bien en texto plano; devolviendo los
 * campos por separado, cada formato los dibuja como le conviene y el contenido
 * se escribe una sola vez.
 */
export interface DetalleCita {
  etiqueta: string;
  valor: string;
}

export interface CorreoDeCita {
  subject: string;
  /** "Estimado/a Juan," — con el nombre real cuando lo hay. */
  saludo: string;
  /** La frase que dice QUÉ pasó. Va antes de los campos. */
  intro: string;
  detalles: DetalleCita[];
  /** Aclaración bajo los campos (la cita anterior). Opcional. */
  nota?: string | null;
  /** Qué hacer si algo no le sirve. */
  cierre: string;
}

/** Lo que firma todos los correos de la clínica. */
const FIRMA = { es: 'Atentamente,\nPrecision Medical', en: 'Sincerely,\nPrecision Medical' } as const;

/**
 * El saludo.
 *
 * Con el nombre del destinatario cuando lo tenemos —que es casi siempre— y
 * "Estimado/a paciente" solo como respaldo. La propuesta de la clínica usaba el
 * genérico para todos; usar el nombre no cuesta nada (ya está en la ficha, y es
 * el mismo dato con el que se arma el `toName` del correo) y un correo que te
 * nombra se lee como escrito para vos, no como un envío masivo.
 *
 * Ojo con el destinatario: cuando el paciente es menor, quien recibe es el
 * apoderado, así que el saludo lleva SU nombre y el cuerpo nombra al menor.
 */
function saludoPara(lang: PortalMessageLang, nombre?: string | null): string {
  const n = nombre?.trim();
  if (lang === 'es') return n ? `Estimado/a ${n},` : 'Estimado/a paciente,';
  return n ? `Dear ${n},` : 'Dear patient,';
}

/** Los campos comunes: cuándo, a qué hora, llegada y dónde. */
function detallesDeLaCita(args: DatosDeCita, etiquetaFecha: string): DetalleCita[] {
  const { lang, fechaSola, cuando, horaCita, horaLlegada, clinica, direccion, enLinea, enlace } = args;
  const es = lang === 'es';

  // `fechaSola`/`horaCita` son opcionales en el tipo porque el SMS no los usa.
  // Si faltan, se cae al string combinado en vez de mostrar un campo vacío.
  const fecha = fechaSola ?? cuando;
  const hora  = horaCita  ?? null;

  const d: DetalleCita[] = [{ etiqueta: etiquetaFecha, valor: fecha }];
  if (hora) d.push({ etiqueta: es ? 'Hora de la cita' : 'Appointment time', valor: hora });

  /**
   * Telemedicina: ni dirección ni hora de llegada.
   *
   * No es un ajuste cosmético. Con la dirección puesta, el recordatorio lo hace
   * manejar hasta la sede para una videollamada; con "llegue 15 minutos antes",
   * encima lo hace salir temprano. Y el enlace NO se da por hecho: medido el
   * 2026-09-14, 28 de las 29 citas en línea no lo tienen cargado, así que sin
   * enlace se le dice que la clínica lo llama en vez de prometerle un link que
   * no existe y dejarlo mirando una pantalla en blanco.
   */
  if (enLinea) {
    d.push({
      etiqueta: es ? 'Modalidad' : 'Format',
      valor: enlace
        ? (es ? `Videollamada — ${enlace}` : `Video visit — ${enlace}`)
        : (es ? 'Videollamada — la clínica lo contactará a esa hora.'
              : 'Video visit — the clinic will contact you at that time.'),
    });
    return d;
  }

  if (horaLlegada) {
    d.push({ etiqueta: es ? 'Registro (llegada)' : 'Check-in (arrival)', valor: horaLlegada });
  }
  d.push({
    etiqueta: es ? 'Ubicación' : 'Location',
    // Con nombre Y dirección: con varias sedes, la dirección sola obliga a
    // adivinar a cuál le corresponde. Si a la sede le falta la dirección
    // —pasa—, queda el nombre en vez de un campo vacío.
    valor: direccion ? `${clinica}\n${direccion}` : clinica,
  });
  return d;
}

/** "comuníquese al (801) …" o, sin teléfono cargado, sin número. */
function comuniquese(lang: PortalMessageLang, telefono: string | null | undefined, motivo: string): string {
  const es = lang === 'es';
  return telefono
    ? (es ? `${motivo}, favor de comunicarse al ${telefono}.`
          : `${motivo}, please call us at ${telefono}.`)
    : (es ? `${motivo}, favor de comunicarse con la clínica.`
          : `${motivo}, please contact the clinic.`);
}

/**
 * El recordatorio de 24 h antes, POR CORREO.
 *
 * Decisión de Erick (2026-09-18): el del día antes va por correo y no por SMS.
 * El SMS del momento de agendar se queda como está.
 *
 * El cierre ofrece avisar si no puede venir, y eso es lo que más rinde: un
 * recordatorio que solo repite la hora no evita el asiento vacío; uno que abre
 * la puerta a avisar, sí — y libera el horario para otro paciente.
 */
export function buildAppointmentReminderEmail(args: DatosDeCita): CorreoDeCita {
  const { lang, telefono, nombrePaciente, nombreDestinatario } = args;
  const es = lang === 'es';

  const deQuien = nombrePaciente
    ? (es ? `la cita de ${nombrePaciente}` : `the appointment for ${nombrePaciente}`)
    : (es ? 'su cita' : 'your appointment');

  return {
    subject: es ? `Recordatorio de ${deQuien} en Precision Medical`
                : `Reminder: ${deQuien} at Precision Medical`,
    saludo: saludoPara(lang, nombreDestinatario),
    intro: es
      ? `Le recordamos que ${deQuien} en Precision Medical es mañana.`
      : `This is a reminder that ${deQuien} at Precision Medical is tomorrow.`,
    detalles: detallesDeLaCita(args, es ? 'Fecha' : 'Date'),
    cierre: comuniquese(lang, telefono,
      es ? 'Si no puede asistir' : 'If you are unable to attend'),
  };
}

/**
 * El aviso de que la cita SE MOVIÓ, por correo.
 *
 * `cuandoAntes` es la fecha anterior, y solo se pasa cuando la hora cambió de
 * verdad: si lo que se movió fue la sede o la modalidad, va en `null` y el
 * correo habla de lugar. Sin esa distinción, un cambio de sede producía un
 * correo que decía "ya no es el jueves a las 4" y dos renglones después "la
 * nueva fecha es jueves a las 4".
 *
 * La cita anterior se nombra DESPUÉS de los datos nuevos y como aclaración: lo
 * primero que el paciente tiene que poder anotar es cuándo es ahora. Y se dice
 * "reemplaza a la cita del…" y no "se cancela la cita previa" —que era la
 * redacción propuesta— porque "se cancela" es exactamente lo que dice el correo
 * de cancelación: quien escanea las dos primeras palabras podría entender que
 * se quedó sin cita.
 */
export function buildAppointmentRescheduleEmail(
  args: DatosDeCita & { cuandoAntes: string | null },
): CorreoDeCita {
  const { lang, cuandoAntes, telefono, nombrePaciente, nombreDestinatario } = args;
  const es = lang === 'es';

  const deQuien = nombrePaciente
    ? (es ? `la cita de ${nombrePaciente}` : `the appointment for ${nombrePaciente}`)
    : (es ? 'su cita' : 'your appointment');

  const esHorario = !!cuandoAntes;

  return {
    subject: esHorario
      ? (es ? `Su cita en Precision Medical ha sido reprogramada`
            : `Your Precision Medical appointment has been rescheduled`)
      : (es ? `Su cita en Precision Medical cambió de lugar`
            : `Your Precision Medical appointment has a new location`),
    saludo: saludoPara(lang, nombreDestinatario),
    intro: esHorario
      ? (es ? `Le informamos que ${deQuien} en Precision Medical ha sido reprogramada.`
            : `We are writing to let you know that ${deQuien} at Precision Medical has been rescheduled.`)
      : (es ? `Le informamos que ${deQuien} en Precision Medical mantiene su horario, pero cambió de lugar.`
            : `We are writing to let you know that ${deQuien} at Precision Medical keeps its time, but the location changed.`),
    detalles: detallesDeLaCita(args, esHorario ? (es ? 'Nueva fecha' : 'New date') : (es ? 'Fecha' : 'Date')),
    nota: cuandoAntes
      ? (es ? `Esta cita reemplaza a la del ${cuandoAntes}.`
            : `This appointment replaces the one on ${cuandoAntes}.`)
      : null,
    cierre: comuniquese(lang, telefono,
      esHorario
        ? (es ? 'Si requiere un horario diferente' : 'If you need a different time')
        : (es ? 'Si esta sede no le queda cómoda'  : 'If this location does not work for you')),
  };
}

/**
 * El aviso de que la cita SE CANCELÓ.
 *
 * El único de los tres SIN campos: al paciente cuya cita se cayó no le sirve la
 * dirección ni a qué hora tenía que llegar — eso ya no va a pasar. Lo único
 * accionable es cuál era y cómo consigue otra, y una lista de cuatro campos que
 * ya no aplican solo hace más difícil encontrar esas dos cosas.
 *
 * NO se usa para no-show: "no viniste" y "te la cancelamos" son cosas distintas.
 */
export function buildAppointmentCancelledEmail(args: {
  lang: PortalMessageLang;
  nombreDestinatario?: string | null;
  /** La fecha que tenía, ya formateada. */
  cuando: string;
  telefono?: string | null;
  nombrePaciente?: string | null;
}): CorreoDeCita {
  const { lang, cuando, telefono, nombrePaciente, nombreDestinatario } = args;
  const es = lang === 'es';

  const deQuien = nombrePaciente
    ? (es ? `la cita de ${nombrePaciente}` : `the appointment for ${nombrePaciente}`)
    : (es ? 'su cita' : 'your appointment');

  return {
    subject: es ? 'Su cita en Precision Medical ha sido cancelada'
                : 'Your Precision Medical appointment has been cancelled',
    saludo: saludoPara(lang, nombreDestinatario),
    intro: es
      ? `Le informamos que ${deQuien} en Precision Medical del ${cuando} ha sido cancelada.`
      : `We are writing to let you know that ${deQuien} at Precision Medical on ${cuando} has been cancelled.`,
    detalles: [],
    cierre: comuniquese(lang, telefono,
      es ? 'Para programar una nueva cita' : 'To book a new appointment'),
  };
}

/** El correo en texto plano, para el cliente que no renderiza HTML. */
export function correoDeCitaTexto(c: CorreoDeCita, lang: PortalMessageLang): string {
  return [
    c.saludo,
    c.intro,
    c.detalles.length
      ? c.detalles.map((d) => `• ${d.etiqueta}: ${d.valor.replace(/\n/g, ', ')}`).join('\n')
      : null,
    c.nota,
    c.cierre,
    FIRMA[lang],
  ].filter(Boolean).join('\n\n');
}

/** El correo en HTML, con las etiquetas en negrita y alineadas. */
export function correoDeCitaHtml(c: CorreoDeCita, lang: PortalMessageLang): string {
  const p = (t: string, estilo = '') =>
    `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#111827;${estilo}">${escapeHtml(t).replaceAll('\n', '<br/>')}</p>`;

  /**
   * Los campos van en una <table> y no en una lista con viñetas.
   *
   * Es lo único que se alinea igual en Gmail, Outlook y el correo de iPhone:
   * `display:flex` y `display:grid` los ignoran o los rompen la mitad de los
   * clientes de correo, y con viñetas las etiquetas quedan desalineadas y hay
   * que leer cada renglón entero para encontrar la que se busca.
   */
  const filas = c.detalles.map((d) => `
    <tr>
      <td style="padding:3px 14px 3px 0;font-size:13px;line-height:1.6;color:#6b7280;white-space:nowrap;vertical-align:top;">${escapeHtml(d.etiqueta)}</td>
      <td style="padding:3px 0;font-size:14px;line-height:1.6;color:#111827;font-weight:600;">${escapeHtml(d.valor).replaceAll('\n', '<br/>')}</td>
    </tr>`).join('');

  const tabla = c.detalles.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border-collapse:collapse;">${filas}</table>`
    : '';

  return [
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">',
    '<div style="max-width:520px;margin:0 auto;padding:28px 18px;">',
    '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:26px;">',
    '<p style="margin:0 0 14px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;">Precision Medical Care</p>',
    p(c.saludo),
    p(c.intro),
    tabla,
    c.nota ? p(c.nota, 'color:#6b7280;font-size:13px;') : '',
    p(c.cierre),
    p(FIRMA[lang]),
    '</div></div></body></html>',
  ].join('');
}

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

  return envolturaCorreo(texto, [
    `<p style="margin:8px 0 22px;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;">${cta}</a></p>`,
    `<p style="margin:0;font-size:11px;line-height:1.6;color:#6b7280;">${fallback}<br/><span style="color:#4f46e5;word-break:break-all;">${escapeHtml(portalUrl)}</span></p>`,
  ].join(''));
}

/**
 * La envoltura visual de TODO correo al paciente.
 *
 * El del portal la tenía escrita adentro suyo, y los que se agregaron después
 * —el recordatorio de 24 h, el aviso de reprogramación— necesitaban la misma
 * caja. Copiarla es lo que hace que dentro de un mes tengamos tres correos de
 * la clínica que no se parecen entre sí, y que arreglar el ancho o el color en
 * uno no arregle los otros dos.
 *
 * `cuerpo` es texto plano: un párrafo por bloque separado con línea en blanco,
 * y los saltos sueltos de adentro (una dirección, una firma) quedan como
 * `<br/>`. `pie` es HTML ya armado para lo que va DESPUÉS del texto — un botón,
 * un link—; el correo que no necesita nada de eso no pasa nada.
 *
 * Deliberadamente sobria: un correo de clínica con gradientes y logos grandes
 * se parece a marketing y los filtros lo tratan peor.
 */
export function envolturaCorreo(cuerpo: string, pie = ''): string {
  const parrafos = cuerpo
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
    pie,
    '</div></div></body></html>',
  ].join('');
}

/** El caseCode y el nombre entran al HTML: nunca sin escapar. */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
