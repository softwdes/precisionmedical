import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from '@/lib/session';
import { DOCTOR_VIEW_COOKIE } from '@/lib/get-session-provider';

/**
 * POST /api/admin/doctor-view   { providerId }  → fija el doctor a "ver como"
 * DELETE /api/admin/doctor-view                 → limpia la selección
 *
 * Solo SUPER_ADMIN / ADMIN. Un doctor real no necesita esto (su portal se
 * resuelve por su propio email) y `getSessionProvider` ignora la cookie cuando
 * el usuario tiene perfil propio — pero igual se valida acá: el acceso al
 * portal de otro médico queda auditado, no es una preferencia de UI cualquiera.
 */

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

async function requireAdmin(): Promise<{ email: string } | null> {
  const user = await getSessionUser();
  if (!user?.email) return null;
  const role = await fetchDbRole(user.email);
  return ADMIN_ROLES.has(role) ? { email: user.email } : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  let providerId: unknown;
  try {
    ({ providerId } = (await req.json()) as { providerId?: unknown });
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (typeof providerId !== 'string' || !providerId) {
    return NextResponse.json({ error: 'INVALID_PROVIDER' }, { status: 400 });
  }

  const provider = await db.provider.findFirst({
    where: { id: providerId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!provider) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  (await cookies()).set(DOCTOR_VIEW_COOKIE, provider.id, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // una jornada
  });

  writeAuditLog(db, {
    ...actorFromHeaders(req.headers),
    action: 'DOCTOR_VIEW_AS',
    entityType: 'providers',
    entityId: provider.id,
    metadata: { admin: admin.email, doctor: provider.email },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, provider: { id: provider.id, firstName: provider.firstName, lastName: provider.lastName } });
}

export async function DELETE(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  (await cookies()).delete(DOCTOR_VIEW_COOKIE);
  return NextResponse.json({ ok: true });
}
