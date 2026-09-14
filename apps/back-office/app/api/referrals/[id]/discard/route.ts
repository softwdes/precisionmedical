/**
 * POST /api/referrals/[id]/discard — la clínica descarta un referido del bufete.
 *
 * El estado `DISCARDED` existía en la base desde el primer día y no había forma
 * de llegar a él: un referido que no servía quedaba PENDIENTE para siempre, y
 * el bufete lo seguía viendo como "sin respuesta". Esto cierra ese agujero.
 *
 * El motivo NO es opcional: descartar sin decir por qué le deja al bufete el
 * mismo silencio que teníamos antes, solo que ahora con un sello encima. El
 * texto viaja al hilo como una respuesta normal, así que le llega a su bandeja.
 *
 * Puerta de la CLÍNICA (no del portal legal): la abre quien recibió el mensaje.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { resolveActor } from '@/lib/actor';
import { requireMessagingActor } from '@/lib/messaging';
import { descartarReferido } from '@/lib/referidos/referidos-server';

type Ctx = { params: Promise<{ id: string }> };

const MOTIVO_MAX = 1000;

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  // Mismo guardián que responder un mensaje: si puede escribir en el hilo,
  // puede resolver el referido que vive en ese hilo.
  const { deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId || !actor.actorName) {
    return NextResponse.json({ error: 'SIN_IDENTIDAD' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const raw = (await req.json().catch(() => null)) as { motivo?: string } | null;
  const motivo = raw?.motivo?.trim();
  if (!motivo) return NextResponse.json({ error: 'FALTA_MOTIVO' }, { status: 400 });
  if (motivo.length > MOTIVO_MAX) return NextResponse.json({ error: 'MOTIVO_LARGO' }, { status: 400 });

  /**
   * El texto que lee el BUFETE va en español, el idioma de la clínica que
   * escribe — igual que el resumen del referido. Lo que le importa al abogado
   * es el motivo, que lo escribió una persona.
   */
  const t = await getTranslations({ locale: 'es', namespace: 'phoenix.messaging' });

  const r = await descartarReferido({
    referralId: id,
    actor: actor as typeof actor & { actorUserId: string; actorName: string },
    textoRespuesta: `${t('refDiscardedReply')}\n\n${motivo}`,
  });

  if (!r.ok) {
    // 409 y no 400: no es un pedido mal hecho, es que alguien se adelantó. La
    // pantalla lo usa para decir QUIÉN, en vez de un error genérico.
    return NextResponse.json({ error: 'YA_RESUELTO', status: r.status, by: r.convertedByName }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
