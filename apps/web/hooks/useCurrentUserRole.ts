'use client';

import { useRole } from '@/contexts/role-context';
import type { Role } from '@/lib/permissions';

/**
 * Returns the current user's role from context (set by the admin layout).
 * Usage: const role = useCurrentUserRole()
 */
export function useCurrentUserRole(): Role {
  return useRole();
}
