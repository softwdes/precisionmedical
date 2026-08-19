'use client';

import { UpdateBanner as SharedUpdateBanner } from '@precision/release';
import { clearSessionGuard } from '@/lib/useSessionGuard';
import { useT } from '@/lib/i18n';

/**
 * Wrapper de app: la logica vive en @precision/release.
 *
 * timeclock no usa next-intl —tiene su propio `useT`— y por eso el componente
 * compartido recibe los textos por props en vez de importar una libreria de
 * i18n.
 */
export function UpdateBanner(): React.ReactElement | null {
  const { t } = useT();

  return (
    <SharedUpdateBanner
      audience="timeclock"
      onBeforeReload={clearSessionGuard}
      labels={{
        available: t.updateAvailable,
        apply: t.updateApply,
        applying: t.updateApplying,
      }}
    />
  );
}
