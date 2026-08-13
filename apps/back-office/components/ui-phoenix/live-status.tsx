'use client';

/**
 * Indicador de frescura — "hace cuánto sé que esto está al día".
 *
 * Es la pieza que protege de verdad, más que bajar la latencia: el peor escenario
 * de cualquier sincronización es una pantalla congelada con cara de viva. Acá el
 * fallo es visible en ámbar y el usuario sabe que tiene que recargar, en vez de
 * confiar en datos de hace veinte minutos.
 *
 * Discreto a propósito: en reposo es un punto y un texto chico. Solo se vuelve
 * ámbar cuando hay algo que decir.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface LiveStatusProps {
  lastSyncedAt: Date | null;
  failing: boolean;
  /** Comprobación manual. Sin esto el usuario no tiene salida cuando falla. */
  onRetry?: () => void;
  className?: string;
}

/** Segundos → texto corto. Se recalcula cada segundo mientras esté montado. */
function useAgeSeconds(since: Date | null): number | null {
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    if (!since) return;
    const id = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, [since]);
  if (!since) return null;
  return Math.max(0, Math.round((Date.now() - since.getTime()) / 1_000));
}

export function LiveStatus({ lastSyncedAt, failing, onRetry, className = '' }: LiveStatusProps): React.ReactElement | null {
  const t = useTranslations('phoenix.common');
  const age = useAgeSeconds(lastSyncedAt);

  if (failing) {
    return (
      <button
        type="button"
        onClick={onRetry}
        disabled={!onRetry}
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber hover:brightness-125 transition-all disabled:cursor-default ${className}`}
        title={t('syncFailingHint')}
      >
        <AlertTriangle className="w-3 h-3 shrink-0" />
        {t('syncFailing')}
        {onRetry && <RefreshCw className="w-3 h-3 shrink-0" />}
      </button>
    );
  }

  if (age === null) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 text-[10.5px] text-text-muted ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald shrink-0" />
      {age < 10
        ? t('syncedNow')
        : age < 60
          ? t('syncedSeconds', { seconds: age })
          : t('syncedMinutes', { minutes: Math.floor(age / 60) })}
    </span>
  );
}
