/**
 * POST /api/admin/cases/[id]/upload-photo
 * Sube una foto de identificación del paciente a Supabase Storage
 * y persiste la URL en consentsData.photos del caso.
 *
 * Autenticado por caseId (staff del back-office).
 * Bucket: intake-photos (mismo que usa el portal del paciente).
 *
 * La subida en sí vive en `lib/intake-photos.ts` — estaba copiada acá, en
 * `patients/[id]/upload-photo` y en el portal del paciente, con los mismos
 * agujeros en las tres.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { validarFoto, subirFoto, conFotoNueva } from '@/lib/intake-photos';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;

  const rec = await db.case.findUnique({
    where:  { id: caseId },
    select: { id: true, consentsData: true },
  });
  if (!rec) return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });

  const formData = await req.formData();
  const foto = await validarFoto(
    formData.get('file') as File | null,
    formData.get('photoType') as string | null,
  );
  if (!foto.ok) return NextResponse.json({ error: foto.error }, { status: 400 });

  const subida = await subirFoto(rec.id, foto);
  if (!subida.ok) {
    console.error('[upload-photo] Supabase error:', subida.detalle);
    return NextResponse.json({ error: 'UPLOAD_FAILED', detail: subida.detalle }, { status: 500 });
  }

  await db.case.update({
    where: { id: rec.id },
    data:  { consentsData: conFotoNueva(rec.consentsData, foto.photoType, subida.url) },
  });

  const actor = await resolveActor(req.headers);
  writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'STAFF_PHOTO_UPLOAD',
    entityType:  'Case',
    entityId:    rec.id,
    metadata:    { photoType: foto.photoType },
  }).catch(() => undefined);

  return NextResponse.json({ url: subida.url });
}
