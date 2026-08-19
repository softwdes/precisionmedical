/**
 * PATCH /api/admin/releases/[id]  { action: 'publish' | 'unpublish' }
 *
 * Publicar es lo único que hace aparecer las notas en el banner. Bloquea si
 * alguna entrada visible no tiene inglés: el idioma sale de la cookie `locale` y
 * si el usuario está en EN tiene que ver TODO en EN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { publishRelease, unpublishRelease } from '@precision-medical/database/release-notes';
import { resolveActor } from '@/lib/actor';
import { requireReleaseAdmin } from '../guard';

const InputSchema = z.object({ action: z.enum(['publish', 'unpublish']) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireReleaseAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  if (parsed.action === 'unpublish') {
    await unpublishRelease(id);
  } else {
    const result = await publishRelease(id, { id: actor.actorUserId, name: actor.actorName });
    if (!result.ok) {
      // 409 y no 400: el payload está bien, es el estado del release el que no
      // permite publicar todavía.
      return NextResponse.json(
        { error: result.error, missing: result.missing },
        { status: result.error === 'NOT_FOUND' ? 404 : 409 },
      );
    }
  }

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: parsed.action === 'publish' ? 'PUBLISH_RELEASE_NOTES' : 'UNPUBLISH_RELEASE_NOTES',
    entityType: 'release',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  return NextResponse.json({ ok: true });
}
