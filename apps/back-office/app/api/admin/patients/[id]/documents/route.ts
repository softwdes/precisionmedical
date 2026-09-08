/**
 * GET /api/admin/patients/[id]/documents — todo el papelerío de una persona.
 *
 * Es la vista que faltaba: hasta ahora los documentos solo se podían mirar
 * CASO POR CASO, y un paciente con tres casos obligaba a entrar tres veces sin
 * que ninguna pantalla mostrara el conjunto.
 *
 * ── Por qué se busca por CASO y no por `patientId` ───────────────────────────
 *
 * `PatientDocument` tiene las dos relaciones, y lo intuitivo sería
 * `where: { patientId }`. **No funciona**, y por un bug que este mismo commit
 * arregla a medias: el `POST /api/admin/cases/[id]/documents` —la vía por la que
 * el staff sube TODO desde el tab Documentos— nunca seteó `patientId`, así que
 * esas filas lo tienen en `NULL`. Filtrar por paciente devolvía casi nada: solo
 * lo que archivó mensajería y lo migrado del v2.
 *
 * El arreglo del POST hace que las filas NUEVAS lleven el paciente, pero las
 * viejas siguen en NULL hasta que se corra el backfill (ver el pendiente). Así
 * que la fuente confiable HOY es el caso, no el paciente — y va a seguir siendo
 * la correcta después del backfill, porque cubre además los documentos que
 * quedaron colgando de un caso borrado.
 *
 * ── El intake no viaja acá ──────────────────────────────────────────────────
 *
 * Se devuelven los CASOS del paciente y la pantalla arma una fila de intake por
 * cada uno, apuntando a `/api/admin/cases/[id]/pdf`. El PDF se genera al vuelo:
 * guardarlo como archivo sería congelar un intake que todavía cambia, y además
 * se podría borrar. Mismo criterio que el tab Documentos del caso.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: patientId } = await ctx.params;

  /**
   * Sin filtro de archivado a propósito: `Patient` no tiene `deletedAt` —el
   * archivado es `status: ARCHIVED`— y un paciente archivado igual necesita su
   * expediente. Archivar libera la agenda, no borra los papeles.
   */
  const paciente = await db.patient.findUnique({
    where:  { id: patientId },
    select: {
      id: true,
      cases: {
        where:   { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select:  { id: true, caseCode: true, caseType: true, createdAt: true },
      },
    },
  });

  if (!paciente) {
    return NextResponse.json({ error: 'PATIENT_NOT_FOUND' }, { status: 404 });
  }

  const casos = paciente.cases;
  const caseIds = casos.map((c) => c.id);

  /**
   * Lista PLANA, sin carpetas.
   *
   * El explorador con carpetas es del expediente del caso, donde tiene sentido
   * organizar. Acá la pregunta es otra —"¿qué papeles tiene esta persona?"— y
   * navegar tres niveles de carpetas por cada uno de tres casos la responde
   * peor. Así que se sacan las carpetas y se traen los archivos con su caso al
   * lado; la fila dice de qué caso viene y con eso alcanza.
   */
  const documentos = caseIds.length === 0 ? [] : await db.patientDocument.findMany({
    where: {
      caseId:   { in: caseIds },
      isFolder: false,
      // Sin `s3Key` no hay archivo que descargar: es una fila muerta.
      s3Key:    { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, mimeType: true, size: true, createdAt: true, caseId: true,
    },
  });

  const codigoDe = new Map(casos.map((c) => [c.id, c.caseCode]));

  return NextResponse.json({
    casos: casos.map((c) => ({
      id: c.id,
      caseCode: c.caseCode,
      caseType: c.caseType,
    })),
    documentos: documentos.map((d) => ({
      id: d.id,
      name: d.name,
      mimeType: d.mimeType,
      size: d.size,
      createdAt: d.createdAt,
      caseId: d.caseId,
      caseCode: d.caseId ? codigoDe.get(d.caseId) ?? null : null,
    })),
  });
}
