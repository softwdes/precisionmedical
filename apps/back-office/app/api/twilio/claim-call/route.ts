/**
 * POST /api/twilio/claim-call — "esta entrante la atendí yo".
 *
 * En un ring group suenan varios navegadores y gana el primero que acepta.
 * Twilio no nos avisa cuál fue: el `<Dial>` termina y el status callback solo
 * trae el resultado. Así que lo declara el navegador que aceptó.
 *
 * Sin esto, `agentUserId` queda vacío en todas las entrantes y la pestaña "Que
 * yo contesté" nunca se llena — el mismo agujero que la fase 1 vino a tapar
 * para las salientes.
 *
 * Es idempotente y no pisa: si otro navegador llegó primero, la fila ya tiene
 * dueño y se respeta. Evita que un `accept()` que perdió la carrera se robe la
 * autoría de la llamada.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, type Prisma } from '@precision-medical/database';
import { createAdminClient } from '@precision-medical/auth/admin';
import { getSessionUser } from '@/lib/session';
import { resolveActor } from '@/lib/actor';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ twilioCallSid: z.string().min(1) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  let agentName: string | null = null;
  try {
    const { data } = await createAdminClient()
      .from('users').select('firstName, lastName').eq('email', user.email ?? '').single();
    if (data) agentName = `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || null;
  } catch { /* el historial lo resuelve después por agentUserId */ }

  // `agentUserId: null` en el WHERE es lo que hace que el primero gane.
  const claimed = await db.callLog.updateMany({
    where: { twilioCallSid: parsed.twilioCallSid, agentUserId: null },
    data:  { agentUserId: user.id, agentName },
  });

  if (claimed.count > 0) {
    const actor = await resolveActor(req.headers);
    await writeAuditLog(db, {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ANSWER_INBOUND_CALL',
      entityType: 'call_logs',
      entityId: parsed.twilioCallSid,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      after: { agentUserId: user.id, agentName } as unknown as Prisma.JsonValue,
    }).catch((e) => console.error('[twilio/claim-call] audit failed:', e));
  }

  return NextResponse.json({ ok: true, claimed: claimed.count > 0 });
}
