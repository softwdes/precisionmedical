'use client';

/**
 * DoctorStepPanel — cuerpo del step 3 "In Room (Doctor)" en Day Admission.
 *
 * Reemplaza el placeholder "módulo en construcción" y absorbe el viejo step 4:
 * el asistente ve el MISMO resumen que el doctor y puede completar la nota, los
 * laboratorios y los servicios cuando el doctor no lo hizo — además de cobrar y
 * cerrar la cita con Checkout.
 *
 * Componentes compartidos con el portal médico (components/visit/*): un solo
 * lugar para la nota y las órdenes, dos formas de entrar.
 *
 * Límite por diseño: si la nota ya está FIRMADA es inmutable (HIPAA) y el
 * editor la muestra en solo lectura. Firmar sigue siendo exclusivo del doctor.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ClipboardList, FileText, FlaskConical, Briefcase, Bandage, Pill, Loader2 } from 'lucide-react';
import { VisitSummary, type SummaryTriage } from '@/components/visit/visit-summary';
import { VisitNoteEditor, type VisitNoteData } from '@/components/visit/visit-note-editor';
import { LabsTab } from '@/components/visit/labs-tab';
import { BracesTab } from '@/components/visit/braces-tab';
import { RxIntegrationStatus } from '@/components/visit/rx-integration-status';
import { CoverageChip } from '@/components/coverage/coverage-chip';
import type { PickableTemplate } from '@/components/visit/template-picker';
import { AppointmentDetailPanel } from '@/components/calendar/appointment-detail-panel';
import type { CoverageDTO } from '@/lib/coverage';

type Tab = 'summary' | 'notes' | 'labs' | 'rx' | 'braces' | 'services';

interface Props {
  appointmentId: string;
  appointmentStatus: string;
  checkedInAt: string | null;
  doctorDoneAt: string | null;
  checkedOutAt?: string | null;
  providerName: string | null;
  triage: SummaryTriage | null;
  /** Payload del panel de servicios y pagos (el mismo del viejo step 4) */
  servicesPanel: React.ComponentProps<typeof AppointmentDetailPanel>['appointment'];
  /** Saldo pendiente, para el panel de pagos */
  billingTotal?: number;
  /** Bloque extra bajo Servicios (historial de facturacion migrado) */
  servicesExtra?: React.ReactNode;
  /** Cobertura del caso — ordena el picker de cargos y se muestra ahí de referencia */
  coverage?: CoverageDTO;
  /** Recarga completa — para después de una acción del usuario (guardar, admitir). */
  onRefresh: () => void;
  /**
   * Refetch SILENCIOSO para el refresco en vivo. `onRefresh` no sirve: prende el
   * skeleton de pantalla completa y limpia el formulario de vitales de la MA.
   */
  onSync?: () => void;
}

export function DoctorStepPanel({
  appointmentId, appointmentStatus, checkedInAt, doctorDoneAt, checkedOutAt, providerName,
  triage, servicesPanel, billingTotal, servicesExtra, coverage, onRefresh, onSync,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  const [tab, setTab] = React.useState<Tab>('summary');
  /** El Resumen pidió cobrar: se salta al tab de Servicios y el panel abre el
   *  modal de "Pago del caso" al montarse. Se limpia al cambiar de tab a mano. */
  const [goToPayments, setGoToPayments] = React.useState(false);
  /** El editor tiene cambios sin guardar: no se recarga la nota por encima. */
  const noteDirty = React.useRef(false);
  const [note, setNote] = React.useState<VisitNoteData | null>(null);
  const [templates, setTemplates] = React.useState<PickableTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);

  // La nota y las plantillas se cargan por API — esta pantalla es client-side
  // (el portal médico las recibe del server component).
  const loadNote = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/visit-notes/${appointmentId}`);
      const d = await res.json() as { note?: VisitNoteData | null };
      setNote(d.note ?? null);
    } catch { /* la UI muestra la nota vacía */ }
  }, [appointmentId]);

  React.useEffect(() => {
    void (async () => {
      await Promise.all([
        loadNote(),
        // El GET devuelve las plantillas completas; acá solo hace falta lo que
        // el selector muestra. Los favoritos son personales del doctor, así que
        // desde admisión se listan sin marcar.
        fetch('/api/admin/templates')
          .then((r) => r.json())
          .then((d: { templates?: Array<{
            id: string; title: string; description: string | null; encounterType: string;
            isActive: boolean; sections: Array<{ sectionKey: string; content: string }>;
          }> }) => setTemplates(
            (d.templates ?? [])
              .filter((tpl) => tpl.isActive)
              .map((tpl) => ({
                id: tpl.id,
                title: tpl.title,
                description: tpl.description,
                encounterType: tpl.encounterType,
                isFavorite: false,
                sections: tpl.sections.map((s) => ({ sectionKey: s.sectionKey, content: s.content })),
              })),
          ))
          .catch(() => undefined),
      ]);
      setLoading(false);
    })();
  }, [loadNote]);

  // Sincronización en vivo con el portal del doctor.
  //
  // El doctor escribe y firma la nota en su pantalla; acá se cargaba UNA vez al
  // montar y quedaba congelada. El asistente veía la nota vacía y el checklist
  // diciendo "sin firmar / sin diagnósticos" cuando el doctor ya había firmado —
  // y no había forma de saberlo sin recargar a mano.
  //
  // Dos guardas:
  //  · Solo mientras la cita está abierta (cerrada no cambia más).
  //  · NUNCA si el editor tiene cambios sin guardar: recargar por encima le
  //    borraría al asistente lo que está tipeando.
  const visitOpen = appointmentStatus !== 'COMPLETED' && appointmentStatus !== 'CANCELLED';
  React.useEffect(() => {
    if (!visitOpen) return;
    const tick = (): void => {
      // Pestaña en segundo plano: no tiene sentido pedir datos que nadie ve. Al
      // volver, el listener de `focus` trae todo al instante.
      if (document.visibilityState === 'hidden') return;
      if (noteDirty.current) return;
      void loadNote();
      // Silencioso: `onRefresh` prendía el skeleton y borraba los vitales.
      (onSync ?? onRefresh)();
    };
    const id = setInterval(tick, 20_000);
    const onFocus = (): void => tick();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [visitOpen, loadNote, onSync, onRefresh]);

  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'summary', label: t('tabSummary'), icon: ClipboardList },
    { id: 'notes', label: t('tabNotes'), icon: FileText },
    { id: 'labs', label: t('tabLabs'), icon: FlaskConical },
    { id: 'rx', label: t('tabRx'), icon: Pill },
    { id: 'braces', label: t('tabBraces'), icon: Bandage },
    { id: 'services', label: t('tabServicesPayments'), icon: Briefcase },
  ];

  return (
    <div className="rounded-lg bg-bg-2/40 overflow-hidden">
      {/* Header del nodo */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-bg-3">
        <div className="w-7 h-7 rounded-full bg-violet flex items-center justify-center text-white font-bold text-[11px] shrink-0">3</div>
        <div className="flex-1 min-w-0">
          <div className="text-violet-text font-bold text-[13px]">{t('stepDoctor')}</div>
          <div className="text-violet-text/60 text-[10px]">{t('stepDoctorAssistantDesc')}</div>
        </div>
        {/* Cobertura acá también: el asistente trabaja los cargos en este step y
            el chip vivía solo en el sidebar del step 2 — lo veía antes de entrar y
            después tenía que acordarse. En la consulta del doctor está siempre en
            el encabezado; esto lo iguala. */}
        {coverage && (
          <CoverageChip caseId={servicesPanel.case?.id ?? null} coverage={coverage} />
        )}
        {providerName && (
          <div className="text-[10px] font-semibold text-violet-text bg-violet/15 border border-violet/25 px-2 py-0.5 rounded-full shrink-0">
            {providerName}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bg-3 px-3 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setGoToPayments(false); setTab(id); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === id ? 'text-violet-text border-violet' : 'text-text-muted border-transparent hover:text-text-1'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="px-3 py-4">
        {loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-text-muted text-[12px]">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('sumLoading')}
          </div>
        ) : (
          <>
            {tab === 'summary' && (
              <VisitSummary
                variant="assistant"
                appointmentId={appointmentId}
                appointmentStatus={appointmentStatus}
                providerName={providerName}
                note={note}
                triage={triage}
                services={(servicesPanel.plannedServiceCodes ?? []) as Array<{ id: string; code: string; description: string; fee?: number }>}
                checkedInAt={checkedInAt}
                doctorDoneAt={doctorDoneAt}
                checkedOutAt={checkedOutAt}
                // El saldo de facturación es la autoridad del monto a cobrar.
                balanceDue={billingTotal}
                onCollect={() => { setGoToPayments(true); setTab('services'); }}
                onFix={(target) => setTab(target)}
                onStatusChange={onRefresh}
                followUp={servicesPanel.case ? {
                  caseId: servicesPanel.case.id,
                  caseCode: servicesPanel.case.caseCode,
                  patient: {
                    firstName: servicesPanel.patient.firstName,
                    lastName: servicesPanel.patient.lastName,
                  },
                  defaultProviderId: servicesPanel.provider?.id ?? null,
                } : null}
              />
            )}

            {tab === 'notes' && (
              <VisitNoteEditor
                appointmentId={appointmentId}
                note={note}
                templates={templates}
                userId={null}
                canSign={false}
                onSaved={() => { void loadNote(); }}
                onDirtyChange={(d) => { noteDirty.current = d; }}
              />
            )}

            {tab === 'labs' && (
              <LabsTab
                appointmentId={appointmentId}
                userId={null}
                defaultProviderId={servicesPanel.provider?.id ?? null}
              />
            )}

            {/* Receta — el MISMO componente del portal del doctor, en modo
                lectura: el asistente necesita responder "¿se le mandó la receta
                a la farmacia?" en el checkout, pero prescribir y repetir son del
                médico (misma regla que `canSign` en la nota). */}
            {tab === 'rx' && <RxIntegrationStatus appointmentId={appointmentId} readOnly />}

            {/* Férulas / DME — el mismo componente que usa el doctor en su portal.
                El cobro cae solo en "Servicios y pagos": se paga todo junto. */}
            {tab === 'braces' && <BracesTab appointmentId={appointmentId} />}

            {/* Servicios y pagos — el panel del viejo step 4, con cobro habilitado */}
            {tab === 'services' && (
              <>
                <AppointmentDetailPanel
                  inline
                  noBorder
                  initialTab="services"
                  appointment={servicesPanel}
                  coverage={coverage}
                  openPaymentsOnMount={goToPayments}
                  onClose={() => {}}
                  onRefresh={onRefresh}
                  billingTotal={billingTotal}
                />
                {servicesExtra}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
