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
import { lawyerCaseFilter, canAssignStaff, caseListFilters } from '@/lib/attorney-portal';
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
  // `sig=pending|signed` — mira SOLO la firma del abogado.
  const signature = searchParams.get('sig')?.trim() ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  /**
   * Los filtros se COMPONEN con `AND`, nunca con spread.
   *
   * Con spread se pisaban entre ellos por usar la misma llave: `lawyerCaseFilter`
   * ancla al bufete con un `OR`, y el `OR` de la búsqueda lo sobrescribía. El
   * efecto no era una lista vacía —que se habría notado— sino una MÁS GRANDE:
   * buscar "maria" en Garcia Law devolvía 33 casos de toda la clínica en vez de
   * sus 2. Un filtro que se pierde en silencio y agranda el resultado es la
   * peor forma de fallar que tiene este módulo.
   */
  const where: Prisma.CaseWhereInput = {
    AND: [
      lawyerCaseFilter(lawyer),
      caseListFilters({
        status,
        signature,
        assignee:     searchParams.get('assignee')?.trim() || undefined,
        assigneeRole: searchParams.get('role')?.trim() || undefined,
      }),
      ...(search
        ? [{
            OR: [
              ...fullNameOR(search),
              { caseCode: { contains: search, mode: 'insensitive' as const } },
              { patient: { firstName: { contains: search, mode: 'insensitive' as const } } },
              { patient: { lastName:  { contains: search, mode: 'insensitive' as const } } },
            ],
          }]
        : []),
    ],
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
        attorneyId: true, paralegalId: true,
        legalAssistants: { select: { lawyerId: true } },
        // SOLO la del abogado: sin el filtro, un caso firmado por el paciente
        // salía como "Firmado" aunque el abogado nunca hubiera firmado.
        lienSignatures: { where: { signerType: 'ATTORNEY' }, select: { id: true }, take: 1 },
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
      legalAssistantIds: c.legalAssistants.map((a) => a.lawyerId),
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
  attorneyId:  z.string().nullable().optional(),
  paralegalId: z.string().nullable().optional(),
  /**
   * Los asistentes son VARIOS: viaja la lista COMPLETA, no un alta o una baja.
   * Mandar el estado final evita el problema clásico de dos pestañas abiertas
   * aplicando deltas sobre versiones distintas del caso.
   */
  legalAssistantIds: z.array(z.string()).optional(),
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
    select: {
      id: true, caseCode: true, attorneyId: true, paralegalId: true,
      legalAssistants: { select: { lawyerId: true } },
    },
  });
  if (!target) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // 2. Las personas asignadas tienen que ser DEL MISMO bufete. Sin esto se
  //    podría asignar a un miembro de otro despacho pasando su id a mano, y de
  //    paso darle visibilidad del caso (el filtro mira estas mismas columnas).
  const ids = [input.attorneyId, input.paralegalId, ...(input.legalAssistantIds ?? [])]
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
  if (input.legalAssistantIds !== undefined) {
    // `deleteMany` + `create` en la misma operación: la lista que llega es el
    // estado final, así que se reemplaza entera dentro de la misma transacción
    // implícita del update. Un diff manual dejaría ventanas donde el caso queda
    // sin asistentes si algo falla en el medio.
    data.legalAssistants = {
      deleteMany: {},
      create: [...new Set(input.legalAssistantIds)].map((lawyerId) => ({ lawyerId })),
    };
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'NOTHING_TO_UPDATE' }, { status: 400 });
  }

  const updated = await db.case.update({
    where: { id: target.id },
    data,
    select: {
      id: true, attorneyId: true, paralegalId: true,
      legalAssistants: { select: { lawyerId: true } },
    },
  });

  // Una entrada `ASSIGNMENT_CHANGE` por campo cambiado — MISMA forma que escribe
  // el admin en `/api/admin/cases/[id]`.
  //
  // Es a propósito: el "Historial de cambios" del caso tiene que mostrar en una
  // sola tabla lo que se movió desde el back-office Y desde el portal. Con un
  // `action` propio quedaban dos formatos y el historial tendría que unirlos,
  // que es la clase de costura que se rompe cuando alguien toca uno de los dos.
  const actor = await resolveActor(req.headers);

  const FIELDS = [
    { key: 'attorneyId',  label: 'Abogado',         raw: 'ATTORNEY',  prevId: target.attorneyId,  newId: updated.attorneyId },
    { key: 'paralegalId', label: 'Gestor de casos', raw: 'PARALEGAL', prevId: target.paralegalId, newId: updated.paralegalId },
  ] as const;

  const changed = FIELDS.filter((f) => f.prevId !== f.newId);

  /**
   * Los asistentes se registran como UNA entrada con las dos listas, no como una
   * fila por persona: "Camila, Daiana → Camila, Dianka" se lee de un vistazo,
   * mientras que un alta y una baja separadas obligan a reconstruir mentalmente
   * quién quedó.
   */
  const prevAssistants = target.legalAssistants.map((a) => a.lawyerId);
  const newAssistants = updated.legalAssistants.map((a) => a.lawyerId);
  const assistantsChanged =
    prevAssistants.length !== newAssistants.length ||
    prevAssistants.some((id) => !newAssistants.includes(id));

  const involvedIds = [
    ...changed.flatMap((f) => [f.prevId, f.newId]),
    ...prevAssistants,
    ...newAssistants,
  ].filter((v): v is string => !!v);

  // Un solo viaje para todos los nombres involucrados. Se resuelven de `lawyers`,
  // que es adonde apuntan las tres columnas (el admin lo buscaba en `employees`
  // y por eso su historial nunca registraba a quién se asignaba).
  const names = new Map<string, string>();
  if (involvedIds.length > 0) {
    const rows = await db.lawyer.findMany({
      where: { id: { in: [...new Set(involvedIds)] } },
      select: { id: true, firstName: true, lastName: true, firmName: true },
    });
    for (const r of rows) {
      names.set(r.id, `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || (r.firmName ?? '—'));
    }
  }

  const listado = (ids: string[]): string | null =>
    ids.length ? ids.map((id) => names.get(id) ?? '—').join(', ') : null;

  const entries: Array<{ label: string; raw: string; previousValue: string | null; newValue: string | null }> = [
    ...changed.map((f) => ({
      label: f.label,
      raw: f.raw,
      previousValue: f.prevId ? (names.get(f.prevId) ?? null) : null,
      newValue:      f.newId  ? (names.get(f.newId)  ?? null) : null,
    })),
    ...(assistantsChanged ? [{
      label: 'Asistente',
      raw: 'LEGALASSISTANT',
      previousValue: listado(prevAssistants),
      newValue:      listado(newAssistants),
    }] : []),
  ];

  for (const f of entries) {
    const { previousValue, newValue } = f;
    const action =
      !previousValue && newValue ? 'Asignado' :
      previousValue && !newValue ? 'Removido' : 'Actualizado';

    await writeAuditLog(db, {
      actorType:   actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole:   actor.actorRole,
      action:      'ASSIGNMENT_CHANGE',
      entityType:  'cases',
      entityId:    target.id,
      ipAddress:   actor.ipAddress,
      userAgent:   actor.userAgent,
      metadata: {
        changeType:     f.label,
        changeTypeRaw:  f.raw,
        action,
        actionRaw:      action === 'Asignado' ? 'ASSIGNED' : action === 'Removido' ? 'REMOVED' : 'UPDATED',
        changedByEmail: actor.email ?? lawyer.email ?? null,
        changedByName:  actor.actorName ?? null,
        previousValue,
        newValue,
        caseCode:       target.caseCode,
        // Deja rastro de que el cambio vino del portal y no del back-office.
        source:         'ATTORNEY_PORTAL',
        firmId:         lawyer.firmId,
      },
    });
  }

  return NextResponse.json({ ok: true, case: updated });
}
