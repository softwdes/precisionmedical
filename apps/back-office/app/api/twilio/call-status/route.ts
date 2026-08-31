import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { readTwilioWebhook } from '@/lib/twilio-server';

const STATUS_MAP: Record<string, 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' | 'IN_PROGRESS'> = {
  'completed':   'ANSWERED',
  'in-progress': 'IN_PROGRESS',
  'no-answer':   'NO_ANSWER',
  'busy':        'BUSY',
  'failed':      'FAILED',
  'canceled':    'NO_ANSWER',
};

// Twilio llama este endpoint como <Dial action="..."> cuando el leg saliente termina.
// El campo relevante es DialCallStatus (no CallStatus, que es del leg entrante).
export async function POST(req: NextRequest) {
  try {
    // Sin firma válida no se toca el CallLog: este endpoint decide el resultado
    // y la duración de una llamada, que es lo que después leen Métricas y el
    // contador de perdidas sin devolver.
    const webhook = await readTwilioWebhook(req, process.env.TWILIO_CALL_STATUS_URL);
    if (!webhook.ok) return new NextResponse('forbidden', { status: 403 });

    const form            = webhook.form;
    const callSid         = form.get('CallSid')         as string | null;
    // DialCallStatus viene del <Dial action>; CallStatus del status callback genérico
    const dialCallStatus  = form.get('DialCallStatus')  as string | null;
    const callStatus      = form.get('CallStatus')      as string | null;
    const dialDuration    = form.get('DialCallDuration') as string | null;
    const callDuration    = form.get('CallDuration')    as string | null;

    if (!callSid) return new NextResponse('ok');

    const status  = dialCallStatus ?? callStatus ?? '';
    const outcome = STATUS_MAP[status] ?? 'ANSWERED';
    const duration = dialDuration ?? callDuration;

    await db.callLog.updateMany({
      where: { twilioCallSid: callSid },
      data: {
        outcome,
        durationSeconds: duration ? parseInt(duration, 10) : undefined,
      },
    });
  } catch (err) {
    console.error('[twilio/call-status] error:', err);
  }

  return new NextResponse('ok', { headers: { 'Content-Type': 'text/plain' } });
}
