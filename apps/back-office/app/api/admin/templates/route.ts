/**
 * Templates CRUD API
 *
 * GET    /api/admin/templates              → listar templates (con secciones)
 * POST   /api/admin/templates              → crear template
 * PATCH  /api/admin/templates              → editar template (body.id requerido)
 * DELETE /api/admin/templates?id=...       → soft delete template
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders, Prisma } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';

const SectionSchema = z.object({
  id: z.string().optional(),
  sectionKey: z.enum([
    'QUEJA_PRINCIPAL', 'HPI', 'ROS', 'EXAMEN_FISICO', 'EVALUACIONES', 'PLAN', 'DIAGNOSTICOS',
  ]),
  content: z.string().default(''),
  enabledByDefault: z.boolean().default(true),
  orderIndex: z.number().int().default(0),
});

const TemplateInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  encounterType: z.enum(['FOLLOW_UP', 'NEW_PATIENT', 'RE_EVAL', 'URI', 'PHYSICAL', 'NURSING_HOME', 'CLOSING', 'OTHER']),
  caseType: z.enum(['MVA', 'GENERAL', 'NURSING_HOME']).default('GENERAL'),
  scope: z.enum(['PERSONAL', 'SHARED', 'SPECIALTY']).default('SHARED'),
  specialty: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  sections: z.array(SectionSchema).default([]),
});

export async function GET(): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const templates = await db.template.findMany({
    where: { deletedAt: null },
    include: {
      sections: { orderBy: { orderIndex: 'asc' } },
      _count: { select: { visitNotes: true, favorites: true } },
    },
    orderBy: [{ isActive: 'desc' }, { usageCount: 'desc' }, { title: 'asc' }],
  });

  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let parsed;
  try {
    parsed = TemplateInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const created = await db.template.create({
    data: {
      title:         parsed.title,
      description:   parsed.description ?? null,
      encounterType: parsed.encounterType,
      caseType:      parsed.caseType,
      scope:         parsed.scope,
      specialty:     (parsed.specialty as Prisma.TemplateCreateInput['specialty']) ?? null,
      isActive:      parsed.isActive,
      createdById:   user.id,
      sections: {
        create: parsed.sections.map((s, i) => ({
          sectionKey:       s.sectionKey,
          content:          s.content,
          enabledByDefault: s.enabledByDefault,
          orderIndex:       s.orderIndex ?? i,
        })),
      },
    },
    include: { sections: true },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CREATE_TEMPLATE',
    entityType: 'templates',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, template: created }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);

  let parsed;
  try {
    parsed = TemplateInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }
  if (!parsed.id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.template.findUnique({ where: { id: parsed.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const updated = await db.$transaction(async (tx) => {
    // Replace all sections: delete existing, create new
    await tx.templateSection.deleteMany({ where: { templateId: parsed.id } });

    return tx.template.update({
      where: { id: parsed.id },
      data: {
        title:         parsed.title,
        description:   parsed.description ?? null,
        encounterType: parsed.encounterType,
        caseType:      parsed.caseType,
        scope:         parsed.scope,
        specialty:     (parsed.specialty as Prisma.TemplateCreateInput['specialty']) ?? null,
        isActive:      parsed.isActive,
        sections: {
          create: parsed.sections.map((s, i) => ({
            sectionKey:       s.sectionKey,
            content:          s.content,
            enabledByDefault: s.enabledByDefault,
            orderIndex:       s.orderIndex ?? i,
          })),
        },
      },
      include: { sections: true },
    });
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'UPDATE_TEMPLATE',
    entityType: 'templates',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: updated as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, template: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  // Regla de negocio (Erick 2026-07-28): el doctor crea y edita plantillas
  // globales, pero SOLO el admin puede eliminarlas.
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const role = await fetchDbRole(user.email);
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN_DELETE_TEMPLATE' }, { status: 403 });
  }

  const before = await db.template.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.template.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SOFT_DELETE_TEMPLATE',
    entityType: 'templates',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id });
}
