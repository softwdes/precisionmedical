'use client';

import { useTranslations } from 'next-intl';
import { UpdateBanner as SharedUpdateBanner, type Audience } from '@precision/release';

/**
 * Wrapper de app: la logica vive en @precision/release, aca solo traducimos.
 *
 * `audience` la pasa cada layout porque back-office sirve tres portales
 * distintos —(admin), doctor y attorney— y cada uno ve sus propias notas.
 *
 * No hay `onBeforeReload`: back-office no tiene SessionGuard (solo `web` y
 * `timeclock` tienen `lib/useSessionGuard`), asi que no hay contador que
 * resetear antes de recargar.
 */
export function UpdateBanner({ audience }: { audience: Audience }): React.ReactElement | null {
  const t = useTranslations('updateBanner');

  return (
    <SharedUpdateBanner
      audience={audience}
      labels={{
        available: t('available'),
        apply: t('apply'),
        applying: t('applying'),
      }}
    />
  );
}
