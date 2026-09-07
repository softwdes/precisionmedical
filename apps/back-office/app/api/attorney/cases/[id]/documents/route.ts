/**
 * GET /api/attorney/cases/[id]/documents — el expediente del caso, para el bufete.
 *
 * Espejo EXACTO en forma del GET de `/api/admin/cases/[id]/documents`, para que
 * el mismo `DocumentsTab` sirva a los dos portales sin ramificar el render.
 *
 * ─── Por qué existe esta ruta ─────────────────────────────────────────────────
 *
 * El tab Documentos es uno de los 4 tabs del portal legal (`TABS_ATTORNEY`),
 * pero pegaba contra `/api/admin/*`, y el middleware le devuelve 403 a todo lo
 * administrativo cuando el rol es LAWYER. O sea: el tab **nunca funcionó** para
 * un abogado —mostraba un error, no una lista vacía— y nadie lo reportó porque
 * el caso sin documentos se ve casi igual.
 *
 * ─── Solo lectura, y de verdad ────────────────────────────────────────────────
 *
 * Erick, 2026-09-07: «los documentos se comparten pero el abogado solo puede ver
 * o descargar, no editar o eliminar nada». Por eso acá hay **un solo verbo**: no
 * existe POST, PATCH ni DELETE en ninguna ruta de documentos del portal. La regla no
 * es un botón escondido en la pantalla — es que la puerta no está construida.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { casoDelAbogado } from '@/lib/attorney-case-scope';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const { caseId, deny } = await casoDelAbogado(id);
  if (deny) return deny;

  const parentId = req.nextUrl.searchParams.get('parentId') || null;

  const documents = await db.patientDocument.findMany({
    where:   { caseId, parentId },
    orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
    select: {
      id: true, name: true, isFolder: true, s3Key: true,
      mimeType: true, size: true, parentId: true, createdAt: true,
      _count: { select: { children: true } },
    },
  });

  return NextResponse.json({ documents });
}
