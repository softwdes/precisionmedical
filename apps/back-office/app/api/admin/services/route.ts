/**
 * B.33 — Service codes CRUD API
 *
 * POST   /api/admin/services           → crear
 * PATCH  /api/admin/services           → editar (body.id requerido)
 * DELETE /api/admin/services?id=...    → soft delete
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders, Prisma } from '@precision-medical/database';

const InputSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(50),
  type: z.enum(['CPT', 'HCPCS', 'CUSTOM_PM']),
  shortDescription: z.string().min(2).max(200),
  longDescription: z.string().max(2000).nullable().optional(),
  category: z.enum(['EM','CHIROPRACTIC','PHYSICAL_THERAPY','IMAGING','INJECTIONS','SURGERY','DME','DRUGS','LAB','REPORTS','CUSTOM','OTHER']),
  currentFee: z.number().min(0).max(99999.99),
  modifiersAllowed: z.array(z.string().max(10)).default([]),
  bundlingNotes: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
  isInternalOnly: z.boolean().default(false),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // Custom PM- enforcement
  if (parsed.type === 'CUSTOM_PM' && !parsed.code.startsWith('PM-')) {
    return NextResponse.json(
      { error: 'INVALID_CODE_PREFIX', message: 'Códigos CUSTOM_PM deben empezar con "PM-"' },
      { status: 400 },
    );
  }

  const FY = 2026;

  const existing = await db.serviceCode.findUnique({
    where: { code_fiscalYear: { code: parsed.code, fiscalYear: FY } },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'DUPLICATE_CODE', message: `Ya existe el código "${parsed.code}" en fiscal year ${FY}` },
      { status: 409 },
    );
  }

  const maxOrder = await db.serviceCode.aggregate({ _max: { sortOrder: true } });

  const created = await db.serviceCode.create({
    data: {
      code: parsed.code,
      type: parsed.type,
      shortDescription: parsed.shortDescription,
      longDescription: parsed.longDescription ?? null,
      category: parsed.category,
      currentFee: parsed.currentFee,
      fiscalYear: FY,
      modifiersAllowed: parsed.modifiersAllowed,
      bundlingNotes: parsed.bundlingNotes ?? null,
      notes: parsed.notes ?? null,
      isActive: parsed.isActive,
      isInternalOnly: parsed.type === 'CUSTOM_PM' ? true : parsed.isInternalOnly,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CREATE_SERVICE_CODE',
    entityType: 'service_codes',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, service: created }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }
  if (!parsed.id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.serviceCode.findUnique({ where: { id: parsed.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const updated = await db.serviceCode.update({
    where: { id: parsed.id },
    data: {
      code: parsed.code,
      type: parsed.type,
      shortDescription: parsed.shortDescription,
      longDescription: parsed.longDescription ?? null,
      category: parsed.category,
      currentFee: parsed.currentFee,
      modifiersAllowed: parsed.modifiersAllowed,
      bundlingNotes: parsed.bundlingNotes ?? null,
      notes: parsed.notes ?? null,
      isActive: parsed.isActive,
      isInternalOnly: parsed.type === 'CUSTOM_PM' ? true : parsed.isInternalOnly,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'UPDATE_SERVICE_CODE',
    entityType: 'service_codes',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: updated as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, service: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.serviceCode.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.serviceCode.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SOFT_DELETE_SERVICE_CODE',
    entityType: 'service_codes',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id });
}
