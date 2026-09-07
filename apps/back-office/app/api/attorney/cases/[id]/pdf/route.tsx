/**
 * GET /api/attorney/cases/[id]/pdf — el intake del caso, para el bufete.
 *
 * Mismo documento que ve la clínica (`lib/intake-pdf.tsx`), con el alcance del
 * bufete adelante. Trae los consentimientos y la firma del paciente, que es
 * justo lo que el bufete pide del expediente.
 *
 * `?download=1` fuerza la descarga; sin el parámetro se abre en el visor.
 */

import { type NextRequest, type NextResponse } from 'next/server';
import { casoDelAbogado } from '@/lib/attorney-case-scope';
import { respuestaIntakePdf } from '@/lib/intake-pdf';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const { caseId, deny } = await casoDelAbogado(id);
  if (deny) return deny;

  return respuestaIntakePdf(caseId, {
    descargar: req.nextUrl.searchParams.get('download') === '1',
  });
}
