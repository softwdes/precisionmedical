'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallBanner(): React.ReactElement | null {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    if (isInstalled) return;

    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    if (dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async (): Promise<void> => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setShowBanner(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = (): void => {
    setShowBanner(false);
    localStorage.setItem('pwa-banner-dismissed', '1');
  };

  if (!showBanner) return null;

  return (
    <div style={{
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
    }}>
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
        onClick={handleDismiss}
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
