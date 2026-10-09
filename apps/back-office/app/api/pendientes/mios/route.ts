import { NextResponse, type NextRequest } from 'next/server';
import { resolveActor } from '@/lib/actor';
import { misPendientes } from '@/lib/pendientes';
import { corregidos } from '@/lib/pendientes/corregidos';

/**
 * "Mis pendientes de corrección": lo que quien pregunta creó y hoy conviene arreglar.
 *
 * Sin chequeo de módulo a propósito, igual que Mis premios: cualquiera con sesión
 * puede preguntar y la respuesta es SOLO lo suyo — el filtro es el `actorUserId`
 * de la sesión, nunca un parámetro del cliente.
 *
 * `?solo=conteo` devuelve nada más los números: es lo que pide el avatar.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const r = await misPendientes(actor.actorUserId);
    if (req.nextUrl.searchParams.get('solo') === 'conteo') {
      return NextResponse.json({ counts: r.counts });
    }
    // El historial de lo ya corregido (90 días): solo lo suyo, igual que lo pendiente.
    const hechos = await corregidos({ userId: actor.actorUserId, dias: 90 });
    return NextResponse.json({ ...r, corregidos: hechos });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'error desconocido';
    return NextResponse.json({ error: 'PENDIENTES_FAILED', detail }, { status: 500 });
  }
}
