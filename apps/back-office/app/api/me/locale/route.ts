/**
 * PUT /api/me/locale — guarda el idioma elegido por quien está usando la app.
 *
 * ── Por qué hace falta ──────────────────────────────────────────────────────
 *
 * El botón EN/ES de la barra escribía SOLO una cookie. Eso alcanza para pintar
 * la pantalla, pero la cookie no existe cuando el servidor tiene que escribir
 * algo sin nadie del otro lado: el aviso al celular se arma en un cron, a las
 * 7:30, y ahí no hay request de esa persona. Sin esta fila, `preferredLocale`
 * se quedaba en su `@default(es)` y el aviso salía en castellano para todos —
 * el código parecería bilingüe y no lo sería.
 *
 * La cookie sigue siendo el camino rápido para renderizar. Esto es el registro
 * durable que el servidor puede leer cuando no hay request. Ver `lib/push.ts`.
 *
 * ── Ojo con los dos proyectos Supabase ──────────────────────────────────────
 *
 * Esta fila es la de PHOENIX, que es donde viven las suscripciones push. El
 * Admin (`apps/web`) tiene su propia copia de `users` y su propio
 * `preferredLocale`; son dos apps con dos cookies y no se pisan.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const InputSchema = z.object({ locale: z.enum(['es', 'en']) });

export async function PUT(req: NextRequest): Promise<NextResponse> {
  // La identidad sale de la sesión, nunca del cuerpo: nadie cambia la
  // preferencia de otro. Ver la nota de `resolveActor`.
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  await db.user.update({
    where: { id: actor.actorUserId },
    data: { preferredLocale: parsed.locale },
  });

  return NextResponse.json({ ok: true, locale: parsed.locale });
}
