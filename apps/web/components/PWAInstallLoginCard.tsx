'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { Download, Info, Loader2, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/lib/use-pwa-install';
import { toast } from 'sonner';

// How long we keep showing the "Preparando..." spinner before
// concluding that Chrome won't fire beforeinstallprompt anytime soon
// (PWA already installed elsewhere, criteria not met, etc) and
// switching to honest manual-path messaging instead.
const PREPARING_TIMEOUT_MS = 12_000;

/**
 * Prominent install card shown on the login page on mobile devices.
 *
 * Unlike the floating banner (which appears post-login only when
 * Chrome has captured beforeinstallprompt), this card ALWAYS renders
 * on mobile because the login page is the right moment to ask: the
 * user is committing to using the app and won't be deeper in flow.
 *
 * Three render paths:
 *   - Android Chrome with captured event → "Instalar" button that
 *     triggers the native dialog directly.
 *   - Android Chrome without event yet (first visit, low engagement)
 *     → instructions to use Menu ⋮ → Install app. Without this
 *     fallback the user sees nothing on the login screen when Chrome
 *     hasn't fired beforeinstallprompt yet.
 *   - iOS Safari → manual instructions (Share → Add to Home Screen);
 *     iOS has no programmatic install API.
 *
 * Visual language is unified with the login form card and the floating
 * post-login banner: dark glass + indigo→violet→cyan gradient border +
 * boxShadow halo.
 */
export function PWAInstallLoginCard(): React.ReactElement | null {
  // ─── All hooks MUST be declared before any early return ──────────
  // React's Rules of Hooks: hook order must be identical across every
  // render of the same component. Returning null before useState/
  // useEffect would change the hook count and crash.
  const { event, platform, standalone, dismissedRecently, install, dismiss } = usePWAInstall();
  const isIos = platform === 'ios';

  // Stops the "Preparando instalación..." spinner from looping forever
  // if Chrome never fires beforeinstallprompt on this device.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (isIos) return;              // iOS has no event ever; not relevant
    if (event) { setStalled(false); return; } // Real button shown — no need to time out
    const id = setTimeout(() => setStalled(true), PREPARING_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [event, isIos]);

  // ─── Visibility gate (safe to early-return AFTER hooks) ──────────
  if (platform !== 'android' && platform !== 'ios') return null;
  if (standalone) return null;
  if (dismissedRecently) return null;

  /**
   * Only ever called when the gradient button is visible, and that
   * only happens when Chrome has captured beforeinstallprompt. So the
   * 'unavailable' branch is defensive only — in practice we shouldn't
   * see it from this UI.
   */
  const handleInstall = async (): Promise<void> => {
    const outcome = await install();
    if (outcome === 'accepted') {
      toast.success('LM Admin instalado');
    } else if (outcome === 'dismissed') {
      dismiss();
    }
  };

  return (
    <div
      role="region"
      aria-label="Instalar LM Admin"
      style={{
        position: 'relative',
        zIndex: 2,
        width: 420,
        maxWidth: '90vw',
        // Tight spacing under the security pills. The pills themselves
        // have marginTop: 1.75rem from the form card; this card sits
        // close to them so it lands above the fold on mobile.
        marginTop: '0.75rem',
        animation: 'fadeUp 500ms 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Gradient border layer — same pattern as the login form card,
          giving visual coherence with the rest of the login screen. */}
      <div
        style={{
          position: 'absolute',
          top: -1, left: -1, right: -1, bottom: -1,
          borderRadius: 15,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.45), rgba(139,92,246,0.20) 50%, rgba(6,182,212,0.32) 100%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Card inner */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          background: 'linear-gradient(135deg, rgba(10,14,26,0.96), rgba(15,20,38,0.96))',
          borderRadius: 14,
          padding: '14px 16px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          boxShadow: '0 12px 36px rgba(0,0,0,0.40), 0 0 28px rgba(99,102,241,0.18)',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'rgba(99,102,241,0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
            boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.25)',
          }}
        >
          {isIos
            ? <Share size={17} color="#A5B4FC" />
            : <Smartphone size={17} color="#A5B4FC" />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#C7D2FE',
              margin: 0,
              letterSpacing: '0.01em',
            }}
          >
            {isIos ? 'Instala LM Admin en tu iPhone' : 'Instala LM Admin en tu Android'}
          </p>

          <p style={{ fontSize: 11.5, color: '#8B95B5', marginTop: 5, lineHeight: 1.5 }}>
            {isIos
              ? 'Para instalar en iPhone, abre esta página en Safari, toca el botón Compartir ↑ y selecciona «Añadir a inicio».'
              : 'Acceso rápido desde tu pantalla de inicio sin abrir Chrome cada vez.'}
          </p>

          {/*
            Three render states for the action area:
            - Android with captured event: real "Instalar" button that
              triggers the native install dialog one-tap.
            - Android WITHOUT captured event yet: subtle "Preparando..."
              indicator with a spinner — no fake button. Chrome decides
              when to fire beforeinstallprompt; we cannot force it. As
              soon as it does, this re-renders into the real button.
            - iOS: no action area (Safari has no install API; the body
              text above already carries the instructions).
          */}
          {!isIos && event ? (
            // Happy path: Chrome captured the event. One-tap install.
            <button
              onClick={() => void handleInstall()}
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
                letterSpacing: '0.01em',
              }}
            >
              <Download size={12} />
              Instalar
            </button>
          ) : !isIos && !stalled ? (
            // Waiting state: Chrome is still evaluating. Quiet spinner —
            // not styled like a button to avoid misleading taps.
            <div
              style={{
                marginTop: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11,
                color: '#6B7592',
                fontStyle: 'italic',
              }}
            >
              <Loader2 size={12} style={{ animation: 'pmPwaSpin 1s linear infinite' }} />
              Preparando instalación...
              <style>{`@keyframes pmPwaSpin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : !isIos ? (
            // Stalled state: Chrome won't fire the event soon. Be honest
            // and point the user to the manual path with a clearly-info
            // (not button) visual treatment.
            <div
              style={{
                marginTop: 10,
                padding: '8px 11px',
                borderRadius: 8,
                background: 'rgba(99,102,241,0.07)',
                border: '1px dashed rgba(99,102,241,0.28)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <Info size={13} color="#818CF8" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: '#8B95B5', lineHeight: 1.5, margin: 0 }}>
                Chrome aún no detecta esta app como instalable. Abre el menú
                <strong style={{ color: '#A5B4FC' }}> ⋮ </strong>
                arriba a la derecha y toca
                <strong style={{ color: '#A5B4FC' }}> «Instalar app»</strong>
                o
                <strong style={{ color: '#A5B4FC' }}> «Añadir a pantalla de inicio»</strong>.
              </p>
            </div>
          ) : null}
        </div>

        <button
          onClick={dismiss}
          aria-label="Cerrar"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#4A5474',
            cursor: 'pointer',
            padding: 4,
            flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
