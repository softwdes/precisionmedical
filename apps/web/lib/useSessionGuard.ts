'use client';

import { useEffect } from 'react';
import { createClient as createBrowserClient } from '@precision-medical/auth/client';

/**
 * Storage key holding the millisecond timestamp at which the current
 * session began. Cleared on manual logout and on auto-expire.
 *
 * Same key name as in apps/timeclock so they stay symmetric — but
 * localStorage is scoped per-origin, so there's no cross-talk between
 * admin.lienmaster.net and pmtc.lienmaster.net.
 */
export const SESSION_STARTED_KEY = 'pm-session-started-at';

/** Call this from manual logout handlers BEFORE signOut to keep the
 *  next login session timing clean. */
export function clearSessionGuard(): void {
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem(SESSION_STARTED_KEY); } catch { /* incognito */ }
  }
}

/**
 * Forces sign-out + redirect to `/login?expired=true` once the current
 * session has lived longer than `maxAgeHours` (default 12). Checked at
 * mount and every minute thereafter.
 *
 * Honest scope: client-side only. Effective against the common case
 * (real users on real browsers). The Supabase JWT expiry config is a
 * separate dial on their dashboard if defense-in-depth is needed.
 */
export function useSessionGuard(maxAgeHours = 12): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const maxAgeMs = maxAgeHours * 3_600_000;

    let started: number;
    try {
      const existing = localStorage.getItem(SESSION_STARTED_KEY);
      const parsed = existing ? Number(existing) : NaN;
      // Defense in depth: si el timestamp guardado YA esta expirado, viene
      // de una sesion anterior cuyo cleanup nunca corrio (cookie/JWT murio
      // antes de que el SessionGuard cliente alcanzara a limpiar). La sesion
      // actual es legitima — el server ya valido la cookie — asi que
      // reseteamos el contador en vez de botar al usuario que recien entro.
      const isStale = !isNaN(parsed) && (Date.now() - parsed) >= maxAgeMs;
      if (!isNaN(parsed) && !isStale) {
        started = parsed;
      } else {
        started = Date.now();
        localStorage.setItem(SESSION_STARTED_KEY, String(started));
      }
    } catch {
      started = Date.now();
    }

    const supabase = createBrowserClient();

    async function check(): Promise<void> {
      const age = Date.now() - started;
      if (age < maxAgeMs) return;
      clearSessionGuard();
      try { await supabase.auth.signOut(); } catch { /* still redirect */ }
      window.location.href = '/login?expired=true';
    }

    void check();
    const intervalId = setInterval(() => void check(), 60_000);
    return () => clearInterval(intervalId);
  }, [maxAgeHours]);
}
