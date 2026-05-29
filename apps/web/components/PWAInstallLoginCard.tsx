'use client';

import * as React from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/lib/use-pwa-install';
import { toast } from 'sonner';

/**
 * Prominent install card shown on the login page on mobile devices.
 *
 * Two render paths only (mirrors the timeclock InstallPWABanner so
 * both apps feel identical):
 *   - Android Chrome with captured beforeinstallprompt event →
 *     "Instalar" button that triggers the native dialog directly.
 *   - iOS Safari → manual instructions (Share → Add to Home Screen)
 *     because iOS has no programmatic install API.
 *
 * Android without a captured event yet is INTENTIONALLY hidden:
 * showing manual menu instructions was confusing users who expected
 * the same one-tap button they see in timeclock. The card reappears
 * automatically once Chrome fires the event (usually within seconds
 * of interaction on the login form).
 *
 * Visual language is unified with the login form card and the floating
 * post-login banner: dark glass + indigo→violet→cyan gradient border +
 * boxShadow halo.
 */
export function PWAInstallLoginCard(): React.ReactElement | null {
  const { event, platform, standalone, dismissedRecently, install, dismiss } = usePWAInstall();

  if (standalone) return null;
  if (dismissedRecently) return null;

  const isIos = platform === 'ios';
  const isAndroidWithEvent = platform === 'android' && event !== null;

  // Hide unless we can offer an actionable install path.
  if (!isIos && !isAndroidWithEvent) return null;

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
        marginTop: '1.25rem',
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

          {isIos ? (
            <p style={{ fontSize: 11.5, color: '#8B95B5', marginTop: 5, lineHeight: 1.5 }}>
              Toca el botón <strong style={{ color: '#A5B4FC' }}>Compartir</strong> abajo
              (cuadrado con flecha ↑) y selecciona <strong style={{ color: '#A5B4FC' }}>«Añadir a inicio»</strong>.
              Así no dejas la sesión abierta en el navegador.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 11.5, color: '#8B95B5', marginTop: 5, lineHeight: 1.5 }}>
                Acceso rápido desde tu pantalla de inicio sin abrir Chrome cada vez.
              </p>
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
                }}
              >
                <Download size={12} />
                Instalar
              </button>
            </>
          )}
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
