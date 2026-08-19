'use client';

import { useTranslations } from 'next-intl';
import { UpdateBanner as SharedUpdateBanner } from '@precision/release';
import { clearSessionGuard } from '@/lib/useSessionGuard';

/**
 * Wrapper de app: la logica vive en @precision/release, aca solo traducimos y
 * reseteamos el contador de 12h de SessionGuard para que arranque limpio
 * despues del reload.
 */
export function UpdateBanner(): React.ReactElement | null {
  const t = useTranslations('updateBanner');

  return (
    <SharedUpdateBanner
      audience="admin"
      onBeforeReload={clearSessionGuard}
      labels={{
        available: t('available'),
        apply: t('apply'),
        applying: t('applying'),
      }}
    />
  );
}
