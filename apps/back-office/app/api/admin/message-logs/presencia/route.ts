/**
 * POST /api/admin/message-logs/presencia — "sigo mirando esta conversación".
 *
 * Un latido cada 20 s desde la pantalla abierta. Devuelve **quién más está
 * mirando la misma conversación**, así el navegador pide y recibe en la misma
 * vuelta: con dos endpoints (uno para avisar, otro para preguntar) serían el
 * doble de peticiones para el mismo dato.
 *
 * ── Avisa, no bloquea ──────────────────────────────────────────────────────
 *
 * Decisión de Erick (2026-10-01). No hay dueño, no hay candado y no hay nada
 * que liberar: esta ruta no puede negarle a nadie abrir ni responder. Un
 * candado convierte un aviso útil en una pelea por el candado —quién lo tiene,
 * qué pasa si cierra la pestaña— y el caso común (dos personas mirando, una
 * contesta) no necesita exclusión.
 *
 * ── Por qué el DELETE al final ─────────────────────────────────────────────
 *
 * Cuando alguien pasa de una conversación a otra, su fila vieja queda. No
 * molesta —la lectura filtra por antigüedad— pero se acumula una por cada par
 * (persona, conversación) que haya existido. Borrar las propias vencidas en el
 * mismo latido mantiene la tabla del tamaño del staff y no del historial.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@precision-medical/database';
import { checkPatientStaff } from '@/lib/patient-access';
import { resolveActor } from '@/lib/actor';
import { vivaDesde } from '@/lib/presencia-sms';

export const dynamic = 'force-dynamic';

const Entrada = z.object({
  /** `pac:<id>` o `tel:<10 digitos>`. */
  clave: z.string().min(3).max(64),
  /**
   * `true` al cerrar la conversación: borra la fila en vez de refrescarla.
   * Sin esto habría que esperar los 45 s del TTL para que el aviso se apague,
   * y durante ese rato la otra persona ve a alguien que ya se fue.
   */
  saliendo: z.boolean().default(false),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  let datos;
  try {
    datos = Entrada.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const actor = await resolveActor(req.headers);
  const userId = actor.actorUserId;
  // Sin identidad no se puede decir QUIÉN está mirando, y "alguien" no sirve
  // de nada: no se registra, pero igual se contesta con lo que haya.
  if (!userId) {
    return NextResponse.json({ otros: [] });
  }

  const ahora = new Date();

  if (datos.saliendo) {
    await db.smsConversationPresence.deleteMany({ where: { clave: datos.clave, userId } });
    return NextResponse.json({ otros: [] });
  }

  await db.smsConversationPresence.upsert({
    where:  { clave_userId: { clave: datos.clave, userId } },
    create: { clave: datos.clave, userId, userName: actor.actorName ?? null },
    update: { userName: actor.actorName ?? null, lastSeenAt: ahora },
  });

  const otros = await db.smsConversationPresence.findMany({
    where: {
      clave: datos.clave,
      userId: { not: userId },
      lastSeenAt: { gte: vivaDesde(ahora) },
    },
    select: { userId: true, userName: true },
    orderBy: { lastSeenAt: 'desc' },
    take: 5,
  });

  // Las propias que quedaron en OTRAS conversaciones. Ver el encabezado.
  await db.smsConversationPresence
    .deleteMany({ where: { userId, clave: { not: datos.clave }, lastSeenAt: { lt: vivaDesde(ahora) } } })
    .catch(() => { /* la limpieza nunca puede hacer fallar el latido */ });

  return NextResponse.json({
    otros: otros.map((o) => ({ userId: o.userId, nombre: o.userName })),
  });
}
