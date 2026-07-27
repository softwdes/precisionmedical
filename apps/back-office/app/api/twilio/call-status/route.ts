import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

const STATUS_MAP: Record<string, 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' | 'IN_PROGRESS'> = {
  'completed':   'ANSWERED',
  'in-progress': 'IN_PROGRESS',
  'no-answer':   'NO_ANSWER',
  'busy':        'BUSY',
  'failed':      'FAILED',
  'canceled':    'NO_ANSWER',
};

// Twilio posts status updates here as the call progresses.
// Updates CallLog with final outcome and duration.
export async function POST(req: NextRequest) {
  try {
    const form         = await req.formData();
    const callSid      = form.get('CallSid')      as string | null;
    const callStatus   = form.get('CallStatus')   as string | null;
    const callDuration = form.get('CallDuration') as string | null;

    if (!callSid) return new NextResponse('ok');

    const outcome = STATUS_MAP[callStatus ?? ''] ?? 'ANSWERED';

    await db.callLog.updateMany({
      where: { twilioCallSid: callSid },
      data: {
        outcome,
        durationSeconds: callDuration ? parseInt(callDuration, 10) : undefined,
      },
    });
  } catch (err) {
    console.error('[twilio/call-status] error:', err);
  }

  return new NextResponse('ok', { headers: { 'Content-Type': 'text/plain' } });
}
