/**
 * GET  /api/admin/cases/[id]  — detalles del caso
 * DELETE /api/admin/cases/[id] — cancelar/eliminar caso (soft: status → CANCELLED)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;

  const c = await db.case.findUnique({
    where: { id },
    select: {
      id: true,
      caseCode: true,
      status: true,
      accidentType: true,
      accidentDate: true,
      portalToken: true,
      createdAt: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (!c) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, case: c });
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;

  const existing = await db.case.findUnique({
    where: { id },
    select: { id: true, caseCode: true, status: true },
  });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (existing.status === 'CANCELLED') {
    return NextResponse.json({ ok: false, error: 'ALREADY_CANCELLED', message: 'El caso ya está cancelado.' }, { status: 409 });
  }

  await db.case.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });

  const actor = actorFromHeaders(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:      'DELETE_CASE',
    entityType:  'cases',
    entityId:    id,
    metadata:    { caseCode: existing.caseCode, previousStatus: existing.status },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
