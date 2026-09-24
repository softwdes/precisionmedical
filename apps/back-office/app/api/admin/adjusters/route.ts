/**
 * Catálogo de ajustadores — CRUD API (paso 1 de la vista de tracking de Edson)
 *
 * POST   /api/admin/adjusters           → crear
 * PATCH  /api/admin/adjusters           → editar (body.id requerido)
 * DELETE /api/admin/adjusters?id=...    → soft delete
 *
 * Ver docs/plan-vista-edson.md §3.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const InputSchema = z.object({
  id: z.string().optional(),
  insuranceCarrierId: z.string().min(1),
  name: z.string().min(2).max(200),
  phone: z.string().max(50).nullable().optional(),
  extension: z.string().max(20).nullable().optional(),
  phone2: z.string().max(50).nullable().optional(),
  fax: z.string().max(50).nullable().optional(),
  email: z.string().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

/** Campos escribibles — evita repetir el mapeo en POST, PATCH y revive. */
function toData(parsed: z.infer<typeof InputSchema>) {
  return {
    insuranceCarrierId: parsed.insuranceCarrierId,
    name: parsed.name.trim(),
    phone: parsed.phone ?? null,
    extension: parsed.extension ?? null,
    phone2: parsed.phone2 ?? null,
    fax: parsed.fax ?? null,
    email: parsed.email ?? null,
    notes: parsed.notes ?? null,
    status: parsed.status,
  };
}

/** Tope de la lista: hoy el catálogo tiene 103 y el buscador lo achica. */
const MAX_LISTA = 60;

/**
 * GET /api/admin/adjusters?q=&carrierId=   → el catálogo, para el selector.
 *
 * Devuelve el catálogo ENTERO y no solo el de la aseguradora del caso, y esa
 * es la decisión que hace que el selector sirva. Medido el 2026-09-17: de las
 * 1.053 filas de la cola de Edson, solo **261** tienen aseguradora resuelta y
 * apenas **177** caen en una aseguradora que además tenga gente en el catálogo.
 * Filtrando solo por aseguradora, el selector saldría VACÍO en el 83% de los
 * casos — que es justo por lo que se lo quitó la primera vez (ver el comentario
 * en `case-adjusters.tsx`).
 *
 * `carrierId` no filtra: ORDENA. Los de la aseguradora del caso suben primero,
 * que es lo que Edson necesita ver arriba, y el resto sigue alcanzable.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').trim();
  const carrierId = sp.get('carrierId') ?? '';

  const where: Prisma.InsuranceAdjusterWhereInput = { deletedAt: null, status: 'ACTIVE' };
  if (q) {
    // También por teléfono: Edson muchas veces tiene el número y no el nombre.
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { insuranceCarrier: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const SELECT = {
    id: true, name: true, phone: true, extension: true, phone2: true,
    fax: true, email: true,
    insuranceCarrier: { select: { id: true, name: true } },
  } as const;

  /*
   * Dos consultas y no una con `sort` después, y el motivo es el tope.
   *
   * Ordenar en memoria lo que ya vino recortado NO sube nada: el recorte pasa
   * primero. Con el catálogo de hoy (103 activos, tope 60) eso dejaba afuera a
   * 10 de los 24 de Progressive y a 5 de los 9 de State Farm — los de apellido
   * tardío. Edson tendría que escribir el nombre para encontrarlos, que es
   * justo lo que no sabe cuando abre la lista.
   *
   * Así, los de la aseguradora del caso entran TODOS y el resto rellena.
   */
  const delCaso = carrierId
    ? await db.insuranceAdjuster.findMany({
        where: { ...where, insuranceCarrierId: carrierId },
        orderBy: { name: 'asc' },
        select: SELECT,
      })
    : [];

  const resto = await db.insuranceAdjuster.findMany({
    where: carrierId ? { ...where, NOT: { insuranceCarrierId: carrierId } } : where,
    orderBy: { name: 'asc' },
    take: Math.max(0, MAX_LISTA - delCaso.length),
    select: SELECT,
  });

  return NextResponse.json({ ok: true, adjusters: [...delCaso, ...resto] });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const carrier = await db.insuranceCarrier.findUnique({ where: { id: parsed.insuranceCarrierId } });
  if (!carrier || carrier.deletedAt) {
    return NextResponse.json(
      { error: 'CARRIER_NOT_FOUND' },
      { status: 404 },
    );
  }

  // El único índice es (carrier, name), así que un adjuster borrado bloquea el
  // alta del mismo nombre. Revivirlo es lo correcto: es la misma persona, y así
  // no se pierden las notas que Edson ya había escrito sobre ella.
  const existing = await db.insuranceAdjuster.findUnique({
    where: { insuranceCarrierId_name: { insuranceCarrierId: parsed.insuranceCarrierId, name: parsed.name.trim() } },
  });
  if (existing && !existing.deletedAt) {
    return NextResponse.json(
      { error: 'DUPLICATE_IN_CARRIER', params: { name: parsed.name, carrier: carrier.name } },
      { status: 409 },
    );
  }

  const created = existing
    ? await db.insuranceAdjuster.update({
        where: { id: existing.id },
        data: { ...toData(parsed), deletedAt: null },
      })
    : await db.insuranceAdjuster.create({ data: toData(parsed) });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: existing ? 'RESTORE_ADJUSTER' : 'CREATE_ADJUSTER',
    entityType: 'insurance_adjusters',
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: existing ? (existing as unknown as Prisma.JsonValue) : undefined,
    after: created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, adjuster: created, restored: !!existing }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
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

  const before = await db.insuranceAdjuster.findUnique({ where: { id: parsed.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const nameChanged    = parsed.name.trim() !== before.name;
  const carrierChanged = parsed.insuranceCarrierId !== before.insuranceCarrierId;
  if (nameChanged || carrierChanged) {
    const dup = await db.insuranceAdjuster.findUnique({
      where: { insuranceCarrierId_name: { insuranceCarrierId: parsed.insuranceCarrierId, name: parsed.name.trim() } },
    });
    if (dup && dup.id !== before.id && !dup.deletedAt) {
      return NextResponse.json(
        { error: 'DUPLICATE_NAME', params: { name: parsed.name } },
        { status: 409 },
      );
    }
  }

  const updated = await db.insuranceAdjuster.update({
    where: { id: parsed.id },
    data: toData(parsed),
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'UPDATE_ADJUSTER',
    entityType: 'insurance_adjusters',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: updated as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, adjuster: updated });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.insuranceAdjuster.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const deleted = await db.insuranceAdjuster.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'SOFT_DELETE_ADJUSTER',
    entityType: 'insurance_adjusters',
    entityId: deleted.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, id });
}
