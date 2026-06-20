/**
 * GET  /api/visit/templates  — lista plantillas activas para el picker (B.17.6)
 * POST /api/visit/templates  — crea una plantilla PERSONAL nueva (B.17.7 CRUD)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import type { EncounterType, CaseType, TemplateSectionKey } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get('doctorId');

  const templates = await db.template.findMany({
    where: {
      isActive: true,
      ...(doctorId ? { createdById: doctorId } : {}),
    },
    select: {
      id: true, title: true, description: true,
      encounterType: true, caseType: true, scope: true, specialty: true,
      usageCount: true, createdById: true,
      sections: {
        select: {
          id: true, sectionKey: true, content: true,
          enabledByDefault: true, orderIndex: true,
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
    orderBy: [{ usageCount: 'desc' }, { title: 'asc' }],
    take: 200,
  });

  return NextResponse.json({ ok: true, templates });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as {
    title?: string;
    description?: string;
    encounterType?: string;
    caseType?: string;
    createdById?: string;
    sections?: Array<{
      sectionKey: string;
      content: string;
      orderIndex?: number;
      enabledByDefault?: boolean;
    }>;
  };

  if (!body.title?.trim())      return NextResponse.json({ error: 'TITLE_REQUIRED' }, { status: 400 });
  if (!body.encounterType)      return NextResponse.json({ error: 'ENCOUNTER_TYPE_REQUIRED' }, { status: 400 });
  if (!body.createdById?.trim()) return NextResponse.json({ error: 'CREATED_BY_REQUIRED' }, { status: 400 });

  const template = await db.template.create({
    data: {
      title:         body.title.trim(),
      description:   body.description?.trim() || null,
      encounterType: body.encounterType as EncounterType,
      caseType:      (body.caseType as CaseType) ?? 'GENERAL',
      scope:         'PERSONAL',
      createdById:   body.createdById,
      sections: body.sections?.length ? {
        create: body.sections.map((s, i) => ({
          sectionKey:       s.sectionKey as TemplateSectionKey,
          content:          s.content,
          orderIndex:       s.orderIndex ?? i,
          enabledByDefault: s.enabledByDefault ?? true,
        })),
      } : undefined,
    },
    include: {
      sections: { orderBy: { orderIndex: 'asc' } },
    },
  });

  return NextResponse.json({ ok: true, template }, { status: 201 });
}
