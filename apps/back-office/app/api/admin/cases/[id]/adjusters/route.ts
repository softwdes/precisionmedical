/**
 * Adjusters asignados al claim del caso — GET / POST / DELETE
 *
 * GET    /api/admin/cases/[id]/adjusters               → actuales + histórico + dirección de billing
 * POST   /api/admin/cases/[id]/adjusters               → asigna (por adjusterId, o crea la persona)
 * DELETE /api/admin/cases/[id]/adjusters?adjusterId=…  → cierra la asignación
 *
 * Gemelo de `managers/route.ts`. Edson pidió poder anotar más de un adjuster
 * ("Kenneth Kelly or Patricia Leon"), con extensión y fax — que ya viven en el
 * catálogo — y la dirección de billing, que es de la ASEGURADORA y se devuelve
 * acá para no obligarlo a buscarla en otra pantalla.
 *
 * Ver docs/plan-vista-edson.md
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const AssignSchema = z.union([
  z.object({ adjusterId: z.string().min(1), notes: z.string().max(1000).nullable().optional() }),
  z.object({
    name: z.string().trim().min(2).max(200),
    phone: z.string().max(50).nullable().optional(),
    extension: z.string().max(20).nullable().optional(),
    phone2: z.string().max(50).nullable().optional(),
    fax: z.string().max(50).nullable().optional(),
    email: z.string().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
    notes: z.string().max(1000).nullable().optional(),
  }),
]);

const SELECT = {
  id: true, assignedAt: true, assignedByName: true, removedAt: true, notes: true,
  adjuster: {
    select: {
      id: true, name: true, phone: true, extension: true, phone2: true,
      fax: true, email: true, status: true,
      insuranceCarrier: { select: { id: true, name: true, claimsAddress: true } },
    },
  },
} as const;

/** La aseguradora efectiva del caso: la del seguro de auto, o la del caso. */
async function resolveCarrierId(caseId: string): Promise<string | null> {
  const row = await db.caseAutoInsurance.findUnique({
    where: { caseId }, select: { carrierId: true },
  });
  if (row?.carrierId) return row.carrierId;
  const kase = await db.case.findUnique({
    where: { id: caseId }, select: { primaryInsuranceId: true },
  });
  return kase?.primaryInsuranceId ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const [rows, carrierId] = await Promise.all([
    db.caseAdjuster.findMany({
      where: { caseId: id },
      orderBy: [{ removedAt: 'asc' }, { assignedAt: 'asc' }],
      select: SELECT,
    }),
    resolveCarrierId(id),
  ]);

  // La direccion de billing viaja con la respuesta aunque no haya ningun
  // adjuster asignado: Edson la necesita para mandar el claim igual.
  const carrier = carrierId
    ? await db.insuranceCarrier.findUnique({
        where: { id: carrierId },
        select: { id: true, name: true, claimsAddress: true, claimsPhone: true, claimsFax: true },
      })
    : null;

  return NextResponse.json({
    ok: true,
    current: rows.filter((r) => !r.removedAt),
    past: rows.filter((r) => r.removedAt),
    carrier,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = AssignSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const kase = await db.case.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!kase || kase.deletedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  let adjusterId: string;

  if ('adjusterId' in parsed) {
    const adj = await db.insuranceAdjuster.findUnique({ where: { id: parsed.adjusterId } });
    if (!adj || adj.deletedAt) return NextResponse.json({ error: 'ADJUSTER_NOT_FOUND' }, { status: 404 });
    adjusterId = adj.id;
  } else {
    // La persona nueva se cuelga de la aseguradora del caso — igual que en el
    // catalogo, para que la proxima vez ya salga en la lista.
    const carrierId = await resolveCarrierId(id);
    if (!carrierId) {
      return NextResponse.json(
        { error: 'NO_CARRIER', message: 'El caso no tiene aseguradora. Elegila antes de agregar un adjuster.' },
        { status: 400 },
      );
    }
    // El unique del catalogo es (aseguradora, nombre): si ya existe se revive en
    // vez de chocar, que es como se comporta el CRUD del catalogo.
    const existing = await db.insuranceAdjuster.findUnique({
      where: { insuranceCarrierId_name: { insuranceCarrierId: carrierId, name: parsed.name } },
    });
    const data = {
      insuranceCarrierId: carrierId,
      name: parsed.name,
      phone: parsed.phone ?? null,
      extension: parsed.extension ?? null,
      phone2: parsed.phone2 ?? null,
      fax: parsed.fax ?? null,
      email: parsed.email ?? null,
      status: 'ACTIVE' as const,
    };
    const saved = existing
      ? await db.insuranceAdjuster.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } })
      : await db.insuranceAdjuster.create({ data });
    adjusterId = saved.id;
  }

  const saved = await db.caseAdjuster.upsert({
    where:  { caseId_adjusterId: { caseId: id, adjusterId } },
    create: {
      caseId: id, adjusterId,
      assignedById: actor.actorUserId, assignedByName: actor.actorName,
      notes: parsed.notes ?? null,
    },
    update: {
      removedAt: null, removedById: null,
      assignedAt: new Date(),
      assignedById: actor.actorUserId, assignedByName: actor.actorName,
      ...(parsed.notes !== undefined ? { notes: parsed.notes ?? null } : {}),
    },
    select: SELECT,
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'ASSIGN_CASE_ADJUSTER',
    entityType: 'case_adjusters',
    entityId: saved.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: saved as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, adjuster: saved }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);
  const adjusterId = req.nextUrl.searchParams.get('adjusterId');
  if (!adjusterId) return NextResponse.json({ error: 'MISSING_ADJUSTER_ID' }, { status: 400 });

  const before = await db.caseAdjuster.findUnique({
    where: { caseId_adjusterId: { caseId: id, adjusterId } },
  });
  if (!before || before.removedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const closed = await db.caseAdjuster.update({
    where: { caseId_adjusterId: { caseId: id, adjusterId } },
    data: { removedAt: new Date(), removedById: actor.actorUserId },
    select: SELECT,
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'UNASSIGN_CASE_ADJUSTER',
    entityType: 'case_adjusters',
    entityId: closed.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: closed as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, adjuster: closed });
}
