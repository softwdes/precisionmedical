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
import { ClipboardList, FileText, FlaskConical, Stethoscope, Bandage, Pill, CreditCard, FolderOpen, Loader2 } from 'lucide-react';
import { VisitSummary, type SummaryTriage } from '@/components/visit/visit-summary';
import { VisitNoteEditor, type VisitNoteData, type VisitNoteEditorHandle } from '@/components/visit/visit-note-editor';
import { useMensajesDelCaso, MensajesDelCasoCard, MensajeUrgenteStrip } from '@/components/visit/mensajes-del-caso';
import { edadEnAnios } from '@/lib/vitales-alerta';
import { LabsTab } from '@/components/visit/labs-tab';
import { BracesTab } from '@/components/visit/braces-tab';
import { RxIntegrationStatus } from '@/components/visit/rx-integration-status';
import { PatientContextPanel } from '@/components/visit/patient-context-panel';
import type { PatientContext } from '@/lib/patient-context';
import { CoverageChip } from '@/components/coverage/coverage-chip';
import type { PickableTemplate } from '@/components/visit/template-picker';
import { AppointmentDetailPanel } from '@/components/calendar/appointment-detail-panel';
import { FinanzasTab, type FinanzasTabHandle } from '@/components/cases/finanzas-tab';
import { DocumentsTab } from '@/components/cases/documents-tab';
import { EmptyState } from '@/components/ui-phoenix';
import type { CoverageDTO } from '@/lib/coverage';
import { useLiveSync } from '@/lib/use-live-sync';
import { LiveStatus } from '@/components/ui-phoenix/live-status';

type Tab = 'notes' | 'documentos' | 'labs' | 'rx' | 'services' | 'braces' | 'summary' | 'pay';

interface Props {
  appointmentId: string;
  /**
   * Para el botón de Historial Médico dentro de la nota. Va también del lado del
   * asistente: es quien más corrige la ficha (una alergia que el paciente
   * menciona en el mostrador) y en Pacientes ya la edita hoy.
   */
  patientId: string;
  /**
   * Quién está mirando — lo necesitan los mensajes del caso: el "sin leer" es
   * por persona y el diálogo del hilo no se puede montar sin saber quién es.
   */
  currentUserId: string | null;
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
  /**
   * ¿EXISTE el registro de triaje? Va aparte de `triage` porque en esta pantalla
   * `triage` se arma del espejo en vivo del formulario y sus campos pueden estar
   * todos en null sin que eso signifique "nadie tomó los vitales".
   */
  hasTriage?: boolean;
  /** Payload del panel de servicios y pagos (el mismo del viejo step 4) */
  servicesPanel: React.ComponentProps<typeof AppointmentDetailPanel>['appointment'];
  /** Saldo pendiente, para el panel de pagos */
  billingTotal?: number;
  /** Visita por videollamada — cambia lo que significa el bloque de vitales. */
  isOnline?: boolean;
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
  appointmentId, patientId, currentUserId, patientContext, appointmentStatus, checkedInAt, doctorDoneAt, checkedOutAt, providerName,
  triage, hasTriage, servicesPanel, billingTotal, coverage, onRefresh, onSync, isOnline = false,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  // ── Mensajes del caso ─────────────────────────────────────────────────────
  const mensajes = useMensajesDelCaso(patientId, servicesPanel.case?.id ?? null);
  const notaRef = React.useRef<VisitNoteEditorHandle>(null);
  /**
   * Lo dice el EDITOR, no esta pantalla: `soloLectura` depende de si el
   * asistente tomó la nota, y eso vive adentro del editor.
   */
  const [puedeEscribirNota, setPuedeEscribirNota] = React.useState(false);

  /** Abre en la nota, igual que la consulta del doctor. */
  const [tab, setTab] = React.useState<Tab>('notes');
  /** El Resumen pidió cobrar: salta al tab de Pagar y abre el modal de cobro al
   *  montarse. Se limpia al cambiar de tab a mano. */
  const [goToPayments, setGoToPayments] = React.useState(false);
  /** Handle del tab de cobro — es la única forma de abrirle el modal desde
   *  afuera, y duplicar la pantalla de cobro no es una opción. */
  const finanzasRef = React.useRef<FinanzasTabHandle>(null);
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
   * "Cobrar $X" del Resumen: cambia al tab de Pagar y el modal aparece solo, en
   * vez de dejar al asistente buscando dónde se paga.
   *
   * El `setTimeout` espera a que el hijo se monte y publique su handle — el ref
   * está vacío en el mismo tick en que cambia el tab. Y se apaga la bandera para
   * que el modal no vuelva a abrirse cada vez que se pase por este tab.
   */
  React.useEffect(() => {
    if (tab !== 'pay' || !goToPayments) return;
    const id = setTimeout(() => {
      finanzasRef.current?.reloadAndOpen();
      setGoToPayments(false);
    }, 0);
    return () => clearTimeout(id);
  }, [tab, goToPayments]);

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
    /**
     * Documentos va SEGUNDO, pegado a la nota, y no al final de la fila.
     *
     * Los otros seis tabs son la secuencia de lo que se HACE en la visita; este
     * es lo que se CONSULTA mientras se hace, y lo que se consulta se usa casi
     * siempre escribiendo la nota (el reporte del accidente, los records de
     * antes, la identificación). Al final de la fila quedaría separado del único
     * tab con el que se usa, y además detrás de Resumen y Pagar, que son el
     * cierre — nadie busca un documento después de cobrar.
     *
     * Es un tab y no el botón "Ver caso" por pedido de la clínica (Erick,
     * 2026-09-03): el expediente completo abre TODO —todas las citas, todos los
     * labs, la facturación— y acá lo único que quieren es leer los archivos sin
     * salir de la cita.
     */
    { id: 'documentos', label: t('tabDocuments'), icon: FolderOpen },
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
          <div className="lg:sticky lg:top-4 space-y-2">
            <PatientContextPanel patient={patientContext} />
            {/* Los mensajes del caso van DEBAJO del contexto y como hermano, no
                adentro: en mobile ese panel se pliega entero y un aviso
                escondido detrás de un tap no es un aviso. */}
            <MensajesDelCasoCard
              datos={mensajes}
              currentUserId={currentUserId}
              onCitar={puedeEscribirNota ? (html) => notaRef.current?.citarEnHpi(html) : null}
              motivoBloqueo={t('quoteBlockedTurn')}
            />
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
                isOnline={isOnline}
                edadPaciente={patientContext ? edadEnAnios(patientContext.dateOfBirth) : null}
                variant="assistant"
                appointmentId={appointmentId}
                appointmentStatus={appointmentStatus}
                providerName={providerName}
                note={note}
                triage={triage}
                hasTriage={hasTriage}
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
              <>
              {/* Un urgente sin leer, arriba de la nota. Va DESPUÉS del aviso
                  del turno que pinta el editor —el turno decide si podés
                  escribir— y por eso queda acá y no adentro del editor. */}
              <div className="mb-3">
                <MensajeUrgenteStrip datos={mensajes} currentUserId={currentUserId} />
              </div>
              <VisitNoteEditor
                ref={notaRef}
                onPuedeEscribirChange={setPuedeEscribirNota}
                appointmentId={appointmentId}
                patientId={patientId}
                note={note}
                templates={templates}
                userId={null}
                canSign={false}
                onSaved={() => { void loadNote(); }}
                onDirtyChange={(d) => { noteDirty.current = d; }}
                /* EL TURNO. Mientras el doctor está adentro con el paciente, el
                   asistente ve la nota en vivo pero no la escribe: los dos
                   tecleando a la vez no es colaboración, es la lotería de quién
                   guarda último. Cuando el doctor cierra la consulta el turno pasa
                   solo — y si se fue sin cerrarla, "Tomar la nota" desbloquea y
                   queda en la auditoría. El servidor aplica la misma regla. */
                turno={{
                  enConsulta: appointmentStatus === 'IN_PROGRESS' && !doctorDoneAt,
                  doctorName: providerName,
                }}
              />
              </>
            )}

            {/* DOCUMENTOS — el MISMO explorador del expediente, sin nada de
                alrededor. Es el componente del tab Documentos del caso, así que
                lo que se sube acá aparece allá y al revés: un solo lugar donde
                viven los archivos, dos puertas para entrar.

                Acá SÍ se puede subir (no va `readOnly`): quien está en el
                mostrador con el paciente es el que escanea la identificación y
                el reporte del accidente, y mandarlo al expediente para eso es
                mandarlo a otra pantalla a mitad de la visita.

                Y esto es también donde aparecen los archivos que se compartieron
                por mensajería: se archivan solos en la carpeta `Messages` del
                caso — ver `lib/messaging-documents.ts`.

                Sin caso no hay expediente, igual que en Pagar: se muestra el
                motivo en vez de una pantalla vacía. */}
            {tab === 'documentos' && (
              servicesPanel.case ? (
                <DocumentsTab caseId={servicesPanel.case.id} />
              ) : (
                <EmptyState.Rich icon={FolderOpen} title={t('docsNoCaseTitle')} subtitle={t('docsNoCaseHint')} />
              )
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

            {/* PAGAR — la plata de ESTA cita, leída de la FACTURACIÓN.
                `filterAppointmentId` la recorta a esta visita: el saldo del caso
                y su historial por fechas se ven en Pacientes (Erick, 2026-08-13).

                Antes acá vivía el panel de servicios en modo cobro, y esa era la
                lista equivocada: solo tiene CPT y efectivo, así que en una visita
                con laboratorios el tab mostraba $200 de cargos debajo de un total
                de $381.26. Los labs y las férulas no están en esa lista —cada uno
                tiene su tab— pero SÍ están en la facturación, que es de donde
                sale el monto que se cobra. Servicios sigue siendo donde se agrega
                y se quita; acá solo se cobra lo que ya quedó definido. */}
            {tab === 'pay' && (
              servicesPanel.case ? (
                <FinanzasTab
                  ref={finanzasRef}
                  caseId={servicesPanel.case.id}
                  filterAppointmentId={appointmentId}
                  /* Cobrar cambia el saldo que también muestran la píldora de
                     Servicios y el Resumen: sin este aviso seguían con el número
                     de antes del pago. */
                  onChanged={onRefresh}
                />
              ) : (
                <EmptyState.Rich icon={CreditCard} title={t('payNoCaseTitle')} subtitle={t('payNoCaseHint')} />
              )
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
