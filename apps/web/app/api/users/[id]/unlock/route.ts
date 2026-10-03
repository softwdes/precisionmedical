import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { unlockAccount } from '@precision-medical/auth/lockout';
import { dbRoleToRole } from '@/lib/permissions';

/**
 * POST /api/users/[id]/unlock — levanta el candado de una cuenta.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Desde el 2026-10-03 son 3 contraseñas erradas y la cuenta queda cerrada hasta
 * la medianoche. Hasta hoy **no había forma de levantarlo**: ni pantalla ni
 * endpoint. La única salida era esperar o acertar la contraseña — imposible
 * justamente cuando el problema es que no te la acordás.
 *
 * O sea que alguien que se trababa a las 8 de la mañana perdía el día entero, y
 * el contador es compartido por las cinco apps: se quedaba afuera de todas.
 *
 * ── Quién puede ─────────────────────────────────────────────────────────────
 *
 * `super_admin` y `admin`. Se usa el MISMO patrón de guardia que
 * `users/[id]/role`: sesión válida, y el rol se lee de la tabla, no del token.
 *
 * `role` lo reserva solo para `super_admin` porque cambiar un rol es un cambio
 * de poder permanente. Desbloquear no otorga nada: devuelve a la persona al
 * estado en el que ya estaba y no cambia su contraseña. Encerrar esta acción en
 * una sola persona haría que un lunes a las 8 de la mañana todos esperen a que
 * esa persona conteste el teléfono — que es exactamente el problema que vino a
 * resolver.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: quienLlama } = await admin
    .from('users').select('id, role').eq('email', user.email).single();

  const rol = dbRoleToRole(quienLlama?.role ?? 'EMPLOYEE');
  if (rol !== 'super_admin' && rol !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  // El candado se busca POR CORREO —es la llave que comparten las cinco apps—,
  // así que hay que resolverlo desde el id que manda la pantalla.
  const { data: objetivo } = await admin
    .from('users').select('email').eq('id', id).single();
  if (!objetivo?.email) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined;

  // Queda asentado QUIÉN desbloqueó a quién: el actor es el que llama, no el
  // desbloqueado.
  const ok = await unlockAccount(objetivo.email, quienLlama!.id as string, ip);
  if (!ok) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
