/**
 * B.31 — Lawyer firm members CRUD API
 *
 * POST   /api/admin/lawyers/members           → agregar member a firm
 * PATCH  /api/admin/lawyers/members           → editar member
 * DELETE /api/admin/lawyers/members?id=...    → soft delete member
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const MemberInputSchema = z.object({
  id: z.string().optional(),
  parentFirmId: z.string(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(50).nullable().optional(),
  memberRole: z.enum(['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL', 'OTHER']).default('ATTORNEY'),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try {
    parsed = MemberInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // Verify firm exists
  const firm = await db.lawyer.findUnique({ where: { id: parsed.parentFirmId } });
  if (!firm || firm.entityType !== 'FIRM') {
    return NextResponse.json({ error: 'FIRM_NOT_FOUND' }, { status: 404 });
  }

  // Check duplicate email
  const dup = await db.lawyer.findUnique({ where: { email: parsed.email } });
  if (dup) {
    return NextResponse.json(
      { error: 'DUPLICATE_EMAIL', message: `Ya existe un usuario con email "${parsed.email}"` },
      { status: 409 },
    );
  }

  const created = await db.lawyer.create({
    data: {
      entityType: 'INDEPENDENT',
      parentFirmId: parsed.parentFirmId,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone ?? null,
      memberRole: parsed.memberRole,
      city: firm.city,
      state: firm.state,
      status: firm.status,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CREATE_LAWYER_MEMBER',
    entityType: 'lawyers',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: created as unknown as Record<string, unknown>,
    metadata: { parentFirmId: parsed.parentFirmId, role: parsed.memberRole },
  });

  return NextResponse.json({ ok: true, member: created }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try {
    parsed = MemberInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }
  if (!parsed.id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.lawyer.findUnique({ where: { id: parsed.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (parsed.email !== before.email) {
    const dup = await db.lawyer.findUnique({ where: { email: parsed.email } });
    if (dup) {
      return NextResponse.json(
        { error: 'DUPLICATE_EMAIL', message: `Ya existe un usuario con email "${parsed.email}"` },
        { status: 409 },
      );
    }
  }

  const updated = await db.lawyer.update({
    where: { id: parsed.id },
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone ?? null,
      memberRole: parsed.memberRole,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'UPDATE_LAWYER_MEMBER',
    entityType: 'lawyers',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, member: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.lawyer.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.lawyer.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SOFT_DELETE_LAWYER_MEMBER',
    entityType: 'lawyers',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, id });
}
