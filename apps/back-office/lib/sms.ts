/**
 * Envío de SMS por Twilio Programmable Messaging.
 *
 * Único punto de salida de SMS del sistema. Hasta ahora no existía ninguno: los
 * dos endpoints de "enviar portal al paciente" eran stubs que escribían audit
 * log y devolvían `stub: true`, así que el paciente nunca recibió nada.
 *
 * Usa la MISMA cuenta y las mismas API Keys que la voz (`twilioClient`), que ya
 * está probada en producción. No hace falta credencial nueva.
 *
 * ⚠️ A2P 10DLC: los operadores de EEUU exigen registrar marca y campaña para
 * mandar SMS desde un número de 10 dígitos. Sin eso Twilio ACEPTA el mensaje y
 * devuelve `queued` — no falla — pero el operador lo filtra y nunca llega. Por
 * eso todo envío queda en `message_logs` con su estado, y el estado REAL lo
 * confirma después el webhook `/api/twilio/sms-status`. Un "enviado" sin esa
 * confirmación no prueba nada.
 */

import { db } from '@precision-medical/database';
import { twilioClient, TWILIO_PHONE_NUMBER, TWILIO_MESSAGING_SERVICE_SID } from '@/lib/twilio-server';
import { toE164, phoneKey } from '@/lib/phone';

/** Interruptor de seguridad: sin esto en `true`, no sale ningún SMS. */
export const SMS_ENABLED = process.env.SMS_ENABLED === 'true';

/**
 * Estados de Twilio → los nuestros.
 *
 * Twilio maneja ~10; nos quedamos con los que cambian una decisión. Lo vive acá
 * y no en el route del webhook porque un route handler no puede exportar nada
 * que no sea un handler (rompe `next build`, ver b229a90).
 */
export function mapTwilioStatus(raw: string | null | undefined): 'QUEUED' | 'SENT' | 'DELIVERED' | 'UNDELIVERED' | 'FAILED' {
  switch ((raw ?? '').toLowerCase()) {
    case 'delivered':                        return 'DELIVERED';
    case 'undelivered':                      return 'UNDELIVERED';
    case 'failed':
    case 'canceled':                         return 'FAILED';
    case 'sent':
    case 'sending':                          return 'SENT';
    case 'queued':
    case 'accepted':
    case 'scheduled':                        return 'QUEUED';
    default:
      // Un estado que no conocemos NO se hace pasar por "en cola": eso deja la
      // fila en un pendiente eterno que nadie va a revisar. Se avisa fuerte y
      // se asume lo pesimista — el webhook ademas lo corrige si hay ErrorCode.
      console.warn('[sms] estado de Twilio desconocido: %s', raw);
      return 'QUEUED';
  }
}

export interface SendSmsArgs {
  to: string;
  body: string;
  /** Contexto para poder listar después "qué se le mandó a este paciente". */
  patientId?: string | null;
  caseId?: string | null;
  sentByUserId?: string | null;
  sentByName?: string | null;
}

export interface SendSmsResult {
  ok: boolean;
  /** Fila de `message_logs`. Siempre se crea, salió o no. */
  messageLogId: string | null;
  /** SID de Twilio — con esto lo cruza el webhook de status. */
  messageSid: string | null;
  /** Estado inicial. `QUEUED` NO significa entregado. */
  status: string | null;
  to: string | null;
  /** `DISABLED` no es un error: es la bandera apagada. */
  error: 'DISABLED' | 'NO_FROM_NUMBER' | 'INVALID_TO' | 'SAME_AS_FROM' | 'OPTED_OUT' | 'TWILIO_ERROR' | null;
  errorDetail: string | null;
}

/**
 * Manda un SMS y lo registra. NO lanza: devuelve el resultado.
 *
 * Que falle un SMS no puede tumbar la operación que lo disparó — crear el caso
 * y avisarle al paciente son dos cosas distintas, y perder la primera porque
 * falló la segunda sería peor que no avisar.
 */
export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  const base: SendSmsResult = {
    ok: false, messageLogId: null, messageSid: null, status: null,
    to: null, error: null, errorDetail: null,
  };

  const fail = async (
    error: NonNullable<SendSmsResult['error']>,
    errorDetail: string,
    to: string | null,
  ): Promise<SendSmsResult> => {
    // Los rechazos también se registran: "no se mandó y por qué" es
    // exactamente lo que hoy no se puede responder.
    const row = await db.messageLog.create({
      data: {
        channel: 'SMS',
        status: 'FAILED',
        toAddress: to ?? args.to,
        fromAddress: TWILIO_PHONE_NUMBER || '',
        body: args.body,
        errorMessage: `${error}: ${errorDetail}`,
        patientId: args.patientId ?? null,
        caseId: args.caseId ?? null,
        sentByUserId: args.sentByUserId ?? null,
        sentByName: args.sentByName ?? null,
      },
      select: { id: true },
    }).catch((e) => { console.error('[sms] no se pudo registrar el fallo:', e); return null; });
    return { ...base, to, error, errorDetail, messageLogId: row?.id ?? null };
  };

  if (!SMS_ENABLED)        return fail('DISABLED', 'SMS_ENABLED no está en true', null);
  if (!TWILIO_PHONE_NUMBER) return fail('NO_FROM_NUMBER', 'falta TWILIO_PHONE_NUMBER', null);

  // `phoneKey` exige 10 dígitos reales: corta los `N/A`, los vacíos y los
  // placeholders que dejó la migración v2 antes de gastar una request.
  if (!phoneKey(args.to)) return fail('INVALID_TO', `número no utilizable: "${args.to}"`, null);

  const to   = toE164(args.to);
  const from = toE164(TWILIO_PHONE_NUMBER);

  // Mandarnos un SMS a nosotros mismos es siempre un bug de datos, y encima se
  // factura. Mismo criterio que el freno anti-bucle de las llamadas.
  if (phoneKey(to) === phoneKey(from)) {
    return fail('SAME_AS_FROM', 'el destino es nuestro propio número', to);
  }

  try {
    // Por Messaging Service si existe: es lo que aplica la campaña A2P
    // aprobada. El número suelto queda solo como respaldo — sirve para probar,
    // pero sin la campaña detrás los operadores filtran.
    const sender = TWILIO_MESSAGING_SERVICE_SID
      ? { messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID }
      : { from };

    const msg = await twilioClient.messages.create({
      to, body: args.body, ...sender,
      ...(process.env.SMS_STATUS_CALLBACK_URL
        ? { statusCallback: process.env.SMS_STATUS_CALLBACK_URL }
        : {}),
    });

    const row = await db.messageLog.create({
      data: {
        providerMessageId: msg.sid,
        channel: 'SMS',
        status: mapTwilioStatus(msg.status),
        toAddress: to,
        // Con Messaging Service el número lo elige Twilio del pool, así que se
        // guarda el que REALMENTE salió, no el que asumimos.
        fromAddress: msg.from ?? from,
        body: args.body,
        patientId: args.patientId ?? null,
        caseId: args.caseId ?? null,
        sentByUserId: args.sentByUserId ?? null,
        sentByName: args.sentByName ?? null,
      },
      select: { id: true },
    }).catch((e) => { console.error('[sms] enviado pero no registrado:', e); return null; });

    return {
      ok: true,
      messageLogId: row?.id ?? null,
      messageSid: msg.sid,
      status: msg.status,
      to,
      error: null,
      errorDetail: null,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);

    // 21610 = el paciente respondió STOP. NO es una falla del sistema: es una
    // baja que hay que respetar, y reintentar sería ilegal (TCPA). Se separa
    // del error genérico para que la UI pueda decirlo con esas palabras y
    // nadie pierda tiempo "arreglando" un envío que funcionó como debía.
    const code = (err as { code?: number } | null)?.code;
    if (code === 21610) {
      console.warn('[sms] %s se dio de baja (STOP) — no se reintenta', to);
      return fail('OPTED_OUT', 'el destinatario respondió STOP y no acepta mensajes', to);
    }

    console.error('[sms] envío fallido a %s: %s', to, detail);
    return fail('TWILIO_ERROR', detail, to);
  }
}
