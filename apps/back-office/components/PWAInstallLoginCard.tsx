'use client';

import * as React from 'react';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '@/lib/use-pwa-install';

// ── Step-by-step modal for iOS (no native prompt available) ─────────────────
function InstallGuideModal({ onClose, isIos }: { onClose: () => void; isIos: boolean }): React.ReactElement {
  const steps = isIos
    ? [
        { n: 1, text: 'Abre el menú de Safari — toca el', strong: 'ícono de Compartir', after: '(cuadro con flecha)' },
        { n: 2, text: 'Desplázate y toca', strong: '"Agregar a pantalla de inicio"', after: '' },
        { n: 3, text: 'Toca', strong: '"Agregar"', after: 'para confirmar' },
      ]
    : [
        { n: 1, text: 'Abre el menú de Chrome — toca los', strong: '⋮ tres puntos', after: 'arriba a la derecha' },
        { n: 2, text: 'Toca', strong: '"Instalar app"', after: 'o "Agregar a pantalla de inicio"' },
        { n: 3, text: 'Toca', strong: '"Instalar"', after: 'en el cuadro de diálogo' },
      ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 env(safe-area-inset-bottom,0)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'linear-gradient(170deg, #0D1426 0%, #0A0E1A 100%)',
          borderTop: '1px solid rgba(56,189,248,0.25)',
          borderRadius: '20px 20px 0 0',
          padding: '20px 24px 32px',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        <p style={{ fontSize: 15, fontWeight: 700, color: '#BFDBFE', margin: '0 0 4px' }}>Instalar Clínica App</p>
        <p style={{ fontSize: 12, color: '#6B7592', margin: '0 0 20px' }}>
          {isIos ? 'Sigue estos pasos en Safari:' : 'Sigue estos pasos en Chrome:'}
        </p>

        {steps.map(({ n, text, strong, after }) => (
          <div key={n} style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(37,99,235,0.22)', border: '1px solid rgba(56,189,248,0.30)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#93C5FD',
            }}>{n}</div>
            <p style={{ fontSize: 13, color: '#A1ACC8', margin: 0, lineHeight: 1.5, paddingTop: 4 }}>
              {text} <strong style={{ color: '#BFDBFE' }}>{strong}</strong> {after}
            </p>
          </div>
        ))}

        <button
          onClick={onClose}
          style={{
            marginTop: 8, width: '100%', padding: '13px 0', borderRadius: 12,
            background: 'linear-gradient(135deg,#1E40AF,#2563EB)',
            color: 'white', fontWeight: 700, fontSize: 14,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(37,99,235,0.45)',
          }}
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

// ── Main card ────────────────────────────────────────────────────────────────
export function PWAInstallLoginCard(): React.ReactElement | null {
  const { event, platform, standalone, dismissedRecently, install, dismiss } = usePWAInstall();
  const [hidden,    setHidden]    = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  if (hidden) return null;
  if (standalone) return null;
  if (dismissedRecently) return null;
  if (platform === 'unknown') return null;
  // Require either a native prompt event or a known platform (for guide fallback)
  if (!event && platform === 'desktop') return null;

  const handleDismiss = (): void => { dismiss(); setHidden(true); };

  const handleInstall = async (): Promise<void> => {
    if (event) {
      const outcome = await install();
      if (outcome === 'dismissed') handleDismiss();
      else setHidden(true);
    } else {
      setShowGuide(true);
    }
  };

  const label    = platform === 'ios' ? 'Agregar a inicio' : 'Instalar App';
  const subtitle = event
    ? 'Acceso rápido desde tu pantalla de inicio'
    : platform === 'ios'
      ? 'Compartir → Agregar a pantalla de inicio'
      : 'Un toque para instalar en tu dispositivo';

  return (
    <>
      {showGuide && (
        <InstallGuideModal onClose={() => setShowGuide(false)} isIos={platform === 'ios'} />
      )}

      <div style={{ marginTop: '1.25rem', width: 420, maxWidth: '90vw', position: 'relative', zIndex: 1 }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: 15,
            background: 'linear-gradient(135deg,rgba(37,99,235,0.40),rgba(30,64,175,0.16) 50%,rgba(56,189,248,0.28) 100%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'relative',
            background: 'rgba(10,14,26,0.92)', borderRadius: 14, padding: '12px 14px',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', gap: 11,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: 'rgba(37,99,235,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.25)',
            }}>
              <Download size={15} color="#93C5FD" />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#BFDBFE', margin: 0, letterSpacing: '0.01em', lineHeight: 1.25 }}>
                Instalar Clínica App
              </p>
              <p style={{ fontSize: 10.5, color: '#8B95B5', margin: '2px 0 0', lineHeight: 1.35 }}>
                {subtitle}
              </p>
            </div>

            <button
              onClick={() => void handleInstall()}
              style={{
                padding: '7px 12px', borderRadius: 8,
                background: 'linear-gradient(135deg,#1E40AF,#2563EB)',
                color: 'white', fontSize: 11.5, fontWeight: 600,
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                flexShrink: 0, boxShadow: '0 4px 12px rgba(37,99,235,0.40)',
              }}
            >
              {label}
            </button>

            <button
              onClick={handleDismiss}
              aria-label="Cerrar"
              style={{ background: 'transparent', border: 'none', color: '#4A5474', cursor: 'pointer', padding: 2, display: 'inline-flex', flexShrink: 0, fontSize: 16 }}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
