/**
 * El recordatorio de la cita por SMS, al momento de agendarla.
 *
 * Pedido de la clínica, de una prueba real: "I just did a test with creating a
 * new patient and an appointment and I got the text to fill out the paperwork
 * but no reminder of the appointment I created". El SMS del formulario existía;
 * el de la cita no existía en ninguna parte del sistema.
 *
 * ── Alcance, decidido por Erick el 2026-09-14 ───────────────────────────────
 * SOLO al agendar. El del día antes NO se toca acá: hoy lo manda otra
 * herramienta, y duplicarlo le llegaría dos veces al paciente. Si algún día se
 * trae ese también, el armador del texto ya está listo y lo único que falta es
 * el cron — por eso esto vive en su propio archivo y no adentro del route.
 *
 * ── Nunca tumba la creación de la cita ──────────────────────────────────────
 * `sendSms` no lanza, y acá además todo va dentro de un try. Agendar y avisar
 * son dos cosas distintas: perder la cita porque falló el SMS sería mucho peor
 * que no avisar. El resultado se devuelve para que el caller lo registre, no
 * para que decida si la cita vale.
 */

import { db, isMinor } from '@precision-medical/database';
import { sendSms } from '@/lib/sms';
import { buildAppointmentReminderSms, idiomaDelPaciente } from '@/lib/portal-message';
import { fechaParaSms, horaParaSms } from '@/lib/fechas';

/** Minutos antes de la cita a los que se le pide llegar. */
const MINUTOS_ANTES_DE_LLEGAR = 15;

export type ResultadoRecordatorio =
  | { enviado: true;  messageLogId: string | null }
  | { enviado: false; motivo: 'SIN_TELEFONO' | 'CITA_NO_ENCONTRADA' | 'ERROR_ENVIO' | 'DESHABILITADO'; detalle?: string };

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
    const cita = await db.appointment.findUnique({
      where: { id: args.appointmentId },
      select: {
        id: true, scheduledFor: true, caseId: true,
        // Telemedicina cambia el mensaje entero, no una palabra: sin dirección
        // y sin hora de llegada. Ver `buildAppointmentReminderSms`.
        isOnline: true, meetingUrl: true,
        clinic:  { select: { name: true, address: true, phone: true } },
        patient: {
          select: {
            id: true, firstName: true, lastName: true, phone: true,
            dateOfBirth: true, preferredLanguage: true, sharesPhone: true,
            guardianPatient: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
      },
    });

    if (!cita?.patient || !cita.clinic) return { enviado: false, motivo: 'CITA_NO_ENCONTRADA' };

    // A quién se le habla. Misma regla que el link del portal: si el paciente
    // es menor y tiene apoderado, el aviso va al apoderado — al menor no le
    // sirve de nada saber la hora si no es quien lo trae.
    const apoderado = isMinor(cita.patient.dateOfBirth) ? cita.patient.guardianPatient : null;
    const destino   = apoderado ?? cita.patient;

    const telefono = destino.phone?.trim();
    if (!telefono) return { enviado: false, motivo: 'SIN_TELEFONO' };

    // La regla vive en portal-message, con la medición que la justifica: sin
    // idioma cargado se habla en INGLÉS, que es lo que la clínica atiende.
    const lang = idiomaDelPaciente(cita.patient.preferredLanguage);

    // Se NOMBRA al paciente cuando el canal no es solo suyo: el apoderado del
    // menor, o el teléfono compartido en familia. Sin el nombre, la mamá que
    // recibe citas de tres hijos no sabe de cuál es ésta.
    const canalCompartido = cita.patient.sharesPhone;
    const nombrePaciente  = (apoderado || canalCompartido)
      ? `${cita.patient.firstName} ${cita.patient.lastName}`.trim()
      : null;

    const llegada = new Date(cita.scheduledFor.getTime() - MINUTOS_ANTES_DE_LLEGAR * 60_000);

    const body = buildAppointmentReminderSms({
      lang,
      cuando:      fechaParaSms(cita.scheduledFor, lang),
      horaLlegada: horaParaSms(llegada),
      clinica:     cita.clinic.name,
      direccion:   cita.clinic.address,
      telefono:    cita.clinic.phone,
      nombrePaciente,
      /**
       * Telemedicina. La cita igual tiene clínica guardada —`clinicId` es
       * obligatorio y define de qué sede se cuenta y quién atiende—, pero al
       * paciente NO se le nombra: no va a ninguna parte.
       *
       * Sin esto el recordatorio le mandaba la dirección de la sede y le pedía
       * llegar 15 minutos antes, o sea que lo hacía manejar hasta Provo para
       * una videollamada. Lo mismo que la clínica reportó en pantalla, pero
       * saliendo por SMS — y ahí no hay nadie que lo corrija.
       */
      enLinea:  cita.isOnline,
      // Medido 2026-09-14: 28 de las 29 citas online NO tienen enlace cargado.
      // Por eso el texto no puede darlo por hecho — sin enlace dice que la
      // clínica llama, en vez de prometer un link que no existe.
      enlace:   cita.meetingUrl,
    });

    const res = await sendSms({
      to: telefono,
      body,
      patientId:    cita.patient.id,
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
