/**
 * GET /api/admin/patients/[id]/membership — la membresía de UNA persona.
 *
 * Existe para el diálogo de Nueva cita: ahí el paciente se elige en el momento
 * y la pastilla tiene que aparecer al lado sin recargar la pantalla. El resto
 * de las superficies (ficha del paciente, detalle del caso) lo resuelven en el
 * servidor con `membresiaDePaciente`, sin pasar por acá.
 *
 * Alcance: el de la ficha. Quien puede ver al paciente puede ver si es socio —
 * y un provider solo ve a los suyos, igual que en todo `patients/*`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { checkPatientAccess } from '@/lib/patient-access';
import { membresiaDePaciente } from '@/lib/membresias';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  const acceso = await checkPatientAccess(id);
  if (acceso.deny) return acceso.deny;

  return NextResponse.json({ membresia: await membresiaDePaciente(id) });
}
