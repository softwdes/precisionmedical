import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/server';
import { ALL_ROLES, dbRoleToRole, roleToDbRole } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

/**
 * Los roles aceptados salen de `ALL_ROLES` — la misma lista que pinta el select
 * de la tabla de usuarios. Cuando estaba duplicada acá a mano le faltaba
 * `doctor`: el select lo ofrecía y el guardado moría con "Invalid role".
 */
const ALLOWED_ROLES: readonly Role[] = ALL_ROLES;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Auth check
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Permission check: only super_admin can change roles
  const admin = createAdminClient();
  const { data: caller } = await admin
    .from('users')
    .select('role, id')
    .eq('email', user.email!)
    .single();

  const callerRole = dbRoleToRole(caller?.role ?? 'EMPLOYEE');
  if (callerRole !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  // Parse body
  let body: { role: string };
  try { body = await req.json() as { role: string }; }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!ALLOWED_ROLES.includes(body.role as Role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Cannot change own role
  if (caller?.id === id) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
  }

  // El rol anterior se lee ANTES del update: es lo único que responde "de qué a
  // qué" en el audit log, y después del update ya no existe en ninguna parte.
  const { data: target } = await admin
    .from('users')
    .select('role, email')
    .eq('id', id)
    .single();

  // Convert internal role to DB value
  const dbRole = roleToDbRole(body.role as Role);

  // Update
  const { error } = await admin
    .from('users')
    .update({ role: dbRole, updatedAt: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cambiar un rol reparte o quita accesos: tiene que dejar rastro igual que el
  // diálogo de edición (`users.update` en tRPC), que ya escribía su log. El
  // fallo al registrar no revierte el cambio —ya está hecho— pero se anota.
  // El `id` va a mano: `@default(cuid())` lo genera Prisma en el cliente y el
  // schema se aplicó con `db push`, así que en la DB la columna es `text NOT
  // NULL` sin default. Omitirlo hacía fallar el insert siempre.
  const { error: logError } = await admin.from('audit_logs').insert({
    id: randomUUID(),
    actorUserId: caller?.id ?? null,
    actorRole: caller?.role ?? null,
    action: 'user.role_changed',
    entityType: 'User',
    entityId: id,
    before: { role: target?.role ?? null },
    after: { role: dbRole, email: target?.email ?? null },
    createdAt: new Date().toISOString(),
  });
  if (logError) console.error('[users.role] audit log failed:', logError.message);

  return NextResponse.json({ success: true, role: body.role });
}
