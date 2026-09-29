import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { misPremios } from '@/lib/premios';

/**
 * "Mis premios": el mes que corre de quien pregunta.
 *
 * Sin chequeo de módulo a propósito, como la Carrera: cualquiera con sesión
 * puede preguntar, y la respuesta es SOLO la suya. Quien no participa este mes
 * recibe `{ participating: false }`, no un error: el menú ni siquiera le
 * muestra la opción, pero un link viejo no tiene por qué romper la pantalla.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const [data, categories] = await Promise.all([
      misPremios(actor.actorUserId),
      db.rewardCategory.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    if (!data) return NextResponse.json({ participating: false });
    return NextResponse.json({
      participating: true,
      ...data,
      categories: categories.map((c) => ({
        code: c.code, nameEs: c.nameEs, nameEn: c.nameEn,
        pointsNew: c.pointsNew, pointsExisting: c.pointsExisting,
        tracksSource: c.tracksSource, requiresPatient: c.requiresPatient,
      })),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'error desconocido';
    return NextResponse.json({ error: 'REWARDS_FAILED', detail }, { status: 500 });
  }
}
