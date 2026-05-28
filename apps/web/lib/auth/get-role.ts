import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/server';
import { dbRoleToRole } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

/**
 * Server-side helper: resolves current user's role from DB.
 * Call from any server component or page that needs the role.
 * Returns 'employee' as safe default if user not found.
 */
export async function getCurrentUserRole(): Promise<Role> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return 'employee';

    const admin = createAdminClient();
    const { data } = await admin
      .from('users')
      .select('role')
      .eq('email', user.email)
      .single();

    return dbRoleToRole(data?.role ?? 'EMPLOYEE');
  } catch {
    return 'employee';
  }
}
