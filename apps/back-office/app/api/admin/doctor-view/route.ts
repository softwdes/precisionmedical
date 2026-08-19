import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { db, writeAuditLog } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { fetchDbRole, fetchUserClinicModules } from '@precision-medical/auth/v2-apps';
import {
  DOCTOR_VIEW_COOKIE,
  DOCTOR_VIEW_MODULE,
  canViewAsDoctor,
  getDoctorViewInfo,
  getSessionProvider,
} from '@/lib/get-session-provider';
import { resolveActor } from '@/lib/actor';

/**
 * GET /api/admin/doctor-view                    → qué resuelve el server para mí
 * POST /api/admin/doctor-view   { providerId }  → fija el doctor a "ver como"
 * DELETE /api/admin/doctor-view                 → limpia la selección
 *
 * Requiere la capacidad "ver como doctor" (`canViewAsDoctor`): admins por rol,
 * el resto por la marca "Portal Médico" de su ficha. Un doctor real no necesita
 * esto (su portal se resuelve por su propio email) y `getSessionProvider` ignora
 * la cookie cuando el usuario tiene perfil propio — pero igual se valida acá: el
 * middleware no cubre `/api/*`, así que esta ruta es su propia puerta.
 */

async function requireDoctorView(): Promise<{ email: string } | null> {
  const user = await getSessionUser();
  if (!user?.email) return null;
  return (await canViewAsDoctor(user.email)) ? { email: user.email } : null;
}

/**
 * Por qué el selector de doctor aparece o no.
 *
 * La capacidad se arma con dos datos que viven en el proyecto Admin (el rol y
 * `clinicModules`) y se resuelven por HTTP. Cuando alguno no llega, el portal se
 * limita en silencio: `fetchDbRole` devuelve 'EMPLOYEE' si la llamada falla, y
 * desde ahí un admin queda sin capacidad sin que nada lo diga en pantalla. Eso
 * es imposible de diagnosticar mirando la UI — por eso esta vista.
 *
 * No expone nada que el dueño de la sesión no pueda ver de sí mismo: su email,
 * su rol, sus módulos y el resultado de las dos preguntas del portal.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 });

  const [role, modules, capacidad, viewInfo, provider] = await Promise.all([
    fetchDbRole(user.email),
    fetchUserClinicModules(user.email),
    canViewAsDoctor(user.email),
    getDoctorViewInfo(),
    getSessionProvider(),
  ]);

  return NextResponse.json({
    email: user.email,
    rolSegunFetchDbRole: role,
    clinicModules: modules,
    moduloDoctor: modules?.[DOCTOR_VIEW_MODULE] ?? null,
    canViewAsDoctor: capacidad,
    // Lo que consume el layout para decidir si dibuja la barra
    canSelect: viewInfo.canSelect,
    isViewAs: viewInfo.isViewAs,
    hasOwnProfile: viewInfo.hasOwnProfile,
    canReturnToAdmin: viewInfo.canReturnToAdmin,
    doctoresEnElSelector: viewInfo.options.length,
    portalResueltoComo: provider ? `${provider.firstName} ${provider.lastName}` : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await requireDoctorView();
  if (!actor) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

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
    ...(await resolveActor(req.headers)),
    action: 'DOCTOR_VIEW_AS',
    entityType: 'providers',
    entityId: provider.id,
    metadata: { viewer: actor.email, doctor: provider.email },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, provider: { id: provider.id, firstName: provider.firstName, lastName: provider.lastName } });
}

export async function DELETE(): Promise<NextResponse> {
  const actor = await requireDoctorView();
  if (!actor) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  (await cookies()).delete(DOCTOR_VIEW_COOKIE);
  return NextResponse.json({ ok: true });
}
