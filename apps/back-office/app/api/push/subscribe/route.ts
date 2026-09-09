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
 * Servicios de push que conocemos. **No es una lista blanca** — ver abajo.
 *
 * Un endpoint que coincide con uno de estos entra sin más. Uno que no coincide
 * TAMBIÉN entra si pasa los chequeos de seguridad, pero deja un aviso en el log
 * para que nos enteremos de un navegador nuevo en vez de rechazarlo en silencio.
 */
const SERVICIOS_CONOCIDOS = [
  'fcm.googleapis.com',                    // Chrome, Edge, Android
  'updates.push.services.mozilla.com',     // Firefox
  'web.push.apple.com',                    // Safari, iOS
  '.notify.windows.com',                   // Edge legacy / WNS
];

/**
 * Hostnames que NUNCA son un servicio de push, y sí son un objetivo interno.
 */
const HOSTS_PROHIBIDOS = ['localhost', '.local', '.internal', '.localdomain'];

/**
 * ¿Se puede aceptar este endpoint?
 *
 * ── Por qué esto NO es una lista blanca de hosts ────────────────────────────
 *
 * La primera versión sí lo era, con un comentario que afirmaba: "el navegador
 * solo emite endpoints de su propio servicio, así que restringir a estos hosts
 * no le quita nada a nadie legítimo". **Era falso.** El 2026-09-10 un usuario
 * con un Samsung A56 tocó la campana y no se encendió: su navegador (Samsung
 * Internet) emite un endpoint que no estaba en la lista, el alta devolvía 400 y
 * el aviso de error no decía por qué. Una lista de hosts es una lista de los
 * navegadores que se me ocurrieron, y la gente usa los que vienen en su teléfono.
 *
 * ── Qué se protege de verdad ────────────────────────────────────────────────
 *
 * El riesgo real es que el servidor le haga un POST a un objetivo INTERNO: una
 * IP privada, el metadata endpoint del cloud, un servicio del cluster. Eso se
 * cierra rechazando **toda IP literal** —ningún servicio de push emite un
 * endpoint por IP, así que no le quita nada a nadie— más los hostnames que
 * solo existen en una red interna.
 *
 * ── Riesgo que queda, dicho en voz alta ─────────────────────────────────────
 *
 * Un nombre público que resuelva a una IP privada (DNS rebinding) pasa estos
 * chequeos: para cerrarlo habría que resolver el nombre en cada alta y validar
 * la IP. No se hace porque el atacante tendría que ser alguien del staff con
 * sesión válida, el cuerpo que viaja es un blob cifrado que no controla, y es
 * un POST por mensaje. Queda el log como red: si aparece un host raro, se ve.
 * Preferible eso a la falsa seguridad de la lista anterior, que no frenaba a
 * ningún atacante y sí frenaba a un usuario con un teléfono Samsung.
 */
function revisarEndpoint(url: string): { ok: true; conocido: boolean } | { ok: false; motivo: string } {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, motivo: 'no es una URL' }; }

  if (u.protocol !== 'https:') return { ok: false, motivo: 'no es https' };
  if (u.port && u.port !== '443') return { ok: false, motivo: 'puerto no estándar' };

  const host = u.hostname.toLowerCase();

  // Toda IP literal, v4 y v6 (`[::1]` llega como `[::1]` en hostname).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) {
    return { ok: false, motivo: 'endpoint por IP' };
  }
  if (HOSTS_PROHIBIDOS.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h))) {
    return { ok: false, motivo: 'host interno' };
  }
  // Un nombre sin punto no sale de la red local.
  if (!host.includes('.')) return { ok: false, motivo: 'host sin dominio' };

  const conocido = SERVICIOS_CONOCIDOS.some((s) =>
    s.startsWith('.') ? host.endsWith(s) : host === s,
  );
  return { ok: true, conocido };
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
  const revision = revisarEndpoint(endpoint);
  if (!revision.ok) {
    // Se logea el HOST y el motivo: el rechazo anterior era mudo del lado del
    // servidor, así que un navegador que no pasaba se veía como "la campana no
    // se enciende" y no había forma de saber por qué sin adivinar.
    console.warn(
      `[push] alta rechazada · ${revision.motivo} · host=${(() => {
        try { return new URL(endpoint).hostname; } catch { return '(ilegible)'; }
      })()}`,
    );
    return NextResponse.json({ error: 'Endpoint no válido' }, { status: 400 });
  }
  if (!revision.conocido) {
    // Entra, pero queda anotado: así se descubre un navegador nuevo mirando el
    // log, en vez de descubriéndolo porque a alguien no le llegan los avisos.
    console.warn(`[push] servicio de push NUEVO: ${new URL(endpoint).hostname}`);
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
