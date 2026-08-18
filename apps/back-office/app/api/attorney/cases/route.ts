/**
 * Portal Legal · Casos del despacho
 *
 * GET   /api/attorney/cases   → listado paginado, SIEMPRE acotado a la sesión
 * PATCH /api/attorney/cases   → asignar abogado / paralegal / asistente
 *
 * Regla de oro de este archivo: el alcance sale de `getSessionLawyer()`, nunca
 * de la query string. No hay ningún parámetro `firmId` que el cliente pueda
 * mandar — si lo hubiera, cambiarlo en la URL mostraría el despacho de al lado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, type Prisma } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter, canAssignStaff } from '@/lib/attorney-portal';
import { resolveActor } from '@/lib/actor';

const PAGE_SIZE = 10;

/** Búsqueda "Apellido, Nombre" o "Nombre Apellido" — mismo criterio que Externals. */
function fullNameOR(q: string): Prisma.CaseWhereInput[] {
  const parts = q.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) return [];
  const a = parts[0]!, b = parts[parts.length - 1]!;
  return [
    { patient: { firstName: { contains: a, mode: 'insensitive' }, lastName: { contains: b, mode: 'insensitive' } } },
    { patient: { firstName: { contains: b, mode: 'insensitive' }, lastName: { contains: a, mode: 'insensitive' } } },
  ];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search')?.trim() ?? '';
  const status = searchParams.get('status')?.trim() ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const scope = lawyerCaseFilter(lawyer);
  const where: Prisma.CaseWhereInput = {
    ...scope,
    ...(status ? { status: status as never } : {}),
    ...(search
      ? {
          OR: [
            ...fullNameOR(search),
            { caseCode: { contains: search, mode: 'insensitive' } },
            { patient: { firstName: { contains: search, mode: 'insensitive' } } },
            { patient: { lastName:  { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, caseCode: true, caseType: true, status: true, createdAt: true,
        accidentDate: true, signatureExempt: true,
        patient: { select: { firstName: true, lastName: true } },
        attorneyId: true, paralegalId: true, legalAssistantId: true,
        lienSignatures: { select: { id: true }, take: 1 },
      },
    }),
    db.case.count({ where }),
  ]);

  return NextResponse.json({
    cases: rows.map((c) => ({
      id: c.id,
      caseCode: c.caseCode,
      caseType: c.caseType,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      accidentDate: c.accidentDate?.toISOString() ?? null,
      patient: c.patient,
      attorneyId: c.attorneyId,
      paralegalId: c.paralegalId,
      legalAssistantId: c.legalAssistantId,
      hasSigned: c.lienSignatures.length > 0,
      signatureExempt: c.signatureExempt,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
}

const AssignSchema = z.object({
  caseId: z.string().min(1),
  /** null desasigna. */
  attorneyId:       z.string().nullable().optional(),
  paralegalId:      z.string().nullable().optional(),
  legalAssistantId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const lawyer = await getSessionLawyer();
  if (!lawyer?.firmId) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  // Repartir trabajo es del titular. El cliente ya esconde los selectores, pero
  // esconder no es proteger: sin este check un gestor los reactiva con un fetch.
  if (!canAssignStaff(lawyer)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  let input: z.infer<typeof AssignSchema>;
  try {
    input = AssignSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // 1. El caso tiene que estar DENTRO del alcance de quien pide. Se comprueba
  //    con el mismo filtro que la lista: si no lo ve, tampoco lo puede tocar.
  const target = await db.case.findFirst({
    where: { AND: [lawyerCaseFilter(lawyer), { id: input.caseId }] },
    select: { id: true, caseCode: true, attorneyId: true, paralegalId: true, legalAssistantId: true },
  });
  if (!target) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // 2. Las personas asignadas tienen que ser DEL MISMO bufete. Sin esto se
  //    podría asignar a un miembro de otro despacho pasando su id a mano, y de
  //    paso darle visibilidad del caso (el filtro mira estas mismas columnas).
  const ids = [input.attorneyId, input.paralegalId, input.legalAssistantId]
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  if (ids.length > 0) {
    const valid = await db.lawyer.count({
      where: { id: { in: ids }, deletedAt: null, parentFirmId: lawyer.firmId },
    });
    if (valid !== new Set(ids).size) {
      return NextResponse.json(
        { error: 'MEMBER_NOT_IN_FIRM', message: 'Solo podés asignar miembros de tu propio despacho.' },
        { status: 403 },
      );
    }
  }

  const data: Prisma.CaseUpdateInput = {};
  if (input.attorneyId !== undefined) {
    data.attorney = input.attorneyId ? { connect: { id: input.attorneyId } } : { disconnect: true };
  }
  if (input.paralegalId !== undefined) {
    data.paralegal = input.paralegalId ? { connect: { id: input.paralegalId } } : { disconnect: true };
  }
  if (input.legalAssistantId !== undefined) {
    data.legalAssistant = input.legalAssistantId ? { connect: { id: input.legalAssistantId } } : { disconnect: true };
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'NOTHING_TO_UPDATE' }, { status: 400 });
  }

  const updated = await db.case.update({
    where: { id: target.id },
    data,
    select: { id: true, attorneyId: true, paralegalId: true, legalAssistantId: true },
  });

  await writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'ATTORNEY_ASSIGN_CASE_STAFF',
    entityType: 'cases',
    entityId: target.id,
    before: { attorneyId: target.attorneyId, paralegalId: target.paralegalId, legalAssistantId: target.legalAssistantId },
    after: updated,
    metadata: { firmId: lawyer.firmId, by: lawyer.email, caseCode: target.caseCode },
  });

  return NextResponse.json({ ok: true, case: updated });
}
