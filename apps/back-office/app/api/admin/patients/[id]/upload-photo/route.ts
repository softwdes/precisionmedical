/**
 * POST /api/admin/patients/[id]/upload-photo
 * Sube una foto de identificación del paciente a Supabase Storage.
 * Busca el caso más reciente del paciente y persiste la URL en consentsData.photos.
 * Bucket: intake-photos (mismo que usa el portal del paciente y la route de casos).
 *
 * La subida en sí vive en `lib/intake-photos.ts` — ver ahí qué se valida y qué
 * queda pendiente (el bucket sigue siendo público).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import {
  validarFoto, subirFoto, conFotoNueva, sinFoto, borrarObjeto, esPhotoType,
} from '@/lib/intake-photos';

type Ctx = { params: Promise<{ id: string }> };

/** El caso más reciente del paciente (excluye soft-deleted, igual que la lista). */
async function casoMasReciente(patientId: string) {
  return db.case.findFirst({
    where:   { patientId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select:  { id: true, consentsData: true },
  });
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id: patientId } = await ctx.params;

  const patient = await db.patient.findUnique({
    where:  { id: patientId },
    select: { id: true },
  });
  if (!patient) return NextResponse.json({ error: 'PATIENT_NOT_FOUND' }, { status: 404 });

  const latestCase = await casoMasReciente(patientId);
  if (!latestCase) return NextResponse.json({ error: 'NO_CASE_FOUND' }, { status: 404 });

  const formData = await req.formData();
  const foto = await validarFoto(
    formData.get('file') as File | null,
    formData.get('photoType') as string | null,
  );
  if (!foto.ok) return NextResponse.json({ error: foto.error }, { status: 400 });

  const subida = await subirFoto(latestCase.id, foto);
  if (!subida.ok) {
    console.error('[patient/upload-photo] Supabase error:', subida.detalle);
    return NextResponse.json({ error: 'UPLOAD_FAILED', detail: subida.detalle }, { status: 500 });
  }

  await db.case.update({
    where: { id: latestCase.id },
    data:  { consentsData: conFotoNueva(latestCase.consentsData, foto.photoType, subida.url) },
  });

  const actor = await resolveActor(req.headers);
  writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'STAFF_PHOTO_UPLOAD',
    entityType:  'Case',
    entityId:    latestCase.id,
    metadata:    { photoType: foto.photoType, uploadedVia: 'patient-dialog', patientId },
  }).catch(() => undefined);

  return NextResponse.json({ url: subida.url, caseId: latestCase.id });
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id: patientId } = await ctx.params;
  const photoType = req.nextUrl.searchParams.get('photoType');

  if (!esPhotoType(photoType)) {
    return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
  }

  const latestCase = await casoMasReciente(patientId);
  if (!latestCase) return NextResponse.json({ error: 'NO_CASE_FOUND' }, { status: 404 });

  const { consents, urlPrevia } = sinFoto(latestCase.consentsData, photoType);

  await db.case.update({
    where: { id: latestCase.id },
    data:  { consentsData: consents },
  });

  borrarObjeto(urlPrevia); // best-effort

  const actor = await resolveActor(req.headers);
  writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'STAFF_PHOTO_DELETE',
    entityType:  'Case',
    entityId:    latestCase.id,
    metadata:    { photoType, patientId },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
