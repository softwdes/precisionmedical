/**
 * Envío de email por la Email API nativa de Twilio.
 *
 * `POST https://comms.twilio.com/v1/Emails`, con las MISMAS credenciales que
 * la voz y el SMS. No hace falta API key de SendGrid ni DNS aparte: los
 * registros `em2506` y `s1/s2._domainkey` que ya están publicados son la
 * autenticación de dominio que este producto usa.
 *
 * Por `fetch` y no por el SDK: `twilio` v6 no expone todavía este endpoint, y
 * para un POST con Basic auth el REST evita esperar a que lo agreguen.
 *
 * ⚠️ NO MANDAR PHI POR ACÁ. La Email API de Twilio es "Powered by Twilio
 * SendGrid", y la documentación de Twilio dice textualmente que no pueden
 * firmar un BAA para SendGrid y que no se use con PHI. Además retiene los
 * datos 7 días, así que tampoco aplica la excepción de "mero conducto".
 *
 * Mientras no haya BAA esto sirve para DOS cosas:
 *   1. Correo interno al staff (bienvenida, reset de contraseña, alertas) —
 *      no lleva PHI y es seguro de forma permanente.
 *   2. Pruebas contra direcciones propias, acotadas por `EMAIL_TEST_ALLOWLIST`.
 *
 * El allowlist es el freno: mientras esté seteado, un correo a cualquier
 * dirección que no esté en la lista NO sale. Es lo que evita que una prueba se
 * le escape a un paciente real por un clic equivocado.
 */

import { db } from '@precision-medical/database';
import {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
} from '@/lib/twilio-server';

const EMAILS_ENDPOINT = 'https://comms.twilio.com/v1/Emails';

/** Interruptor: sin esto en `true`, no sale ningún correo. */
export const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';

/** Remitente. Transaccional, NO una dirección de marketing. */
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS ?? '';
const FROM_NAME    = process.env.EMAIL_FROM_NAME ?? 'Precision Medical';

/**
 * Destinos autorizados mientras dura la etapa de prueba, separados por coma.
 *
 * Acepta dos formas:
 *   · una dirección exacta   → `juan@gmail.com`
 *   · un dominio entero      → `@precisionmedicalcare.com`
 *
 * El dominio existe por practicidad: si cada dev tuviera que agregarse a mano,
 * habría que editar la variable y redeployar por cada persona. Con el dominio
 * del equipo adentro, cualquiera prueba con su correo de trabajo y nadie toca
 * la configuración.
 *
 * Las pruebas se hacen creando PACIENTES ficticios con el correo del dev, así
 * que el flujo que se ejercita es el real. El allowlist no estorba eso —el
 * destino es la casilla del dev, que está autorizada— y sigue frenando lo que
 * importa: un envío a la dirección de un paciente de verdad.
 *
 * Para abrir el canal a cualquier destinatario —recién cuando el BAA esté
 * firmado— hay que poner `*` de forma EXPLÍCITA.
 *
 * Vacío o sin definir NO abre nada: bloquea todo. El default falla cerrado a
 * propósito. Con la regla al revés, olvidarse de cargar la variable en un
 * entorno nuevo desactivaba la unica proteccion que hay contra mandarle PHI a
 * un paciente real sin BAA — y ese olvido no avisa, simplemente funciona.
 */
const ALLOWLIST_ENV = (process.env.EMAIL_TEST_ALLOWLIST ?? '').trim();

/** `*` explícito = canal abierto (BAA firmado). Cualquier otra cosa restringe. */
const UNRESTRICTED = ALLOWLIST_ENV === '*';

const TEST_ALLOWLIST_RAW = ALLOWLIST_ENV
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/**
 * Dominios publicos que NO se aceptan como comodin.
 *
 * Parte del equipo prueba con Gmail, asi que alguien va a querer poner
 * `@gmail.com` de una y ahorrarse listar cada casilla. Eso vacia la proteccion
 * entera: la mayoria de los pacientes reales tienen Gmail. Se ignora la entrada
 * y se avisa, en vez de dejar pasar todo en silencio.
 *
 * Las direcciones sueltas de esos dominios SI valen — `juan@gmail.com` esta
 * bien, `@gmail.com` no.
 */
const DOMINIOS_PUBLICOS = new Set([
  '@gmail.com', '@googlemail.com', '@hotmail.com', '@outlook.com',
  '@live.com', '@yahoo.com', '@icloud.com', '@me.com', '@aol.com', '@proton.me',
]);

const TEST_ALLOWLIST = TEST_ALLOWLIST_RAW.filter((e) => {
  if (e.startsWith('@') && DOMINIOS_PUBLICOS.has(e)) {
    console.error(
      '[email] EMAIL_TEST_ALLOWLIST: se IGNORA "%s". Un dominio publico como comodin ' +
      'deja pasar a cualquier paciente real. Listá las direcciones una por una.', e);
    return false;
  }
  return true;
});

/** ¿Este destino está habilitado para las pruebas? */
function allowedInTests(to: string): boolean {
  if (UNRESTRICTED) return true;
  if (TEST_ALLOWLIST.length === 0) return false;   // falla cerrado
  const addr   = to.toLowerCase();
  const domain = addr.slice(addr.lastIndexOf('@'));   // incluye la arroba
  return TEST_ALLOWLIST.some(e => e.startsWith('@') ? e === domain : e === addr);
}

export interface SendEmailArgs {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text: string;
  patientId?: string | null;
  caseId?: string | null;
  sentByUserId?: string | null;
  sentByName?: string | null;
}

export interface SendEmailResult {
  ok: boolean;
  messageLogId: string | null;
  /** `operationId` de Twilio — con esto se consulta el estado del envío. */
  operationId: string | null;
  to: string | null;
  error: 'DISABLED' | 'NO_FROM' | 'NO_CREDENTIALS' | 'INVALID_TO'
       | 'NOT_IN_TEST_ALLOWLIST' | 'TWILIO_ERROR' | null;
  errorDetail: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Manda un correo y lo registra. NO lanza: devuelve el resultado, igual que
 * `sendSms`. Que falle un aviso no puede tumbar la operación que lo disparó.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const base: SendEmailResult = {
    ok: false, messageLogId: null, operationId: null, to: null,
    error: null, errorDetail: null,
  };

  const to = args.to.trim();

  const fail = async (
    error: NonNullable<SendEmailResult['error']>,
    errorDetail: string,
  ): Promise<SendEmailResult> => {
    const row = await db.messageLog.create({
      data: {
        channel: 'EMAIL',
        status: 'FAILED',
        toAddress: to || '(vacío)',
        fromAddress: FROM_ADDRESS || '(sin remitente)',
        body: `${args.subject}\n\n${args.text}`,
        errorMessage: `${error}: ${errorDetail}`,
        patientId: args.patientId ?? null,
        caseId: args.caseId ?? null,
        sentByUserId: args.sentByUserId ?? null,
        sentByName: args.sentByName ?? null,
      },
      select: { id: true },
    }).catch((e) => { console.error('[email] no se pudo registrar el fallo:', e); return null; });
    return { ...base, to: to || null, error, errorDetail, messageLogId: row?.id ?? null };
  };

  if (!EMAIL_ENABLED)  return fail('DISABLED', 'EMAIL_ENABLED no está en true');
  if (!FROM_ADDRESS)   return fail('NO_FROM', 'falta EMAIL_FROM_ADDRESS');
  if (!TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET) {
    return fail('NO_CREDENTIALS', 'faltan las API Keys de Twilio');
  }
  if (!EMAIL_RE.test(to)) return fail('INVALID_TO', `dirección no válida: "${to}"`);

  // El freno de la etapa de prueba. Si la variable venia solo con dominios
  // publicos, quedo vacia tras el filtro — y "vacia" significa "sin
  // restriccion", que seria exactamente lo contrario de lo que se quiso.
  if (!UNRESTRICTED && TEST_ALLOWLIST.length === 0) {
    return fail('NOT_IN_TEST_ALLOWLIST',
      TEST_ALLOWLIST_RAW.length > 0
        ? 'EMAIL_TEST_ALLOWLIST solo tenia dominios publicos, que no se aceptan ' +
          'como comodin. Listá direcciones concretas.'
        : 'EMAIL_TEST_ALLOWLIST no esta configurada. Sin ella no se manda nada: ' +
          'listá las direcciones de prueba, o poné "*" cuando el BAA este firmado.');
  }
  if (!allowedInTests(to)) {
    return fail(
      'NOT_IN_TEST_ALLOWLIST',
      `el correo está en modo prueba: "${to}" no está autorizado. ` +
      'Agregá la dirección —o el dominio, con @ adelante— a EMAIL_TEST_ALLOWLIST.',
    );
  }

  try {
    // Basic auth con API Key SID + Secret — mismas credenciales que voz y SMS.
    const auth = Buffer.from(`${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`).toString('base64');

    const res = await fetch(EMAILS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: { address: FROM_ADDRESS, name: FROM_NAME },
        to:   [{ address: to, ...(args.toName ? { name: args.toName } : {}) }],
        content: { subject: args.subject, html: args.html, text: args.text },
      }),
    });

    const payload = await res.json().catch(() => null) as { operationId?: string; message?: string } | null;

    if (!res.ok) {
      const detail = payload?.message ?? `HTTP ${res.status}`;
      console.error('[email] Twilio rechazó el envío a %s: %s', to, detail);
      return fail('TWILIO_ERROR', detail);
    }

    // 202 Accepted: Twilio lo tomó, NO que el destinatario lo recibió. Mismo
    // criterio que el SMS — el estado real lo confirma el seguimiento posterior.
    const operationId = payload?.operationId ?? null;

    const row = await db.messageLog.create({
      data: {
        providerMessageId: operationId,
        channel: 'EMAIL',
        status: 'QUEUED',
        toAddress: to,
        fromAddress: FROM_ADDRESS,
        body: `${args.subject}\n\n${args.text}`,
        patientId: args.patientId ?? null,
        caseId: args.caseId ?? null,
        sentByUserId: args.sentByUserId ?? null,
        sentByName: args.sentByName ?? null,
      },
      select: { id: true },
    }).catch((e) => { console.error('[email] enviado pero no registrado:', e); return null; });

    return {
      ok: true,
      messageLogId: row?.id ?? null,
      operationId,
      to,
      error: null,
      errorDetail: null,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[email] envío fallido a %s: %s', to, detail);
    return fail('TWILIO_ERROR', detail);
  }
}

/** Solo para diagnóstico: si el canal está en modo prueba y con qué alcance. */
export function emailMode(): { enabled: boolean; testMode: boolean; allowed: number } {
  return { enabled: EMAIL_ENABLED, testMode: !UNRESTRICTED, allowed: TEST_ALLOWLIST.length };
}

// `TWILIO_ACCOUNT_SID` no se usa en el request (la Basic auth va con la API
// Key), pero se importa para que quede explícito de qué cuenta sale el correo.
void TWILIO_ACCOUNT_SID;
