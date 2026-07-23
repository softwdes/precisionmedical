'use client';

import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform = 'android' | 'ios' | 'desktop' | 'unknown';

const DISMISS_KEY = 'bo-pwa-install-dismissed';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Singleton — one listener, many subscribers ───────────────────────
let cachedEvent: BeforeInstallPromptEvent | null = null;
let installed = false;
type Listener = (state: { event: BeforeInstallPromptEvent | null; installed: boolean }) => void;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l({ event: cachedEvent, installed });
}

if (typeof window !== 'undefined') {
  // Pick up event captured by the inline script before React hydrated
  const early = (window as { __pwaPrompt?: BeforeInstallPromptEvent }).__pwaPrompt;
  if (early) cachedEvent = early;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedEvent = e as BeforeInstallPromptEvent;
    (window as { __pwaPrompt?: BeforeInstallPromptEvent }).__pwaPrompt = cachedEvent;
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
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
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
    // localStorage may be blocked in private mode
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────

export interface UsePWAInstallState {
  event: BeforeInstallPromptEvent | null;
  installed: boolean;
  platform: Platform;
  standalone: boolean;
  dismissedRecently: boolean;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismiss: () => void;
}

export function usePWAInstall(): UsePWAInstallState {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(cachedEvent);
  const [hasInstalled, setHasInstalled] = useState(installed);
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [standalone, setStandalone] = useState(true);
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
