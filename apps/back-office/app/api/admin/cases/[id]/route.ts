/**
 * GET    /api/admin/cases/[id]  — detalles del caso
 * PATCH  /api/admin/cases/[id]  — editar campos básicos
 * DELETE /api/admin/cases/[id]  — soft-delete (status → CANCELLED)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;

  const c = await db.case.findUnique({
    where: { id },
    select: {
      id: true,
      caseCode: true,
      caseType: true,
      status: true,
      accidentType: true,
      accidentDate: true,
      accidentLocation: true,
      accidentNotes: true,
      consentsData: true,
      portalToken: true,
      createdAt: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      lawFirm: { select: { id: true, firmName: true } },
      attorney: { select: { id: true, firstName: true, lastName: true } },
      primaryInsurance: { select: { id: true, name: true } },
      specialty: { select: { id: true, name: true } },
    },
  });

  if (!c) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, case: c });
}

const PatchSchema = z.object({
  status:           z.enum(['NEW_REFERRAL','INTAKE_PENDING','INTAKE_COMPLETED','CONFIRMED','ACTIVE','MMI','CLOSED','SETTLED','ARCHIVED','CANCELLED']).optional(),
  caseType:         z.enum(['MVA','GENERAL','WORKERS_COMP','NURSING_HOME']).optional(),
  accidentType:     z.enum(['AUTO','MOTORCYCLE','PEDESTRIAN','WORKPLACE','OTHER']).nullable().optional(),
  accidentDate:     z.string().nullable().optional(),
  accidentLocation: z.string().nullable().optional(),
  accidentNotes:    z.string().nullable().optional(),
  lawFirmId:        z.string().nullable().optional(),
  // text fields stored in consentsData JSON
  chiropractor:     z.string().nullable().optional(),
  lawFirmLabel:     z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 422 });

  const { accidentDate, chiropractor, lawFirmLabel, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (accidentDate !== undefined) {
    data.accidentDate = accidentDate ? new Date(accidentDate + 'T12:00:00') : null;
  }

  // Merge consentsData JSON with text fields
  if (chiropractor !== undefined || lawFirmLabel !== undefined) {
    const existing = await db.case.findUnique({ where: { id }, select: { consentsData: true } });
    const prev = (existing?.consentsData ?? {}) as Record<string, unknown>;
    data.consentsData = {
      ...prev,
      ...(chiropractor !== undefined ? { chiropractor } : {}),
      ...(lawFirmLabel !== undefined ? { lawFirm: lawFirmLabel } : {}),
    };
  }

  const updated = await db.case.update({ where: { id }, data, select: { id: true, caseCode: true } });

  const actor = actorFromHeaders(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:      'UPDATE_CASE',
    entityType:  'cases',
    entityId:    id,
    metadata:    { caseCode: updated.caseCode, fields: Object.keys(parsed.data) },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true });
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
