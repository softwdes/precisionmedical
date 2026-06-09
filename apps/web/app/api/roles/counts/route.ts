import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/server';

/**
 * GET /api/roles/counts
 * Returns user count per role, keyed by lowercase role name.
 * e.g. { super_admin: 2, employee: 9, admin: 1, ... }
 */

const DB_TO_ROLE: Record<string, string> = {
  SUPER_ADMIN: 'super_admin',
  ADMIN:       'admin',
  CONTADOR:    'contador',
  EMPLOYEE:    'employee',
  LAWYER:      'lawyer',
  PROVIDER:    'provider',
  AUDITOR_AI:  'ia_auditor',
};

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('role');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts: Record<string, number> = {};
  (data ?? []).forEach(row => {
    const role = DB_TO_ROLE[row.role as string];
    if (role) counts[role] = (counts[role] ?? 0) + 1;
  });

  return NextResponse.json(counts);
}
