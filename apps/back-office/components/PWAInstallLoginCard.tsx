'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Download } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type MobilePlatform = 'ios' | 'android';

// ── Helpers ───────────────────────────────────────────────────────────────────
const DISMISS_KEY = 'bo-pwa-install-dismissed';
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000;

function getMobilePlatform(): MobilePlatform | null {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports Macintosh UA but has touch points
  if (/iPhone|iPod/.test(ua)) return 'ios';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return null;
}

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return !isNaN(ts) && Date.now() - ts < DISMISS_TTL;
  } catch {
    return false;
  }
}

// ── Step-by-step modal ────────────────────────────────────────────────────────
function InstallGuideModal({ onClose, isIos }: { onClose: () => void; isIos: boolean }): React.ReactElement {
  const steps = isIos
    ? [
        { n: 1, text: 'Abre el menú de Safari — toca el', strong: 'ícono de Compartir', after: '(cuadro con flecha ↑)' },
        { n: 2, text: 'Desplázate y toca', strong: '"Agregar a pantalla de inicio"', after: '' },
        { n: 3, text: 'Toca', strong: '"Agregar"', after: 'en la esquina superior derecha' },
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
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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

// ── Main card ─────────────────────────────────────────────────────────────────
export function PWAInstallLoginCard(): React.ReactElement | null {
  const [platform,   setPlatform]   = useState<MobilePlatform | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showGuide,  setShowGuide]  = useState(false);
  const [dismissed,  setDismissed]  = useState(false);
  const [hasPrompt,  setHasPrompt]  = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Recover any early-captured prompt (from layout inline script)
    const early = (window as { __pwaPrompt?: BeforeInstallPromptEvent }).__pwaPrompt;
    if (early) { promptRef.current = early; setHasPrompt(true); }

    // Listen for prompt arriving after mount (may come after the 3s timer)
    const onPrompt = (e: Event): void => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setHasPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // Skip non-mobile or already-installed or dismissed
    const mob = getMobilePlatform();
    if (!mob) return;
    if (isStandalone()) return;
    if (wasDismissedRecently()) return;

    setPlatform(mob);

    // Show banner after 3 s (same approach as reference project)
    const timer = setTimeout(() => setShowBanner(true), 3000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  if (!showBanner || !platform || dismissed) return null;

  const handleDismiss = (): void => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
    setDismissed(true);
  };

  const handleInstall = async (): Promise<void> => {
    if (promptRef.current) {
      promptRef.current.prompt();
      const { outcome } = await promptRef.current.userChoice;
      promptRef.current = null;
      if (outcome === 'accepted') { setShowBanner(false); return; }
      handleDismiss();
    } else {
      setShowGuide(true);
    }
  };

  // iOS never has beforeinstallprompt — always show inline instruction, no install button
  const isIos    = platform === 'ios';
  const subtitle = hasPrompt
    ? 'Acceso rápido desde tu pantalla de inicio'
    : isIos
      ? 'Toca ⎙ → "Agregar a pantalla de inicio"'
      : 'Un toque para instalar en tu dispositivo';

  return (
    <>
      {showGuide && (
        <InstallGuideModal
          onClose={() => setShowGuide(false)}
          isIos={platform === 'ios'}
        />
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

            {/* iOS: no install button — instructions are in subtitle */}
            {!isIos && (
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
                Instalar App
              </button>
            )}

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
