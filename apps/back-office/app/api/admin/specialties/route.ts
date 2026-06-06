/**
 * B.36 — Specialties CRUD API
 *
 * POST   /api/admin/specialties           → crear
 * PATCH  /api/admin/specialties           → editar (body.id requerido)
 * DELETE /api/admin/specialties?id=...    → soft delete (deletedAt = now)
 *
 * Phase 1A — Conecta directamente a Prisma. Sin auth todavía (Phase 1B).
 * Audit log se escribe con actor_type=HUMAN_USER (stub para Phase 1B con session).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const SpecialtyInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(100),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color debe ser hex (#RRGGBB)'),
  workflowType: z.enum(['MVA', 'GM', 'SELFPAY', 'NURSING_HOME']),
  caseType: z.enum(['MVA', 'GENERAL', 'NURSING_HOME']),
  cptSuggested: z.array(z.string().regex(/^[A-Z0-9]+$/i, 'CPT inválido')).default([]),
  isActive: z.boolean().default(true),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try {
    parsed = SpecialtyInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // Check duplicate name
  const existing = await db.specialtyCatalog.findUnique({ where: { name: parsed.name } });
  if (existing) {
    return NextResponse.json(
      { error: 'DUPLICATE_NAME', message: `Ya existe una especialidad con nombre "${parsed.name}"` },
      { status: 409 },
    );
  }

  // Get max sortOrder for new specialty
  const maxOrder = await db.specialtyCatalog.aggregate({
    _max: { sortOrder: true },
  });

  const created = await db.specialtyCatalog.create({
    data: {
      name: parsed.name,
      description: parsed.description ?? null,
      color: parsed.color,
      workflowType: parsed.workflowType,
      caseType: parsed.caseType,
      cptSuggested: parsed.cptSuggested,
      isActive: parsed.isActive,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CREATE_SPECIALTY',
    entityType: 'specialty_catalog',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: created as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, specialty: created }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try {
    parsed = SpecialtyInputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  if (!parsed.id) {
    return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });
  }

  const before = await db.specialtyCatalog.findUnique({ where: { id: parsed.id } });
  if (!before) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Check duplicate name (excluding self)
  if (parsed.name !== before.name) {
    const dup = await db.specialtyCatalog.findUnique({ where: { name: parsed.name } });
    if (dup) {
      return NextResponse.json(
        { error: 'DUPLICATE_NAME', message: `Ya existe una especialidad con nombre "${parsed.name}"` },
        { status: 409 },
      );
    }
  }

  const updated = await db.specialtyCatalog.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      description: parsed.description ?? null,
      color: parsed.color,
      workflowType: parsed.workflowType,
      caseType: parsed.caseType,
      cptSuggested: parsed.cptSuggested,
      isActive: parsed.isActive,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'UPDATE_SPECIALTY',
    entityType: 'specialty_catalog',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, specialty: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });
  }

  const before = await db.specialtyCatalog.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Soft delete
  const deleted = await db.specialtyCatalog.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'SOFT_DELETE_SPECIALTY',
    entityType: 'specialty_catalog',
    entityId: deleted.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, id });
}
