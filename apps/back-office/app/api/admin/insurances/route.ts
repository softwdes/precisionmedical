/**
 * B.32 — Insurance carriers CRUD API
 *
 * POST   /api/admin/insurances           → crear
 * PATCH  /api/admin/insurances           → editar (body.id requerido)
 * DELETE /api/admin/insurances?id=...    → soft delete
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const InputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(200),
  legalName: z.string().max(300).nullable().optional(),
  shortCode: z.string().min(1).max(4),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  type: z.enum(['PIP', 'MED_PAY', 'HEALTH', 'WORKERS', 'OTHER']),
  claimsPhone: z.string().max(50).nullable().optional(),
  claimsEmail: z.string().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  claimsFax: z.string().max(50).nullable().optional(),
  claimsAddress: z.string().max(500).nullable().optional(),
  portalUrl: z.string().url().nullable().optional().or(z.literal('').transform(() => null)),
  hcfaChannel: z.enum(['EMAIL', 'FAX', 'PORTAL', 'PAPER', 'EDI']),
  preauthRequired: z.boolean().default(false),
  avgResponseDays: z.number().int().min(0).max(365).nullable().optional(),
  responseSpeed: z.enum(['FAST', 'AVERAGE', 'SLOW', 'UNKNOWN']).default('UNKNOWN'),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
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

  const existing = await db.insuranceCarrier.findUnique({ where: { name: parsed.name } });
  if (existing) {
    return NextResponse.json(
      { error: 'DUPLICATE_NAME', message: `Ya existe una aseguradora con nombre "${parsed.name}"` },
      { status: 409 },
    );
  }

  const maxOrder = await db.insuranceCarrier.aggregate({ _max: { sortOrder: true } });

  const created = await db.insuranceCarrier.create({
    data: {
      name: parsed.name,
      legalName: parsed.legalName ?? null,
      shortCode: parsed.shortCode,
      color: parsed.color,
      type: parsed.type,
      claimsPhone: parsed.claimsPhone ?? null,
      claimsEmail: parsed.claimsEmail ?? null,
      claimsFax: parsed.claimsFax ?? null,
      claimsAddress: parsed.claimsAddress ?? null,
      portalUrl: parsed.portalUrl ?? null,
      hcfaChannel: parsed.hcfaChannel,
      preauthRequired: parsed.preauthRequired,
      avgResponseDays: parsed.avgResponseDays ?? null,
      responseSpeed: parsed.responseSpeed,
      notes: parsed.notes ?? null,
      isActive: parsed.isActive,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CREATE_INSURANCE',
    entityType: 'insurance_carriers',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: created as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, insurance: created }, { status: 201 });
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

  const before = await db.insuranceCarrier.findUnique({ where: { id: parsed.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (parsed.name !== before.name) {
    const dup = await db.insuranceCarrier.findUnique({ where: { name: parsed.name } });
    if (dup) {
      return NextResponse.json(
        { error: 'DUPLICATE_NAME', message: `Ya existe una aseguradora con nombre "${parsed.name}"` },
        { status: 409 },
      );
    }
  }

  const updated = await db.insuranceCarrier.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      legalName: parsed.legalName ?? null,
      shortCode: parsed.shortCode,
      color: parsed.color,
      type: parsed.type,
      claimsPhone: parsed.claimsPhone ?? null,
      claimsEmail: parsed.claimsEmail ?? null,
      claimsFax: parsed.claimsFax ?? null,
      claimsAddress: parsed.claimsAddress ?? null,
      portalUrl: parsed.portalUrl ?? null,
      hcfaChannel: parsed.hcfaChannel,
      preauthRequired: parsed.preauthRequired,
      avgResponseDays: parsed.avgResponseDays ?? null,
      responseSpeed: parsed.responseSpeed,
      notes: parsed.notes ?? null,
      isActive: parsed.isActive,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'UPDATE_INSURANCE',
    entityType: 'insurance_carriers',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, insurance: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.insuranceCarrier.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const deleted = await db.insuranceCarrier.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SOFT_DELETE_INSURANCE',
    entityType: 'insurance_carriers',
    entityId: deleted.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, id });
}
