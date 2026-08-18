import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { db, writeAuditLog } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { ATTORNEY_VIEW_COOKIE, canViewAsLawyer } from '@/lib/get-session-lawyer';
import { resolveActor } from '@/lib/actor';

/**
 * POST   /api/attorney/view   { lawyerId }  → fija el bufete a "ver como"
 * DELETE /api/attorney/view                 → limpia la selección
 *
 * Espejo de `/api/admin/doctor-view`. Solo admins (`canViewAsLawyer`), y se
 * valida ACÁ aunque el middleware ya filtre: `/api/*` no pasa por los checks de
 * página, así que esta ruta es su propia puerta. Un abogado real no la necesita
 * —su portal sale de su email— y ponerse la cookie a mano no le sirve de nada,
 * porque `getSessionLawyer` la ignora sin rol admin.
 */

async function requireAttorneyView(): Promise<{ email: string } | null> {
  const user = await getSessionUser();
  if (!user?.email) return null;
  return (await canViewAsLawyer(user.email)) ? { email: user.email } : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await requireAttorneyView();
  if (!actor) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  let lawyerId: unknown;
  try {
    ({ lawyerId } = (await req.json()) as { lawyerId?: unknown });
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (typeof lawyerId !== 'string' || !lawyerId) {
    return NextResponse.json({ error: 'INVALID_LAWYER' }, { status: 400 });
  }

  const lawyer = await db.lawyer.findFirst({
    where: { id: lawyerId, deletedAt: null },
    select: { id: true, firmName: true, firstName: true, lastName: true, email: true },
  });
  if (!lawyer) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  (await cookies()).set(ATTORNEY_VIEW_COOKIE, lawyer.id, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // una jornada
  });

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'ATTORNEY_VIEW_AS',
    entityType: 'lawyers',
    entityId: lawyer.id,
    metadata: { viewer: actor.email, firm: lawyer.firmName ?? lawyer.email },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const actor = await requireAttorneyView();
  if (!actor) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  (await cookies()).delete(ATTORNEY_VIEW_COOKIE);
  return NextResponse.json({ ok: true });
}
