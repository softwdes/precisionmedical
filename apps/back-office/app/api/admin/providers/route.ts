/**
 * Providers CRUD API
 *
 * GET    /api/admin/providers?q=&status=&limit=  → listar / buscar providers
 * POST   /api/admin/providers                    → crear provider
 * PATCH  /api/admin/providers                    → editar provider (body.id requerido)
 * DELETE /api/admin/providers?id=...             → soft delete provider
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders, Prisma } from '@precision-medical/database';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q      = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? 'ACTIVE';
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '100'), 200);

  const providers = await db.provider.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status: status as 'ACTIVE' | 'INACTIVE' | 'PENDING_APPROVAL' | 'TERMINATED' } : {}),
      ...(q ? {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName:  { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialty: true,
      status: true,
      employeeId: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: limit,
  });

  return NextResponse.json({ providers });
}

const ProviderInputSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().default(''),
  phone: z.string().max(50).nullable().optional(),
  specialty: z.enum([
    'CHIROPRACTIC', 'GENERAL', 'NEUROLOGY', 'ORTHOPEDICS', 'OTHER',
    'PAIN_MANAGEMENT', 'PHYSICAL_THERAPY', 'PSYCHOLOGY', 'RADIOLOGY',
  ]),
  licenseNumber: z.string().max(100).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'TERMINATED']).default('ACTIVE'),
  employeeId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try {
    parsed = ProviderInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const created = await db.provider.create({
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone ?? null,
      specialty: parsed.specialty,
      licenseNumber: parsed.licenseNumber ?? null,
      status: parsed.status,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CREATE_PROVIDER',
    entityType: 'providers',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, provider: created }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try {
    parsed = ProviderInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }
  if (!parsed.id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.provider.findUnique({ where: { id: parsed.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const updated = await db.provider.update({
    where: { id: parsed.id },
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone ?? null,
      specialty: parsed.specialty,
      licenseNumber: parsed.licenseNumber ?? null,
      status: parsed.status,
      employeeId: parsed.employeeId !== undefined ? parsed.employeeId : undefined,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'UPDATE_PROVIDER',
    entityType: 'providers',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: updated as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, provider: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.provider.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.provider.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'TERMINATED' },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SOFT_DELETE_PROVIDER',
    entityType: 'providers',
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id });
}
