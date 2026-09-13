/**
 * GET /api/admin/patients/[id]/documents/[docId]/download
 *   URL firmada (15 min) de un archivo del expediente de UNA PERSONA.
 *
 * ── Por qué hacía falta otra ruta de descarga ────────────────────────────────
 *
 * La que existía es `cases/[id]/documents/[docId]/download`: pide el caso en la
 * URL y exige que el documento sea de ESE caso. Pero hay documentos que no
 * cuelgan de ningún caso —`caseId` en NULL y `patientId` puesto— y no son una
 * rareza: son las **2.697 fotos de identidad migradas del v2**
 * (`patients/<id>/personal/dl_front.jpg`, `id_card_front/back`, `patient_photo`),
 * que en el sistema viejo pertenecían a la PERSONA, no a un expediente.
 *
 * Sin esta ruta, el diálogo de Archivos los listaba y al hacer clic no pasaba
 * nada: `abrir()` arrancaba con `if (!doc.caseId) return`. Archivos visibles e
 * imposibles de abrir es la misma falla que tener la ficha sin el archivo, al
 * revés.
 *
 * ── Alcance ─────────────────────────────────────────────────────────────────
 *
 * Sirve los DOS tipos: el documento propio de la persona y el que cuelga de
 * alguno de sus casos. Así el diálogo tiene una sola puerta en vez de elegir
 * ruta según si hay `caseId`, que es justo donde se cuela el bug.
 *
 * La autorización es la de la ficha (`checkPatientAccess`), la misma que ya
 * protege la lista: quien puede ver al paciente puede abrir sus papeles.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { createClient } from '@supabase/supabase-js';
import { checkPatientAccess } from '@/lib/patient-access';

// Storage vive en el proyecto Phoenix (kiqlh…) — vars dedicadas con fallback legacy.
const supabase = createClient(
  (process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  (process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!,
);

const BUCKET = 'case-documents';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
): Promise<NextResponse> {
  const { id: patientId, docId } = await ctx.params;

  const acceso = await checkPatientAccess(patientId);
  if (acceso.deny) return acceso.deny;

  const doc = await db.patientDocument.findUnique({
    where: { id: docId },
    select: {
      id: true, name: true, isFolder: true, s3Key: true,
      patientId: true, caseId: true,
      case: { select: { patientId: true } },
    },
  });

  // El documento tiene que ser de ESTA persona: o por `patientId`, o por el
  // caso del que cuelga. Comparar solo por `patientId` dejaría afuera todo lo
  // que subió el staff desde el tab Documentos, que durante mucho tiempo no lo
  // seteó (ver el encabezado del GET de la lista).
  const esDelPaciente = doc?.patientId === patientId || doc?.case?.patientId === patientId;
  if (!doc || !esDelPaciente) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (doc.isFolder) return NextResponse.json({ error: 'IS_FOLDER' }, { status: 400 });
  if (!doc.s3Key)   return NextResponse.json({ error: 'NO_S3_KEY' }, { status: 400 });

  // Dos firmas del mismo archivo: una para ver embebido y otra con `download`,
  // que hace que Storage responda con `Content-Disposition: attachment`. Ver el
  // comentario largo en la ruta del caso.
  const [view, dl] = await Promise.all([
    supabase.storage.from(BUCKET).createSignedUrl(doc.s3Key, 900),
    supabase.storage.from(BUCKET).createSignedUrl(doc.s3Key, 900, { download: doc.name }),
  ]);

  if (view.error || !view.data || dl.error || !dl.data) {
    console.error('[patient-download] Supabase Storage error:', view.error ?? dl.error);
    return NextResponse.json(
      { error: 'STORAGE_ERROR', message: (view.error ?? dl.error)?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: view.data.signedUrl,
    downloadUrl: dl.data.signedUrl,
    name: doc.name,
  });
}
