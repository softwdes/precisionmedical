/**
 * GET /api/attorney/cases/[id]/lien — el Medical Lien Agreement en PDF.
 *
 * Es el papel que el bufete descarga una vez firmado. Sólo se emite si el caso
 * está DENTRO del alcance de la sesión y ya tiene la firma del abogado — o está
 * exento. Es el mismo criterio que cierra el tab de Documentos: firmar es lo que
 * abre el expediente.
 *
 * El documento se arma en `lib/lien-pdf.tsx` porque también lo sirve el back
 * office, con otro guard y sin exigir la firma del abogado. Acá sólo vive la
 * puerta; ver el comentario de ese archivo.
 */

import { type NextRequest } from 'next/server';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter } from '@/lib/attorney-portal';
import { respuestaLienPdf } from '@/lib/lien-pdf';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const lawyer = await getSessionLawyer();
  if (!lawyer) return new Response('Forbidden', { status: 403 });

  return respuestaLienPdf(id, {
    alcance: lawyerCaseFilter(lawyer),
    exigirFirmaDelAbogado: true,
  });
}
