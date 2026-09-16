/**
 * Las fotos de identidad, archivadas como DOCUMENTOS del paciente.
 *
 * ── El agujero que cierra ───────────────────────────────────────────────────
 *
 * Hasta hoy las cuatro fotos del intake de v3 vivían SOLO como URLs dentro de
 * `Case.consentsData.photos`. Existían —los recuadros las mostraban— pero no
 * eran filas de `patient_documents`, así que no aparecían en ninguna lista de
 * archivos: ni en el tab Documentos del caso ni en "Archivos personales" del
 * diálogo, que decía "0 files" con tres fotos guardadas (Erick, 2026-09-15).
 *
 * Las del v2 sí son documentos —1.149 pacientes las tienen así— con lo cual las
 * dos generaciones se comportaban distinto frente a la misma pregunta: "¿qué
 * papeles tiene esta persona?". Este módulo las iguala: toda foto que entra,
 * venga del portal del paciente o del staff, queda además como documento.
 *
 * ── Por qué del PACIENTE y no del CASO (decisión de Erick, 15-sep) ──────────
 *
 * Confirma la que ya había tomado el 11-sep para las del v2, y por la misma
 * razón medida: **el portal del bufete sirve TODOS los documentos de un caso**
 * (`api/attorney/cases/[id]/documents` filtra por `caseId` y nada más). Un
 * documento de identidad con `caseId` puesto le queda a la vista al abogado.
 * Por eso la fila va con `patientId` y `caseId: null` — que además es lo
 * correcto de por sí: 327 pacientes tienen más de un caso y una licencia de
 * conducir no es de uno de ellos.
 *
 * ── Por qué se COPIA el archivo al bucket privado ──────────────────────────
 *
 * El intake sube a `intake-photos`, que es PÚBLICO y con URLs que no vencen
 * (deuda anotada en `lib/intake-photos.ts`). `patient_documents` se sirve
 * siempre desde `case-documents`, que es privado y va con URL firmada de 15
 * minutos — no hay columna de bucket en la tabla, así que la fila SOLO puede
 * apuntar ahí. Apuntarla al bucket público habría sido, además, guardar el
 * documento de identidad en el lugar que ya sabemos que está mal.
 *
 * ── Por qué vive en `packages/database` y no en cada app ───────────────────
 *
 * Lo necesitan las dos: `apps/forms` (el paciente subiendo desde su link) y
 * `apps/back-office` (el staff). No hay paquete de storage en el workspace y
 * crearlo es una decisión aparte, pero duplicar es exactamente lo que dejó la
 * subida de fotos escrita tres veces con los mismos tres agujeros. Acá ya viven
 * las otras reglas de dominio que cruzan apps (`resolveGuardian`, `codes`,
 * `writeAuditLog`), así que esta va con ellas.
 */

import type { PrismaClient } from '@prisma/client';

/** Storage vive en el proyecto Phoenix (kiqlh…) — vars dedicadas con fallback legacy. */
const SUPABASE_URL = (process.env.SUPABASE_STORAGE_URL
  ?? process.env.SUPABASE_URL
  ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY = (process.env.SUPABASE_STORAGE_SERVICE_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;

/** Privado: nunca link directo, siempre URL firmada. */
const BUCKET = 'case-documents';

export const SLOTS_FOTO = [
  'selfie', 'dlFront', 'insuranceCardFront', 'insuranceCardBack',
] as const;
export type SlotFoto = typeof SLOTS_FOTO[number];

/**
 * Recuadro → nombre de archivo, con la convención del v2.
 *
 * Se usa la del v2 a propósito y no una nueva: `fotosDelPaciente()` y la lista
 * de documentos del paciente reconocen los recuadros MIRANDO EL NOMBRE. Con
 * esta convención, la foto que sube hoy un paciente nuevo entra por el mismo
 * camino que la de uno migrado y los recuadros siguen funcionando aunque el
 * `consentsData` del caso se vacíe. Cambiar el nombre acá los desconecta.
 */
const NOMBRE_DE_SLOT: Record<SlotFoto, string> = {
  selfie:             'patient_photo',
  dlFront:            'dl_front',
  insuranceCardFront: 'id_card_front',
  insuranceCardBack:  'id_card_back',
};

/** El mismo mapa al revés, para encontrar la fila que ya existe de ese recuadro. */
const RE_DE_SLOT: Record<SlotFoto, RegExp> = {
  selfie:             /^patient_photo\./i,
  dlFront:            /^dl_front\./i,
  insuranceCardFront: /^id_card_front\./i,
  insuranceCardBack:  /^id_card_back\./i,
};

export function esSlotFoto(v: unknown): v is SlotFoto {
  return typeof v === 'string' && (SLOTS_FOTO as readonly string[]).includes(v);
}

/**
 * Carpeta del paciente dentro del bucket privado.
 *
 * `patients/<id>/personal/` es donde dejó las suyas la migración del v2 — las
 * nuevas van al mismo lugar para que no haya dos convenciones conviviendo.
 */
function rutaDe(patientId: string, slot: SlotFoto, ext: string): string {
  return `patients/${patientId}/personal/${NOMBRE_DE_SLOT[slot]}.${ext}`;
}

export type ResultadoArchivo =
  | { ok: true;  documentId: string; s3Key: string }
  | { ok: false; detalle: string };

export interface FotoParaArchivar {
  patientId: string;
  slot: SlotFoto;
  /** El contenido del archivo. Quien sube ya lo tiene leído y validado. */
  bytes: ArrayBuffer | Buffer | Uint8Array;
  /** El tipo VALIDADO, no el que declaró el cliente. */
  mimeType: string;
  /** Sin punto: `jpg`, `png`, `heic`. */
  ext: string;
  /** Quién la subió, cuando se sabe. `null` para el paciente desde su link. */
  createdByUserId?: string | null;
}

/**
 * Guarda la foto en el bucket privado y deja (o actualiza) su fila de documento.
 *
 * Es **idempotente por recuadro**: si el paciente vuelve a sacarse la foto, se
 * pisa el archivo y se actualiza la MISMA fila en vez de acumular una por
 * intento. Sin esto, cuatro reintentos de una licencia movida dejaban cuatro
 * licencias en la lista y nadie sabía cuál era la buena.
 *
 * No tira nunca: archivar es un efecto secundario de la subida, y la subida ya
 * terminó bien. Si esto falla, la foto igual está en su recuadro —que es como
 * funcionaba hasta hoy— y el fallo queda en el log. Ninguna pantalla debería
 * quedarse sin foto porque el archivado falló.
 */
export async function archivarFotoDeIdentidad(
  db: PrismaClient,
  foto: FotoParaArchivar,
): Promise<ResultadoArchivo> {
  const s3Key  = rutaDe(foto.patientId, foto.slot, foto.ext);
  const cuerpo = Buffer.from(foto.bytes as ArrayBuffer);

  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${s3Key}`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${SERVICE_KEY}`,
        apikey:         SERVICE_KEY,
        'Content-Type': foto.mimeType,
        'x-upsert':     'true',
      },
      body: cuerpo,
    });
    if (!res.ok) {
      const detalle = await res.text();
      console.error('[foto-identidad] Storage rechazó la copia privada:', detalle);
      return { ok: false, detalle };
    }

    /**
     * La fila que ya tenga ESE recuadro, incluso si está en la papelera.
     *
     * Se busca por nombre porque es lo único que identifica al recuadro (ver
     * `NOMBRE_DE_SLOT`), y se incluye a la eliminada a propósito: subir una foto
     * nueva encima de una borrada la revive, que es lo mismo que ya hace el
     * recuadro con `conFotoNueva()` y su papelera.
     */
    const re = RE_DE_SLOT[foto.slot];
    const previas = await db.patientDocument.findMany({
      where:  { patientId: foto.patientId, caseId: null, isFolder: false },
      select: { id: true, name: true },
    });
    const previa = previas.find((d) => re.test(d.name));

    const datos = {
      name:      `${NOMBRE_DE_SLOT[foto.slot]}.${foto.ext}`,
      s3Key,
      mimeType:  foto.mimeType,
      size:      cuerpo.byteLength,
      deletedAt: null, deletedById: null, deletedByName: null,
    };

    const doc = previa
      ? await db.patientDocument.update({ where: { id: previa.id }, data: datos })
      : await db.patientDocument.create({
          data: {
            ...datos,
            isFolder:  false,
            patientId: foto.patientId,
            // `caseId: null` es la decisión, no un olvido — ver el encabezado.
            caseId:    null,
            parentId:  null,
            createdByUserId: foto.createdByUserId ?? null,
          },
        });

    return { ok: true, documentId: doc.id, s3Key };
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error('[foto-identidad] no se pudo archivar como documento:', detalle);
    return { ok: false, detalle };
  }
}

/**
 * La misma foto, a la papelera de documentos.
 *
 * Va junto al `aPapelera()` del recuadro: si no, una licencia "eliminada"
 * desaparece del recuadro y se sigue pudiendo descargar desde la lista de
 * archivos personales. Es un documento de identidad — eliminarlo tiene que
 * eliminarlo en los dos lados.
 *
 * Marca, no borra: el archivo se queda en el bucket y la fila se puede
 * restaurar, igual que cualquier otro documento.
 */
export async function papelerizarFotoDeIdentidad(
  db: PrismaClient,
  patientId: string,
  slot: SlotFoto,
  quien: { id?: string | null; nombre?: string | null } = {},
): Promise<void> {
  try {
    const re = RE_DE_SLOT[slot];
    const vigentes = await db.patientDocument.findMany({
      where:  { patientId, caseId: null, isFolder: false, deletedAt: null },
      select: { id: true, name: true },
    });
    const fila = vigentes.find((d) => re.test(d.name));
    if (!fila) return;

    await db.patientDocument.update({
      where: { id: fila.id },
      data:  {
        deletedAt:     new Date(),
        deletedById:   quien.id ?? null,
        deletedByName: quien.nombre ?? null,
      },
    });
  } catch (e) {
    console.error('[foto-identidad] no se pudo mandar a la papelera:', e);
  }
}

/** La trae de vuelta, junto con el recuadro. Gemela de `desdePapelera()`. */
export async function restaurarFotoDeIdentidad(
  db: PrismaClient,
  patientId: string,
  slot: SlotFoto,
): Promise<void> {
  try {
    const re = RE_DE_SLOT[slot];
    const borradas = await db.patientDocument.findMany({
      where:  { patientId, caseId: null, isFolder: false, deletedAt: { not: null } },
      select: { id: true, name: true },
    });
    const fila = borradas.find((d) => re.test(d.name));
    if (!fila) return;

    await db.patientDocument.update({
      where: { id: fila.id },
      data:  { deletedAt: null, deletedById: null, deletedByName: null },
    });
  } catch (e) {
    console.error('[foto-identidad] no se pudo restaurar:', e);
  }
}
