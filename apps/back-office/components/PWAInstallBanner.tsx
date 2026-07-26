'use client';

import * as React from 'react';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '@/lib/use-pwa-install';

export function PWAInstallBanner(): React.ReactElement | null {
  const { event, installed, platform, standalone, dismissedRecently, install, dismiss } = usePWAInstall();

  if (platform === 'ios' || platform === 'unknown') return null;
  if (standalone || installed) return null;
  if (dismissedRecently) return null;
  if (!event) return null;

  const handleInstall = async (): Promise<void> => {
    const outcome = await install();
    if (outcome === 'dismissed') dismiss();
  };

  return (
    <div
      role="region"
      aria-label="Instalar Clínica App"
      style={{
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        zIndex: 9999,
        maxWidth: '360px',
        width: 'calc(100vw - 32px)',
        animation: 'boInstallFadeUp 500ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      <style>{`
        @keyframes boInstallFadeUp {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      <div style={{ position: 'relative' }}>
        {/* Gradient border — brand blue/cyan */}
        <div style={{
          position: 'absolute', top: -1, left: -1, right: -1, bottom: -1,
          borderRadius: 15,
          background: 'linear-gradient(135deg, rgba(37,99,235,0.50), rgba(30,64,175,0.22) 50%, rgba(56,189,248,0.36) 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <div style={{
          position: 'relative', zIndex: 1,
          background: 'linear-gradient(135deg, rgba(10,14,26,0.96), rgba(15,20,38,0.96))',
          borderRadius: 14, padding: '12px 14px',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', gap: 11,
          boxShadow: '0 12px 36px rgba(0,0,0,0.45), 0 0 24px rgba(37,99,235,0.18)',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'rgba(37,99,235,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.25)',
          }}>
            <Download size={15} color="#93C5FD" />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#BFDBFE', margin: 0, letterSpacing: '0.01em', lineHeight: 1.25 }}>
              Instalar Clínica App
            </p>
            <p style={{ fontSize: 10.5, color: '#8B95B5', margin: '2px 0 0', lineHeight: 1.35 }}>
              Acceso rápido desde tu inicio
            </p>
          </div>

          <button
            onClick={() => void handleInstall()}
            style={{
              padding: '7px 12px', borderRadius: 8,
              background: 'linear-gradient(135deg, #1E40AF, #2563EB)',
              color: 'white', fontSize: 11.5, fontWeight: 600,
              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              flexShrink: 0, boxShadow: '0 4px 12px rgba(37,99,235,0.40)',
            }}
          >
            Instalar
          </button>

          <button
            onClick={dismiss}
            aria-label="Cerrar"
            style={{ background: 'transparent', border: 'none', color: '#4A5474', cursor: 'pointer', padding: 2, display: 'inline-flex', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
