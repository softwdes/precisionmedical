import { NextResponse, type NextRequest } from 'next/server';
import { resolveActor } from '@/lib/actor';
import { datosDelPaciente, participacionActual } from '@/lib/premios';

/**
 * Lo que "Registrar logro" completa solo al elegir un paciente: la clínica y
 * si es NEW o EXISTING. Es la MISMA función que usa el POST para guardar, así
 * que lo que se ve en el diálogo es lo que queda en la fila.
 *
 * Solo para quien participa: no devuelve datos del paciente (ni nombre ni
 * contacto), pero no hay motivo para que responda a quien no juega.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const part = await participacionActual(actor.actorUserId);
  if (!part) return NextResponse.json({ error: 'NOT_PARTICIPATING' }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const patientId = searchParams.get('patientId') ?? '';
  const dia = searchParams.get('dia') ?? '';
  if (!patientId || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    return NextResponse.json({ error: 'INVALID_QUERY' }, { status: 400 });
  }

  try {
    const mes = part.period.month.toISOString().slice(0, 10);
    return NextResponse.json(await datosDelPaciente(patientId, dia, mes));
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'error desconocido';
    return NextResponse.json({ error: 'REWARDS_FAILED', detail }, { status: 500 });
  }
}
