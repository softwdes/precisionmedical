/**
 * POST /api/messages/[threadId]/archive — archivar o desarchivar un hilo PARA
 * MÍ: `{ archived: boolean }`. Bandeja de la clínica y del portal médico.
 *
 * Es lo que antes se llamaba "quitar de mi bandeja": el hilo sale de MI lista,
 * nadie más se entera, sigue en el historial del paciente y vuelve solo si
 * alguien escribe (`reviveThread`). Ahora tiene nombre de lo que es —archivar—
 * y una carpeta donde encontrarlo.
 *
 * Desarchivar limpia también el `deletedAt` viejo: los hilos que la gente
 * "quitó" antes de que existiera la carpeta aparecen en Archivados y vuelven
 * igual que los nuevos.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@precision-medical/database';
import { requireMessagingActor } from '@/lib/messaging';

type Ctx = { params: Promise<{ threadId: string }> };
const Schema = z.object({ archived: z.boolean() });

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { threadId } = await ctx.params;

  let input: z.infer<typeof Schema>;
  try {
    input = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALIDO' }, { status: 400 });
  }

  const r = await db.messageRecipient.updateMany({
    where: { threadId, userId: actor.actorUserId, thread: { deletedAt: null } },
    data: input.archived
      ? { archivedAt: new Date() }
      : { archivedAt: null, deletedAt: null },
  });
  if (r.count === 0) return NextResponse.json({ error: 'Hilo no encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true, archived: input.archived });
}
