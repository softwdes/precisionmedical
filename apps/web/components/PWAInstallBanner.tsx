'use client';

import * as React from 'react';
import { usePWAInstall } from '@/lib/use-pwa-install';
import { toast } from 'sonner';

/**
 * Compact floating banner shown post-login on mobile devices when the
 * PWA is installable but not yet installed. Suppressed on desktop —
 * the admin is mostly used from laptops where install prompts are
 * disruptive. The prominent install affordance lives on the login
 * page; this banner is a gentle reminder on inner pages.
 */
export function PWAInstallBanner(): React.ReactElement | null {
  const { event, installed, platform, standalone, dismissedRecently, install, dismiss } = usePWAInstall();

  // Hide if: not mobile, already installed, dismissed recently, or no install API available yet.
  // iOS Safari has no install API, so this banner skips it — iOS install
  // is handled via the PWAInstallLoginCard which shows manual instructions.
  if (platform !== 'android') return null;
  if (standalone || installed) return null;
  if (dismissedRecently) return null;
  if (!event) return null;

  const handleInstall = async (): Promise<void> => {
    const outcome = await install();
    if (outcome === 'accepted') {
      toast.success('LM Admin instalado');
    } else if (outcome === 'dismissed') {
      // The user said no in the native dialog — respect that for 7 days.
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
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'var(--bg-1)',
        border: '1px solid rgba(99,102,241,0.30)',
        borderRadius: '14px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        maxWidth: '340px',
        width: 'calc(100vw - 40px)',
      }}
    >
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '13px', fontWeight: 500, margin: '0 0 2px', color: 'var(--text-1)' }}>
          Instalar LM Admin
        </p>
        <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: 0 }}>
          Accede más rápido desde tu pantalla de inicio
        </p>
      </div>
      <button
        onClick={() => void handleInstall()}
        style={{
          padding: '7px 14px',
          borderRadius: '8px',
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.30)',
          color: '#6366F1',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
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
          color: 'var(--text-3)',
          cursor: 'pointer',
          padding: '4px',
          fontSize: '16px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
