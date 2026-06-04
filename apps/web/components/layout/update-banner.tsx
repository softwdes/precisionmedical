'use client';

import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { useVersionCheck } from '@/lib/useVersionCheck';
import { clearSessionGuard } from '@/lib/useSessionGuard';
import { createClient as createBrowserClient } from '@precision-medical/auth/client';

/**
 * Banner top que aparece cuando hay un deploy nuevo mientras el usuario
 * tiene la app abierta. Click → cierra sesion, limpia SW + caches, hard
 * navigate al login para forzar bundle nuevo.
 *
 * Mismo patron que apps/timeclock/components/UpdateBanner.tsx.
 */
export function UpdateBanner(): React.ReactElement | null {
  const { isOutdated } = useVersionCheck();
  const [applying, setApplying] = useState(false);

  if (!isOutdated) return null;

  async function handleApply(): Promise<void> {
    setApplying(true);
    try {
      clearSessionGuard();
      try { await createBrowserClient().auth.signOut(); } catch { /* noop */ }

      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        } catch { /* noop */ }
      }
      if (typeof caches !== 'undefined') {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        } catch { /* noop */ }
      }
    } finally {
      window.location.href = '/login';
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 60%, #06B6D4 100%)',
        boxShadow: '0 4px 18px rgba(99,102,241,0.4)',
        color: 'white',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
      }}
    >
      <Sparkles size={15} strokeWidth={2.5} />
      <span>Nueva versión disponible</span>
      <button
        onClick={() => void handleApply()}
        disabled={applying}
        style={{
          marginLeft: 8,
          background: 'rgba(255,255,255,0.18)',
          border: '1px solid rgba(255,255,255,0.35)',
          color: 'white',
          fontSize: 12,
          fontWeight: 700,
          padding: '6px 14px',
          borderRadius: 999,
          cursor: applying ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'inherit',
          opacity: applying ? 0.7 : 1,
          transition: 'background 150ms ease',
        }}
        onMouseOver={e => { if (!applying) e.currentTarget.style.background = 'rgba(255,255,255,0.28)'; }}
        onMouseOut={e => { if (!applying) e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
      >
        <RefreshCw
          size={12}
          strokeWidth={2.5}
          className={applying ? 'animate-spin' : undefined}
        />
        {applying ? 'Actualizando...' : 'Actualizar ahora'}
      </button>
    </div>
  );
}
