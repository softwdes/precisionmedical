'use client';

import { useSessionGuard } from '@/lib/useSessionGuard';

/**
 * Drop-in <SessionGuard /> for layouts.tsx (server components).
 * Renders nothing — only attaches the session-age watcher hook.
 * Default cap: 12h since the user last logged in.
 */
export function SessionGuard({ maxAgeHours = 12 }: { maxAgeHours?: number }): null {
  useSessionGuard(maxAgeHours);
  return null;
}
