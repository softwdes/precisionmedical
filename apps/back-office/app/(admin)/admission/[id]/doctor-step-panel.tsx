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
import { ClipboardList, FileText, FlaskConical, Stethoscope, Bandage, Pill, CreditCard, Loader2 } from 'lucide-react';
import { VisitSummary, type SummaryTriage } from '@/components/visit/visit-summary';
import { VisitNoteEditor, type VisitNoteData } from '@/components/visit/visit-note-editor';
import { LabsTab } from '@/components/visit/labs-tab';
import { BracesTab } from '@/components/visit/braces-tab';
import { RxIntegrationStatus } from '@/components/visit/rx-integration-status';
import { PatientContextPanel } from '@/components/visit/patient-context-panel';
import type { PatientContext } from '@/lib/patient-context';
import { CoverageChip } from '@/components/coverage/coverage-chip';
import type { PickableTemplate } from '@/components/visit/template-picker';
import { AppointmentDetailPanel } from '@/components/calendar/appointment-detail-panel';
import type { CoverageDTO } from '@/lib/coverage';
import { useLiveSync } from '@/lib/use-live-sync';
import { LiveStatus } from '@/components/ui-phoenix/live-status';

type Tab = 'notes' | 'labs' | 'rx' | 'services' | 'braces' | 'summary' | 'pay';

interface Props {
  appointmentId: string;
  /**
   * Para el botón de Historial Médico dentro de la nota. Va también del lado del
   * asistente: es quien más corrige la ficha (una alergia que el paciente
   * menciona en el mostrador) y en Pacientes ya la edita hoy.
   */
  patientId: string;
  /**
   * Contexto clínico para el panel izquierdo — el MISMO que ve el doctor.
   * `null` mientras la pantalla todavía no cargó el detalle de la cita.
   */
  patientContext: PatientContext | null;
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
  appointmentId, patientId, patientContext, appointmentStatus, checkedInAt, doctorDoneAt, checkedOutAt, providerName,
  triage, servicesPanel, billingTotal, coverage, onRefresh, onSync,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  /** Abre en la nota, igual que la consulta del doctor. */
  const [tab, setTab] = React.useState<Tab>('notes');
  /** El Resumen pidió cobrar: salta al tab de Pagar y abre el modal de cobro al
   *  montarse. Se limpia al cambiar de tab a mano. */
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

  // Sincronización en vivo con el portal del doctor, por PULSO.
  //
  // El doctor escribe y firma en su pantalla; acá se cargaba UNA vez al montar y
  // quedaba congelado: el asistente veía la nota vacía y el checklist diciendo
  // "sin firmar / sin diagnósticos" cuando el doctor ya había firmado.
  //
  // El pulso pesa ~60 bytes, así que se consulta cada 5 s en vez de traer todo
  // cada 20. Dos guardas que siguen valiendo:
  //  · Solo con la cita abierta (cerrada no cambia más).
  //  · NUNCA si el editor tiene cambios sin guardar — recargar por encima le
  //    borraría al asistente lo que está tipeando.
  const visitOpen = appointmentStatus !== 'COMPLETED' && appointmentStatus !== 'CANCELLED';
  const { lastSyncedAt, failing, syncNow } = useLiveSync({
    url: `/api/admin/pulse?appointmentId=${appointmentId}`,
    enabled: visitOpen,
    onChange: () => {
      if (noteDirty.current) return;
      void loadNote();
      // Silencioso: `onRefresh` prende el skeleton y borra los vitales.
      (onSync ?? onRefresh)();
    },
  });

  /**
   * El orden sigue el flujo real de la visita (Erick, 2026-08-13):
   *
   *   Nota → Labs → Recetas → Servicios → Férulas → Resumen → Pagar
   *
   * La nota primero, que es lo que el asistente lee y transcribe con el paciente
   * ahí; en el medio lo que se le hace y se le da; y al final el resumen —revisar
   * antes de cerrar— y el cobro, que es lo último que pasa en la visita. Deja al
   * asistente con la misma secuencia que el doctor, cuyo resumen es su paso 4.
   *
   * Antes abría en Summary y tenía "Servicios y pagos" en un solo tab. Ese orden
   * venía de pensar la pantalla como un tablero y no como una secuencia.
   */
  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'notes', label: t('tabNotes'), icon: FileText },
    { id: 'labs', label: t('tabLabs'), icon: FlaskConical },
    { id: 'rx', label: t('tabRx'), icon: Pill },
    { id: 'services', label: t('tabServices'), icon: Stethoscope },
    { id: 'braces', label: t('tabBraces'), icon: Bandage },
    { id: 'summary', label: t('tabSummary'), icon: ClipboardList },
    { id: 'pay', label: t('tabPay'), icon: CreditCard },
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
        {visitOpen && (
          <LiveStatus lastSyncedAt={lastSyncedAt} failing={failing} onRetry={syncNow} className="shrink-0" />
        )}
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

      {/* Contexto clínico del paciente a la izquierda + trabajo a la derecha.
          Las MISMAS medidas que la consulta del doctor (columna fija de 290px,
          pegada al scroll) porque tiene que verse igual de los dos lados
          (Erick, 2026-08-13). En mobile/iPad vertical el contexto se apila
          arriba, igual que allá.

          La barra de tabs queda arriba a lo ancho y no dentro de la columna
          derecha: el encabezado violeta del paso también cruza toda la tarjeta, y
          empezar los tabs recién a los 290px los dejaría desalineados de él. */}
      <div className={`px-3 py-4 grid grid-cols-1 gap-4 items-start ${patientContext && tab === 'notes' ? 'lg:grid-cols-[290px_1fr]' : ''}`}>
        {/* Solo en la nota, igual que la consulta del doctor: en los otros tabs el
            contenido son tablas y el ancho es el recurso escaso. */}
        {patientContext && tab === 'notes' && (
          <div className="lg:sticky lg:top-4">
            <PatientContextPanel patient={patientContext} />
          </div>
        )}
        <div className="min-w-0">
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
                onCollect={() => { setGoToPayments(true); setTab('pay'); }}
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
                patientId={patientId}
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
            {/* SERVICIOS — los cargos de ESTA visita. Sin nada de pagos:
                `hidePayments` deja solo la lista y el picker, que es lo que el
                asistente toca acá (agregar lo que ordenó el doctor, quitar lo que
                no se hizo). El cobro vive en su propio tab.

                Sigue siendo el panel de detalle de cita del calendario, que es el
                que ya tiene la lista de cargos de las tres fuentes. Que Day
                Admission tenga su propia composición en vez de embutir un panel
                pensado para modal queda como el paso que falta — ese panel lo
                comparten 6 pantallas y tocarlo de apuro rompe el calendario. */}
            {tab === 'services' && (
              <AppointmentDetailPanel
                inline
                noBorder
                hidePayments
                initialTab="services"
                appointment={servicesPanel}
                coverage={coverage}
                onClose={() => {}}
                onRefresh={onRefresh}
              />
            )}

            {/* PAGAR — la plata de ESTA cita.
                `billingTotal` viene recortado a esta cita y sin los CPT (esos los
                paga el seguro o el abogado meses después).

                NO va el historial de facturación del caso (Erick, 2026-08-13): en
                la cita se ve solo lo que hay que pagar. El historial del paciente
                se ve en Pacientes, que es donde está por fecha de cita — acá eran
                cargos de otras fechas compitiendo con los de hoy. */}
            {tab === 'pay' && (
              <AppointmentDetailPanel
                inline
                noBorder
                hideAddCharge
                initialTab="services"
                appointment={servicesPanel}
                coverage={coverage}
                openPaymentsOnMount={goToPayments}
                onClose={() => {}}
                onRefresh={onRefresh}
                billingTotal={billingTotal}
              />
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
