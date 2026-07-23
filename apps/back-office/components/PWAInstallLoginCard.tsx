'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { Download, Share, MoreVertical } from 'lucide-react';
import { detectPlatform, isStandalone, wasDismissedRecently, markDismissed, type BeforeInstallPromptEvent } from '@/lib/use-pwa-install';

// Singleton — mismo event bus que usePWAInstall
let cachedEvent: BeforeInstallPromptEvent | null = null;
type Listener = (e: BeforeInstallPromptEvent | null) => void;
const listeners = new Set<Listener>();

if (typeof window !== 'undefined') {
  // Pick up event captured by the inline script before React hydrated
  const early = (window as { __pwaPrompt?: BeforeInstallPromptEvent }).__pwaPrompt;
  if (early) cachedEvent = early;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedEvent = e as BeforeInstallPromptEvent;
    (window as { __pwaPrompt?: BeforeInstallPromptEvent }).__pwaPrompt = cachedEvent;
    for (const l of listeners) l(cachedEvent);
  });
}

export function PWAInstallLoginCard(): React.ReactElement | null {
  const [platform, setPlatform]   = useState<'android' | 'ios' | 'desktop' | 'unknown'>('unknown');
  const [event,    setEvent]      = useState<BeforeInstallPromptEvent | null>(cachedEvent);
  const [hidden,   setHidden]     = useState(false);
  const [mounted,  setMounted]    = useState(false);

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());
    const l: Listener = (e) => setEvent(e);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  if (!mounted) return null;
  if (hidden) return null;
  if (isStandalone()) return null;
  if (wasDismissedRecently()) return null;
  if (platform === 'desktop' || platform === 'unknown') return null;

  const dismiss = (): void => { markDismissed(); setHidden(true); };

  const handleInstall = async (): Promise<void> => {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'dismissed') dismiss();
    else setHidden(true);
  };

  // iOS — manual instructions
  if (platform === 'ios') {
    return (
      <div style={{
        marginTop: '1.25rem', width: 420, maxWidth: '90vw', position: 'relative', zIndex: 1,
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: 15, background: 'linear-gradient(135deg,rgba(37,99,235,0.35),rgba(30,64,175,0.14) 50%,rgba(56,189,248,0.24) 100%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', background: 'rgba(10,14,26,0.90)', borderRadius: 14, padding: '12px 16px', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(37,99,235,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.22)' }}>
              <Share size={14} color="#93C5FD" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#BFDBFE', margin: 0, lineHeight: 1.25 }}>Instalar Clínica App</p>
              <p style={{ fontSize: 10.5, color: '#6B7592', margin: '2px 0 0', lineHeight: 1.4 }}>
                Toca <strong style={{ color: '#93C5FD' }}>⬆ Compartir</strong> → <strong style={{ color: '#93C5FD' }}>Agregar a inicio</strong>
              </p>
            </div>
            <button onClick={dismiss} aria-label="Cerrar" style={{ background: 'transparent', border: 'none', color: '#4A5474', cursor: 'pointer', padding: 4, display: 'inline-flex', flexShrink: 0, fontSize: 16 }}>✕</button>
          </div>
        </div>
      </div>
    );
  }

  // Android with native event
  if (event) {
    return (
      <div style={{ marginTop: '1.25rem', width: 420, maxWidth: '90vw', position: 'relative', zIndex: 1 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: 15, background: 'linear-gradient(135deg,rgba(37,99,235,0.40),rgba(30,64,175,0.16) 50%,rgba(56,189,248,0.28) 100%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', background: 'rgba(10,14,26,0.92)', borderRadius: 14, padding: '12px 14px', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(37,99,235,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.25)' }}>
              <Download size={15} color="#93C5FD" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#BFDBFE', margin: 0, letterSpacing: '0.01em', lineHeight: 1.25 }}>Instalar Clínica App</p>
              <p style={{ fontSize: 10.5, color: '#8B95B5', margin: '2px 0 0', lineHeight: 1.35 }}>Acceso rápido desde tu inicio</p>
            </div>
            <button onClick={() => void handleInstall()} style={{ padding: '7px 12px', borderRadius: 8, background: 'linear-gradient(135deg,#1E40AF,#2563EB)', color: 'white', fontSize: 11.5, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 4px 12px rgba(37,99,235,0.40)' }}>
              Instalar
            </button>
            <button onClick={dismiss} aria-label="Cerrar" style={{ background: 'transparent', border: 'none', color: '#4A5474', cursor: 'pointer', padding: 2, display: 'inline-flex', flexShrink: 0 }}>✕</button>
          </div>
        </div>
      </div>
    );
  }

  // Android without event yet — manual instructions
  return (
    <div style={{ marginTop: '1.25rem', width: 420, maxWidth: '90vw', position: 'relative', zIndex: 1 }}>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: 15, background: 'linear-gradient(135deg,rgba(37,99,235,0.30),rgba(56,189,248,0.20) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', background: 'rgba(10,14,26,0.90)', borderRadius: 14, padding: '12px 16px', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(37,99,235,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MoreVertical size={14} color="#93C5FD" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#BFDBFE', margin: 0, lineHeight: 1.25 }}>Instalar Clínica App</p>
            <p style={{ fontSize: 10.5, color: '#6B7592', margin: '2px 0 0', lineHeight: 1.4 }}>
              Toca <strong style={{ color: '#93C5FD' }}>⋮</strong> → <strong style={{ color: '#93C5FD' }}>Instalar app</strong> en Chrome
            </p>
          </div>
          <button onClick={dismiss} aria-label="Cerrar" style={{ background: 'transparent', border: 'none', color: '#4A5474', cursor: 'pointer', padding: 4, display: 'inline-flex', flexShrink: 0, fontSize: 16 }}>✕</button>
        </div>
      </div>
    </div>
  );
}
