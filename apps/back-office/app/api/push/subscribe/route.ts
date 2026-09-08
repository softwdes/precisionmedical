/**
 * POST   /api/push/subscribe → guarda la suscripción de ESTE navegador.
 * DELETE /api/push/subscribe → la borra (el usuario apagó los avisos).
 *
 * Una fila por (persona · navegador · dominio): el principal, `providers.*` y
 * `attorney.*` son tres PWA distintas y cada una trae su propia suscripción.
 * Ver la cabecera de `push_subscriptions` en el schema.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

interface CuerpoSuscripcion {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/**
 * Servicios de push permitidos.
 *
 * Esto NO es una formalidad. El servidor le hace un POST a `endpoint` cada vez
 * que manda un aviso, así que un endpoint arbitrario convertiría a cualquier
 * usuario logueado en dueño de un proxy de peticiones salientes desde nuestra
 * infraestructura (SSRF): apuntarlo a una IP interna, a un metadata endpoint
 * del cloud, o a un tercero para usarnos de amplificador.
 *
 * El navegador solo emite endpoints de su propio servicio, así que restringir
 * a estos hosts no le quita nada a nadie legítimo.
 */
const SERVICIOS_PERMITIDOS = [
  'fcm.googleapis.com',                    // Chrome, Edge, Android
  'updates.push.services.mozilla.com',     // Firefox
  'web.push.apple.com',                    // Safari, iOS
  '.notify.windows.com',                   // Edge legacy / WNS
];

function endpointPermitido(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  return SERVICIOS_PERMITIDOS.some((s) =>
    s.startsWith('.') ? u.hostname.endsWith(s) : u.hostname === s,
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const raw = (await req.json().catch(() => null)) as CuerpoSuscripcion | null;
  const endpoint = raw?.endpoint?.trim();
  const p256dh = raw?.keys?.p256dh?.trim();
  const auth = raw?.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Suscripción incompleta' }, { status: 400 });
  }
  if (!endpointPermitido(endpoint)) {
    return NextResponse.json({ error: 'Endpoint no reconocido' }, { status: 400 });
  }

  const origin = req.headers.get('host') ?? '';

  /**
   * `endpoint` es único, así que el upsert cubre los dos casos reales: el
   * navegador que se re-suscribe (mismo endpoint) y el que renovó su
   * suscripción (endpoint nuevo, el viejo morirá con un 410 en el primer
   * envío y se borra solo).
   *
   * Se reasigna el `userId` a propósito: en un dispositivo compartido —la
   * tablet del consultorio— el último que aceptó es el que debe recibir, no
   * el que lo aceptó hace un mes.
   */
  const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null;

  // SQL crudo por el mismo motivo que `lib/push.ts`: el modelo todavía no está
  // en el cliente de Prisma generado, y regenerarlo acá rompe más de lo que
  // arregla. El `id` va explícito porque `@default(cuid())` no existe en la
  // base — la trampa ya documentada del proyecto.
  await db.$executeRaw`
    INSERT INTO "push_subscriptions"
           ("id", "userId", "origin", "endpoint", "p256dh", "auth", "userAgent", "createdAt", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${actor.actorUserId}, ${origin}, ${endpoint},
            ${p256dh}, ${auth}, ${userAgent}, NOW(), NOW())
    ON CONFLICT ("endpoint") DO UPDATE
       SET "userId"       = EXCLUDED."userId",
           "origin"       = EXCLUDED."origin",
           "p256dh"       = EXCLUDED."p256dh",
           "auth"         = EXCLUDED."auth",
           "userAgent"    = EXCLUDED."userAgent",
           "failureCount" = 0,
           "updatedAt"    = NOW()
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const raw = (await req.json().catch(() => null)) as CuerpoSuscripcion | null;
  const endpoint = raw?.endpoint?.trim();
  if (!endpoint) return NextResponse.json({ error: 'Falta el endpoint' }, { status: 400 });

  // Acotado al dueño: nadie apaga los avisos de otro mandando su endpoint.
  await db.$executeRaw`
    DELETE FROM "push_subscriptions"
     WHERE "endpoint" = ${endpoint} AND "userId" = ${actor.actorUserId}
  `;

  return NextResponse.json({ ok: true });
}
