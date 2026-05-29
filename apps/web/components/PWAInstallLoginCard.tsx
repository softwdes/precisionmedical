'use client';

import * as React from 'react';
import { Download, MoreVertical, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/lib/use-pwa-install';
import { toast } from 'sonner';

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
  const { event, platform, standalone, dismissedRecently, install, dismiss } = usePWAInstall();

  if (platform !== 'android' && platform !== 'ios') return null;
  if (standalone) return null;
  if (dismissedRecently) return null;

  const isIos = platform === 'ios';

  /**
   * Single click handler for all three render states. Outcomes:
   *   - accepted   → user installed via native dialog
   *   - dismissed  → user rejected the native dialog; respect for 7 days
   *   - unavailable → either iOS (no install API ever) or Android where
   *                   Chrome hasn't fired beforeinstallprompt yet. We
   *                   show a platform-aware toast pointing to the manual
   *                   path so the user always gets feedback on tap.
   */
  const handleInstall = async (): Promise<void> => {
    const outcome = await install();
    if (outcome === 'accepted') {
      toast.success('LM Admin instalado');
    } else if (outcome === 'dismissed') {
      dismiss();
    } else if (outcome === 'unavailable') {
      if (isIos) {
        toast.info('Toca el botón Compartir ↑ abajo en Safari y selecciona «Añadir a inicio».');
      } else {
        toast.info('Toca el menú ⋮ de Chrome arriba y selecciona «Instalar app».');
      }
    }
  };

  // Picks the right icon + label per state, but they all share the
  // same gradient button shell below. Keeps the visual story uniform.
  const cta = isIos
    ? { Icon: Share, label: 'Compartir ↑ → Añadir a inicio' }
    : event
      ? { Icon: Download, label: 'Instalar' }
      : { Icon: MoreVertical, label: 'Menú ⋮ → Instalar app' };

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
              ? 'Así no dejas la sesión abierta en el navegador y abres la app directo desde tu inicio.'
              : 'Acceso rápido desde tu pantalla de inicio sin abrir Chrome cada vez.'}
          </p>

          {/* Single CTA button. Always clickable so the user gets
              feedback on tap. handleInstall picks the right behavior:
              triggers native install if Chrome captured the event,
              otherwise shows a toast with the manual path. */}
          <button
            onClick={() => void handleInstall()}
            style={{
              marginTop: 10,
              padding: '7px 12px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              color: 'white',
              fontSize: 11.5,
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
            <cta.Icon size={12} />
            {cta.label}
          </button>
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
