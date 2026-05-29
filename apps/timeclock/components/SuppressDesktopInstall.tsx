'use client';

import { useEffect } from 'react';

/**
 * Suppresses Chrome/Edge's automatic PWA install prompt on desktop
 * (the "Install" icon in the address bar / mini-banner). On mobile
 * (Android/iOS) we let the native prompt behave normally — that's
 * where Time Clock is meant to be installed.
 *
 * If you ever want PWA install on desktop too, simply remove this
 * component from layout.tsx.
 */
export function SuppressDesktopInstall(): null {
  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    // Heuristic for touch-first devices. Catches phones + tablets
    // (iPads, large Android tablets) — both legitimate Time Clock
    // targets. Desktop / laptop browsers fall through and get the
    // prompt suppressed.
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) return;

    const handler = (e: Event) => {
      e.preventDefault();
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  return null;
}
