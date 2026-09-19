/**
 * POST   /api/admin/diagnoses/[id]/favorite   → marcar diagnóstico como favorito
 * DELETE /api/admin/diagnoses/[id]/favorite   → quitarlo de favoritos
 *
 * Los favoritos son PERSONALES: cada provider marca los suyos. El usuario se
 * resuelve por el email de sesión → `users` de Phoenix, igual que en
 * `templates/[id]/favorite` y en `snippets`.
 *
 * ── Por qué este archivo se reescribió (2026-09-19) ──────────────────────────
 *
 * Acá vivía el stub de la Fase 1A:
 *
 *     const FAKE_USER_ID = 'erick-super-admin-stub';
 *
 * `user_diagnosis_favorites.userId` tiene FK contra `users(id)`, así que ese
 * insert NUNCA pudo entrar: violaba la restricción y la ruta devolvía 500. Y el
 * cliente se lo tragaba con un `catch` vacío, así que la estrella se pintaba un
 * instante y volvía apagada en el siguiente fetch. La tabla tenía CERO filas.
 *
 * Reportado por Devin como *"Favorites not showing in ICD 10/SNOMED Sections"*.
 * No era de mostrar: no se guardaba. El lado de LECTURA ya estaba bien —
 * `GET /api/admin/diagnoses` recibe el `userId` real y marca `isFavorite`.
 *
 * La ruta tampoco tenía NINGÚN chequeo de sesión. Ahora responde 401 sin ella.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';

type Ctx = { params: Promise<{ id: string }> };

/**
 * `users.id` de Phoenix a partir del email de sesión.
 *
 * El `id` de `supabase.auth.getUser()` es el UUID del proyecto de Auth y NO
 * sirve como FK — los `users.id` de Phoenix son cuid. El email corporativo es
 * la llave común. Mismo puente que usan plantillas y snippets.
 */
async function sessionUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const row = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id: diagnosisId } = await ctx.params;
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // El FK ya lo impediría, pero un 404 dice qué pasó y un 500 no.
  const dx = await db.diagnosis.findUnique({ where: { id: diagnosisId }, select: { id: true } });
  if (!dx) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.userDiagnosisFavorite.upsert({
    where: { userId_diagnosisId: { userId, diagnosisId } },
    update: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    create: { userId, diagnosisId, usageCount: 1, lastUsedAt: new Date() },
  });

  return NextResponse.json({ ok: true, favorite: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id: diagnosisId } = await ctx.params;
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  await db.userDiagnosisFavorite.deleteMany({ where: { userId, diagnosisId } });

  return NextResponse.json({ ok: true, favorite: false });
}
