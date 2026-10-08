/**
 * GET /api/admin/patients/[id]/health-history/pdf
 *   El cuestionario Health History en PDF, con lo que el paciente ya tiene.
 *
 *   ?blank=1     formulario en blanco, sin ningún dato del paciente
 *   ?download=1  fuerza la descarga; sin el parámetro se abre en el visor
 *
 * Mismo guard de lectura que el Historial Médico. El PDF sale de lo GUARDADO:
 * el modal guarda antes de abrir el visor.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { checkPatientAccess } from '@/lib/patient-access';
import { cargarHealthHistory } from '@/lib/health-history-data';
import { HealthHistoryPdf } from '@/lib/health-history-pdf';
import { vistaEnBlanco } from '@/lib/health-history-form';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const acceso = await checkPatientAccess(id);
  if (acceso.deny) return acceso.deny;

  const datos = await cargarHealthHistory(id);
  if (!datos) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const blank = req.nextUrl.searchParams.get('blank') === '1';
  const descargar = req.nextUrl.searchParams.get('download') === '1';

  const buffer = await renderToBuffer(<HealthHistoryPdf view={blank ? vistaEnBlanco() : datos.view} />);

  const nombre = blank ? 'health-history-blank.pdf' : `health-history-${datos.view.patient.name.replace(/[^\w]+/g, '-').toLowerCase()}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="${nombre}"`,
      'Content-Length':      String(buffer.byteLength),
      // Es PHI: que ni el navegador ni un proxy lo guarden.
      'Cache-Control':       'no-store',
    },
  });
}
