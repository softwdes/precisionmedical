/**
 * POST /api/activity/heartbeat — marca el minuto actual como "de uso activo".
 *
 * El navegador pega acá mientras la persona está trabajando (ver
 * `lib/use-activity-heartbeat.ts`). Cada ping enciende SU bit en un bitmap de
 * los 60 minutos de la hora, y `activeMinutes` es el popcount de ese bitmap.
 *
 * El OR es idempotente, y de ahí sale todo lo bueno: pingear diez veces el
 * mismo minuto cuenta uno solo, dos pestañas del mismo usuario marcan el mismo
 * bit, y un ping perdido no cuesta el minuto entero porque el siguiente (20s
 * después) vuelve a marcarlo. El modelo anterior sumaba +1 por ping con una
 * guarda de 50s: ahí cada ping perdido era un minuto perdido para siempre, y
 * por eso 15 minutos de trabajo real se veían como 5.
 *
 * `GREATEST` protege los conteos viejos: las filas escritas antes de la
 * migración tienen `minutesMask = 0` y su `activeMinutes` no debe caer a 0
 * cuando llegue el primer ping nuevo de esa hora.
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // users.id de Phoenix (cuid) — la misma identidad que AuditLog.actorUserId,
  // para que el reporte cruce eventos y tiempo con una sola llave.
  const dbUser = await getDbUserByEmail(user.email);
  if (!dbUser) return NextResponse.json({ error: 'USER_NOT_LINKED' }, { status: 403 });

  await db.$executeRaw`
    INSERT INTO "user_activity" ("userId", "bucketStart", "minutesMask", "activeMinutes", "lastPingAt")
    VALUES (
      ${dbUser.id},
      date_trunc('hour', now()),
      (1::bigint << EXTRACT(minute FROM now())::int),
      1,
      now()
    )
    ON CONFLICT ("userId", "bucketStart") DO UPDATE
    SET "minutesMask"   = "user_activity"."minutesMask" | EXCLUDED."minutesMask",
        "activeMinutes" = GREATEST(
          bit_count(("user_activity"."minutesMask" | EXCLUDED."minutesMask")::bit(64))::int,
          "user_activity"."activeMinutes"
        ),
        "lastPingAt"    = now()
  `;

  return NextResponse.json({ ok: true });
}
