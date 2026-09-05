/**
 * POST /api/admin/snippets/[id]/use — el snippet se insertó en una nota.
 *
 * Suma uno al contador global y, si la persona lo tiene en favoritos, al suyo
 * (`SnippetFavorite.usageCount` + `lastUsedAt`): con eso "los míos primero" se
 * ordena por lo que cada uno usa de verdad y no por lo que marcó una vez.
 *
 * Es telemetría, no una mutación clínica: sin audit log (igual que el
 * autoguardado de la nota) y el cliente la dispara fire-and-forget — si falla,
 * la nota ya tiene el texto y no se le avisa nada al provider.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const snippet = await db.snippet.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!snippet) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const me = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true },
  });

  await db.$transaction([
    db.snippet.update({ where: { id }, data: { usageCount: { increment: 1 } } }),
    // Solo si ya es favorito: usar un snippet no lo convierte en favorito.
    ...(me
      ? [db.snippetFavorite.updateMany({
          where: { snippetId: id, userId: me.id },
          data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
        })]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
