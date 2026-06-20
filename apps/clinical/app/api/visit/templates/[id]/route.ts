/**
 * PUT    /api/visit/templates/[id]  — actualiza título/descripción/tipo + reemplaza secciones (B.17.7)
 * DELETE /api/visit/templates/[id]  — soft-delete (isActive=false)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import type { EncounterType, CaseType, TemplateSectionKey } from '@precision-medical/database';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;

  const existing = await db.template.findUnique({ where: { id }, select: { id: true, isActive: true } });
  if (!existing || !existing.isActive) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const body = await req.json() as {
    title?: string;
    description?: string;
    encounterType?: string;
    caseType?: string;
    sections?: Array<{
      sectionKey: string;
      content: string;
      orderIndex?: number;
      enabledByDefault?: boolean;
    }>;
  };

  if (!body.title?.trim())  return NextResponse.json({ error: 'TITLE_REQUIRED' }, { status: 400 });
  if (!body.encounterType)  return NextResponse.json({ error: 'ENCOUNTER_TYPE_REQUIRED' }, { status: 400 });

  const template = await db.$transaction(async (tx) => {
    if (body.sections !== undefined) {
      await tx.templateSection.deleteMany({ where: { templateId: id } });
    }

    return tx.template.update({
      where: { id },
      data: {
        title:         body.title!.trim(),
        description:   body.description?.trim() || null,
        encounterType: body.encounterType as EncounterType,
        caseType:      (body.caseType as CaseType) ?? 'GENERAL',
        ...(body.sections?.length ? {
          sections: {
            create: body.sections.map((s, i) => ({
              sectionKey:       s.sectionKey as TemplateSectionKey,
              content:          s.content,
              orderIndex:       s.orderIndex ?? i,
              enabledByDefault: s.enabledByDefault ?? true,
            })),
          },
        } : {}),
      },
      include: {
        sections: { orderBy: { orderIndex: 'asc' } },
      },
    });
  });

  return NextResponse.json({ ok: true, template });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;

  const existing = await db.template.findUnique({ where: { id }, select: { id: true, isActive: true } });
  if (!existing || !existing.isActive) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  await db.template.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
