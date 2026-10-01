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
    const [data, anterior, categories] = await Promise.all([
      misPremios(actor.actorUserId),
      // El mes anterior: se aprueba después de terminar, y tiene que verse "En revisión" / "Aprobado".
      misPremios(actor.actorUserId, 'anterior'),
      db.rewardCategory.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const previous = anterior ? {
      month: anterior.month, approved: anterior.approved, payoutCents: anterior.me.payoutCents,
      goalsHit: anterior.me.goalsHit, goalsTotal: anterior.me.goalsTotal, kind: anterior.me.kind, progress: anterior.me.progress,
    } : null;
    if (!data) return NextResponse.json({ participating: false, previous });
    return NextResponse.json({
      participating: true,
      ...data,
      previous,
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
