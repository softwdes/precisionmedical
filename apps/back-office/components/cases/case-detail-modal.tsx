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
import {
  Button, Dialog, DialogContent, DialogTitle,
  DialogHeader, DialogDescription, DialogFooter,
} from '@precision/ui';
import { CaseDetailClient } from '@/app/(admin)/front-office/[id]/case-detail-client';
import { sinCasoAbierto } from '@/lib/case-modal-url';
import { SignDialog } from '@/app/attorney/cases/case-actions';

type ClientProps = React.ComponentProps<typeof CaseDetailClient>;

export function CaseDetailModal({
  caseInfo, auditEvents, variant = 'admin', initialTab, signature = null,
}: {
  caseInfo: ClientProps['caseInfo'];
  auditEvents: ClientProps['auditEvents'];
  variant?: ClientProps['variant'];
  initialTab?: ClientProps['initialTab'];
  /**
   * Portal legal. El estado de la firma vive acá y no en la lista porque el
   * bloqueo de documentos abre el diálogo DESDE ADENTRO del modal: pasarlo por
   * la lista obligaría a cerrar el caso para firmar y volver a abrirlo.
   */
  signature?: { hasSigned: boolean; exempt: boolean; canSign: boolean; defaultName: string } | null;
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
  const ta = useTranslations('phoenix.attorney');
  const tc = useTranslations('phoenix.common');

  const [signing, setSigning] = React.useState(false);

  /**
   * Portal legal · segundo aviso ("Firma requerida"), el de v2.
   *
   * Aparece UNA vez al abrir el caso sin firma. Cancelar lo cierra y deja al
   * abogado dentro del modal —puede recorrer todo salvo los documentos—, y no
   * vuelve a molestar mientras el caso siga abierto: repetirlo en cada tab
   * convertiría el aviso en un obstáculo.
   *
   * Se pinta solo mientras la firma SIGA faltando: después de firmar, el
   * `router.refresh()` trae `hasSigned: true` y este estado deja de importar,
   * sin depender de que alguien se acuerde de bajarlo.
   */
  const signatureRequired = !!signature && !signature.hasSigned && !signature.exempt;
  const [gateDismissed, setGateDismissed] = React.useState(false);

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
            // Los documentos se cierran solo si falta la firma Y el caso no está
            // exento: un caso exento nunca va a firmarse, así que bloquearlo lo
            // dejaría cerrado para siempre.
            signatureRequired={signatureRequired}
            // Sin permiso para firmar no se ofrece el botón: rebotaría contra el
            // 403 del servidor y parecería que la pantalla está rota.
            onRequestSign={signature?.canSign ? () => setSigning(true) : undefined}
          />
        </div>
      </DialogContent>

      {signatureRequired && !gateDismissed && !signing && (
        <Dialog open onOpenChange={() => setGateDismissed(true)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{ta('signRequiredTitle')}</DialogTitle>
              <DialogDescription>{ta('signRequiredBody')}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setGateDismissed(true)}>
                {tc('cancel')}
              </Button>
              {/* Sin permiso para firmar no se ofrece el botón: rebotaría contra
                  el 403 del servidor y parecería que la pantalla está rota. */}
              {signature?.canSign && (
                <Button className="w-full sm:w-auto" onClick={() => { setGateDismissed(true); setSigning(true); }}>
                  {ta('signNow')}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {signing && signature && (
        <SignDialog
          caseRow={{
            id: caseInfo.id,
            caseCode: caseInfo.caseCode,
            hasSigned: signature.hasSigned,
            signatureExempt: signature.exempt,
            attorneyName: signature.defaultName,
          }}
          defaultName={signature.defaultName}
          onClose={() => setSigning(false)}
          // `refresh` y no cerrar el caso: la firma cambia lo que el modal
          // muestra (los documentos se abren), así que se recarga con el caso
          // todavía abierto.
          onSigned={() => { setSigning(false); router.refresh(); }}
        />
      )}
    </Dialog>
  );
}
