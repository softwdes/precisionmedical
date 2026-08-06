/**
 * POST /api/activity/heartbeat — un minuto de uso ACTIVO del back-office.
 *
 * Fase 2 de métricas por empleado. El navegador pega acá 1 vez por minuto,
 * y SOLO si hubo interacción real (mouse/teclado/touch) con la pestaña visible
 * — ver `lib/use-activity-heartbeat.ts`. Dejar la app abierta sin tocarla no
 * suma tiempo.
 *
 * El upsert es UNA sentencia atómica: con varias pestañas del mismo usuario,
 * la cláusula WHERE del ON CONFLICT descarta cualquier ping que llegue a menos
 * de 50s del anterior, así que un minuto real nunca cuenta dos veces y
 * `activeMinutes` no puede pasar de 60 por hora.
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // users.id de Phoenix (cuid) — el mismo FK que usa AuditLog.actorUserId, para
  // que la Fase 3 cruce eventos y tiempo activo con una sola identidad.
  const dbUser = await getDbUserByEmail(user.email);
  if (!dbUser) return NextResponse.json({ error: 'USER_NOT_LINKED' }, { status: 403 });

  await db.$executeRaw`
    INSERT INTO "user_activity" ("userId", "bucketStart", "activeMinutes", "lastPingAt")
    VALUES (${dbUser.id}, date_trunc('hour', now()), 1, now())
    ON CONFLICT ("userId", "bucketStart") DO UPDATE
    SET "activeMinutes" = LEAST("user_activity"."activeMinutes" + 1, 60),
        "lastPingAt"    = now()
    WHERE now() - "user_activity"."lastPingAt" >= interval '50 seconds'
  `;

  return NextResponse.json({ ok: true });
}
