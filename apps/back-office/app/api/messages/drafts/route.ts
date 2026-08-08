/**
 * Borradores (M1 F4 — Save as Draft). PRIVADOS del autor: nadie más los ve.
 *
 * GET  /api/messages/drafts        → mis borradores (recientes primero)
 * POST /api/messages/drafts        → guardar { id?, payload } — con id pisa el
 *                                    existente (siempre que sea mío)
 *
 * `payload` es el compose serializado tal cual (to/cc/tipo/categoría/
 * prioridad/asunto/cuerpo/adjuntos/paciente); subject y paciente van
 * denormalizados para listar sin deserializar.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, type Prisma } from '@precision-medical/database';
import { requireMessagingActor } from '@/lib/messaging';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const drafts = await db.messageDraft.findMany({
    where: { userId: actor.actorUserId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, subject: true, patientName: true, updatedAt: true, payload: true },
  });

  return NextResponse.json({ drafts });
}

interface DraftBody {
  id?: string;
  payload?: Record<string, unknown>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const raw = (await req.json().catch(() => null)) as DraftBody | null;
  if (!raw?.payload || typeof raw.payload !== 'object') {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const subject = typeof raw.payload.subject === 'string' ? raw.payload.subject.slice(0, 200) : null;
  const patient = raw.payload.patient as { id?: string; name?: string } | null | undefined;

  const payload = raw.payload as Prisma.InputJsonValue;

  if (raw.id) {
    const updated = await db.messageDraft.updateMany({
      where: { id: raw.id, userId: actor.actorUserId },
      data: { payload, subject, patientId: patient?.id ?? null, patientName: patient?.name ?? null },
    });
    if (updated.count === 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ id: raw.id });
  }

  const draft = await db.messageDraft.create({
    data: {
      userId: actor.actorUserId,
      payload,
      subject,
      patientId: patient?.id ?? null,
      patientName: patient?.name ?? null,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: draft.id }, { status: 201 });
}
