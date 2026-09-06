/**
 * Snippets CRUD API — bloques de texto por sección de la nota.
 *
 * GET    /api/admin/snippets?section=HPI   → listar (con favorito del que pide)
 * POST   /api/admin/snippets               → crear
 * PATCH  /api/admin/snippets               → editar (body.id requerido)
 * DELETE /api/admin/snippets?id=...        → soft delete — SOLO admin
 *
 * Mismo esqueleto y mismas reglas que /api/admin/templates (Erick 2026-07-28,
 * reconfirmado para snippets el 2026-09-05): cualquier provider crea y edita,
 * solo SUPER_ADMIN/ADMIN elimina, y cada escritura queda en el audit log.
 * Ver docs/plan-settings-portal-snippets.md §5.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { resolveActor } from '@/lib/actor';
import {
  SNIPPET_SECTIONS, SNIPPET_MESSAGE_SECTIONS, isSnippetSection, ownMessageSection, type SnippetSection,
} from '@/lib/snippet-sections';

const SnippetInputSchema = z.object({
  id: z.string().optional(),
  sectionKey: z.enum(SNIPPET_SECTIONS),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  // El HTML puede ser largo (un ROS completo con casillas pasa los 10 KB);
  // el tope es para que un pegado accidental de un PDF entero no entre.
  content: z.string().max(200_000).default(''),
  isActive: z.boolean().default(true),
});

/**
 * users.id de Phoenix a partir del email de sesión.
 *
 * `supabase.auth.getUser().id` es el UUID del proyecto de Auth y NO sirve como
 * FK — `users.id` de Phoenix son cuid. El email corporativo es la llave común,
 * el mismo puente que usan templates y templates/[id]/favorite.
 */
async function sessionUser(): Promise<{ email: string; userId: string | null } | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const row = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true },
  });
  return { email: user.email, userId: row?.id ?? null };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await sessionUser();
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const section = req.nextUrl.searchParams.get('section');
  if (section !== null && !isSnippetSection(section)) {
    return NextResponse.json({ error: 'INVALID_SECTION' }, { status: 400 });
  }

  /**
   * `?messageContext=portal|backoffice` — las plantillas de MENSAJERÍA que le
   * tocan a quien escribe. Se decide ACÁ porque depende del rol, que el cliente
   * no conoce: ADMIN/SUPER_ADMIN ven los dos grupos (providers y clínica); el
   * resto, el de su contexto. Excluyente con `section`.
   */
  const messageContext = req.nextUrl.searchParams.get('messageContext');
  let sections: readonly SnippetSection[] | null = section ? [section] : null;
  if (messageContext !== null) {
    if (messageContext !== 'portal' && messageContext !== 'backoffice') {
      return NextResponse.json({ error: 'INVALID_CONTEXT' }, { status: 400 });
    }
    const role = await fetchDbRole(session.email);
    sections = role === 'SUPER_ADMIN' || role === 'ADMIN'
      ? SNIPPET_MESSAGE_SECTIONS
      : [ownMessageSection(messageContext)];
  }

  const rows = await db.snippet.findMany({
    where: { deletedAt: null, ...(sections ? { sectionKey: { in: [...sections] } } : {}) },
    include: {
      favorites: session.userId ? { where: { userId: session.userId }, select: { id: true } } : false,
      _count: { select: { favorites: true } },
    },
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }],
  });

  const snippets = rows.map((s) => ({
    id: s.id,
    sectionKey: s.sectionKey,
    title: s.title,
    description: s.description,
    content: s.content,
    isActive: s.isActive,
    usageCount: s.usageCount,
    favoritesCount: s._count.favorites,
    isFavorite: Array.isArray(s.favorites) ? s.favorites.length > 0 : false,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return NextResponse.json({ snippets });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const session = await sessionUser();
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let parsed;
  try {
    parsed = SnippetInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // Autor: users.id de Phoenix (el FK snippets_createdById_fkey apunta a users).
  if (!session.userId) return NextResponse.json({ error: 'USER_NOT_LINKED' }, { status: 403 });

  const created = await db.snippet.create({
    data: {
      sectionKey:  parsed.sectionKey,
      title:       parsed.title,
      description: parsed.description ?? null,
      content:     parsed.content,
      isActive:    parsed.isActive,
      scope:       'SHARED', // globales — la UI no ofrece otro alcance
      createdById: session.userId,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    // El cliente no manda x-actor-user-id; sin este fallback la mutación queda
    // sin autor en el audit log (Regla #3).
    actorUserId: actor.actorUserId ?? session.userId,
    actorRole: actor.actorRole,
    action: 'CREATE_SNIPPET',
    entityType: 'snippets',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, snippet: created }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const session = await sessionUser();
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let parsed;
  try {
    parsed = SnippetInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }
  if (!parsed.id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.snippet.findFirst({ where: { id: parsed.id, deletedAt: null } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const updated = await db.snippet.update({
    where: { id: parsed.id },
    data: {
      sectionKey:  parsed.sectionKey,
      title:       parsed.title,
      description: parsed.description ?? null,
      content:     parsed.content,
      isActive:    parsed.isActive,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId ?? session.userId,
    actorRole: actor.actorRole,
    action: 'UPDATE_SNIPPET',
    entityType: 'snippets',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: updated as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, snippet: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  // Regla de negocio: el provider crea y edita, SOLO el admin elimina. El rol
  // se resuelve acá, en el server — esconder el botón no cierra la URL.
  const session = await sessionUser();
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const role = await fetchDbRole(session.email);
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN_DELETE_SNIPPET' }, { status: 403 });
  }

  const before = await db.snippet.findFirst({ where: { id, deletedAt: null } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.snippet.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId ?? session.userId,
    actorRole: actor.actorRole,
    action: 'SOFT_DELETE_SNIPPET',
    entityType: 'snippets',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id });
}
