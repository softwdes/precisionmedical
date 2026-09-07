/**
 * GET /api/admin/cases/[id]/pdf — el formulario de intake del caso en PDF.
 *
 * `?download=1` fuerza la descarga; sin el parámetro se abre en el visor, que
 * es lo que necesitan el `<iframe>` de la vista previa y la impresión.
 *
 * El documento se arma en `lib/intake-pdf.tsx` porque también lo sirve el
 * portal legal, con otro guard. Acá alcanza con el del middleware: `/api/admin/*`
 * ya está cerrado para LAWYER, DOCTOR y PROVIDER.
 */

import { type NextRequest, type NextResponse } from 'next/server';
import { respuestaIntakePdf } from '@/lib/intake-pdf';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  return respuestaIntakePdf(id, {
    descargar: req.nextUrl.searchParams.get('download') === '1',
  });
}
