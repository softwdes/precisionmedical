/**
 * El recordatorio de la cita por SMS, al momento de agendarla.
 *
 * Pedido de la clínica, de una prueba real: "I just did a test with creating a
 * new patient and an appointment and I got the text to fill out the paperwork
 * but no reminder of the appointment I created". El SMS del formulario existía;
 * el de la cita no existía en ninguna parte del sistema.
 *
 * ── Alcance ─────────────────────────────────────────────────────────────────
 *
 * 2026-09-14 — SOLO al agendar, por SMS.
 * 2026-09-18 — Erick suma los otros dos, los DOS por correo y no por SMS:
 *
 *   | cuándo              | canal  | quién lo dispara            |
 *   |---------------------|--------|-----------------------------|
 *   | al agendar          | SMS    | las 3 rutas que crean citas |
 *   | 24 h antes          | correo | el cron `recordatorio-cita` |
 *   | al reprogramar      | correo | el PATCH de la cita         |
 *   | al cancelar         | correo | el PATCH de la cita         |
 *
 * El del día antes **ya no lo manda solo la herramienta externa**: la de afuera
 * sigue con su SMS y el nuestro sale por correo, así que no se pisan — son dos
 * canales distintos, no dos copias del mismo mensaje.
 *
 * ── Nunca tumba la creación de la cita ──────────────────────────────────────
 * `sendSms` no lanza, y acá además todo va dentro de un try. Agendar y avisar
 * son dos cosas distintas: perder la cita porque falló el SMS sería mucho peor
 * que no avisar. El resultado se devuelve para que el caller lo registre, no
 * para que decida si la cita vale.
 */

import { db, isMinor } from '@precision-medical/database';
import { sendSms } from '@/lib/sms';
import { sendEmail } from '@/lib/email';
import {
  buildAppointmentReminderSms, buildAppointmentReminderEmail,
  buildAppointmentRescheduleEmail, buildAppointmentCancelledEmail,
  correoDeCitaTexto, correoDeCitaHtml,
  idiomaDelPaciente, type DatosDeCita, type CorreoDeCita,
} from '@/lib/portal-message';
import { fechaParaSms, horaParaSms, fechaSolaParaCorreo } from '@/lib/fechas';
import { horarioYaPaso } from '@/lib/scheduling-rules';

/** Minutos antes de la cita a los que se le pide llegar. */
const MINUTOS_ANTES_DE_LLEGAR = 15;

/**
 * A una cita que YA PASÓ no se le avisa nada al paciente.
 *
 * Desde el 2026-09-18 se pueden registrar visitas que ya ocurrieron —el
 * paciente vino y no se alcanzó a cargar— y avisarle de una cita de la semana
 * pasada es, en el mejor de los casos, ruido; en el peor, un "le reprogramamos
 * su cita" por corregirle la hora a una visita vieja. Erick: "no envía ninguna
 * notificación".
 *
 * El candado vive ACÁ y no en las rutas por la misma razón que el resto de este
 * archivo: son tres rutas que crean citas más el PATCH que las mueve y cancela,
 * y con una copia por ruta, la quinta que se escriba se olvida.
 *
 * Usa la misma gracia de una hora que el guard de creación, y eso deja un
 * invariante cómodo: la cita que se pudo crear SIN `allowPast` se avisa, y la
 * que necesitó la bandera no.
 */
function noSeAvisaPorqueYaPaso(cuando: Date): boolean {
  return horarioYaPaso(cuando);
}

/**
 * Todo lo que hace falta para avisarle a alguien sobre una cita, resuelto UNA vez.
 *
 * Los tres avisos —agendar (SMS), 24 h antes (correo) y reprogramación (correo)—
 * necesitan responder las mismas cuatro preguntas: a quién se le habla, en qué
 * idioma, si hay que nombrar al paciente y cómo se escribe la fecha. Cada una
 * tiene una regla con historia atrás (el apoderado del menor, el teléfono
 * compartido en familia, el inglés por defecto), y tres copias de esas reglas
 * es tres formas distintas de equivocarse.
 */
export interface CitaParaAvisar {
  appointmentId: string;
  patientId: string;
  caseId: string | null;
  scheduledFor: Date;
  /** A dónde se le escribe. Del apoderado si el paciente es menor. */
  telefono: string | null;
  email: string | null;
  /** Nombre del destinatario, para saludarlo. */
  nombreDestinatario: string;
  /**
   * Los datos ya formateados que consumen los armadores de texto.
   *
   * `datos.nombrePaciente` viene resuelto para el canal SMS. Para el correo hay
   * que pisarlo con `nombrePacienteEnCorreo` — ver el comentario de abajo.
   */
  datos: DatosDeCita;
  /**
   * Si el correo tiene que nombrar al paciente, que NO es la misma respuesta
   * que para el SMS: compartir el correo y compartir el teléfono son dos
   * banderas distintas de la ficha, y una familia puede tener una sin la otra.
   */
  nombrePacienteEnCorreo: string | null;
}

/**
 * Carga la cita y resuelve a quién y cómo se le habla.
 *
 * Devuelve `null` si la cita no existe o le falta paciente o sede — no lanza:
 * todos los callers son avisos, y un aviso que explota no puede tumbar lo que
 * lo disparó.
 */
export async function cargarCitaParaAvisar(appointmentId: string): Promise<CitaParaAvisar | null> {
  const cita = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true, scheduledFor: true, caseId: true,
      // Telemedicina cambia el mensaje entero, no una palabra: sin dirección
      // y sin hora de llegada. Ver `buildAppointmentReminderSms`.
      isOnline: true, meetingUrl: true,
      clinic:  { select: { name: true, address: true, phone: true } },
      patient: {
        select: {
          id: true, firstName: true, lastName: true, phone: true, email: true,
          dateOfBirth: true, preferredLanguage: true,
          sharesPhone: true, sharesEmail: true,
          guardianPatient: {
            select: { firstName: true, lastName: true, phone: true, email: true },
          },
        },
      },
    },
  });

  if (!cita?.patient || !cita.clinic) return null;

  // A quién se le habla. Misma regla que el link del portal: si el paciente es
  // menor y tiene apoderado, el aviso va al apoderado — al menor no le sirve
  // de nada saber la hora si no es quien lo trae.
  const apoderado = isMinor(cita.patient.dateOfBirth) ? cita.patient.guardianPatient : null;
  const destino   = apoderado ?? cita.patient;

  // La regla vive en portal-message, con la medición que la justifica: sin
  // idioma cargado se habla en INGLÉS, que es lo que la clínica atiende.
  const lang = idiomaDelPaciente(cita.patient.preferredLanguage);

  /**
   * Se NOMBRA al paciente cuando el canal no es solo suyo.
   *
   * El canal se mira POR CANAL: compartir el correo no implica compartir el
   * teléfono. Antes esto miraba `sharesPhone` para todo, que es correcto para
   * el SMS y equivocado para el correo — en los dos sentidos: nombra al
   * paciente en un correo que es solo suyo (dato de más), y lo omite en un
   * correo compartido, que es el caso donde hace falta.
   */
  const nombreDelPaciente = `${cita.patient.firstName} ${cita.patient.lastName}`.trim();
  const nombrarSi = (canalCompartido: boolean) =>
    (apoderado || canalCompartido) ? nombreDelPaciente : null;

  const llegada = new Date(cita.scheduledFor.getTime() - MINUTOS_ANTES_DE_LLEGAR * 60_000);

  return {
    appointmentId: cita.id,
    patientId:     cita.patient.id,
    caseId:        cita.caseId,
    scheduledFor:  cita.scheduledFor,
    telefono:      destino.phone?.trim() || null,
    email:         destino.email?.trim() || null,
    nombreDestinatario: `${destino.firstName} ${destino.lastName ?? ''}`.trim(),
    datos: {
      lang,
      nombreDestinatario: `${destino.firstName} ${destino.lastName ?? ''}`.trim(),
      cuando:      fechaParaSms(cita.scheduledFor, lang),
      // El correo las muestra en renglones distintos ("Nueva fecha" / "Hora de
      // la cita"); el SMS sigue usando `cuando`, que las trae pegadas.
      fechaSola:   fechaSolaParaCorreo(cita.scheduledFor, lang),
      horaCita:    horaParaSms(cita.scheduledFor),
      horaLlegada: horaParaSms(llegada),
      clinica:     cita.clinic.name,
      direccion:   cita.clinic.address,
      telefono:    cita.clinic.phone,
      // El default es el del SMS; el carril de correo lo pisa con `sharesEmail`.
      nombrePaciente: nombrarSi(cita.patient.sharesPhone),
      enLinea: cita.isOnline,
      // Medido 2026-09-14: 28 de las 29 citas online NO tienen enlace cargado.
      enlace:  cita.meetingUrl,
    },
    nombrePacienteEnCorreo: nombrarSi(cita.patient.sharesEmail),
  };
}

export type ResultadoRecordatorio =
  | { enviado: true;  messageLogId: string | null }
  | { enviado: false; motivo: 'SIN_TELEFONO' | 'CITA_NO_ENCONTRADA' | 'ERROR_ENVIO' | 'DESHABILITADO' | 'CITA_PASADA'; detalle?: string };

/**
 * Manda el recordatorio de una cita recién creada.
 *
 * @param appointmentId la cita, ya guardada.
 * @param actor quién agendó — queda en `message_logs` para poder responder
 *   después "quién le mandó esto al paciente".
 */
export async function enviarRecordatorioDeCita(args: {
  appointmentId: string;
  actorUserId?: string | null;
  actorName?: string | null;
}): Promise<ResultadoRecordatorio> {
  try {
    const cita = await cargarCitaParaAvisar(args.appointmentId);
    if (!cita) return { enviado: false, motivo: 'CITA_NO_ENCONTRADA' };
    if (noSeAvisaPorqueYaPaso(cita.scheduledFor)) return { enviado: false, motivo: 'CITA_PASADA' };
    if (!cita.telefono) return { enviado: false, motivo: 'SIN_TELEFONO' };

    // `cita.datos` ya trae el idioma, la fecha formateada, la hora de llegada
    // y si hay que nombrar al paciente — todo resuelto por el cargador
    // compartido, el mismo que usan el recordatorio de 24 h y el de
    // reprogramación. Acá vivía una segunda copia de esas cuatro reglas.
    const body = buildAppointmentReminderSms(cita.datos);

    const res = await sendSms({
      to: cita.telefono,
      body,
      patientId:    cita.patientId,
      caseId:       cita.caseId,
      sentByUserId: args.actorUserId ?? null,
      sentByName:   args.actorName ?? null,
    });

    if (res.ok) return { enviado: true, messageLogId: res.messageLogId };
    // La bandera apagada no es una falla: es la configuración diciendo que no.
    if (res.error === 'DISABLED') return { enviado: false, motivo: 'DESHABILITADO' };
    return { enviado: false, motivo: 'ERROR_ENVIO', detalle: res.error ?? res.errorDetail ?? undefined };
  } catch (err) {
    // Se traga el error a propósito y se avisa fuerte en el log del servidor.
    // La cita ya existe; que el aviso falle no puede hacer fallar la respuesta.
    console.error('[recordatorio-cita] no se pudo enviar para %s:', args.appointmentId, err);
    return { enviado: false, motivo: 'ERROR_ENVIO', detalle: String(err) };
  }
}

// ─── Los avisos por CORREO ───────────────────────────────────────────────────
//
// Decisión de Erick (2026-09-18): la reprogramación y el recordatorio del día
// antes van por correo, NO por SMS. El SMS se queda solo en el momento de
// agendar, que es el que ya existía.

export type ResultadoAvisoEmail =
  | { enviado: true;  messageLogId: string | null }
  | { enviado: false; motivo: 'SIN_EMAIL' | 'CITA_NO_ENCONTRADA' | 'ERROR_ENVIO' | 'DESHABILITADO' | 'CITA_PASADA'; detalle?: string };

/**
 * Manda un correo sobre una cita. El tronco común de los dos de abajo.
 *
 * No exportado: lo que se usa afuera son los dos avisos concretos, que se
 * distinguen por el texto. Tener el envío una sola vez es lo que hace que el
 * día que cambie algo del transporte —el remitente, el registro, el manejo de
 * errores— cambie para los dos.
 */
async function enviarCorreoDeCita(args: {
  cita: CitaParaAvisar;
  correo: CorreoDeCita;
  actorUserId?: string | null;
  actorName?: string | null;
}): Promise<ResultadoAvisoEmail> {
  const { cita, correo } = args;
  if (!cita.email) return { enviado: false, motivo: 'SIN_EMAIL' };

  const lang = cita.datos.lang;

  const res = await sendEmail({
    to: cita.email,
    toName: cita.nombreDestinatario || null,
    subject: correo.subject,
    // El mismo contenido dibujado de dos formas. El HTML alinea las etiquetas
    // en una tabla; el texto plano las lista con viñetas para el cliente que
    // no renderiza — no son dos redacciones distintas.
    html: correoDeCitaHtml(correo, lang),
    text: correoDeCitaTexto(correo, lang),
    patientId:    cita.patientId,
    caseId:       cita.caseId,
    sentByUserId: args.actorUserId ?? null,
    sentByName:   args.actorName ?? null,
    /**
     * ⚠️ Sin `sinPhi`. A propósito.
     *
     * Este correo dice que una persona tiene una cita en una clínica médica, con
     * fecha, hora y sede. Eso es PHI, así que va por el carril restringido:
     * `EMAIL_TEST_ALLOWLIST` decide si sale, igual que el link del portal.
     * El carril `sinPhi` es solo para el aviso al abogado, cuyo texto es fijo.
     */
  });

  if (res.ok) return { enviado: true, messageLogId: res.messageLogId };
  if (res.error === 'DISABLED') return { enviado: false, motivo: 'DESHABILITADO' };
  return { enviado: false, motivo: 'ERROR_ENVIO', detalle: res.error ?? res.errorDetail ?? undefined };
}

/**
 * El recordatorio de 24 h antes. Lo dispara el cron, no una persona.
 *
 * Marcar que se mandó NO es cosa de acá: el cron es el que sabe si quiere
 * reintentar, y meter la escritura adentro haría que un aviso fallido quedara
 * marcado como hecho.
 */
export async function enviarRecordatorio24h(cita: CitaParaAvisar): Promise<ResultadoAvisoEmail> {
  try {
    const correo = buildAppointmentReminderEmail({
      ...cita.datos,
      // El canal es el CORREO: se nombra al paciente según `sharesEmail`, no
      // según `sharesPhone`.
      nombrePaciente: cita.nombrePacienteEnCorreo,
    });
    return await enviarCorreoDeCita({ cita, correo, actorName: 'Recordatorio automático' });
  } catch (err) {
    console.error('[recordatorio-24h] falló para %s:', cita.appointmentId, err);
    return { enviado: false, motivo: 'ERROR_ENVIO', detalle: String(err) };
  }
}

/**
 * El aviso de que la cita se movió.
 *
 * `cuandoAntes` lo tiene que pasar el caller: para cuando esto corre, la cita
 * ya se guardó con la fecha nueva y la anterior ya no está en ninguna parte.
 * Pedirlo como parámetro es lo que obliga a leerlo ANTES del update — si se
 * intentara resolver acá, siempre llegaría tarde.
 */
export async function avisarReprogramacion(args: {
  appointmentId: string;
  /**
   * La fecha que TENÍA, leída antes de guardar. `null` cuando la hora no se
   * tocó y lo que cambió fue la sede o la modalidad — ahí el correo habla de
   * lugar, no de horario.
   */
  scheduledForAnterior: Date | null;
  actorUserId?: string | null;
  actorName?: string | null;
}): Promise<ResultadoAvisoEmail> {
  try {
    const cita = await cargarCitaParaAvisar(args.appointmentId);
    if (!cita) return { enviado: false, motivo: 'CITA_NO_ENCONTRADA' };
    // La fecha que se mira es la NUEVA (la cita ya se guardó). Mover una visita
    // vieja para corregirle la hora no le avisa nada al paciente; mover una cita
    // pasada a un día que viene sí, que es una reprogramación de verdad.
    if (noSeAvisaPorqueYaPaso(cita.scheduledFor)) return { enviado: false, motivo: 'CITA_PASADA' };

    const correo = buildAppointmentRescheduleEmail({
      ...cita.datos,
      nombrePaciente: cita.nombrePacienteEnCorreo,
      cuandoAntes: args.scheduledForAnterior
        ? fechaParaSms(args.scheduledForAnterior, cita.datos.lang)
        : null,
    });

    return await enviarCorreoDeCita({
      cita, correo,
      actorUserId: args.actorUserId,
      actorName:   args.actorName,
    });
  } catch (err) {
    console.error('[aviso-reprogramacion] falló para %s:', args.appointmentId, err);
    return { enviado: false, motivo: 'ERROR_ENVIO', detalle: String(err) };
  }
}

/**
 * El aviso de que la cita se canceló.
 *
 * `cuando` sale de la cita tal como está guardada: cancelar no le cambia la
 * fecha, solo el estado, así que la fecha que hay que nombrar sigue ahí.
 *
 * Solo para cancelaciones de verdad. Un NO_SHOW no pasa por acá — decirle "te
 * la cancelamos" a quien no vino es contarle mal lo que pasó, y encima le
 * quitaría el motivo para llamar a reprogramar.
 */
export async function avisarCancelacion(args: {
  appointmentId: string;
  actorUserId?: string | null;
  actorName?: string | null;
}): Promise<ResultadoAvisoEmail> {
  try {
    const cita = await cargarCitaParaAvisar(args.appointmentId);
    if (!cita) return { enviado: false, motivo: 'CITA_NO_ENCONTRADA' };
    // Una cita que ya pasó no se "cancela" para el paciente: se corrige el
    // registro. Avisarle sería contarle mal lo que pasó.
    if (noSeAvisaPorqueYaPaso(cita.scheduledFor)) return { enviado: false, motivo: 'CITA_PASADA' };

    const correo = buildAppointmentCancelledEmail({
      lang:     cita.datos.lang,
      nombreDestinatario: cita.nombreDestinatario,
      cuando:   cita.datos.cuando,
      telefono: cita.datos.telefono,
      nombrePaciente: cita.nombrePacienteEnCorreo,
    });

    return await enviarCorreoDeCita({
      cita, correo,
      actorUserId: args.actorUserId,
      actorName:   args.actorName,
    });
  } catch (err) {
    console.error('[aviso-cancelacion] falló para %s:', args.appointmentId, err);
    return { enviado: false, motivo: 'ERROR_ENVIO', detalle: String(err) };
  }
}
