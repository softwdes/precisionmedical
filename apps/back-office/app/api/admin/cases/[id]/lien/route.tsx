/**
 * GET /api/admin/cases/[id]/lien — el Medical Lien Agreement en PDF, para la clínica.
 *
 * Hasta el 2026-09-17 este papel sólo lo podía abrir el BUFETE. El back office
 * veía en el tab Caso que el paciente había firmado —quién y cuándo— y no tenía
 * ninguna forma de ver el documento: el botón de imprimir estaba adentro de un
 * `isAttorney` y el endpoint pedía sesión de abogado. La clínica es la que hace
 * firmar el lien y era la única que no podía verlo.
 *
 * NO exige la firma del abogado, a diferencia de la puerta del portal legal. Esa
 * regla existe para abrirle el expediente al bufete; acá no significa nada. El
 * propio acuerdo dice que sigue siendo válido aunque el abogado no lo firme, así
 * que condicionar a eso lo que la clínica puede ver sería inventar un requisito
 * que el documento mismo niega.
 *
 * El guard es el del middleware: `/api/admin/*` ya está cerrado para LAWYER,
 * DOCTOR y PROVIDER. Mismo criterio que `/api/admin/cases/[id]/pdf`, que sirve
 * el formulario de admisión.
 */

import { type NextRequest } from 'next/server';
import { respuestaLienPdf } from '@/lib/lien-pdf';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return respuestaLienPdf(id, { exigirFirmaDelAbogado: false });
}
