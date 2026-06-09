/**
 * B.30 — Lawyers (firms) CRUD API
 *
 * POST   /api/admin/lawyers           → crear firm
 * PATCH  /api/admin/lawyers           → editar firm (body.id requerido)
 * DELETE /api/admin/lawyers?id=...    → soft delete firm + sus members
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders, Prisma } from '@precision-medical/database';

const FirmInputSchema = z.object({
  id: z.string().optional(),
  firmName: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(2).nullable().optional(),
  paymentSpeed: z.enum(['FAST', 'AVERAGE', 'SLOW', 'UNKNOWN']).default('UNKNOWN'),
  caseflowFlags: z.array(z.string().max(50)).default([]),
  notes: z.string().max(5000).nullable().optional(),
  isActive: z.boolean().default(true),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try {
    parsed = FirmInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const existing = await db.lawyer.findUnique({ where: { email: parsed.email } });
  if (existing) {
    return NextResponse.json(
      { error: 'DUPLICATE_EMAIL', message: `Ya existe un bufete/miembro con email "${parsed.email}"` },
      { status: 409 },
    );
  }

  const created = await db.lawyer.create({
    data: {
      entityType: 'FIRM',
      firmName: parsed.firmName,
      email: parsed.email,
      phone: parsed.phone ?? null,
      address: parsed.address ?? null,
      city: parsed.city ?? null,
      state: parsed.state ?? null,
      paymentSpeed: parsed.paymentSpeed,
      caseflowFlags: parsed.caseflowFlags,
      notes: parsed.notes ?? null,
      status: parsed.isActive ? 'ACTIVE' : 'INACTIVE',
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CREATE_LAWYER_FIRM',
    entityType: 'lawyers',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, firm: created }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try {
    parsed = FirmInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }
  if (!parsed.id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.lawyer.findUnique({ where: { id: parsed.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Check duplicate email excluding self
  if (parsed.email !== before.email) {
    const dup = await db.lawyer.findUnique({ where: { email: parsed.email } });
    if (dup) {
      return NextResponse.json(
        { error: 'DUPLICATE_EMAIL', message: `Ya existe un bufete/miembro con email "${parsed.email}"` },
        { status: 409 },
      );
    }
  }

  const updated = await db.lawyer.update({
    where: { id: parsed.id },
    data: {
      firmName: parsed.firmName,
      email: parsed.email,
      phone: parsed.phone ?? null,
      address: parsed.address ?? null,
      city: parsed.city ?? null,
      state: parsed.state ?? null,
      paymentSpeed: parsed.paymentSpeed,
      caseflowFlags: parsed.caseflowFlags,
      notes: parsed.notes ?? null,
      status: parsed.isActive ? 'ACTIVE' : 'INACTIVE',
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'UPDATE_LAWYER_FIRM',
    entityType: 'lawyers',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: updated as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, firm: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.lawyer.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Soft delete firm + cascade to members
  const now = new Date();
  await db.$transaction([
    db.lawyer.update({ where: { id }, data: { deletedAt: now, status: 'INACTIVE' } }),
    db.lawyer.updateMany({ where: { parentFirmId: id, deletedAt: null }, data: { deletedAt: now, status: 'INACTIVE' } }),
  ]);

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SOFT_DELETE_LAWYER_FIRM',
    entityType: 'lawyers',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id });
}
