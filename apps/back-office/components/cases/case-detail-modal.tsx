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
import { conCasoAbierto, sinCasoAbierto } from '@/lib/case-modal-url';
import { SignDialog } from '@/app/attorney/cases/case-actions';

type ClientProps = React.ComponentProps<typeof CaseDetailClient>;

export function CaseDetailModal({
  caseInfo, auditEvents, variant = 'admin', initialTab, signature = null, patientCases = [],
}: {
  caseInfo: ClientProps['caseInfo'];
  auditEvents: ClientProps['auditEvents'];
  variant?: ClientProps['variant'];
  initialTab?: ClientProps['initialTab'];
  /**
   * Todos los casos de este paciente — dibuja el selector de arriba.
   *
   * Existe para el doctor: en la consulta está tratando al paciente AHORA y el
   * antecedente de una lesión anterior es lo que necesita leer, pero cada caso
   * era una pantalla a la que solo se llegaba volviendo a la lista. Con esto el
   * modal deja de ser "un caso" y pasa a ser "este paciente".
   *
   * Vacío o de un solo elemento no dibuja nada: un selector con una opción es
   * ruido.
   */
  patientCases?: Array<{ id: string; caseCode: string; caseType: string; status: string; createdAt: string }>;
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
        {/* Selector de casos del paciente.
            Va FUERA del área scrolleable y pegado arriba: es la respuesta a
            "¿qué más tuvo este paciente?", y si scrollea con el contenido
            desaparece justo cuando el doctor está leyendo el caso viejo y quiere
            volver al de hoy.
            Cambiar de caso SÍ pasa por el router (y no por `escribirUrl`): el
            caso lo arma el server desde `?case=`, así que acá hace falta que el
            árbol se vuelva a ejecutar. Es lo contrario del cambio de tab, que es
            puro estado del cliente. */}
        {patientCases.length > 1 && (
          <div className="shrink-0 border-b border-border px-4 sm:px-6 py-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted shrink-0">
              {t('patientCasesLabel', { count: patientCases.length })}
            </span>
            {patientCases.map((c) => {
              const actual = c.id === caseInfo.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={actual}
                  onClick={() => router.replace(conCasoAbierto(pathname, searchParams, c.id), { scroll: false })}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors ${
                    actual
                      ? 'bg-violet/15 text-violet-text border border-violet/40 cursor-default'
                      : 'border border-border text-text-2 hover:bg-white/5 hover:text-text-1'
                  }`}
                  title={`${c.caseType} · ${new Date(c.createdAt).toLocaleDateString()}`}
                >
                  {c.caseCode}
                </button>
              );
            })}
          </div>
        )}
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
