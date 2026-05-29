'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { useT } from '@/lib/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'android' | 'ios' | 'desktop' | 'unknown';

const DISMISS_KEY = 'pmtc-pwa-install-dismissed';
// Re-prompt one week after dismissal. Daily-use app — keeps the
// reminder gentle but not spammy.
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari exposes standalone differently from the spec
  const navWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return navWithStandalone.standalone === true;
}

function wasDismissedRecently(): boolean {
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

/**
 * Banner that prompts the user to install the PWA.
 *
 * Behavior:
 * - Android Chrome: captures `beforeinstallprompt`, shows a button that
 *   triggers the native install dialog when tapped.
 * - iOS Safari: shows manual instructions (Share → Add to Home Screen)
 *   because iOS doesn't expose an install API.
 * - Desktop: hidden by design — Time Clock is a phone-first app.
 * - Already installed: hidden (detected via display-mode: standalone).
 * - Dismissed: hidden for 7 days, then reappears.
 */
export function InstallPWABanner(): React.ReactElement | null {
  const { t } = useT();
  // Start hidden to avoid SSR flash; the effect decides whether to show.
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isStandalone()) return;           // already installed
    if (wasDismissedRecently()) return;   // user said no recently

    const p = detectPlatform();
    setPlatform(p);

    if (p === 'desktop' || p === 'unknown') return;

    // iOS: no install API; we just render instructions immediately.
    if (p === 'ios') {
      setVisible(true);
      return;
    }

    // Android: wait for beforeinstallprompt. Chrome fires this only when
    // installability criteria are met (manifest + active SW + engagement).
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // localStorage may be blocked in incognito iOS Safari etc.
      // No big deal — the banner just reappears next reload.
    }
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    // Whether accepted or dismissed, the event can only be used once.
    setDeferredPrompt(null);
    if (choice.outcome === 'accepted') {
      // appinstalled listener will hide the banner.
    } else {
      dismiss();
    }
  }

  if (!visible) return null;

  const isIos = platform === 'ios';

  return (
    <div
      role="region"
      aria-label={t.pwaInstallTitle}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 360,
        zIndex: 2,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
        border: '1px solid rgba(99,102,241,0.30)',
        boxShadow: '0 0 24px rgba(99,102,241,0.15)',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: 'rgba(99,102,241,0.20)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {isIos ? <Share size={16} color="#818CF8" /> : <Download size={16} color="#818CF8" />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#A5B4FC',
            margin: 0,
            letterSpacing: '0.01em',
          }}
        >
          {isIos ? t.pwaIosTitle : t.pwaInstallTitle}
        </p>
        <p
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 4,
            lineHeight: 1.45,
          }}
        >
          {isIos ? t.pwaIosBody : t.pwaInstallBody}
        </p>

        {!isIos && (
          <button
            onClick={install}
            style={{
              marginTop: 10,
              padding: '7px 14px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              color: 'white',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(99,102,241,0.40)',
            }}
          >
            <Download size={12} />
            {t.pwaInstallButton}
          </button>
        )}
      </div>

      <button
        onClick={dismiss}
        aria-label={t.pwaInstallDismiss}
        style={{
          background: 'none',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          color: 'var(--text-muted)',
          opacity: 0.6,
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
