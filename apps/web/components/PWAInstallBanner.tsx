'use client';

import * as React from 'react';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '@/lib/use-pwa-install';
import { toast } from 'sonner';

/**
 * Compact floating banner shown post-login on mobile devices when the
 * PWA is installable but not yet installed. Suppressed on desktop —
 * the admin is mostly used from laptops where install prompts are
 * disruptive. The prominent install affordance lives on the login
 * page (PWAInstallLoginCard); this banner is a gentle reminder on
 * inner pages.
 *
 * Visual language is unified with the login card and the rest of the
 * admin: dark glass + gradient border + indigo→violet→cyan ring.
 */
export function PWAInstallBanner(): React.ReactElement | null {
  const { event, installed, platform, standalone, dismissedRecently, install, dismiss } = usePWAInstall();

  // Hide if: not Android, already installed, dismissed recently, or no install API available yet.
  // iOS has no install API → handled via PWAInstallLoginCard (manual instructions).
  if (platform !== 'android') return null;
  if (standalone || installed) return null;
  if (dismissedRecently) return null;
  if (!event) return null;

  const handleInstall = async (): Promise<void> => {
    const outcome = await install();
    if (outcome === 'accepted') {
      toast.success('LM Admin instalado');
    } else if (outcome === 'dismissed') {
      // User said no in the native dialog — respect that for 7 days.
      dismiss();
    }
  };

  return (
    <div
      role="region"
      aria-label="Instalar LM Admin"
      style={{
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        zIndex: 9999,
        maxWidth: '360px',
        width: 'calc(100vw - 32px)',
        animation: 'pmInstallFadeUp 500ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Scoped keyframes — keeps the component self-contained (the
          floating banner is rendered from layout.tsx and doesn't share
          a stylesheet with the login page that defines its own fadeUp). */}
      <style>{`
        @keyframes pmInstallFadeUp {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      {/* Outer wrapper: holds the gradient border (B) and the inner card. */}
      <div style={{ position: 'relative', transform: 'translateX(-50%)' }}>
        {/* Gradient border layer — sits behind, slightly inset, so its
            edges peek out as a 1px conic-ish frame around the card. */}
        <div
          style={{
            position: 'absolute',
            top: -1, left: -1, right: -1, bottom: -1,
            borderRadius: 15,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.50), rgba(139,92,246,0.22) 50%, rgba(6,182,212,0.36) 100%)',
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
            padding: '12px 14px',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            boxShadow: '0 12px 36px rgba(0,0,0,0.45), 0 0 24px rgba(99,102,241,0.18)',
          }}
        >
          {/* Icon box — matches the login card's icon treatment */}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: 'rgba(99,102,241,0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.25)',
            }}
          >
            <Download size={15} color="#A5B4FC" />
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: '#C7D2FE',
                margin: 0,
                letterSpacing: '0.01em',
                lineHeight: 1.25,
              }}
            >
              Instalar LM Admin
            </p>
            <p
              style={{
                fontSize: 10.5,
                color: '#8B95B5',
                margin: '2px 0 0',
                lineHeight: 1.35,
              }}
            >
              Acceso rápido desde tu inicio
            </p>
          </div>

          {/* Install button — matches login card's gradient + shadow */}
          <button
            onClick={() => void handleInstall()}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              color: 'white',
              fontSize: 11.5,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(99,102,241,0.40)',
            }}
          >
            Instalar
          </button>

          <button
            onClick={dismiss}
            aria-label="Cerrar"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#4A5474',
              cursor: 'pointer',
              padding: 2,
              display: 'inline-flex',
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
