/**
 * PATCH /api/admin/releases/entries/[entryId]
 *
 * Curar una línea del changelog: corregir el texto, escribir el inglés, cambiar
 * el módulo o la audiencia, u ocultarla.
 *
 * Los mensajes de commit de este repo ya están escritos para humanos, pero no
 * siempre con el corte justo — y hay líneas que no se publican (las de
 * seguridad). Guardar cualquier cosa acá apaga `needsReview`: alguien ya la miró.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, type ReleaseAudience } from '@precision-medical/database';
import { AUDIENCES } from '@precision/release/audience';
import { MODULE_LABELS } from '@precision/release/modules';
import { requireReleaseAdmin } from '../../guard';

const InputSchema = z
  .object({
    textEs: z.string().trim().min(1).max(500).optional(),
    // `null` explícito para volver a dejarla sin traducir.
    textEn: z.string().trim().max(500).nullable().optional(),
    module: z.enum(Object.keys(MODULE_LABELS) as [string, ...string[]]).optional(),
    audiences: z.array(z.enum(AUDIENCES)).optional(),
    hidden: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Mandá al menos un campo' });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
): Promise<NextResponse> {
  const auth = await requireReleaseAdmin();
  if (auth instanceof NextResponse) return auth;

  const { entryId } = await params;

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const entry = await db.releaseEntry.findUnique({
    where: { id: entryId },
    select: { id: true, release: { select: { status: true } } },
  });
  if (entry === null) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Un release publicado ya se le mostró a gente; editarlo cambiaría el texto
  // bajo los pies de quien lo leyó. Hay que despublicarlo primero.
  if (entry.release.status === 'PUBLISHED') {
    return NextResponse.json({ error: 'ALREADY_PUBLISHED' }, { status: 409 });
  }

  const saved = await db.releaseEntry.update({
    where: { id: entryId },
    data: {
      ...(parsed.textEs !== undefined ? { textEs: parsed.textEs } : {}),
      ...(parsed.textEn !== undefined
        ? { textEn: parsed.textEn === null || parsed.textEn === '' ? null : parsed.textEn }
        : {}),
      ...(parsed.module !== undefined ? { module: parsed.module } : {}),
      ...(parsed.audiences !== undefined
        ? { audiences: parsed.audiences.map((a) => a.toUpperCase() as ReleaseAudience) }
        : {}),
      ...(parsed.hidden !== undefined ? { hidden: parsed.hidden } : {}),
      needsReview: false,
    },
  });

  return NextResponse.json({ ok: true, entry: { id: saved.id, needsReview: saved.needsReview } });
}
