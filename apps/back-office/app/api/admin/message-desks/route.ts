/**
 * Configuración → Pedidos de bufetes: quién atiende cada escritorio.
 *
 * GET  → los tres escritorios con su gente + los candidatos asignables.
 * PUT  → reemplaza la lista de un escritorio: `{ desk, emails: string[] }`.
 *
 * Solo admin. Los candidatos salen del DIRECTORIO (proyecto Admin), no de
 * Phoenix: así aparece quien se dio de alta hoy y todavía no entró (Brunella).
 * Al asignarla se le crea la fila de Phoenix en el acto, y los pedidos se le
 * acumulan hasta que inicie sesión.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { requireMessagingActor, ADMIN_ROLES } from '@/lib/messaging';
import { ESCRITORIOS } from '@/lib/mensajeria/escritorios';
import {
  escritoriosConMiembros, candidatosParaEscritorio, asegurarFilaPhoenix,
} from '@/lib/mensajeria/escritorios-server';

function esAdmin(role: string | null): boolean {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  if (!esAdmin(actor.actorRole)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const [escritorios, candidatos] = await Promise.all([
    escritoriosConMiembros(),
    candidatosParaEscritorio(),
  ]);
  return NextResponse.json({ escritorios, candidatos });
}

const PutSchema = z.object({
  desk: z.enum(ESCRITORIOS),
  emails: z.array(z.string().email()).max(20),
});

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  if (!esAdmin(actor.actorRole)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  let input: z.infer<typeof PutSchema>;
  try {
    input = PutSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALIDO' }, { status: 400 });
  }

  // Cada email → fila de Phoenix (creándola si hace falta). Los que no son
  // gente interna se devuelven para que la pantalla lo diga, no se ignoran.
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()))];
  const resueltos = await Promise.all(emails.map(async (email) => ({ email, user: await asegurarFilaPhoenix(email) })));
  const rechazados = resueltos.filter((r) => !r.user).map((r) => r.email);
  if (rechazados.length > 0) {
    return NextResponse.json({ error: 'NO_ASIGNABLES', emails: rechazados }, { status: 400 });
  }
  const userIds = resueltos.map((r) => r.user!.id);

  const antes = await db.messageDeskMember.findMany({
    where: { desk: input.desk },
    select: { userId: true, user: { select: { email: true } } },
  });
  const antesIds = new Set(antes.map((a) => a.userId));

  await db.$transaction([
    db.messageDeskMember.deleteMany({
      where: { desk: input.desk, userId: { notIn: userIds } },
    }),
    db.messageDeskMember.createMany({
      data: userIds
        .filter((id) => !antesIds.has(id))
        .map((userId) => ({ desk: input.desk, userId, addedByUserId: actor.actorUserId, addedByName: actor.actorName })),
      skipDuplicates: true,
    }),
  ]);

  writeAuditLog(db, {
    ...actor,
    action: 'MESSAGE_DESK_UPDATED',
    entityType: 'MessageDesk',
    entityId: input.desk,
    metadata: {
      antes: antes.map((a) => a.user.email),
      despues: emails,
    },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, escritorios: await escritoriosConMiembros() });
}
