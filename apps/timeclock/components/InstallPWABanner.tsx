'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X, ExternalLink } from 'lucide-react';
import { useT } from '@/lib/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'android' | 'ios-safari' | 'ios-webview' | 'desktop' | 'unknown';

const DISMISS_KEY = 'pmtc-pwa-install-dismissed';
// Re-prompt one week after dismissal. Daily-use app — keeps the
// reminder gentle but not spammy.
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);

  if (isIOS) {
    // Known in-app browsers / WebViews on iOS. None of them expose
    // "Add to Home Screen" — Apple restricts that to Safari proper.
    const inAppBrowsers = /FBAN|FBAV|Instagram|Twitter|Line|MicroMessenger|WhatsApp|LinkedIn|GSA\//;
    if (inAppBrowsers.test(ua)) return 'ios-webview';
    // Safari proper exposes "Safari/X.Y" in the UA. WebKit-based
    // WebViews omit this token, which is the standard fingerprint
    // used to distinguish them. (Chrome on iOS includes "CriOS"
    // and also lacks Safari/X — same behavior, no install API.)
    if (!/Safari\//.test(ua) || /CriOS|FxiOS|EdgiOS/.test(ua)) return 'ios-webview';
    return 'ios-safari';
  }

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

    // iOS Safari + iOS WebView: no install API exists. We just render
    // the appropriate instructions immediately and let the user follow
    // them manually.
    if (p === 'ios-safari' || p === 'ios-webview') {
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

  const isAndroid    = platform === 'android';
  const isIosSafari  = platform === 'ios-safari';
  const isIosWebView = platform === 'ios-webview';

  // Title + leading icon per scenario
  const title =
    isIosWebView ? t.pwaIosWebViewTitle :
    isIosSafari  ? t.pwaIosTitle :
                   t.pwaInstallTitle;

  const LeadingIcon =
    isIosWebView ? <ExternalLink size={16} color="#F87171" /> :
    isIosSafari  ? <Share size={16} color="#818CF8" /> :
                   <Download size={16} color="#818CF8" />;

  // Border color hint: rose for WebView (warning), indigo for normal flows
  const accentBorder = isIosWebView ? 'rgba(244,63,94,0.30)' : 'rgba(99,102,241,0.30)';
  const accentGlow   = isIosWebView ? 'rgba(244,63,94,0.15)' : 'rgba(99,102,241,0.15)';
  const accentBg     = isIosWebView ? 'rgba(244,63,94,0.18)' : 'rgba(99,102,241,0.20)';
  const titleColor   = isIosWebView ? '#FCA5A5' : '#A5B4FC';

  return (
    <div
      role="region"
      aria-label={title}
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
        border: `1px solid ${accentBorder}`,
        boxShadow: `0 0 24px ${accentGlow}`,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: accentBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {LeadingIcon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: titleColor,
            margin: 0,
            letterSpacing: '0.01em',
          }}
        >
          {title}
        </p>

        {/* WebView: instructional text only */}
        {isIosWebView && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>
            {t.pwaIosWebViewBody}
          </p>
        )}

        {/* Android: 1-liner + Install button */}
        {isAndroid && (
          <>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>
              {t.pwaInstallBody}
            </p>
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
          </>
        )}

        {/* iOS Safari: numbered steps with visual Share icon */}
        {isIosSafari && (
          <>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginBottom: 8, lineHeight: 1.45 }}>
              {t.pwaIosBody}
            </p>
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <IosStep n={1} text={t.pwaIosStep1}>
                {/* iOS Share glyph: square w/ arrow up */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </IosStep>
              <IosStep n={2} text={t.pwaIosStep2} />
              <IosStep n={3} text={t.pwaIosStep3} />
            </ol>
          </>
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

/** A single numbered step inline-rendered with circular badge + text + optional inline icon. */
function IosStep({ n, text, children }: { n: number; text: string; children?: React.ReactNode }): React.ReactElement {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
      <span
        aria-hidden
        style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(99,102,241,0.18)',
          color: '#A5B4FC',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 600,
        }}
      >
        {n}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap' }}>
        {text}
        {children}
      </span>
    </li>
  );
}
