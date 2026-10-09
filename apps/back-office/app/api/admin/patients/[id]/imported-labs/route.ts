/**
 * Los laboratorios que se importaron de otro sistema, para la ficha.
 *
 * GET /api/admin/patients/[id]/imported-labs
 *   Devuelve los resultados agrupados por FECHA y panel, que es como se lee una
 *   tanda de laboratorios: "el hemograma del 5 de octubre", no 63 renglones
 *   sueltos.
 *
 * Son de solo lectura a propósito. No son órdenes nuestras —nadie las pidió
 * desde acá, nadie las va a resultar— y editarlas sería reescribir el expediente
 * de otro sistema. Lo que se puede hacer es importar más o deshacer una tanda.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { checkPatientAccess, auditarFichaAjenaDesdeLaPagina } from '@/lib/patient-access';

type Ctx = { params: Promise<{ id: string }> };

export interface ImportedLabRow {
  id: string;
  name: string;
  sourceCode: string | null;
  value: string;
  unit: string | null;
  status: string | null;
}

export interface ImportedLabGroup {
  /** Día de la toma, ISO. */
  date: string;
  panelName: string | null;
  performedBy: string | null;
  importId: string;
  sourceFileName: string | null;
  results: ImportedLabRow[];
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  // La carpeta es [id] como las otras catorce rutas de paciente; adentro
  // se sigue llamando patientId, que es el nombre del campo en la base.
  const { id: patientId } = await ctx.params;

  const { deny } = await checkPatientAccess(patientId);
  if (deny) return deny;
  await auditarFichaAjenaDesdeLaPagina(patientId);

  const filas = await db.importedLabResult.findMany({
    where: { patientId },
    orderBy: [{ observedAt: 'desc' }, { panelName: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, sourceCode: true, value: true, unit: true, status: true,
      observedAt: true, panelName: true, performedBy: true, importId: true, sourceFileName: true,
    },
  });

  // Agrupado por (día + panel). El mapa conserva el orden de llegada, que ya
  // viene ordenado por la consulta: no hace falta volver a ordenar.
  const grupos = new Map<string, ImportedLabGroup>();
  for (const f of filas) {
    const date = f.observedAt.toISOString().slice(0, 10);
    const clave = `${date}|${f.panelName ?? ''}`;
    let g = grupos.get(clave);
    if (!g) {
      g = {
        date,
        panelName: f.panelName,
        performedBy: f.performedBy,
        importId: f.importId,
        sourceFileName: f.sourceFileName,
        results: [],
      };
      grupos.set(clave, g);
    }
    g.results.push({
      id: f.id, name: f.name, sourceCode: f.sourceCode,
      value: f.value, unit: f.unit, status: f.status,
    });
  }

  return NextResponse.json({
    groups: [...grupos.values()],
    total: filas.length,
  });
}
