/**
 * El adjunto de un mensaje pasa a ser un documento del expediente.
 *
 * ── El problema ─────────────────────────────────────────────────────────────
 *
 * `MessageAttachment` ya tenía un puente al expediente —el campo
 * `patientDocumentId`— pero funcionaba en UN solo sentido: se podía adjuntar al
 * mensaje un documento que ya estaba en el chart. El camino inverso, que es el
 * que la gente usa, no existía. Medido el 2026-09-02: de 15 adjuntos, **los 15
 * se subieron al mensaje y 0 salieron del chart**. O sea que el camino que
 * existía no se usa y el que se usa no llegaba a ninguna parte: el tab
 * Documentos del caso decía "No documents" con archivos ya compartidos adentro
 * del hilo.
 *
 * ── Copia, no referencia (decisión de Erick, 2026-09-02) ───────────────────
 *
 * Son dos buckets distintos: los adjuntos viven en `message-attachments` y los
 * documentos del caso en `case-documents`. Se podía crear la fila apuntando al
 * objeto que ya está en el bucket de mensajería y no duplicar nada — pero
 * `MessageEntry` borra sus adjuntos en cascada, así que un documento del
 * expediente quedaría dependiendo de que nadie borre un hilo. Un documento en la
 * ficha del paciente es registro clínico; el costo de storage duplicado es
 * despreciable al lado de perderlo.
 *
 * Los dos buckets son PRIVADOS — verificado contra Storage el 2026-09-02
 * (`public=false` en los dos). Importa decirlo porque `intake-photos`, en el
 * mismo proyecto, es público, y copiar ahí habría dejado cada adjunto clínico
 * accesible sin sesión.
 *
 * ── Automático, no un botón ────────────────────────────────────────────────
 *
 * Se dispara al enviar. Si dependiera de que alguien se acuerde de apretar
 * "archivar", pasaría lo mismo que con las fotos del intake: el camino existía y
 * en dos meses lo encontraron 6 pacientes de 133.
 *
 * ── Best-effort a propósito ────────────────────────────────────────────────
 *
 * Ninguna falla de acá puede tumbar el envío del mensaje. Si Storage falla, el
 * mensaje se manda igual y el adjunto sigue leyéndose desde el hilo; lo único
 * que falta es la copia en el expediente, y como la operación es idempotente
 * (marca el adjunto con `patientDocumentId`) un reenvío o un reintento futuro la
 * completa sin duplicar.
 */

import { db } from '@precision-medical/database';

const SUPABASE_URL = (process.env.SUPABASE_STORAGE_URL
  ?? process.env.SUPABASE_URL
  ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY = (process.env.SUPABASE_STORAGE_SERVICE_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;

const BUCKET_ADJUNTOS  = 'message-attachments';
const BUCKET_DOCUMENTOS = 'case-documents';

/**
 * Carpeta donde aterrizan. Va aparte de la raíz a propósito: la documentación
 * oficial del v2 todavía no se migró, y cuando entre va a convivir en el mismo
 * `patient_documents` (14.378 filas ya). Sin una carpeta propia, lo que se
 * compartió por chat quedaría mezclado con el expediente oficial y nadie podría
 * distinguirlos después.
 *
 * El nombre se GUARDA en la base, así que no puede seguir el idioma de quien
 * mira — es un dato, no una etiqueta de UI. Queda en inglés, que es el idioma
 * por defecto del back-office (ver `i18n/request.ts`).
 */
export const CARPETA_MENSAJERIA = 'Messages';

/** Nombre de archivo seguro para una key de Storage — igual que `upload-url`. */
function nombreSeguro(nombre: string): string {
  return nombre.replace(/[^a-z0-9._\-\s]/gi, '_').slice(0, 200) || 'archivo';
}

/** La carpeta de mensajería del caso; la crea la primera vez. */
async function carpetaDelCaso(caseId: string, patientId: string | null): Promise<string | null> {
  const existente = await db.patientDocument.findFirst({
    where:  { caseId, isFolder: true, name: CARPETA_MENSAJERIA, parentId: null },
    select: { id: true },
  });
  if (existente) return existente.id;

  const creada = await db.patientDocument.create({
    data: { name: CARPETA_MENSAJERIA, isFolder: true, caseId, patientId, parentId: null },
    select: { id: true },
  });
  return creada.id;
}

/** Baja el objeto del bucket de adjuntos. `null` si no está. */
async function bajarAdjunto(key: string): Promise<{ bytes: ArrayBuffer; tipo: string } | null> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_ADJUNTOS}/${key}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  if (!res.ok) return null;
  return {
    bytes: await res.arrayBuffer(),
    tipo:  res.headers.get('content-type') || 'application/octet-stream',
  };
}

/**
 * Archiva en el expediente los adjuntos SUBIDOS de un hilo.
 *
 * Se saltan solos:
 *  · los que ya tienen `patientDocumentId` — o vinieron del chart, o ya se
 *    archivaron: por eso la función se puede volver a llamar sin duplicar;
 *  · los hilos sin caso. El tab Documentos es del caso, así que sin `caseId` no
 *    hay dónde ponerlos. Son 19 de 63 hilos hoy (los creados desde el inbox sin
 *    paciente); quedan solo dentro del hilo, como antes.
 *
 * @returns cuántos documentos quedaron creados.
 */
export async function archivarAdjuntosDelHilo(threadId: string, actorUserId: string | null): Promise<number> {
  const hilo = await db.messageThread.findFirst({
    where:  { id: threadId, deletedAt: null },
    select: { id: true, patientId: true, caseId: true },
  });
  if (!hilo?.caseId) return 0;

  const pendientes = await db.messageAttachment.findMany({
    where: {
      entry: { threadId },
      patientDocumentId: null,
      fileUrl: { not: null },
    },
    select: { id: true, fileUrl: true, fileName: true, documentType: true },
  });
  if (pendientes.length === 0) return 0;

  /**
   * La carpeta se crea con el PRIMER archivo que de verdad se copia, no al
   * entrar. Si se creara antes, un hilo cuyos adjuntos ya no existen en Storage
   * —hoy 14 de 15 filas apuntan a objetos que no están— dejaba una carpeta
   * "Messages" vacía en el expediente. Una carpeta vacía en la ficha de un
   * paciente se lee como "acá no hay nada todavía", no como "esto falló".
   */
  let carpetaId: string | null = null;
  let archivados = 0;

  for (const adj of pendientes) {
    try {
      const archivo = await bajarAdjunto(adj.fileUrl!);
      if (!archivo) {
        console.warn('[messaging-documents] el adjunto %s apunta a un objeto que no existe: %s', adj.id, adj.fileUrl);
        continue;
      }
      carpetaId ??= await carpetaDelCaso(hilo.caseId, hilo.patientId);

      const destino = `cases/${hilo.caseId}/${Date.now()}-${nombreSeguro(adj.fileName)}`;
      const subida = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_DOCUMENTOS}/${destino}`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${SERVICE_KEY}`,
          apikey:         SERVICE_KEY,
          'Content-Type': archivo.tipo,
        },
        body: archivo.bytes,
      });
      if (!subida.ok) {
        console.error('[messaging-documents] no se pudo copiar %s: %s', adj.id, await subida.text());
        continue;
      }

      const doc = await db.patientDocument.create({
        data: {
          name:     adj.fileName.slice(0, 255),
          s3Key:    destino,
          isFolder: false,
          size:     archivo.bytes.byteLength,
          mimeType: archivo.tipo,
          patientId: hilo.patientId,
          caseId:    hilo.caseId,
          parentId:  carpetaId,
          createdByUserId: actorUserId,
        },
        select: { id: true },
      });

      /**
       * El vínculo de vuelta. Hace la operación idempotente y, de paso, deja el
       * adjunto del hilo apuntando al documento del expediente — que es para lo
       * que el campo existía.
       *
       * `fileUrl` se conserva: la lectura del adjunto lo prefiere (ver
       * `attachments/[id]`), así que el hilo sigue abriendo su propia copia y no
       * depende de que el documento del chart siga ahí.
       */
      await db.messageAttachment.update({
        where: { id: adj.id },
        data:  { patientDocumentId: doc.id },
      });

      archivados++;
    } catch (e) {
      console.error('[messaging-documents] falló el archivado de %s:', adj.id, e);
    }
  }

  return archivados;
}
