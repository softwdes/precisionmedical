'use client';

import * as React from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/lib/use-pwa-install';
import { toast } from 'sonner';

/**
 * Prominent install card shown on the login page on mobile devices.
 *
 * Decision after multiple iterations: ONE pretty gradient button is
 * always visible. The user wanted a consistent, attractive CTA — not
 * conditional spinners, callouts, or info boxes that look different
 * each time they reload. So the button is always there.
 *
 * The button's BEHAVIOR adapts based on what's available:
 *   - Android Chrome with captured beforeinstallprompt → one-tap
 *     native install dialog. The happy path.
 *   - Android Chrome without event → toast with menu instructions.
 *     We can't bypass Chrome's security here; the toast is the
 *     honest fallback. After repeated install/uninstall cycles
 *     Chrome enters a cooldown and won't fire the event again for
 *     up to ~90 days.
 *   - iOS Safari → toast with Share → Add to Home Screen steps.
 *     iOS has no install API ever.
 */
export function PWAInstallLoginCard(): React.ReactElement | null {
  const { event, platform, standalone, dismissedRecently, install, dismiss } = usePWAInstall();

  if (platform !== 'android' && platform !== 'ios') return null;
  if (standalone) return null;
  if (dismissedRecently) return null;

  const isIos = platform === 'ios';

  const handleClick = async (): Promise<void> => {
    if (isIos) {
      toast.info(
        'En Safari: toca el botón Compartir ↑ (cuadrado con flecha) y selecciona «Añadir a inicio».',
        { duration: 8000 },
      );
      return;
    }

    const outcome = await install();
    if (outcome === 'accepted') {
      toast.success('LM Admin instalado');
    } else if (outcome === 'dismissed') {
      dismiss();
    } else if (outcome === 'unavailable') {
      // Chrome hasn't (yet) declared this PWA installable on this
      // device. Usually means: insufficient engagement, or the user
      // installed+uninstalled recently and Chrome is in a cooldown.
      // The menu path always works.
      toast.info(
        'Toca el menú ⋮ de Chrome arriba a la derecha y selecciona «Instalar app». Si no aparece, sigue interactuando con la página unos segundos y vuelve a intentar.',
        { duration: 9000 },
      );
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
        marginTop: '0.75rem',
        animation: 'fadeUp 500ms 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Gradient border layer */}
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
            {isIos ? 'Instala LM Admin en tu iPhone' : 'Instala LM Admin'}
          </p>
          <p
            style={{
              fontSize: 11.5,
              color: '#8B95B5',
              marginTop: 5,
              lineHeight: 1.5,
            }}
          >
            Acceso rápido desde tu pantalla de inicio sin abrir el navegador cada vez.
          </p>

          {/* The pretty button. Always visible. */}
          <button
            onClick={() => void handleClick()}
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
            {isIos
              ? <><Share size={12} /> Cómo instalar</>
              : <><Download size={12} /> {event ? 'Instalar' : 'Instalar'}</>
            }
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
