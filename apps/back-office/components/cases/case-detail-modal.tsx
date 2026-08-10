'use client';

/**
 * CaseDetailModal — el detalle de caso completo dentro de un modal grande.
 *
 * Lo monta `CaseUrlModal` cuando la pantalla lleva `?case=<id>` — Pacientes y
 * Calendario, en admin y en el portal del doctor. La lista queda montada debajo
 * con su búsqueda, sus filas expandidas y su scroll.
 *
 * El id va en la URL de la LISTA, no como ruta propia: así un refresh reproduce
 * la vista exacta. Antes se usaba una ruta interceptada y recargar servía la
 * página completa del caso, perdiendo la lista y la búsqueda. Los deep links a
 * `/front-office/[id]` siguen existiendo como página completa.
 */

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogTitle } from '@precision/ui';
import { CaseDetailClient } from '@/app/(admin)/front-office/[id]/case-detail-client';
import { sinCasoAbierto } from '@/lib/case-modal-url';

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('phoenix.caseDetail');

  /**
   * Cerrar = sacar `?case=` de la URL, no `router.back()`.
   *
   * Con `back()` el cierre dependía de que existiera una entrada anterior en el
   * historial: si entraste con la URL pegada o recargaste con el caso abierto,
   * el botón de cerrar te sacaba del sitio o no hacía nada. Quitar el parámetro
   * funciona en los dos casos.
   *
   * `replace`, no `push`: cerrar no es un paso nuevo de navegación, y con push
   * el botón Atrás del navegador volvía a abrir el caso.
   */
  const close = React.useCallback(() => {
    router.replace(sinCasoAbierto(pathname, searchParams), { scroll: false });
  }, [router, pathname, searchParams]);

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
