'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('updateBanner');
  const [applying, setApplying] = useState(false);

  if (!isOutdated) return null;

  async function handleApply(): Promise<void> {
    setApplying(true);
    try {
      clearSessionGuard();

      // SignOut con timeout 3s — sin esto, mala senial -> boton colgado
      const signOutWithTimeout = Promise.race([
        createBrowserClient().auth.signOut().catch(() => undefined),
        new Promise<void>(resolve => setTimeout(resolve, 3000)),
      ]);
      try { await signOutWithTimeout; } catch { /* noop */ }

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
      // Hard navigate con cache-bust + replace (no back stack)
      const url = new URL('/login', window.location.origin);
      url.searchParams.set('_v', String(Date.now()));
      window.location.replace(url.toString());
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
        padding: '7px 12px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 7px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 8,
        rowGap: 6,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
        lineHeight: 1.2,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <Sparkles size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t('available')}
        </span>
      </span>
      <button
        onClick={() => void handleApply()}
        disabled={applying}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: 'white',
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 12px',
          borderRadius: 999,
          cursor: applying ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontFamily: 'inherit',
          opacity: applying ? 0.7 : 1,
          transition: 'background 150ms ease',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
        onMouseOver={e => { if (!applying) e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; }}
        onMouseOut={e => { if (!applying) e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
      >
        <RefreshCw
          size={11}
          strokeWidth={2.5}
          className={applying ? 'animate-spin' : undefined}
        />
        {applying ? t('applying') : t('apply')}
      </button>
    </div>
  );
}
