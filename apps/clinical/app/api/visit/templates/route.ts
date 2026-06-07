/**
 * GET /api/visit/templates
 *
 * Devuelve las plantillas activas disponibles para cargar en B.18.
 * Ordenadas por usageCount DESC, luego por título.
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(): Promise<NextResponse> {
  const templates = await db.template.findMany({
    where:   { isActive: true },
    select: {
      id: true, title: true, description: true,
      encounterType: true, caseType: true, scope: true, specialty: true,
      usageCount: true,
      sections: {
        select: {
          id: true, sectionKey: true, content: true,
          enabledByDefault: true, orderIndex: true,
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
    orderBy: [{ usageCount: 'desc' }, { title: 'asc' }],
    take: 50,
  });

  return NextResponse.json({ ok: true, templates });
}
