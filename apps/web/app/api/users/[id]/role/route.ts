import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/server';
import { dbRoleToRole, roleToDbRole } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

const ALLOWED_ROLES: Role[] = [
  'super_admin', 'admin', 'contador', 'employee', 'lawyer', 'provider', 'ia_auditor',
];

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

  // Convert internal role to DB value
  const dbRole = roleToDbRole(body.role as Role);

  // Update
  const { error } = await admin
    .from('users')
    .update({ role: dbRole, updatedAt: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, role: body.role });
}
