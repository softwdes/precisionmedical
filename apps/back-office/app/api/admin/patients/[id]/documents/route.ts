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
 * ── …y por qué ahora ADEMÁS se busca por paciente ───────────────────────────
 *
 * Lo de arriba sigue siendo cierto, pero era la mitad: hay documentos que no
 * cuelgan de ningún caso porque en el v2 NO colgaban de ninguno — las fotos de
 * identidad, que pertenecen a la persona. Son 2.697 filas con `patientId`
 * puesto y `caseId` en NULL, y con el filtro por caso no aparecían en ninguna
 * pantalla del sistema. La consulta es hoy la UNIÓN de las dos: los papeles de
 * sus casos y los papeles suyos sin caso.
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
import { VIGENTES } from '@/lib/documentos';
import { createClient } from '@supabase/supabase-js';
import { checkPatientAccess } from '@/lib/patient-access';

/** Storage vive en el proyecto Phoenix (kiqlh…) — vars dedicadas con fallback legacy. */
const supabase = createClient(
  (process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  (process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!,
);

/** Privado: se sirve siempre con URL firmada, nunca con link directo. */
const BUCKET_DOCS = 'case-documents';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: patientId } = await ctx.params;

  // Documentos del expediente: mismo alcance que la ficha. Sin esto un provider
  // listaba los papeles de cualquier paciente de la clínica.
  const acceso = await checkPatientAccess(patientId);
  if (acceso.deny) return acceso.deny;

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
  const documentos = await db.patientDocument.findMany({
    where: {
      isFolder: false,
      // Sin `s3Key` no hay archivo que descargar: es una fila muerta.
      s3Key:    { not: null },
      // Los de la papelera no salen en la ficha del paciente. La papelera vive
      // en el tab Documentos del caso, que es donde se borran y se restauran.
      ...VIGENTES,
      OR: [
        ...(caseIds.length ? [{ caseId: { in: caseIds } }] : []),
        /**
         * Documentos de la PERSONA, sin caso.
         *
         * No es un caso de borde: son las 2.697 fotos de identidad migradas del
         * v2 (`patients/<id>/personal/…`), que allá colgaban del paciente y acá
         * quedan con `caseId` en NULL a propósito —ver el comentario de
         * `fotosPaciente` más abajo—. Con el filtro viejo, que era solo por
         * caso, no aparecían en NINGUNA pantalla: ni acá ni en el expediente
         * del caso. Existían en la base y no había forma de verlas.
         */
        { patientId, caseId: null },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, mimeType: true, size: true, createdAt: true,
      caseId: true, s3Key: true,
    },
  });

  const codigoDe = new Map(casos.map((c) => [c.id, c.caseCode]));

  /**
   * Las fotos de identidad del v2, servidas para los cuatro recuadros.
   *
   * ── Por qué no se copiaron al bucket de fotos ────────────────────────────
   *
   * Los recuadros de arriba leen `Case.consentsData.photos`, que son URLs
   * PÚBLICAS y permanentes del bucket `intake-photos` (`public: true`, ver el
   * encabezado de `lib/intake-photos.ts`). Meter ahí las 2.697 licencias de
   * conducir y tarjetas de seguro del v2 multiplicaba por 75 una exposición de
   * PHI que ya está anotada como deuda. Y ponerles un `caseId` para que
   * entraran por el camino viejo era peor: el portal del bufete sirve TODOS los
   * documentos de un caso (`api/attorney/cases/[id]/documents`), así que la
   * licencia del paciente habría quedado a la vista del abogado.
   *
   * Así que se quedan en `case-documents`, que es privado, colgando de la
   * PERSONA —que es de quien son: 327 pacientes tienen más de un caso y una
   * licencia no es de uno de ellos— y se sirven acá con URL firmada de 15 min,
   * el mismo patrón que `lab-results`.
   *
   * ⚠️ `id_card_*` se mapea a la tarjeta de SEGURO por descarte (el v2 ya tiene
   * `dl_*` para la licencia, y vienen en pares frente/dorso: 566 y 548).
   * Confirmarlo mirando una en pantalla la primera vez; si fuera un documento
   * de identidad distinto, se cambian estas dos líneas y nada más.
   */
  const FOTO_POR_NOMBRE: Array<readonly [RegExp, string]> = [
    [/^patient_photo\./i,  'selfie'],
    [/^dl_front\./i,       'dlFront'],
    [/^id_card_front\./i,  'insuranceCardFront'],
    [/^id_card_back\./i,   'insuranceCardBack'],
  ];

  const porRecuadro = new Map<string, string>();   // slot → s3Key
  for (const d of documentos) {
    if (d.caseId !== null || !d.s3Key) continue;
    const slot = FOTO_POR_NOMBRE.find(([re]) => re.test(d.name))?.[1];
    // `documentos` viene ordenado por fecha desc: la primera que matchea es la
    // más nueva, y es la que se muestra.
    if (slot && !porRecuadro.has(slot)) porRecuadro.set(slot, d.s3Key);
  }

  const fotosPaciente: Record<string, string> = {};

  /**
   * Recuadros que TIENEN archivo y se quedaron sin link.
   *
   * Antes esto se tragaba el error —`const { data } = …; if (data?.signedUrl)`—
   * y el resultado era el peor de los dos mundos: la pantalla decía "falta la
   * foto" cuando la foto estaba guardada, y no quedaba ni una línea en el log
   * que dijera por qué. El 13-sep se fue medio día en descartar la base, el
   * bucket y el código —los tres estaban bien— porque la única pieza que
   * fallaba era justo la que no dejaba rastro.
   *
   * Ahora el fallo viaja: al log del servidor y a la respuesta, para que la
   * pantalla pueda decir "no se pudo cargar" en vez de "no hay".
   */
  const fotosSinLink: string[] = [];
  let fotosError: string | null = null;

  await Promise.all([...porRecuadro].map(async ([slot, key]) => {
    const { data, error } = await supabase.storage.from(BUCKET_DOCS).createSignedUrl(key, 900);
    if (data?.signedUrl) { fotosPaciente[slot] = data.signedUrl; return; }
    fotosSinLink.push(slot);
    fotosError ??= error?.message ?? 'Storage no devolvió URL';
    console.error('[patient-documents] no se pudo firmar la foto de identidad', {
      patientId, slot, s3Key: key, error: error?.message ?? null,
    });
  }));

  return NextResponse.json({
    fotosPaciente,
    fotosSinLink,
    fotosError,
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
