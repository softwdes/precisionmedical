/**
 * POST /api/admin/patients/[id]/restore
 *
 * Restaura un paciente INACTIVE: vuelve a ACTIVE y reactiva sus casos (deletedAt → null).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const existing = await db.patient.findUnique({
    where: { id },
    select: {
      id: true,
      patientCode: true,
      status: true,
      cases: { where: { deletedAt: { not: null } }, select: { id: true } },
    },
  });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (existing.status !== 'INACTIVE') {
    return NextResponse.json({ ok: false, error: 'NOT_INACTIVE', message: 'El paciente no está inactivo.' }, { status: 409 });
  }

  await db.$transaction([
    db.patient.update({
      where: { id },
      data: { status: 'ACTIVE' },
    }),
    // Reactivar solo los casos que se archivaron junto con el paciente
    ...(existing.cases.length > 0
      ? [db.case.updateMany({
          where: { patientId: id, deletedAt: { not: null } },
          data: { deletedAt: null },
        })]
      : []),
  ]);

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'RESTORE_PATIENT',
    entityType:  'patients',
    entityId:    id,
    metadata:    { patientCode: existing.patientCode, casesRestored: existing.cases.length },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
