/**
 * Las cuatro fotos de identidad de un paciente, vengan de donde vengan.
 *
 * Hay DOS orígenes y ninguna pantalla debería tener que saberlo:
 *
 *  1. **El caso** — `Case.consentsData.photos`, que es donde las deja el intake
 *     de v3 (URL pública del bucket `intake-photos`).
 *  2. **La persona** — las **3.142 fotos migradas del v2**, que allá colgaban del
 *     PACIENTE y no de un expediente. Viven en `patient_documents` con `caseId`
 *     en NULL, en el bucket privado, y se sirven con URL firmada.
 *
 * Sin el segundo origen, la ficha de un paciente migrado dice "faltan la foto,
 * la licencia y la tarjeta del seguro" teniendo las cuatro guardadas — que es
 * exactamente lo que reportó Erick el 13-sep mirando dos pacientes distintos.
 *
 * La del CASO gana siempre: es la que cargó el staff para ESE expediente y es la
 * más nueva. La de la persona es el respaldo.
 *
 * ── Por qué las del v2 no están en `consentsData` ──────────────────────────
 * Decisión de Erick (11-sep), medida antes de tomarla: `intake-photos` es un
 * bucket PÚBLICO con URLs permanentes y sin sesión, y son documentos de
 * identidad; y ponerles `caseId` las habría expuesto al bufete, porque el portal
 * legal sirve todos los documentos de un caso. Ver el encabezado de
 * `api/admin/patients/[id]/documents/route.ts`.
 */

import {
  db,
  fotosDelPaciente as fotosDelPacienteCompartida,
  fotosConRespaldo as fotosConRespaldoCompartida,
} from '@precision-medical/database';
import { VIGENTES } from '@/lib/documentos';
import { createClient } from '@supabase/supabase-js';

/** Privado: nunca link directo, siempre URL firmada. */
const BUCKET = 'case-documents';

/** Cuánto vive la URL firmada. Lo mismo que usa el visor de resultados de lab. */
const MINUTOS = 15;

const supabase = createClient(
  (process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  (process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!,
);
/* ────────────────────────────────────────────────────────────────────────────
 * Los dos lectores se mudaron a `packages/database/src/foto-identidad.ts` el
 * 2026-09-17: `apps/forms` también los necesita, para no volver a pedirle la
 * licencia a un paciente que ya la mandó. Ahí ya vivía el ESCRITOR
 * (`archivarFotoDeIdentidad`) y el mapa de nombre de archivo → recuadro, así
 * que tenerlos separados era garantizar que la convención se desincronizara.
 *
 * Se reexportan con la misma firma para no tocar a los llamadores
 * (`case-detail-data.ts` y `patient-context.ts`); la única diferencia es que
 * allá reciben el cliente de Prisma, que se inyecta acá.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Las fotos que el paciente tiene colgadas de su persona, ya firmadas. */
export function fotosDelPaciente(patientId: string): Promise<Record<string, string>> {
  return fotosDelPacienteCompartida(db, patientId) as Promise<Record<string, string>>;
}

/**
 * Las del caso, completadas con las de la persona.
 *
 * Se llama con lo que ya trae `consentsData.photos` para no ir a buscar nada
 * cuando el caso ya tiene las cuatro.
 */
export function fotosConRespaldo(
  patientId: string,
  delCaso: Record<string, string>,
): Promise<Record<string, string>> {
  return fotosConRespaldoCompartida(db, patientId, delCaso);
}

/**
 * La FOTO DE PERFIL de muchos pacientes, en dos viajes y no en 2N.
 *
 * La necesitan las LISTAS —la agenda de Mi Día y la cola de Day Admission—,
 * donde llamar a `fotosDelPaciente` por fila sería una consulta y una firma por
 * paciente: con 30 citas del día, 60 viajes para dibujar 30 caritas.
 *
 * Acá son dos: una consulta con `IN (...)` y UNA sola firma en lote
 * (`createSignedUrls`). Solo trae la selfie, que es lo único que una lista
 * dibuja; los otros tres recuadros de identidad siguen saliendo por
 * `fotosDelPaciente`, que es la pantalla donde se miran de a uno.
 *
 * Nunca lanza: una lista tiene que dibujarse aunque el almacenamiento falle, y
 * el costo de que falle es una carita con iniciales. Quien la llame igual
 * debería envolverla en `.catch(() => new Map())` si no quiere depender de eso.
 */
export async function selfiesDePacientes(
  patientIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(patientIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const docs = await db.patientDocument.findMany({
    where: { patientId: { in: ids }, caseId: null, isFolder: false, s3Key: { not: null }, ...VIGENTES },
    orderBy: { createdAt: 'desc' },
    select: { patientId: true, name: true, s3Key: true },
  });

  // Ordenado por fecha desc: la primera que matchea es la más nueva de esa persona.
  const porPaciente = new Map<string, string>();
  for (const d of docs) {
    // `name`, `s3Key` y `patientId` son anulables en el modelo: se sacan a
    // variables para que el estrechamiento valga dentro del `if`.
    const { patientId, name, s3Key } = d;
    if (!patientId || !s3Key || !name || porPaciente.has(patientId)) continue;
    if (/^patient_photo\./i.test(name)) porPaciente.set(patientId, s3Key);
  }
  if (porPaciente.size === 0) return new Map();

  const claves = [...porPaciente.values()];
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(claves, MINUTOS * 60);
  if (error || !data) {
    console.error('[fotos-identidad] no se pudieron firmar las fotos de la lista', {
      pacientes: ids.length, error: error?.message ?? null,
    });
    return new Map();
  }

  // `createSignedUrls` responde en el MISMO orden que se le mandó, pero cada
  // entrada puede venir con su propio error (una clave que ya no existe), así
  // que se arma por `path` y no por posición.
  const urlPorClave = new Map<string, string>();
  for (const r of data) {
    if (r.signedUrl && r.path) urlPorClave.set(r.path, r.signedUrl);
  }

  const salida = new Map<string, string>();
  for (const [patientId, clave] of porPaciente) {
    const url = urlPorClave.get(clave);
    if (url) salida.set(patientId, url);
  }
  return salida;
}
