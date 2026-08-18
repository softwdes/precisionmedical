/**
 * Encargados del caso — GET / POST / DELETE
 *
 * GET    /api/admin/cases/[id]/managers             → actuales + histórico
 * POST   /api/admin/cases/[id]/managers             → asigna (por lawyerId, o crea la persona)
 * DELETE /api/admin/cases/[id]/managers?lawyerId=…  → cierra la asignación
 *
 * Pedido de Edson: necesita saber quién lleva el caso HOY. Rotan —se van del
 * bufete y nombran a otro— así que el DELETE **cierra** la asignación con
 * `removedAt` en vez de borrar la fila: si se borrara, Edson perdería a quién
 * le escribió el mes pasado.
 *
 * Ver docs/plan-vista-edson.md
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

/**
 * Se puede asignar a alguien que ya existe (`lawyerId`) o escribir uno nuevo.
 *
 * Lo segundo existe para no frenar a Edson: si el bufete le manda un encargado
 * que no está cargado, lo escribe ahí mismo y queda creado como miembro del
 * bufete — o sea que la próxima vez ya sale en la lista. Obligarlo a ir a
 * Settings primero es como se termina con los datos en un Excel aparte.
 */
const AssignSchema = z.union([
  z.object({ lawyerId: z.string().min(1), notes: z.string().max(1000).nullable().optional() }),
  z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
    phone: z.string().max(50).nullable().optional(),
    memberRole: z.enum(['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL', 'LEGAL_ASSISTANT', 'OTHER'])
      .default('CASE_MANAGER'),
    notes: z.string().max(1000).nullable().optional(),
  }),
]);

const SELECT = {
  id: true, assignedAt: true, assignedByName: true, removedAt: true, notes: true,
  lawyer: {
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true,
      memberRole: true, status: true,
      parentFirm: { select: { id: true, firmName: true } },
    },
  },
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const rows = await db.caseManager.findMany({
    where: { caseId: id },
    orderBy: [{ removedAt: 'asc' }, { assignedAt: 'asc' }],
    select: SELECT,
  });

  return NextResponse.json({
    ok: true,
    current: rows.filter((r) => !r.removedAt),
    past: rows.filter((r) => r.removedAt),
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

  const kase = await db.case.findUnique({
    where: { id },
    select: { id: true, deletedAt: true, lawFirmId: true },
  });
  if (!kase || kase.deletedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  let lawyerId: string;

  if ('lawyerId' in parsed) {
    const lawyer = await db.lawyer.findUnique({ where: { id: parsed.lawyerId } });
    if (!lawyer || lawyer.deletedAt) {
      return NextResponse.json({ error: 'LAWYER_NOT_FOUND' }, { status: 404 });
    }
    lawyerId = lawyer.id;
  } else {
    // La persona nueva se cuelga del bufete del caso. Sin bufete no hay dónde
    // ponerla, y crearla suelta la dejaría invisible para los demás casos.
    if (!kase.lawFirmId) {
      return NextResponse.json(
        { error: 'NO_FIRM', message: 'El caso no tiene bufete asignado. Elegí el bufete antes de agregar un encargado.' },
        { status: 400 },
      );
    }
    const created = await db.lawyer.create({
      data: {
        entityType: 'FIRM_MEMBER',
        parentFirmId: kase.lawFirmId,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        memberRole: parsed.memberRole,
        status: 'ACTIVE',
      },
    });
    lawyerId = created.id;
  }

  // Si ya estuvo asignado y se le habia cerrado, se revive esa misma fila: el
  // unique es (caseId, lawyerId) y ademas asi no se pierde el historial.
  const saved = await db.caseManager.upsert({
    where:  { caseId_lawyerId: { caseId: id, lawyerId } },
    create: {
      caseId: id, lawyerId,
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
    action: 'ASSIGN_CASE_MANAGER',
    entityType: 'case_managers',
    entityId: saved.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: saved as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, manager: saved }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);
  const lawyerId = req.nextUrl.searchParams.get('lawyerId');
  if (!lawyerId) return NextResponse.json({ error: 'MISSING_LAWYER_ID' }, { status: 400 });

  const before = await db.caseManager.findUnique({
    where: { caseId_lawyerId: { caseId: id, lawyerId } },
  });
  if (!before || before.removedAt) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const closed = await db.caseManager.update({
    where: { caseId_lawyerId: { caseId: id, lawyerId } },
    data: { removedAt: new Date(), removedById: actor.actorUserId },
    select: SELECT,
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'UNASSIGN_CASE_MANAGER',
    entityType: 'case_managers',
    entityId: closed.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: closed as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, manager: closed });
}
