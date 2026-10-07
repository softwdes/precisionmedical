/**
 * POST /api/twilio/sms-status — Twilio avisa qué pasó con un SMS.
 *
 * Es la ÚNICA forma de saber si un mensaje llegó. `messages.create` devuelve
 * `queued` casi siempre: Twilio lo aceptó, nada más. La entrega la confirma el
 * operador minutos después, y por acá.
 *
 * Importa especialmente con A2P 10DLC: si la marca o la campaña no están
 * registradas, el operador filtra el mensaje y llega `undelivered` con el error
 * 30007 — sin este webhook eso es indistinguible de "el paciente lo ignoró".
 *
 * Se configura en la variable `SMS_STATUS_CALLBACK_URL`, que `lib/sms.ts` pasa
 * como `statusCallback` en cada envío.
 */

import { NextResponse, type NextRequest } from 'next/server';
import twilio from 'twilio';
import { db, type MessageStatus } from '@precision-medical/database';
import { mapTwilioStatus, sendSms } from '@/lib/sms';
import { soloDigitos } from '@/lib/telefono-paciente';

export const dynamic = 'force-dynamic';

/** Twilio reintenta si no ve un 2xx, así que se responde 200 siempre. */
const ok = () => new NextResponse('', { status: 200 });

/**
 * Qué estado puede PISAR a cuál. El estado solo avanza, nunca retrocede.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 *
 * Twilio manda `queued`, `sent` y `delivered` como tres POST sueltos y **no
 * garantiza el orden**. Cuando salen casi juntos, el `queued` puede llegar
 * después del `delivered` — y hasta hoy esta ruta aplicaba el último que
 * entrara, así que un mensaje entregado volvía a "en cola".
 *
 * Medido el 2026-10-06 sobre los envíos reales: **81 de 466 salientes** —uno
 * de cada seis— figuraban QUEUED teniendo `deliveredAt` puesto, que es una
 * contradicción que sólo puede escribir esta ruta. La prueba de que fue una
 * carrera y no otra cosa está en los tiempos: en los entregados, la última
 * escritura cae 0,00 s después del acuse; en los 81 atascados cae 0,35 s
 * DESPUÉS. Algo escribió luego del "entregado", y lo único que escribe acá es
 * un aviso más viejo llegando tarde.
 *
 * En la clínica eso se leía como "el mensaje nunca salió" y en la consola de
 * Twilio decía entregado. El registro contradecía al proveedor.
 */
const PUEDE_PISAR: Record<MessageStatus, readonly MessageStatus[]> = {
  // Nada: es el estado inicial con el que nace la fila.
  QUEUED:      [],
  SENT:        ['QUEUED'],
  DELIVERED:   ['QUEUED', 'SENT'],
  UNDELIVERED: ['QUEUED', 'SENT'],
  FAILED:      ['QUEUED', 'SENT'],
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const raw  = await req.text();
    const form = new URLSearchParams(raw);

    // Firma de Twilio. Solo se valida si hay AUTH TOKEN configurado — la app
    // autentica con API Keys, que NO sirven para esto. Sin token no se rechaza
    // nada (romper la entrega de estados sería peor), pero queda el aviso: sin
    // validar, cualquiera puede POSTear un "delivered" falso.
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken) {
      const signature = req.headers.get('x-twilio-signature') ?? '';
      const url = process.env.SMS_STATUS_CALLBACK_URL ?? req.url;
      const params = Object.fromEntries(form.entries());
      if (!twilio.validateRequest(authToken, signature, url, params)) {
        console.error('[twilio/sms-status] firma inválida — descartado');
        return ok();
      }
    } else {
      console.warn('[twilio/sms-status] sin TWILIO_AUTH_TOKEN: no se valida la firma');
    }

    const sid    = form.get('MessageSid') ?? form.get('SmsSid');
    const status = form.get('MessageStatus') ?? form.get('SmsStatus');
    if (!sid) return ok();

    const errCode = form.get('ErrorCode');
    let   mapped  = mapTwilioStatus(status);

    // Un mensaje con ErrorCode no esta "en cola" ni "enviado": Twilio ya sabe
    // que no llego. Paso de verdad — quedo una fila QUEUED con error 30005
    // (numero inexistente) que en la UI se leia como "todavia esperando".
    // Un pendiente eterno es peor que un fallo: nadie lo revisa.
    if (errCode && (mapped === 'QUEUED' || mapped === 'SENT')) {
      console.warn('[twilio/sms-status] %s traia ErrorCode %s con estado "%s": se marca UNDELIVERED',
        sid, errCode, status);
      mapped = 'UNDELIVERED';
    }

    // `updateMany` y no `update`: un SID que no conocemos no es un error. Pasa
    // si el proceso murió entre que Twilio aceptó el mensaje y lo registramos.
    //
    // El `status` del WHERE es el guardia de orden: la fila solo se toca si
    // está en un estado anterior. Va en la condición y no en un `if` leído
    // antes, porque entre leer y escribir puede entrar otro aviso — la base
    // decide, en una sola operación.
    const anteriores = PUEDE_PISAR[mapped] ?? [];
    if (anteriores.length === 0) {
      // `queued` no puede adelantar a nada. Llega tarde o llega primero; en
      // los dos casos la fila ya nació en QUEUED y no hay nada que escribir.
      return ok();
    }

    const res = await db.messageLog.updateMany({
      where: { providerMessageId: sid, status: { in: [...anteriores] } },
      data: {
        status: mapped,
        ...(mapped === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        ...(errCode ? { errorCode: Number.parseInt(errCode, 10) || null } : {}),
        ...(form.get('ErrorMessage') ? { errorMessage: form.get('ErrorMessage') } : {}),
      },
    });

    if (res.count === 0) {
      console.warn('[twilio/sms-status] SID desconocido: %s (%s)', sid, status);
    } else if (mapped === 'UNDELIVERED' || mapped === 'FAILED') {
      // Ruidoso a propósito: es la señal de que algo está mal de verdad —
      // número inválido, bloqueo del operador, o A2P sin registrar.
      console.error('[twilio/sms-status] NO ENTREGADO %s · estado=%s error=%s %s',
        sid, status, errCode ?? '-', form.get('ErrorMessage') ?? '');
    }

    /**
     * El fijo que no recibe SMS: reintentar en el CELULAR.
     *
     * Erick, 2026-10-07. El caso que lo pidió: Gretchen George (P-4879)
     * tiene un fijo como principal y su celular cargado en la ficha, sin
     * usar — porque el envío siempre prefiere el principal. Twilio nos venía
     * diciendo con todas las letras que ese número no puede recibir SMS, y
     * nadie leía el mensaje.
     *
     * ── Por qué SOLO el 30006 ──────────────────────────────────────────
     *
     * Es el único código que habla del NÚMERO y no del momento:
     *   30006 — el destino no puede recibir SMS (un fijo). Estructural: va a
     *           fallar siempre, probar otro número es lo correcto.
     *   30003 — el teléfono está apagado o fuera de red. TEMPORAL: el número
     *           está bien y mañana funciona. Mandarle el aviso a otro
     *           teléfono por eso sería desviar un mensaje con datos del
     *           paciente por una condición que se arregla sola.
     *   30005 — el número no existe. Suena parecido, pero puede ser un dedazo
     *           al cargarlo, y el segundo campo suele tener el mismo error.
     *
     * Empezar por el caso inequívoco. Medido sobre el histórico: esto habría
     * disparado en 1 mensaje de 486, y en ninguno de los 421 entregados.
     *
     * ── Los tres frenos ────────────────────────────────────────────────
     *
     * 1. Tiene que haber un celular DISTINTO. Comparado por dígitos, porque
     *    el mismo número escrito de dos formas no es un segundo teléfono: de
     *    1.252 fichas con los dos campos llenos, solo 239 difieren de verdad.
     * 2. El mensaje que falló NO puede ser ya el del celular. Sin esto, el
     *    reintento que también falla dispara otro, y otro.
     * 3. Si algo acá se rompe, el webhook responde 200 igual. Twilio reintenta
     *    cuando no ve un 2xx, y un reintento suyo volvería a entrar por acá:
     *    romper la entrega de ESTADOS por un reenvío es peor que no reenviar.
     */
    if (errCode === '30006' && res.count > 0) {
      try { await reintentarEnElCelular(sid); }
      catch (e) { console.error('[twilio/sms-status] el reintento falló, sigo:', e); }
    }

    return ok();
  } catch (err) {
    console.error('[twilio/sms-status] error:', err);
    return ok();
  }
}

/**
 * Reenvía al celular un mensaje que murió contra un fijo.
 *
 * Separado del handler a propósito: el webhook tiene que terminar en 200 pase
 * lo que pase acá, y mezclar las dos cosas invita a que un `throw` de esto se
 * lleve puesto el registro del estado.
 */
async function reintentarEnElCelular(sid: string): Promise<void> {
  const fallado = await db.messageLog.findFirst({
    where: { providerMessageId: sid },
    select: {
      id: true, body: true, toAddress: true, patientId: true, caseId: true,
      patient: { select: { phone: true, phone2: true } },
    },
  });
  if (!fallado?.patient) return;              // sin ficha no hay segundo número

  const celular = (fallado.patient.phone2 ?? '').trim();
  if (!celular) return;

  const dCel = soloDigitos(celular);
  // Freno 1: tiene que ser OTRO número, no el mismo escrito distinto.
  if (dCel === soloDigitos(fallado.patient.phone)) return;
  // Freno 2: si lo que falló YA era el celular, no hay a dónde reintentar.
  if (dCel === soloDigitos(fallado.toAddress)) return;

  console.warn('[twilio/sms-status] %s murió contra un fijo; reenviando al celular', sid);

  await sendSms({
    to: celular,
    body: fallado.body,
    patientId: fallado.patientId ?? undefined,
    caseId: fallado.caseId ?? undefined,
    // Sin `sentByName`: no lo escribió una persona. Queda como automático,
    // igual que un recordatorio, y así el historial no le atribuye a nadie
    // un mensaje que mandó el sistema.
  });
}
