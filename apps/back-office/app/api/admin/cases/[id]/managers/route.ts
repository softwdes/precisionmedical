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
  name: true, email: true, phone: true, role: true,
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

  const stamp = {
    assignedById: actor.actorUserId,
    assignedByName: actor.actorName,
    notes: parsed.notes ?? null,
  };

  let saved;

  if ('lawyerId' in parsed) {
    const lawyer = await db.lawyer.findUnique({ where: { id: parsed.lawyerId } });
    if (!lawyer || lawyer.deletedAt) {
      return NextResponse.json({ error: 'LAWYER_NOT_FOUND' }, { status: 404 });
    }
    // Del catálogo: se revive la fila si ya había estado, así no se duplica ni
    // se pierde el histórico.
    saved = await db.caseManager.upsert({
      where:  { caseId_lawyerId: { caseId: id, lawyerId: lawyer.id } },
      create: { caseId: id, lawyerId: lawyer.id, ...stamp },
      update: { removedAt: null, removedById: null, assignedAt: new Date(), ...stamp },
      select: SELECT,
    });
  } else {
    /*
     * Escrito a mano. NO se exige bufete y NO se crea nada en el catálogo:
     * pedirlo hacía imposible agregar a nadie en los casos sin bufete, que son
     * la mayoría. Los datos viven en la asignación misma.
     *
     * Si el caso tiene bufete, igual se deja constancia del vínculo — pero como
     * dato, no como requisito.
     */
    saved = await db.caseManager.create({
      data: {
        caseId: id,
        name: `${parsed.firstName} ${parsed.lastName}`.trim(),
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        role: parsed.memberRole,
        ...stamp,
      },
      select: SELECT,
    });
  }

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
  // Se identifica por el id de la ASIGNACION: los encargados escritos a mano no
  // tienen `lawyerId`, asi que ese ya no sirve como llave.
  const assignmentId = req.nextUrl.searchParams.get('id');
  if (!assignmentId) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.caseManager.findUnique({ where: { id: assignmentId } });
  if (!before || before.caseId !== id || before.removedAt) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const closed = await db.caseManager.update({
    where: { id: assignmentId },
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
