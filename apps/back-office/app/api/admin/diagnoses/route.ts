/**
 * B.35 — Diagnoses CRUD API (ICD-10 + SNOMED dual)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const InputSchema = z.object({
  id: z.string().optional(),
  icd10Code: z.string().min(2).max(20),
  icd10Description: z.string().min(2).max(500),
  snomedCode: z.string().max(50).nullable().optional(),
  snomedDescription: z.string().max(500).nullable().optional(),
  category: z.enum(['S','T','M','R','G','F','V_W','Z','OTHER']),
  bodySystem: z.string().max(100).nullable().optional(),
  piRelevant: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try { parsed = InputSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) }, { status: 400 });
  }

  const existing = await db.diagnosis.findUnique({ where: { icd10Code: parsed.icd10Code } });
  if (existing) {
    return NextResponse.json({ error: 'DUPLICATE_CODE', message: `Ya existe ICD-10 "${parsed.icd10Code}"` }, { status: 409 });
  }

  const created = await db.diagnosis.create({
    data: {
      icd10Code: parsed.icd10Code,
      icd10Description: parsed.icd10Description,
      snomedCode: parsed.snomedCode ?? null,
      snomedDescription: parsed.snomedDescription ?? null,
      category: parsed.category,
      bodySystem: parsed.bodySystem ?? null,
      piRelevant: parsed.piRelevant,
      isActive: parsed.isActive,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType, actorUserId: actor.actorUserId,
    action: 'CREATE_DIAGNOSIS', entityType: 'diagnoses', entityId: created.id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    after: created as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, diagnosis: created }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try { parsed = InputSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) }, { status: 400 });
  }
  if (!parsed.id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.diagnosis.findUnique({ where: { id: parsed.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (parsed.icd10Code !== before.icd10Code) {
    const dup = await db.diagnosis.findUnique({ where: { icd10Code: parsed.icd10Code } });
    if (dup) return NextResponse.json({ error: 'DUPLICATE_CODE' }, { status: 409 });
  }

  const updated = await db.diagnosis.update({
    where: { id: parsed.id },
    data: {
      icd10Code: parsed.icd10Code,
      icd10Description: parsed.icd10Description,
      snomedCode: parsed.snomedCode ?? null,
      snomedDescription: parsed.snomedDescription ?? null,
      category: parsed.category,
      bodySystem: parsed.bodySystem ?? null,
      piRelevant: parsed.piRelevant,
      isActive: parsed.isActive,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType, actorUserId: actor.actorUserId,
    action: 'UPDATE_DIAGNOSIS', entityType: 'diagnoses', entityId: updated.id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    before: before as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, diagnosis: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.diagnosis.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.diagnosis.update({
    where: { id },
    data: { isActive: false },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType, actorUserId: actor.actorUserId,
    action: 'DEACTIVATE_DIAGNOSIS', entityType: 'diagnoses', entityId: id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    before: before as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, id });
}
