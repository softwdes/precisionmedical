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
    select: {
      id: true,
      hidden: true,
      needsReview: true,
      textEn: true,
      release: { select: { status: true } },
    },
  });
  if (entry === null) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Lo que decide si se puede editar NO es el estado del release, es si esta
  // entrada ya se le mostró a alguien.
  //
  // Con el auto-publicado, las entradas que esperan revisión viven DENTRO de
  // releases publicados: bloquear por `status` dejaría la cola de curación
  // inservible, que es justo la pantalla que existe para destaparlas. Una nota
  // que sigue en `needsReview` u `hidden` nunca salió, así que se edita libre.
  const yaSeMostro =
    entry.release.status === 'PUBLISHED' && !entry.hidden && !entry.needsReview;

  /*
   * Salvo que lo único que se esté haciendo sea ESCRIBIR EL INGLÉS QUE FALTA.
   *
   * El candado de arriba se lleva puesto el caso que el schema declara
   * obligatorio: "un release no se puede publicar con `textEn` en null en
   * alguna entrada visible". Con el auto-publicado, una nota sin inglés sale
   * igual y a partir de ahí es inmutable — queda en español para siempre para
   * quien tenga el selector en EN. Medido el 2026-10-06 sobre el rango del
   * lanzamiento: 28 notas, 0 con trailer `Release-EN:`, 16 de ellas visibles.
   *
   * Es la excepción más chica que arregla eso: un solo campo, y solo para
   * llenar un hueco. Pisar un inglés ya escrito, o tocar cualquier otra cosa,
   * sigue dando 409.
   *
   * No le cambia el texto a nadie bajo los pies: quien la leyó en español la
   * vio en español porque no había otra, y el que lee en inglés pasa de ver
   * español a ver inglés. Nadie pierde lo que ya leyó.
   */
  const soloLlenaElIngles =
    Object.keys(parsed).length === 1 &&
    parsed.textEn !== undefined &&
    parsed.textEn !== null &&
    parsed.textEn !== '' &&
    entry.textEn === null;

  if (yaSeMostro && !soloLlenaElIngles) {
    return NextResponse.json({ error: 'ALREADY_VISIBLE' }, { status: 409 });
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
      // Guardar es revisar. En el camino de `soloLlenaElIngles` ya venía en
      // false —la nota es visible—, así que no cambia nada.
      needsReview: false,
    },
  });

  return NextResponse.json({ ok: true, entry: { id: saved.id, needsReview: saved.needsReview } });
}
