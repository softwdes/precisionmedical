/**
 * GET /api/attorney/cases/[id]/history — historial de cambios de asignación.
 *
 * Réplica del "Historial de cambios" de v2: fecha · tipo · acción · usuario ·
 * valor anterior · valor nuevo.
 *
 * Sale del audit log (`ASSIGNMENT_CHANGE`), que escriben las DOS puertas con la
 * misma forma: el back-office en `/api/admin/cases/[id]` y el portal en
 * `/api/attorney/cases`. Por eso el historial es uno solo y no hay que unir dos
 * formatos distintos.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter } from '@/lib/attorney-portal';

interface HistoryRow {
  id: string;
  date: string;
  changeType: string | null;
  action: string | null;
  user: string | null;
  previousValue: string | null;
  newValue: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  // El caso tiene que estar en su alcance — si no lo ve, tampoco ve quién lo tocó.
  const target = await db.case.findFirst({
    where: { AND: [lawyerCaseFilter(lawyer), { id }] },
    select: { id: true, caseCode: true },
  });
  if (!target) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const logs = await db.auditLog.findMany({
    where: { entityType: 'cases', entityId: target.id, action: 'ASSIGNMENT_CHANGE' },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, createdAt: true, actorUserId: true, metadata: true },
  });

  // Las filas viejas guardaban un cuid en `changedByEmail` en vez del email (ya
  // corregido en el escritor). Para no mostrar `cqhr4cvbc2vx1xtyzofuqw` en la
  // columna Usuario, lo que parezca un id se resuelve contra `users`.
  const looksLikeId = (v: string | null): v is string => !!v && !v.includes('@');
  const pendingIds = new Set<string>();
  for (const l of logs) {
    const m = (l.metadata ?? {}) as Record<string, unknown>;
    const by = typeof m.changedByEmail === 'string' ? m.changedByEmail : null;
    if (looksLikeId(by)) pendingIds.add(by);
    if (!by && l.actorUserId) pendingIds.add(l.actorUserId);
  }

  const emailById = new Map<string, string>();
  if (pendingIds.size > 0) {
    const users = await db.user.findMany({
      where: { id: { in: [...pendingIds] } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    for (const u of users) {
      emailById.set(u.id, u.email || `${u.firstName} ${u.lastName}`.trim());
    }
  }

  const rows: HistoryRow[] = logs.map((l) => {
    const m = (l.metadata ?? {}) as Record<string, unknown>;
    const raw = typeof m.changedByEmail === 'string' ? m.changedByEmail : null;

    const user =
      raw && raw.includes('@') ? raw
      : looksLikeId(raw) ? (emailById.get(raw) ?? raw)
      : l.actorUserId ? (emailById.get(l.actorUserId) ?? null)
      : (typeof m.changedByName === 'string' ? m.changedByName : null);

    return {
      id: l.id,
      date: l.createdAt.toISOString(),
      changeType:    typeof m.changeType    === 'string' ? m.changeType    : null,
      action:        typeof m.action        === 'string' ? m.action        : null,
      user,
      previousValue: typeof m.previousValue === 'string' ? m.previousValue : null,
      newValue:      typeof m.newValue      === 'string' ? m.newValue      : null,
    };
  });

  return NextResponse.json({ caseCode: target.caseCode, rows });
}
