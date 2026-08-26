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
import { db } from '@precision-medical/database';
import { mapTwilioStatus } from '@/lib/sms';

export const dynamic = 'force-dynamic';

/** Twilio reintenta si no ve un 2xx, así que se responde 200 siempre. */
const ok = () => new NextResponse('', { status: 200 });

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
    const res = await db.messageLog.updateMany({
      where: { providerMessageId: sid },
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

    return ok();
  } catch (err) {
    console.error('[twilio/sms-status] error:', err);
    return ok();
  }
}
