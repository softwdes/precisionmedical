import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@precision-medical/database';

const BodySchema = z.object({
  twilioCallSid: z.string().min(1),
  patientId:     z.string().min(1),
  caseId:        z.string().nullable().optional(),
});

/**
 * Vincula un CallLog (creado por el webhook /api/twilio/voice cuando el
 * Device del navegador inicia la llamada) con el paciente/caso desde donde
 * se llamó. Sin esto, la llamada queda registrada igual (outcome/duración
 * los pone el webhook de status), pero en Comunicaciones/Métricas aparece
 * solo con el número de teléfono — sin nombre de paciente ni caso.
 *
 * Se llama desde el frontend apenas el hook expone `callSid` (la llamada ya
 * conectó), no antes — antes de eso el CallLog todavía no existe.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  await db.callLog.updateMany({
    where: { twilioCallSid: parsed.twilioCallSid },
    data: {
      patientId: parsed.patientId,
      ...(parsed.caseId ? { caseId: parsed.caseId } : {}),
    },
  }).catch((e) => console.error('[twilio/link-call] link failed:', e));

  return NextResponse.json({ ok: true });
}
