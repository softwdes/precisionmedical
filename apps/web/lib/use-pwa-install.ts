'use client';

import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform = 'android' | 'ios' | 'desktop' | 'unknown';

const DISMISS_KEY = 'lm-pwa-install-dismissed';
// Re-prompt 7 days after dismissal. Gentle reminder without spamming.
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Singleton state ──────────────────────────────────────────────────
// We register ONE beforeinstallprompt listener at module load and fan
// the event out to any number of React subscribers. Without this, every
// instance of usePWAInstall would race for the same one-shot event and
// only the lucky one would get it.
let cachedEvent: BeforeInstallPromptEvent | null = null;
let installed = false;
type Listener = (state: { event: BeforeInstallPromptEvent | null; installed: boolean }) => void;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l({ event: cachedEvent, installed });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedEvent = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    cachedEvent = null;
    notify();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  const navWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return navWithStandalone.standalone === true;
}

export function wasDismissedRecently(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage may be blocked in private mode — banner just reappears next reload
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────

export interface UsePWAInstallState {
  /** The captured beforeinstallprompt event, or null if not (yet) fired. */
  event: BeforeInstallPromptEvent | null;
  /** True once the user accepted the install (via appinstalled). */
  installed: boolean;
  /** Detected at first call; stable through component lifetime. */
  platform: Platform;
  /** True when the app is running as an installed PWA. */
  standalone: boolean;
  /** True when the user dismissed the banner < TTL ago. */
  dismissedRecently: boolean;
  /** Trigger native install dialog (Android). Resolves after user choice. */
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  /** Record a dismissal — banner hides for 7 days. */
  dismiss: () => void;
}

export function usePWAInstall(): UsePWAInstallState {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(cachedEvent);
  const [hasInstalled, setHasInstalled] = useState(installed);
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [standalone, setStandalone] = useState(true);          // assume installed pre-mount → no flash
  const [dismissedRecently, setDismissedRecently] = useState(true);

  useEffect(() => {
    setPlatform(detectPlatform());
    setStandalone(isStandalone());
    setDismissedRecently(wasDismissedRecently());

    const listener: Listener = (state) => {
      setEvent(state.event);
      setHasInstalled(state.installed);
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return {
    event,
    installed: hasInstalled,
    platform,
    standalone,
    dismissedRecently,
    install: async () => {
      if (!cachedEvent) return 'unavailable';
      await cachedEvent.prompt();
      const choice = await cachedEvent.userChoice;
      // The event is one-shot. Whatever the outcome, consume it.
      cachedEvent = null;
      notify();
      return choice.outcome;
    },
    dismiss: () => {
      markDismissed();
      setDismissedRecently(true);
    },
  };
}
