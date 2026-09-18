'use client';

/**
 * Los CARGOS de un caso, desde Finanzas.
 *
 * ## Por qué existe
 *
 * Finanzas sabía cobrar pero no facturar: aplicaba pagos contra cargos que ya
 * existían y no podía crear ni quitar ninguno. Eso vivía solo en My Day, Day
 * Admission y la vista del caso, y el que cobra —que es quien descubre que
 * falta una férula o que se cargó un servicio de más— tenía que ir a buscarlo a
 * otra pantalla (Erick, 18-sep-2026).
 *
 * ## Por qué NO se reimplementa nada
 *
 * Monta los MISMOS tabs de la vista del caso, `CaseServicesTab` y
 * `CaseBracesTab`, con el mismo hook. Vienen con todo puesto: el buscador único
 * sobre los dos catálogos (con seguro y sin seguro), las férulas, el orden por
 * la cobertura del paciente, el aviso de códigos repetidos y —lo que más
 * importa acá— **las reglas de borrado**, que viven en la API y no en el botón:
 * un cargo ya cobrado no se quita hasta que se anule su pago
 * (`lib/charge-payments.ts`).
 *
 * Una segunda implementación de "agregar un cargo" sería una segunda forma de
 * equivocarse con la plata, igual que lo sería una segunda del cobro.
 *
 * ## Sobre qué visitas trabaja
 *
 * Sobre las que YA EXISTEN, y nada más (decisión de Erick, 18-sep): Finanzas no
 * crea citas. `visitId = null` hace que los tabs listen todas las del caso, y
 * el cargo se agrega SIEMPRE a una visita elegida a mano.
 *
 * No es una formalidad: todo cargo cuelga de una cita —`appointmentId` es
 * obligatorio en `appointment_billing`— y si la pantalla eligiera sola "la más
 * reciente", en **1.289 de los 2.300 pacientes con deuda** esa cita tiene más
 * de seis meses (711 de ellos, más de un año). La férula vendida hoy quedaría
 * facturada en una consulta del año pasado.
 */

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@precision/ui';
import { useCaseClinical } from '@/components/cases/case-clinical-data';

/**
 * Diferidos, como en la vista del caso: `case-clinical-tabs` arrastra los
 * cuatro tabs con sus pickers y catálogos, y la cola de cobranzas se abre
 * muchas más veces de las que alguien toca los cargos.
 */
const CaseServicesTab = dynamic(() =>
  import('@/components/cases/case-clinical-tabs').then((m) => m.CaseServicesTab));
const CaseBracesTab = dynamic(() =>
  import('@/components/cases/case-clinical-tabs').then((m) => m.CaseBracesTab));

export interface CargosDialogProps {
  caseId: string;
  caseCode: string;
  /** Nombre del paciente, para que el diálogo diga de quién es la cuenta. */
  paciente: string;
  onClose: () => void;
  /** Se agregó o se quitó un cargo: la fila y los totales quedaron viejos. */
  onChanged: () => void;
}

export function CargosDialog({
  caseId, caseCode, paciente, onClose, onChanged,
}: CargosDialogProps): React.ReactElement {
  const t = useTranslations('phoenix.cobranzas');
  const clinical = useCaseClinical(caseId);

  /**
   * Avisar hacia afuera cuando cambian los cargos.
   *
   * Los tabs no tienen `onChanged`: recargan su propio `clinical` y nada más.
   * Mirar `visits` es la señal que sí emiten — cambia al agregar o quitar,
   * porque el cargo vive adentro de su visita.
   */
  useEffect(() => {
    if (clinical.loading) return;
    onChanged();
    // `onChanged` viene memorizado del padre; depender de `visits` es el punto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinical.visits]);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Sin botón de cerrar propio: `DialogContent` ya trae el suyo y se
            veían DOS X pegadas (visto en pantalla, 18-sep). `pr-12` le deja el
            lugar al del primitivo para que no se monte sobre el título. */}
        <div className="shrink-0 px-5 py-4 pr-12 border-b border-border min-w-0">
          <DialogTitle className="text-text-1 font-semibold text-base">
            {t('chargesTitle')}
          </DialogTitle>
          <p className="text-text-muted text-xs mt-0.5 truncate">
            <span className="font-mono text-cyan mr-1.5">{caseCode}</span>
            {paciente}
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">
          {clinical.loading ? (
            <div className="flex items-center gap-2 text-text-muted text-xs py-6">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('loading')}
            </div>
          ) : clinical.error ? (
            <p className="text-rose text-xs py-4">{t('chargesError')}</p>
          ) : (
            <>
              {/* Con seguro y sin seguro: el picker busca en los dos catálogos. */}
              <CaseServicesTab caseId={caseId} clinical={clinical} visitId={null} />
              <CaseBracesTab caseId={caseId} clinical={clinical} visitId={null} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
