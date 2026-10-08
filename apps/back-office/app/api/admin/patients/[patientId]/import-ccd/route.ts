/**
 * Importar los LABORATORIOS de un CCD a la ficha del paciente.
 *
 * POST /api/admin/patients/[patientId]/import-ccd
 *   multipart/form-data con el archivo en `file`, y `aplicar=true` para escribir.
 *   Sin `aplicar` devuelve el resumen y NO toca nada — ver abajo.
 *
 * ## Por qué solo laboratorios
 *
 * Med USA apaga MEDUSA el 31-dic-2026 y entrega los expedientes como CCDA. Se
 * midió un archivo real el 2026-10-08: la sección de resultados es la única que
 * viene completa. La medicación no trae dosis, cantidad ni refills, y las
 * alergias no traen un solo código —alérgeno, reacción y severidad son texto
 * libre—, así que importarlas llenaría la ficha sin alimentar el control de
 * interacciones, que es para lo que se pedían.
 *
 * ## Siempre se puede mirar antes de escribir
 *
 * Sin `aplicar` la ruta lee el archivo, lo analiza y devuelve el resumen: cuántos
 * resultados, de qué paneles, qué rango de fechas, cuántos ya estaban y cuántos
 * se descartaron y por qué. Nada se guarda.
 *
 * No es un lujo: el archivo es de OTRO sistema, puede ser del paciente
 * equivocado, y una vez adentro los resultados se mezclan con los nuestros. El
 * paso de mirar es el único lugar donde eso se puede atajar.
 *
 * ## El archivo NO se guarda
 *
 * El CCD es PHI y acá solo interesa su contenido estructurado. Se guarda el
 * NOMBRE del archivo para poder rastrear de dónde salió cada fila, nunca el
 * archivo. Quien lo quiera conservar lo sube como documento del paciente, que es
 * el lugar que ya existe para eso.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkPatientAccess, auditarFichaAjenaDesdeLaPagina } from '@/lib/patient-access';
import { leerLabsDelCcd, claveDeResultado, type CcdLabResult } from '@/lib/ccd-labs';

type Ctx = { params: Promise<{ patientId: string }> };

/**
 * 20 MB. El archivo medido pesa 603 KB con diez años de historia; veinte deja
 * margen de sobra para el paciente más cargado sin dejar que un archivo
 * cualquiera ocupe la memoria del servidor.
 */
const MAX_BYTES = 20 * 1024 * 1024;

/** Resumen por panel, que es como se lee una tanda de laboratorios. */
function porPanel(results: CcdLabResult[]): Array<{ panel: string; n: number }> {
  const mapa = new Map<string, number>();
  for (const r of results) {
    const k = r.panelName ?? '—';
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa].map(([panel, n]) => ({ panel, n })).sort((a, b) => b.n - a.n);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { patientId } = await ctx.params;

  const { deny } = await checkPatientAccess(patientId);
  if (deny) return deny;
  // El registro de quién tocó una ficha ajena va ANTES de hacer nada.
  await auditarFichaAjenaDesdeLaPagina(patientId);

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'INVALID_FORM' }, { status: 400 }); }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'FILE_TOO_LARGE', maxBytes: MAX_BYTES }, { status: 413 });
  }

  const aplicar = form.get('aplicar') === 'true';
  const xml = await file.text();

  const { results, panels, descartadas } = leerLabsDelCcd(xml);

  if (results.length === 0) {
    /**
     * Se distingue "no es un CCD" de "es un CCD sin laboratorios": son dos
     * problemas distintos y mandan a la persona a lugares distintos — a buscar
     * otro archivo, o a aceptar que ese paciente no tiene labs cargados allá.
     */
    const pareceCcd = xml.includes('urn:hl7-org:v3') || xml.includes('ClinicalDocument');
    return NextResponse.json({
      error: pareceCcd ? 'CCD_SIN_LABORATORIOS' : 'NO_ES_UN_CCD',
      descartadas,
    }, { status: 422 });
  }

  // Qué hay ya, para no contar como nuevo lo que se importó antes. Se compara
  // por la llave estable, así que reimportar el mismo archivo no duplica.
  const claves = results.map((r) => claveDeResultado(patientId, r));
  const existentes = new Set(
    (await db.importedLabResult.findMany({
      where: { patientId, sourceKey: { in: claves } },
      select: { sourceKey: true },
    })).map((r) => r.sourceKey),
  );

  const nuevos = results.filter((r) => !existentes.has(claveDeResultado(patientId, r)));
  const fechas = results.map((r) => r.observedAt).filter((d): d is string => !!d).sort();

  const resumen = {
    archivo: file.name,
    paneles: panels,
    leidos: results.length,
    nuevos: nuevos.length,
    yaEstaban: results.length - nuevos.length,
    descartadas,
    desde: fechas[0] ?? null,
    hasta: fechas[fechas.length - 1] ?? null,
    panelesDetalle: porPanel(results),
  };

  if (!aplicar) return NextResponse.json({ ...resumen, aplicado: false });

  if (nuevos.length === 0) {
    return NextResponse.json({ ...resumen, aplicado: true, insertados: 0 });
  }

  const importId = crypto.randomUUID();
  // `actorName` es "Nombre Apellido" con el correo de respaldo — el mismo sello
  // que usan los otros snapshots (chargedByName, orderedByName).
  const quien = await resolveActor(req.headers);

  /**
   * `skipDuplicates`: dos pestañas apretando a la vez, o un archivo que se
   * solapa con otro ya importado, no tienen por qué romper la tanda entera. El
   * índice único de (paciente, llave) es el que decide, no esta consulta.
   */
  const { count } = await db.importedLabResult.createMany({
    data: nuevos.map((r) => ({
      patientId,
      name: r.name ?? r.sourceCode ?? '—',
      sourceCode: r.sourceCode,
      sourceCodeSystem: r.sourceCodeSystem,
      value: r.value ?? '',
      valueNumeric: r.valueNumeric,
      unit: r.unit,
      // `observedAt` es obligatorio en la tabla: un resultado sin fecha no se
      // puede ubicar en el tiempo y no sirve para nada, así que no entra.
      observedAt: new Date(`${r.observedAt}T00:00:00Z`),
      panelName: r.panelName,
      panelCode: r.panelCode,
      performedBy: r.performedBy,
      status: r.status,
      sourceKey: claveDeResultado(patientId, r),
      importId,
      sourceFileName: file.name,
      importedByName: quien.actorName,
    })).filter((d) => !Number.isNaN(d.observedAt.getTime())),
    skipDuplicates: true,
  });

  await writeAuditLog(db, {
    ...quien,
    action: 'IMPORT_CCD_LABS',
    entityType: 'Patient',
    entityId: patientId,
    metadata: {
      importId,
      archivo: file.name,
      insertados: String(count),
      leidos: String(results.length),
      yaEstaban: String(resumen.yaEstaban),
      descartadas: String(descartadas.length),
      rango: `${resumen.desde ?? '—'} → ${resumen.hasta ?? '—'}`,
      importadoPor: quien.actorName ?? '—',
    },
  }).catch((e) => { console.error('[audit] no se pudo registrar la importación:', e); });

  return NextResponse.json({ ...resumen, aplicado: true, importId, insertados: count }, { status: 201 });
}
