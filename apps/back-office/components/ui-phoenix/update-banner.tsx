'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, RefreshCw } from 'lucide-react';
import { useVersionCheck } from '@/lib/useVersionCheck';
import { createClient as createBrowserClient } from '@precision-medical/auth/client';

/**
 * Banner fijo en el top que aparece cuando hay un deploy nuevo mientras
 * el usuario tiene la app abierta. Click → cierra sesión, limpia caches
 * y SW, hard-navigate al login forzando el bundle nuevo.
 */
export function UpdateBanner(): React.ReactElement | null {
  const { isOutdated } = useVersionCheck();
  const t = useTranslations('updateBanner');
  const [applying, setApplying] = useState(false);

  if (!isOutdated) return null;

  async function handleApply(): Promise<void> {
    setApplying(true);
    try {
      // Sign-out con timeout 3s — evita cuelgue en mala señal
      await Promise.race([
        createBrowserClient().auth.signOut().catch(() => undefined),
        new Promise<void>(resolve => setTimeout(resolve, 3000)),
      ]).catch(() => undefined);

      // Desregistrar SW (no-op si no hay PWA aún)
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        } catch { /* noop */ }
      }

      // Limpiar caches del browser
      if (typeof caches !== 'undefined') {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        } catch { /* noop */ }
      }
    } finally {
      const url = new URL('/login', window.location.origin);
      url.searchParams.set('_v', String(Date.now()));
      window.location.replace(url.toString());
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-3 py-[7px] text-white"
      style={{
        background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 60%, #06B6D4 100%)',
        boxShadow: '0 4px 18px rgba(99,102,241,0.4)',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 7px)',
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
        <Sparkles size={14} strokeWidth={2.5} className="shrink-0" />
        <span className="truncate">{t('available')}</span>
      </span>

      <button
        type="button"
        onClick={() => void handleApply()}
        disabled={applying}
        className="flex shrink-0 items-center gap-1 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-[11px] font-bold text-white transition-colors hover:bg-white/30 disabled:opacity-70"
      >
        <RefreshCw size={11} strokeWidth={2.5} className={applying ? 'animate-spin' : undefined} />
        {applying ? t('applying') : t('apply')}
      </button>
    </div>
  );
}
