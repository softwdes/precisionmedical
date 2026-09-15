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

import { db } from '@precision-medical/database';
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

/**
 * Nombre del archivo en el v2 → recuadro de v3.
 *
 * ⚠️ `id_card_*` se mapea a la tarjeta de SEGURO por descarte: el v2 ya tiene
 * `dl_*` para la licencia, y `id_card` viene en pares frente/dorso (566 y 548).
 * Si resultara ser otro documento, se cambian estas dos líneas y nada más.
 */
const POR_NOMBRE: Array<readonly [RegExp, string]> = [
  [/^patient_photo\./i, 'selfie'],
  [/^dl_front\./i, 'dlFront'],
  [/^id_card_front\./i, 'insuranceCardFront'],
  [/^id_card_back\./i, 'insuranceCardBack'],
];

/** Las fotos que el paciente trae del v2, ya firmadas. `{}` si no tiene. */
export async function fotosDelPaciente(patientId: string): Promise<Record<string, string>> {
  const docs = await db.patientDocument.findMany({
    // Una foto eliminada no vuelve a aparecer en los recuadros de identidad.
    where: { patientId, caseId: null, isFolder: false, s3Key: { not: null }, ...VIGENTES },
    orderBy: { createdAt: 'desc' },
    select: { name: true, s3Key: true },
  });
  if (docs.length === 0) return {};

  const porRecuadro = new Map<string, string>();
  for (const d of docs) {
    const slot = POR_NOMBRE.find(([re]) => re.test(d.name))?.[1];
    // Ordenado por fecha desc: la primera que matchea es la más nueva.
    if (slot && d.s3Key && !porRecuadro.has(slot)) porRecuadro.set(slot, d.s3Key);
  }
  if (porRecuadro.size === 0) return {};

  const fotos: Record<string, string> = {};
  await Promise.all(
    [...porRecuadro].map(async ([slot, key]) => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(key, MINUTOS * 60);
      if (data?.signedUrl) { fotos[slot] = data.signedUrl; return; }
      /**
       * Si Storage no da el link, el aviso de "faltan documentos" vuelve a
       * aparecer sobre un paciente que SÍ tiene las cuatro fotos — que es el
       * bug que este archivo vino a arreglar, disfrazado de otra cosa. Sin
       * esta línea no hay forma de distinguirlo desde afuera: la pantalla se
       * ve igual que la de un paciente sin fotos.
       */
      console.error('[fotos-identidad] no se pudo firmar la foto', {
        patientId, slot, s3Key: key, error: error?.message ?? null,
      });
    }),
  );
  return fotos;
}

/**
 * Las del caso, completadas con las de la persona.
 *
 * Se llama con lo que ya trae `consentsData.photos` para no ir a buscar nada
 * cuando el caso ya tiene las cuatro.
 */
export async function fotosConRespaldo(
  patientId: string,
  delCaso: Record<string, string>,
): Promise<Record<string, string>> {
  const faltan = ['selfie', 'insuranceCardFront', 'insuranceCardBack', 'dlFront']
    .some((k) => !delCaso[k]);
  if (!faltan) return delCaso;

  const dePersona = await fotosDelPaciente(patientId);
  // El caso pisa a la persona: es la foto de ESTE expediente.
  return { ...dePersona, ...delCaso };
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
