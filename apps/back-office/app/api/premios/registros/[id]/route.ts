import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

/**
 * Borrar un registro propio que todavía está PENDIENTE: para corregir un error
 * de carga antes de que el Admin lo mire. Uno ya verificado o rechazado no se
 * toca desde acá; eso es decisión del Admin.
 *
 * Es un borrado de verdad y no una papelera: el registro nunca contó para nada,
 * y el audit log guarda qué era.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const entry = await db.rewardEntry.findUnique({ where: { id } });
  if (!entry || entry.userId !== actor.actorUserId) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (entry.status !== 'PENDING') return NextResponse.json({ error: 'ALREADY_REVIEWED' }, { status: 409 });

  const period = await db.rewardPeriod.findUnique({ where: { id: entry.periodId }, select: { status: true } });
  if (period?.status !== 'OPEN') return NextResponse.json({ error: 'PERIOD_CLOSED' }, { status: 409 });

  await db.rewardEntry.delete({ where: { id } });
  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'REWARD_ENTRY_DELETE',
    entityType: 'reward_entries',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: {
      categoryCode: entry.categoryCode, occurredOn: entry.occurredOn.toISOString().slice(0, 10),
      patientId: entry.patientId, source: entry.source, points: entry.points,
    },
  });
  return NextResponse.json({ ok: true });
}
