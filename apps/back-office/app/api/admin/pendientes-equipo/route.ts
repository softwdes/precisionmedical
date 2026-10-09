import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { misPendientes } from '@/lib/pendientes';
import { corregidos } from '@/lib/pendientes/corregidos';
import { resumenDelEquipo } from '@/lib/pendientes/equipo';

/**
 * Incidencias de TODO el equipo, para el administrador.
 *
 *   GET /api/admin/pendientes-equipo                → una fila por persona
 *   GET /api/admin/pendientes-equipo?usuario=<id>   → el detalle de UNA persona
 *
 * El detalle es por query y NO por carpeta dinámica (`[userId]`) a propósito:
 * esta carpeta tiene hermanos con `[id]`, y dos nombres de slug en la misma
 * posición tumban la app entera sin que `tsc` lo vea (trap-dos-slugs-tumban-la-app).
 *
 * Doble puerta: el middleware la cierra bajo el módulo `settings`, y acá se vuelve
 * a mirar el ROL de la sesión. Un solo cerrojo en una ruta que muestra lo que
 * cada persona hizo mal es poco.
 */
const ROLES_ADMIN = new Set(['SUPER_ADMIN', 'ADMIN']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (!actor.actorRole || !ROLES_ADMIN.has(actor.actorRole)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    const usuario = req.nextUrl.searchParams.get('usuario');
    if (!usuario) return NextResponse.json(await resumenDelEquipo(30));

    const persona = await db.user.findFirst({
      where: { id: usuario, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (!persona) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    const [pendientes, hechos] = await Promise.all([
      misPendientes(persona.id),
      corregidos({ userId: persona.id, dias: 90 }),
    ]);
    return NextResponse.json({
      usuario: { id: persona.id, nombre: `${persona.firstName} ${persona.lastName}`.trim(), rol: persona.role },
      ...pendientes,
      corregidos: hechos,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'error desconocido';
    return NextResponse.json({ error: 'PENDIENTES_EQUIPO_FAILED', detail }, { status: 500 });
  }
}
