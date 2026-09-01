import { type NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { corredores } from '@/lib/carrera';

/**
 * La pista, para toda la clínica.
 *
 * Autenticación sí, autorización por módulo NO: la Carrera es deliberadamente
 * abierta a cualquiera con sesión en el back-office (decisión de Erick,
 * 31-ago-2026). Lo que la hace segura de compartir es lo que NO devuelve
 * `corredores()`: ni llamadas, ni SMS, ni el desglose acción por acción, ni un
 * solo dato de paciente. Nombre, grupo, minutos y conteos por área.
 *
 * `/api/metrics/*` no está en `MODULE_API_ROUTES` del middleware, así que no
 * hay que exceptuar nada — pero si alguien agrega ese prefijo ahí, esta ruta se
 * apaga para medio equipo sin que nadie lo note.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from') ?? '';
  const to   = searchParams.get('to')   ?? '';

  const DIA = /^\d{4}-\d{2}-\d{2}$/;
  if (!DIA.test(from) || !DIA.test(to)) {
    return NextResponse.json({ error: 'BAD_RANGE', detail: 'from/to deben ser YYYY-MM-DD' }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: 'BAD_RANGE', detail: 'from no puede ser posterior a to' }, { status: 400 });
  }

  try {
    return NextResponse.json({ from, to, racers: await corredores(from, to) });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'error desconocido';
    return NextResponse.json({ error: 'METRICS_FAILED', detail }, { status: 500 });
  }
}
