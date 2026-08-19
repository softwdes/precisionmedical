'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { Audience } from './audience';
import { stashPendingNotes } from './pending-notes';
import { useVersionCheck } from './use-version-check';

/**
 * Banner que aparece arriba cuando hay un deploy nuevo mientras el usuario
 * tiene la app abierta. El click limpia SW + caches y hace hard-reload a la
 * pagina actual SIN cerrar sesion.
 *
 * Estilos inline a proposito: `apps/timeclock` no usa el preset de Tailwind ni
 * incluye `packages/**` en su `content`, asi que cualquier clase de utilidad
 * en este archivo no se generaria ahi. Inline funciona en las 6 apps sin
 * tocarles el tailwind.config.
 *
 * i18n por props: `timeclock` no usa next-intl (tiene su propio `useT`), asi
 * que el componente no importa ninguna libreria de i18n — cada app le pasa
 * los textos ya traducidos.
 */

/** Alto del banner, publicado para apps con headers `position: fixed`. */
export const BANNER_HEIGHT_VAR = '--pm-update-banner-h';

export interface UpdateBannerLabels {
  /** "Nueva versión disponible" */
  available: string;
  /** "Actualizar ahora" */
  apply: string;
  /** "Actualizando..." */
  applying: string;
}

export interface UpdateBannerProps {
  /** Que audiencia esta mirando — define que notas vera despues del reload. */
  audience: Audience;
  labels: UpdateBannerLabels;
  /**
   * Corre justo antes del reload. Para lo que es propio de cada app: `web` y
   * `timeclock` resetean aca el contador de 12h de SessionGuard. Las otras
   * cuatro apps no tienen SessionGuard, asi que no pasan nada.
   */
  onBeforeReload?: () => void;
}

export function UpdateBanner({
  audience,
  labels,
  onBeforeReload,
}: UpdateBannerProps): React.ReactElement | null {
  const { isOutdated, bootVersion } = useVersionCheck();
  const [applying, setApplying] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  // El banner es `fixed`, asi que no empuja nada por si solo: sin esto tapa
  // los primeros ~30px, incluido el header sticky de las tablas. Empujamos el
  // body y publicamos el alto como CSS var para los headers `fixed`, que el
  // padding del body no mueve.
  useEffect(() => {
    if (!isOutdated) return;
    const bar = barRef.current;
    if (bar === null) return;

    const apply = (): void => {
      const height = bar.offsetHeight;
      document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, `${height}px`);
      document.body.style.paddingTop = `${height}px`;
    };

    apply();
    // El banner envuelve en pantallas angostas (<320px), asi que el alto cambia.
    const observer = new ResizeObserver(apply);
    observer.observe(bar);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(BANNER_HEIGHT_VAR);
      document.body.style.paddingTop = '';
    };
  }, [isOutdated]);

  if (!isOutdated) return null;

  async function handleApply(): Promise<void> {
    setApplying(true);
    try {
      onBeforeReload?.();

      // Dejar el SHA de arranque para que el bundle nuevo sepa desde donde
      // contar los cambios. Si nunca llego a leerse un SHA, no hay rango que
      // pedir y el reload pasa sin changelog.
      if (bootVersion !== null) {
        stashPendingNotes({ since: bootVersion, audience });
      }

      // Sin desregistrar el SW, seguiria sirviendo el bundle cacheado
      // (`/_next/static/*` esta en CacheFirst a 30 dias) y "Actualizar" no
      // traeria nada nuevo — sobre todo en PWA de iOS.
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        } catch {
          /* noop */
        }
      }

      if (typeof caches !== 'undefined') {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {
          /* noop */
        }
      }
    } finally {
      // Hard-reload a la pagina actual con cache-bust. `replace` para no
      // ensuciar el back stack. La sesion vive en cookies httpOnly de
      // Supabase y sobrevive el reload.
      const url = new URL(window.location.href);
      url.searchParams.set('_v', String(Date.now()));
      window.location.replace(url.toString());
    }
  }

  return (
    <div
      ref={barRef}
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
          {labels.available}
        </span>
      </span>

      <button
        type="button"
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
        onMouseOver={(e) => {
          if (!applying) e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
        }}
        onMouseOut={(e) => {
          if (!applying) e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
        }}
      >
        <RefreshCw
          size={11}
          strokeWidth={2.5}
          style={applying ? { animation: 'pm-update-spin 1s linear infinite' } : undefined}
        />
        {applying ? labels.applying : labels.apply}
      </button>

      {/* La animacion va inline: `animate-spin` de Tailwind no existe en
          timeclock, y un @keyframes global por app se olvida. */}
      <style>{'@keyframes pm-update-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
