/**
 * Nombres propios de las categorías de snippets.
 *
 * GET   /api/admin/snippets/sections  → { labels: { HPI: { es, en }, … } }
 * PATCH /api/admin/snippets/sections  → { sectionKey, es, en } — SOLO admin
 *
 * Cambia el rótulo, nunca la clave del enum. Un texto vacío borra el nombre
 * propio de ese idioma y vuelve al por defecto. Ver lib/section-labels.ts.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { resolveActor } from '@/lib/actor';
import { SNIPPET_SECTIONS } from '@/lib/snippet-sections';
import { SECTION_LABELS_KEY, getSectionLabelOverrides, type SectionLabelOverrides } from '@/lib/section-labels';

const Input = z.object({
  sectionKey: z.enum(SNIPPET_SECTIONS),
  es: z.string().trim().max(60).default(''),
  en: z.string().trim().max(60).default(''),
});

export async function GET(): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  return NextResponse.json({ labels: await getSectionLabelOverrides() });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // Renombrar una sección se ve en la nota, en la impresión y en el catálogo
  // de TODOS: es del admin, como eliminar. El rol se resuelve acá.
  const role = await fetchDbRole(user.email);
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN_RENAME_SECTION' }, { status: 403 });
  }

  let parsed;
  try {
    parsed = Input.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const before = await getSectionLabelOverrides();
  const after: SectionLabelOverrides = { ...before };
  const entry: { es?: string; en?: string } = {};
  if (parsed.es) entry.es = parsed.es;
  if (parsed.en) entry.en = parsed.en;
  if (Object.keys(entry).length) after[parsed.sectionKey] = entry;
  else delete after[parsed.sectionKey];

  const me = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true },
  });

  await db.setting.upsert({
    where: { key: SECTION_LABELS_KEY },
    create: {
      key: SECTION_LABELS_KEY,
      value: after as Prisma.InputJsonValue,
      description: 'Nombres propios de las categorías de snippets (secciones de la nota y grupos de mensajería), por idioma.',
      updatedById: me?.id ?? null,
    },
    update: { value: after as Prisma.InputJsonValue, updatedById: me?.id ?? null },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId ?? me?.id ?? null,
    actorRole: actor.actorRole,
    action: 'RENAME_SNIPPET_SECTION',
    entityType: 'settings',
    entityId: SECTION_LABELS_KEY,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: { [parsed.sectionKey]: before[parsed.sectionKey] ?? null } as Prisma.JsonValue,
    after: { [parsed.sectionKey]: after[parsed.sectionKey] ?? null } as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, labels: after });
}
