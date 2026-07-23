import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

// Twilio posts status updates here (CallStatus callback).
// We update the CallLog record with final status + duration.
export async function POST(req: NextRequest) {
  const body = await req.formData();

  const callSid      = body.get('CallSid') as string | null;
  const callStatus   = body.get('CallStatus') as string | null;
  const callDuration = body.get('CallDuration') as string | null;

  if (!callSid) return new NextResponse('ok');

  const statusMap: Record<string, string> = {
    'initiated':   'INITIATED',
    'ringing':     'RINGING',
    'in-progress': 'IN_PROGRESS',
    'completed':   'COMPLETED',
    'no-answer':   'NO_ANSWER',
    'busy':        'BUSY',
    'failed':      'FAILED',
  };

  const mappedStatus = statusMap[callStatus ?? ''] ?? 'COMPLETED';

  await db.callLog.updateMany({
    where: { twilioCallSid: callSid },
    data: {
      status: mappedStatus as never,
      durationSeconds: callDuration ? parseInt(callDuration, 10) : undefined,
    },
  });

  return new NextResponse('ok');
}
