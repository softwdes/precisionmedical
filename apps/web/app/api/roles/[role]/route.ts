import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/server';
import { dbRoleToRole } from '@/lib/permissions';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ role: string }> },
): Promise<NextResponse> {
  // Auth check
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Permission check: only super_admin
  const admin = createAdminClient();
  const { data: caller } = await admin
    .from('users')
    .select('role')
    .eq('email', user.email!)
    .single();

  const callerRole = dbRoleToRole(caller?.role ?? 'EMPLOYEE');
  if (callerRole !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { role } = await params;

  // Cannot edit system roles
  const { data: existing } = await admin
    .from('roles_config')
    .select('is_system')
    .eq('role', role)
    .single();

  if (existing?.is_system) {
    return NextResponse.json({ error: 'System roles cannot be edited' }, { status: 400 });
  }

  let body: { permissions: Record<string, unknown> };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { error } = await admin
    .from('roles_config')
    .update({ permissions: body.permissions })
    .eq('role', role);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
