/**
 * B.35 — Diagnoses CRUD API (ICD-10 + SNOMED dual)
 *
 * GET /api/admin/diagnoses?q=&category=&filter=&page=&limit=
 *   Paginado server-side — nunca devuelve más de 50 rows a la vez.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const filter   = searchParams.get('filter') ?? 'all';   // all | piRelevant | favorites
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit    = Math.min(50, parseInt(searchParams.get('limit') ?? '50'));
  const userId   = searchParams.get('userId') ?? '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    ...(q ? {
      OR: [
        { icd10Code:         { contains: q, mode: 'insensitive' } },
        { icd10Description:  { contains: q, mode: 'insensitive' } },
        { snomedCode:        { contains: q, mode: 'insensitive' } },
        { snomedDescription: { contains: q, mode: 'insensitive' } },
      ],
    } : {}),
    ...(category && category !== 'all' ? { category } : {}),
    ...(filter === 'piRelevant' ? { piRelevant: true } : {}),
  };

  // Para filtro favorites: obtener IDs del usuario y filtrar
  let favIds: Set<string> = new Set();
  if (filter === 'favorites' && userId) {
    const favs = await db.userDiagnosisFavorite.findMany({
      where: { userId },
      select: { diagnosisId: true },
    });
    favIds = new Set(favs.map((f) => f.diagnosisId));
    if (favIds.size === 0) {
      return NextResponse.json({ diagnoses: [], total: 0, page, limit, pages: 0 });
    }
    (where as Record<string, unknown>).id = { in: [...favIds] };
  }

  // Para marcar favoritos en los resultados
  if (userId && filter !== 'favorites') {
    const favs = await db.userDiagnosisFavorite.findMany({
      where: { userId },
      select: { diagnosisId: true },
    });
    favIds = new Set(favs.map((f) => f.diagnosisId));
  }

  const [rows, total] = await Promise.all([
    db.diagnosis.findMany({
      where,
      orderBy: [{ piRelevant: 'desc' }, { icd10Code: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, icd10Code: true, icd10Description: true,
        snomedCode: true, snomedDescription: true,
        category: true, bodySystem: true, piRelevant: true, isActive: true,
      },
    }),
    db.diagnosis.count({ where }),
  ]);

  const diagnoses = rows.map((d) => ({
    ...d,
    isFavorite: favIds.has(d.id),
  }));

  return NextResponse.json({ diagnoses, total, page, limit, pages: Math.ceil(total / limit) });
}

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
  const actor = await resolveActor(req.headers);
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
    actorType: actor.actorType, actorUserId: actor.actorUserId, actorRole: actor.actorRole,
    action: 'CREATE_DIAGNOSIS', entityType: 'diagnoses', entityId: created.id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    after: created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, diagnosis: created }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
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
    actorType: actor.actorType, actorUserId: actor.actorUserId, actorRole: actor.actorRole,
    action: 'UPDATE_DIAGNOSIS', entityType: 'diagnoses', entityId: updated.id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: updated as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, diagnosis: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
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
    actorType: actor.actorType, actorUserId: actor.actorUserId, actorRole: actor.actorRole,
    action: 'DEACTIVATE_DIAGNOSIS', entityType: 'diagnoses', entityId: id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id });
}
