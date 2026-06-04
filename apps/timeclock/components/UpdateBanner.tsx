'use client';

import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { useVersionCheck } from '@/lib/useVersionCheck';
import { clearSessionGuard } from '@/lib/useSessionGuard';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/lib/i18n';

/**
 * Banner sticky en el top que aparece cuando hay un deploy nuevo
 * mientras el usuario tiene la PWA abierta.
 *
 * El click hace una limpieza completa:
 *   1. clearSessionGuard()              — resetea contador de 12h
 *   2. supabase.auth.signOut()          — cierra sesion (cookies + tokens)
 *   3. unregister de Service Workers    — fuerza bundle nuevo en proxima carga
 *   4. caches.delete() de todas las caches — limpia assets viejos
 *   5. window.location.href = '/login'  — hard navigate, no SPA
 *
 * Sin los pasos 3-4 el SW seguiria sirviendo el bundle cacheado y el
 * "Actualizar" no traeria realmente la version nueva — sobre todo en
 * iOS PWA donde el SW es agresivo con el cache.
 */
export function UpdateBanner(): React.ReactElement | null {
  const { isOutdated } = useVersionCheck();
  const { t } = useT();
  const [applying, setApplying] = useState(false);

  if (!isOutdated) return null;

  async function handleApply(): Promise<void> {
    setApplying(true);
    try {
      // 1. Reset contador SessionGuard
      clearSessionGuard();

      // 2. SignOut Supabase con TIMEOUT — sin esto, si el celular tiene
      // mala senial el boton se cuelga indefinidamente en "Actualizando..."
      // y el usuario asume que se trabo.
      const signOutWithTimeout = Promise.race([
        createClient().auth.signOut().catch(() => undefined),
        new Promise<void>(resolve => setTimeout(resolve, 3000)),
      ]);
      try { await signOutWithTimeout; } catch { /* noop */ }

      // 3. Desregistrar Service Workers
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        } catch { /* noop */ }
      }

      // 4. Borrar todas las caches que dejo workbox/next-pwa
      if (typeof caches !== 'undefined') {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        } catch { /* noop */ }
      }
    } finally {
      // 5. Hard navigate con cache-bust + replace (no back stack).
      // El query param fuerza al browser a no reusar HTML del HTTP cache
      // — el SW + caches ya estan limpios, esto es la ultima capa.
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
        // Compacto: 7px (mobile) padding vertical + safe-area en top
        padding: '7px 12px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 7px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',       // por si en <320px no cabe en una linea
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
          {t.updateAvailable}
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
        <RefreshCw size={11} strokeWidth={2.5} style={applying ? { animation: 'spin 1s linear infinite' } : undefined} />
        {applying ? t.updateApplying : t.updateApply}
      </button>
    </div>
  );
}
