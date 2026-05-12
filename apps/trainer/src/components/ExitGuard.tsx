'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function ExitGuard({ onExit }: { onExit: () => Promise<void> }) {
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const pathname = usePathname();

  // How many pages deep we are within the app (relative to guard init)
  const depth = useRef(0);
  // Flag set by popstate handler so the pathname effect knows it's a back nav
  const isBackNav = useRef(false);
  // Skip depth increment on first pathname render
  const firstRender = useRef(true);
  // Guard only activates on mobile
  const active = useRef(false);

  // Initialize once on mount
  useEffect(() => {
    if (window.innerWidth > 900) return;
    active.current = true;

    // Push one sentinel entry — gives us one extra back-press before exiting
    window.history.pushState(null, '');

    function onPopState() {
      if (!active.current) return;
      isBackNav.current = true;
      if (depth.current <= 0) {
        // No more app pages to go back to — about to exit
        window.history.pushState(null, ''); // re-arm sentinel
        setShow(true);
      } else {
        depth.current = Math.max(0, depth.current - 1);
      }
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Track forward navigations via pathname changes
  useEffect(() => {
    if (!active.current) return;
    if (firstRender.current) { firstRender.current = false; return; }
    if (isBackNav.current) { isBackNav.current = false; return; } // back nav, already decremented
    depth.current++; // forward navigation
  }, [pathname]);

  async function handleExit() {
    setPending(true);
    await onExit();
  }

  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
      onClick={() => setShow(false)}
    >
      <div
        style={{
          width: '100%', maxWidth: '320px', background: '#0d0d0f',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
          overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '24px' }}>
          <p style={{ fontWeight: 700, fontSize: '15px', color: '#E6EDEC', margin: '0 0 8px' }}>
            ¿Salir de la aplicación?
          </p>
          <p style={{ fontSize: '13px', color: '#6B7472', lineHeight: 1.6, margin: 0 }}>
            Se cerrará tu sesión. Tendrás que volver a iniciar sesión para continuar.
          </p>
        </div>
        <div style={{
          display: 'flex', gap: '10px', padding: '16px 24px',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        }}>
          <button
            className="btn btn-outline"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => setShow(false)}
            disabled={pending}
          >
            Cancelar
          </button>
          <button
            onClick={handleExit}
            disabled={pending}
            style={{
              flex: 1, height: '44px', background: '#dc2626', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '13px',
              cursor: pending ? 'not-allowed' : 'pointer',
              opacity: pending ? 0.6 : 1,
              letterSpacing: '0.04em',
            }}
          >
            {pending ? 'Cerrando...' : 'Salir'}
          </button>
        </div>
      </div>
    </div>
  );
}
