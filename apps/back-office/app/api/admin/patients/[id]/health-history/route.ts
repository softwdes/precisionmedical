/**
 * GET /api/admin/patients/[id]/health-history
 *   Lo que el modal "Health History" muestra pre-llenado: la vista del
 *   formulario (ficha + historial médico + intake) y el historial tal cual,
 *   para calcular el patch al guardar. Se ESCRIBE con `updateMedicalHistory`
 *   — no hay PATCH acá: un solo camino de escritura para el historial.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { checkPatientAccess } from '@/lib/patient-access';
import { cargarHealthHistory } from '@/lib/health-history-data';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const acceso = await checkPatientAccess(id);
  if (acceso.deny) return acceso.deny;

  const datos = await cargarHealthHistory(id);
  if (!datos) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json(datos, { headers: { 'Cache-Control': 'no-store' } });
}
