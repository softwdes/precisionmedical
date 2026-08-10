'use client';

/**
 * CaseDetailModal — el detalle de caso completo dentro de un modal grande.
 *
 * Lo renderizan las rutas INTERCEPTADAS (Pacientes admin y Mis Pacientes del
 * doctor): al hacer clic en "ver caso" la URL cambia a la del caso pero la
 * lista queda montada debajo — búsqueda, filas expandidas y scroll intactos.
 * Cerrar es router.back(). Un refresh o el link directo renderizan la página
 * completa de siempre (la intercepción solo aplica a navegación en cliente),
 * así que los deep links no cambian.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogTitle } from '@precision/ui';
import { CaseDetailClient } from '@/app/(admin)/front-office/[id]/case-detail-client';

type ClientProps = React.ComponentProps<typeof CaseDetailClient>;

export function CaseDetailModal({
  caseInfo, auditEvents, variant = 'admin', initialTab,
}: {
  caseInfo: ClientProps['caseInfo'];
  auditEvents: ClientProps['auditEvents'];
  variant?: ClientProps['variant'];
  initialTab?: ClientProps['initialTab'];
}): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('phoenix.caseDetail');

  const close = React.useCallback(() => router.back(), [router]);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-[1280px] w-[96vw] h-[94vh] p-0 overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">
          {t('caseModalTitle', { code: caseInfo.caseCode })}
        </DialogTitle>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          <CaseDetailClient
            caseInfo={caseInfo}
            auditEvents={auditEvents}
            variant={variant}
            initialTab={initialTab}
            inModal
            onClose={close}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
