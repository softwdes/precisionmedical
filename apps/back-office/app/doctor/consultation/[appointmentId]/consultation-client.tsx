'use client';
import { localeApp, edad } from '@/lib/fechas';

/**
 * Portal Médico · Consulta — client (D3 shell)
 *
 * Nodos de flujo estilo Day Admission (versión doctor, identidad violet) +
 * contexto del paciente + tabs en el orden confirmado:
 * Triaje · Notas · Laboratorios · Prescripción · Servicios.
 * Notas/Labs/Rx llegan en D4 con la información de Erick.
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft, Check, ChevronRight, ClipboardList, FlaskConical, FileText, FolderOpen, Pill, Briefcase, Bandage,
  HeartPulse, Video,
} from 'lucide-react';
import { PageHeader, EmptyState, TagPill, PersonAvatar } from '@/components/ui-phoenix';
import { CoverageChip } from '@/components/coverage/coverage-chip';
import type { CoverageDTO } from '@/lib/coverage';
import { AppointmentDetailPanel } from '@/components/calendar/appointment-detail-panel';
import { VisitNoteEditor, type VisitNoteData } from '@/components/visit/visit-note-editor';
import type { PickableTemplate } from '@/components/visit/template-picker';
import { TriageVitalsForm } from '@/components/visit/triage-vitals-form';
import { PatientContextPanel, type PatientContext } from '@/components/visit/patient-context-panel';
import { LabsTab } from '@/components/visit/labs-tab';
import { VisitSummary } from '@/components/visit/visit-summary';
import { MedicationHistory } from '@/components/visit/medication-history';
import { RxIntegrationStatus } from '@/components/visit/rx-integration-status';
import { BracesTab } from '@/components/visit/braces-tab';
import { DocumentsTab } from '@/components/cases/documents-tab';
import { useMensajesDelCaso, MensajesDelCasoCard, MensajeUrgenteStrip } from '@/components/visit/mensajes-del-caso';
import type { VisitNoteEditorHandle } from '@/components/visit/visit-note-editor';
import { conCasoAbierto } from '@/lib/case-modal-url';
import { edadEnAnios } from '@/lib/vitales-alerta';

export interface ConsultationTriage {
  heightFt: number | null; heightIn: number | null; heightCm: number | null;
  weightLbs: number | null; weightOz: number | null; weightKg: number | null;
  systolicMmhg: number | null; diastolicMmhg: number | null;
  systolicMmhg2: number | null; diastolicMmhg2: number | null;
  pulseBpm: number | null; pulseBpm2: number | null;
  respiratoryRate: number | null; respiratoryRate2: number | null;
  tempFahrenheit: number | null; tempFahrenheit2: number | null;
  tempCelsius: number | null; tempCelsius2: number | null;
  painScale: number | null;
  o2Saturation: number | null; onRoomAir: boolean; o2Comment: string | null;
  visualAcuityRight: string | null; visualAcuityLeft: string | null;
  visualAcuityBoth: string | null; visionCorrected: boolean;
  chiefComplaint: string | null;
}

export interface ConsultationAppointment {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  status: string;
  type: string;
  isOnline: boolean;
  meetingUrl: string | null;
  checkedInAt: string | null;
  attendanceSignedAt: string | null;
  noteStatus: string | null;
  /** El doctor ya terminó con el paciente (nodo 4) — no cierra la cita */
  doctorDoneAt: string | null;
  /** El asistente cerró la visita — cierra el reloj de tiempo en clínica */
  checkedOutAt: string | null;
  clinicName: string;
  caseId: string | null;
  caseCode: string | null;
  /** ¿Quién paga? Decide qué catálogo abre primero el picker de cargos. */
  coverage: CoverageDTO;
  /** Verificación del caso — mismas fuentes que Day Admission */
  verification: {
    healthForm: boolean;
    consents: boolean;
    pip: boolean;
    insuranceName: string | null;
  };
  /** Payload del panel de servicios compartido con Day Admission */
  servicesPanel: React.ComponentProps<typeof AppointmentDetailPanel>['appointment'];
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    sex: string | null;
    phone: string | null;
  };
  triage: ConsultationTriage | null;
}

type Tab = 'notes' | 'documentos' | 'labs' | 'rx' | 'services' | 'braces';
/** 4 nodos: el 4 es Resumen y salida (el cobro sigue siendo del asistente) */
type StepView = 1 | 2 | 3 | 4;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(localeApp(), {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Denver',
  });
}

/** Campo read-only — misma caja de valor que los inputs del triaje de Day Admission */
function F({ label, value, accent, align = 'center' }: { label: string; value: React.ReactNode; accent?: 'amber'; align?: 'center' | 'left' }): React.ReactElement {
  const empty = value === null || value === undefined || value === '';
  // Clases idénticas al VInput del triaje de Day Admission (read-only)
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">{label}</div>
      <div className={`w-full bg-bg-2 border border-border rounded-md px-2.5 py-1.5 text-[13px] font-semibold tabular-nums truncate ${align === 'center' ? 'text-center' : 'text-left'} ${empty ? 'text-text-muted' : accent === 'amber' ? 'text-amber' : 'text-text-1'}`}>
        {empty ? '—' : value}
      </div>
    </div>
  );
}

/** Sección de vitales con header cyan + emoji — espejo de Day Admission */
function VSection({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <div className="text-[10px] font-bold text-cyan uppercase tracking-wider flex items-center gap-1.5 mb-2">
        <span>{emoji}</span>{title}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

/** Separador de toma (1ª / 2ª) — espejo de Day Admission */
function ReadingDivider({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold text-cyan uppercase tracking-wider shrink-0">{label}</span>
      <div className="flex-1 h-px bg-bg-3" />
    </div>
  );
}

export function ConsultationClient({
  appointment: a, note, templates, userId, patientContext, llegadaPropia = false,
  casosDelPaciente = 1,
}: {
  appointment: ConsultationAppointment;
  note: VisitNoteData | null;
  templates: PickableTemplate[];
  userId: string | null;
  patientContext: PatientContext;
  /**
   * La llegada la marcó el propio provider (no el mostrador). Habilita el
   * Checkout en el Resumen — ver la prop homónima de `VisitSummary`.
   */
  llegadaPropia?: boolean;
  /**
   * Cuántos casos tiene este paciente en total. Dibuja el "+N" del chip del
   * expediente — el doctor sabe si hay antecedentes sin abrir nada.
   */
  casosDelPaciente?: number;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  /** El vocabulario del triaje vive en `phoenix.admission` — una sola copia. */
  const ta = useTranslations('phoenix.admission');
  const router = useRouter();
  /**
   * Se llegó desde la cola de notas sin cerrar de Mi Día. El "volver" tiene que
   * devolver la cola ABIERTA para seguir con la siguiente; sin esto la nota se
   * firmaba y había que reabrir la lista a mano, una vez por nota.
   */
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const desdeNotas = searchParams.get('desde') === 'notas';

  // ── Mensajes del caso · el mismo bloque que Day Admission ─────────────────
  const mensajes = useMensajesDelCaso(patientContext.id, a.caseId ?? null);
  const notaRef = React.useRef<VisitNoteEditorHandle>(null);
  const [puedeEscribirNota, setPuedeEscribirNota] = React.useState(false);

  /** Marcando la llegada desde el nodo 1 — ver el bloque que lo usa. */
  const [marcando, setMarcando] = React.useState(false);
  const marcarLlegada = async (): Promise<void> => {
    setMarcando(true);
    try {
      await fetch(`/api/admin/admission/${a.id}/check-in`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        // `source` deja asentado en el audit log que la llegada la marcó el
        // provider: de eso depende que el Resumen le ofrezca también el Checkout.
        body:    JSON.stringify({ source: 'doctor-portal' }),
      });
      router.refresh();
    } finally {
      setMarcando(false);
    }
  };

  const hasTriage = !!a.triage;
  const isInRoom = a.status === 'IN_PROGRESS';
  const isCompleted = a.status === 'COMPLETED';
  const age = edad(a.patient.dateOfBirth);
  const tr = a.triage;

  /**
   * Paso actual del flujo. Si el doctor ya terminó, el Resumen.
   *
   * `isInRoom` NO cuenta para saltar al nodo 3. Contaba, y desde que "Atender"
   * pasa a sala ANTES de abrir la consulta eso mandaba siempre al área de
   * trabajo: el doctor solo, que es el que tiene que tomar los signos, aterrizaba
   * pasado el triaje y el formulario quedaba escondido detrás de un nodo que
   * nadie tenía motivo para tocar. El triaje se saltaba en silencio.
   *
   * Ahora el que manda es el DATO: sin vitales, el paso pendiente es el 2 — esté
   * el paciente en sala o no. Es también lo que reemplaza al viejo candado de
   * "no atender sin triaje": en vez de bloquear, se pasa por el mismo lugar.
   *
   * Las visitas online van al 3: por video nadie puede tomar la presión, así que
   * ahí la ausencia de vitales no es un paso pendiente.
   */
  const currentStep = (a.doctorDoneAt ? 4 : isCompleted || hasTriage || a.isOnline ? 3 : 2) as StepView;
  // Navegación libre entre nodos — arranca en el paso actual
  const [view, setView] = React.useState<StepView>(currentStep);
  const [tab, setTab] = React.useState<Tab>('notes');
  const isCurrent = (n: StepView): boolean => n === currentStep;

  // El Resumen (nodo 4) lee la nota del payload del SERVER, así que hay que
  // refrescarlo al entrar: si no, el doctor escribe diagnósticos y el checklist
  // le dice que faltan.
  //
  // Va acá y NO en el `onSaved` del editor: con el autoguardado por debounce
  // (2,5 s) eso disparaba un `router.refresh()` cada dos teclas — un re-render
  // del server component entero mientras el doctor escribe.
  /**
   * Saldo de ESTA visita, solo cuando el provider recibió él al paciente.
   *
   * Cuando está solo hace el proceso entero, cobranza incluida (Erick,
   * 1-sep-2026): no hay mostrador donde el paciente pague al salir. Esconderle el
   * botón no evita que reciba el efectivo — evita que quede registrado, que es
   * peor. El endpoint de pago ya audita al actor (`REGISTER_BILLING_PAYMENT`),
   * así que se puede revisar después cuáles cobró el provider sin tocar el
   * camino del dinero.
   *
   * La fórmula es la MISMA que usa el asistente en Day Admission, y el `payer
   * !== 'INSURANCE'` no es un detalle: los CPT se le cobran al seguro o al
   * abogado meses después, y pedírselos al paciente sería cobrarle plata que no
   * le toca (Erick 2026-08-08). Una segunda fórmula acá daría dos montos
   * distintos para el mismo paciente según quién mire.
   */
  const [saldoVisita, setSaldoVisita] = React.useState<number | undefined>(undefined);
  const cargarSaldo = React.useCallback(async (): Promise<void> => {
    if (!llegadaPropia || !a.caseId) return;
    try {
      const res = await fetch(`/api/admin/cases/${a.caseId}/billing`);
      const data = await res.json() as { billings?: Array<{ appointmentId: string | null; payer: string; balanceDue: number }> };
      const total = (data.billings ?? [])
        .filter((b) => b.appointmentId === a.id && b.payer !== 'INSURANCE')
        .reduce((s, b) => s + b.balanceDue, 0);
      setSaldoVisita(total || undefined);
    } catch { /* sin saldo el Resumen simplemente no ofrece cobrar */ }
  }, [llegadaPropia, a.caseId, a.id]);

  React.useEffect(() => {
    if (view === 4) { router.refresh(); void cargarSaldo(); }
  }, [view, router, cargarSaldo]);

  // Nodos del flujo del doctor — 4 pasos. El cobro es del asistente, salvo
  // cuando el provider recibió él al paciente: ahí no hay a quién entregárselo
  // y cierra y cobra él (ver `saldoVisita`).
  // `short` es la etiqueta de mobile: los 4 pasos tienen que entrar en 375px
  // sin scroll horizontal (antes el riel medía 712px y el paso 4 quedaba fuera).
  const steps: Array<{ n: StepView; label: string; short: string; desc: string; done: boolean; current: boolean }> = [
    { n: 1, label: t('stepCheckin'), short: t('stepCheckinShort'), desc: t('stepCheckinDesc'), done: !!a.checkedInAt || isInRoom || isCompleted, current: isCurrent(1) },
    { n: 2, label: t('stepTriage'),  short: t('stepTriageShort'),  desc: t('stepTriageDesc'),  done: hasTriage || isInRoom || isCompleted,      current: isCurrent(2) },
    { n: 3, label: t('stepDoctor'),  short: t('stepDoctorShort'),  desc: t('stepDoctorDesc'),  done: !!a.doctorDoneAt || isCompleted,            current: isCurrent(3) },
    { n: 4, label: t('stepSummary'), short: t('stepSummaryShort'), desc: t('stepSummaryDesc'), done: !!a.doctorDoneAt,                           current: isCurrent(4) },
  ];

  // Tabs del área de trabajo del doctor (nodo 3) — Servicios a la derecha de Prescripción
  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'notes',    label: t('tabNotes'),    icon: FileText },
    /* Documentos pegado a la nota — el mismo orden y el mismo motivo que en Day
       Admission (ver el comentario largo en `doctor-step-panel.tsx`). El botón
       "Ver caso" del encabezado se queda: son dos cosas distintas, este tab lee
       los archivos de este paciente y ese abre el expediente entero. */
    { id: 'documentos', label: t('tabDocuments'), icon: FolderOpen },
    { id: 'labs',     label: t('tabLabs'),     icon: FlaskConical },
    { id: 'rx',       label: t('tabRx'),       icon: Pill },
    { id: 'services', label: t('tabServices'), icon: Briefcase },
    { id: 'braces',   label: t('tabBraces'),   icon: Bandage },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <PersonAvatar firstName={a.patient.firstName} lastName={a.patient.lastName} size={12} gradientClass="bg-gradient-to-br from-violet to-[#a78bfa]" />
          <div className="min-w-0">
            <PageHeader
              title={`${a.patient.firstName} ${a.patient.lastName}`}
              subtitle={
                <span className="flex items-center gap-2 flex-wrap">
                  {/**
                    * El código del caso ES el botón del expediente.
                    *
                    * Nació como un botón neutro arriba a la derecha, al lado de
                    * "Volver": ahí se leía como chrome de la pantalla y no como
                    * una herramienta, y encima quedaba lejos del nombre, que es
                    * donde el doctor está mirando. Acá el gesto es obvio —el
                    * código del caso lleva al caso— y no hace falta inventar una
                    * etiqueta.
                    *
                    * Violet y no verde: en esta pantalla el emerald ya significa
                    * "hecho/confirmado" (check-in, pasos completados, Atender).
                    * Un expediente en verde competiría con la acción principal y
                    * diría algo que no es. Violet es la identidad del portal
                    * médico (Regla #5).
                    */}
                  {a.caseCode && a.caseId && (
                    /**
                     * Tiene que leerse como CONTROL, no como chip.
                     *
                     * Primero fue solo el código con un ícono, y no se notaba que
                     * se podía tocar (Erick): esta fila es la de las etiquetas de
                     * estado —`In consultation`, la cobertura— y el ojo ya
                     * aprendió que acá las cosas se leen, no se aprietan. Un chip
                     * en la fila de los chips se lee como chip.
                     *
                     * Tres señales lo sacan de esa categoría, y hacen falta las
                     * tres: el VERBO ("Ver caso" promete que algo va a pasar,
                     * "GM-3153" solo nombra), la FLECHA (te lleva a algún lado) y
                     * la ALTURA (`py-1` contra los chips planos de al lado).
                     *
                     * El verbo se esconde en mobile y queda el código, que es lo
                     * que identifica — Regla #4.
                     */
                    <button
                      type="button"
                      onClick={() => router.push(conCasoAbierto(pathname, searchParams, a.caseId!), { scroll: false })}
                      className="group/case inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-violet/50 bg-violet/[0.14] text-violet-text hover:bg-violet/25 hover:border-violet/70 transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline text-[11px] font-semibold">{t('consultOpenCase')}</span>
                      <span className="font-mono text-[11px] font-semibold opacity-90">{a.caseCode}</span>
                      {/* Cuántos antecedentes tiene, sin abrir nada. Con un solo
                          caso no se dibuja: "+0" no informa. */}
                      {casosDelPaciente > 1 && (
                        <span className="text-[10px] font-bold rounded bg-violet/25 px-1 py-px">
                          +{casosDelPaciente - 1}
                        </span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform group-hover/case:translate-x-0.5" />
                    </button>
                  )}
                  {/* Sin caso vinculado no hay expediente que abrir. */}
                  {a.caseCode && !a.caseId && <span className="font-mono text-[11px] text-cyan">{a.caseCode}</span>}
                  <span>{timeLabel(a.scheduledFor)} · {a.durationMinutes} min</span>
                  {age != null && <span>· {age} {t('yearsShort')}</span>}
                  {a.patient.sex && <span>· {a.patient.sex}</span>}
                  <span>· {a.clinicName}</span>
                  {a.isOnline && <Video className="w-3.5 h-3.5 text-cyan" />}
                  {isInRoom && <TagPill label={t('statusInProgress')} colorClass="bg-violet/15 text-violet-text border-violet/30" />}
                  {/* Quién paga, en la línea que el doctor ya lee. Editable: si
                      está sin definir, se resuelve acá sin salir de la consulta. */}
                  <CoverageChip caseId={a.caseId} coverage={a.coverage} />
                </span>
              }
            />
          </div>
        </div>
        {/* El expediente NO va acá: vive en el chip del código de caso, bajo el
            nombre. Dos puertas a lo mismo son ruido, y en esta esquina se leía
            como chrome. */}
        <Link
          href={desdeNotas ? '/doctor?notas=1' : '/doctor'}
          className="h-9 px-3 rounded-md border border-border text-text-2 text-xs font-semibold hover:bg-white/5 transition-colors flex items-center gap-1.5 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('consultBack')}
        </Link>
      </div>

      {/* Nodos de flujo — navegación LIBRE, estilo Day Admission (clic para ver cada paso).
          Mobile/iPad vertical: grid de 4 celdas (icono arriba, etiqueta corta abajo) —
          los 4 pasos entran en 375px sin swipe. Desde lg: el riel horizontal con
          descripciones y conectores, igual que Day Admission. */}
      <div className="rounded-lg bg-bg-2/30 px-2 py-2 sm:px-4 sm:py-3">
        <div className="grid grid-cols-4 gap-1 lg:flex lg:items-center">
          {steps.map((s, i) => (
            <React.Fragment key={s.label}>
              <button
                type="button"
                onClick={() => setView(s.n)}
                aria-current={view === s.n ? 'step' : undefined}
                className={`flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1 lg:gap-2 min-h-11 lg:min-h-0 lg:shrink-0 rounded-md px-1 py-1.5 lg:px-2 lg:-mx-1 transition-all text-center lg:text-left ${
                  view === s.n ? 'bg-bg-2/70 ring-1 ring-violet/40' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    s.done
                      ? 'bg-emerald text-white'
                      : s.current
                        ? 'bg-violet text-white'
                        : 'bg-bg-2 text-text-muted border border-border'
                  }`}
                >
                  {s.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <div className="min-w-0 w-full lg:w-auto">
                  <div className={`text-[10px] lg:text-[12px] font-bold leading-tight truncate ${s.current ? 'text-violet-text' : s.done ? 'text-emerald' : 'text-text-muted'}`}>
                    <span className="lg:hidden">{s.short}</span>
                    <span className="hidden lg:inline">{s.label}</span>
                  </div>
                  <div className="text-[9.5px] text-text-muted hidden lg:block">{s.desc}</div>
                </div>
              </button>
              {i < steps.length - 1 && <div className="hidden lg:block flex-1 h-px bg-bg-3 mx-3 min-w-[16px]" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Banner al ver un paso distinto al actual — igual que Day Admission */}
      {view !== currentStep && (
        <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          {/* El paso 2 sin triaje NO es solo lectura: ahí el doctor lo carga.
              Dejar el "solo lectura" del cartel contradiciendo un formulario
              editable justo debajo es peor que no poner nada. */}
          <span className="text-[11px] text-amber">
            {view === 2 && !hasTriage
              ? t('viewingStepEditable', { n: view })
              : t('viewingStep', { n: view })}
          </span>
          <button
            type="button"
            onClick={() => setView(currentStep)}
            className="text-[11px] font-semibold text-amber hover:underline shrink-0"
          >
            ← {t('backToCurrent')}
          </button>
        </div>
      )}

      {/* ── Nodo 1: Check-in — resumen de llegada ── */}
      {view === 1 && (
        <div className="rounded-lg bg-bg-2/30 p-4 space-y-3 max-w-xl">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald" />
            {t('stepCheckin')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <F
              label={t('stepCheckin')}
              value={a.checkedInAt ? timeLabel(a.checkedInAt) : null}
            />
            <F
              label={t('attendanceLabel')}
              value={a.attendanceSignedAt ? timeLabel(a.attendanceSignedAt) : null}
            />
          </div>
          {/**
            * Sin llegada marcada, el doctor la marca él.
            *
            * Espejo exacto del nodo 2: acá había un cartel ámbar que decía "el
            * paciente aún no hace check-in en recepción" y no ofrecía nada, con
            * el paciente ya sentado enfrente. En varias clínicas no hay
            * recepcionista ni asistente y el provider hace todo (Erick,
            * 31-ago-2026), así que el cartel señalaba a alguien que no existe.
            *
            * Es el MISMO endpoint del mostrador: lo que marque el doctor es la
            * misma llegada que ve el asistente en Day Admission, no una copia.
            */}
          {!a.checkedInAt && (
            <div className="space-y-2.5">
              <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber flex items-start gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>{ta('checkinDoctorCapture')}</span>
              </div>
              <button
                type="button"
                onClick={() => void marcarLlegada()}
                disabled={marcando}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-bold disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #10B981, #14b8a6)', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}
              >
                <Check className="w-4 h-4" />
                {marcando ? ta('checkinMarking') : ta('checkIn')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Nodo 2: Triaje y verificación (lectura del TriageRecord del MA) ── */}
      {view === 2 && (
        <div className="space-y-4">
          {/* Verificación — mismos indicadores que ve el asistente en Day Admission */}
          <div className="flex items-center gap-2 flex-wrap">
            <TagPill
              label={`${t('docHealthForm')} ${a.verification.healthForm ? '✓' : '· ' + t('pendingLabel')}`}
              colorClass={a.verification.healthForm ? 'bg-emerald/15 text-emerald border-emerald/30' : 'bg-amber/15 text-amber border-amber/30'}
            />
            <TagPill
              label={`${t('docConsents')} ${a.verification.consents ? '✓' : '· ' + t('pendingLabel')}`}
              colorClass={a.verification.consents ? 'bg-emerald/15 text-emerald border-emerald/30' : 'bg-amber/15 text-amber border-amber/30'}
            />
            <TagPill
              label={`PIP ${a.verification.pip ? '✓' : '· ' + t('notVerified')}`}
              colorClass={a.verification.pip ? 'bg-emerald/15 text-emerald border-emerald/30' : 'bg-amber/15 text-amber border-amber/30'}
            />
            {a.verification.insuranceName ? (
              <TagPill label={`${t('insuranceLabel')}: ${a.verification.insuranceName}`} colorClass="bg-cyan/15 text-cyan border-cyan/30" />
            ) : (
              <TagPill label={t('insuranceNone')} colorClass="bg-amber/15 text-amber border-amber/30" />
            )}
          </div>

          {!hasTriage || !tr ? (
            /**
             * Sin triaje, el doctor lo carga él.
             *
             * Antes acá había un `EmptyState` y el camino se terminaba: la
             * pantalla le decía que el asistente no había cargado nada y no le
             * ofrecía nada (Erick, 2026-08-13 — "actualmente no ve nada y se
             * frustra"). En la clínica pasa que el asistente no llegó y el
             * médico ya tiene al paciente delante.
             *
             * Es el MISMO formulario de Day Admission, así que lo que cargue el
             * doctor es el mismo registro que ve el asistente — no una copia.
             */
            <div className="space-y-3">
              <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber flex items-start gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>{ta('triageDoctorCapture')}</span>
              </div>
              <TriageVitalsForm
                isOnline={a.isOnline}
                key={a.id}
                appointmentId={a.id}
                initial={null}
                onSaved={() => router.refresh()}
                edadPaciente={edadEnAnios(patientContext.dateOfBirth)}
              />
            </div>
          ) : (
          <div className="rounded-lg bg-bg-2/30 p-4 space-y-5">
            {/* Espejo del formulario TRIAGE VITALS de Day Admission (read-only) */}
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-cyan" />
              {t('triageVitalsTitle')}
            </div>

            {tr.chiefComplaint && (
              <div className="max-w-xl">
                <F label={t('chiefComplaint')} value={tr.chiefComplaint} align="left" />
              </div>
            )}

            <ReadingDivider label={t('triage1stReading')} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
              <VSection title={t('secHeight')} emoji="📏">
                <F label={t('fFeet')} value={tr.heightFt} />
                <F label={t('fInches')} value={tr.heightIn} />
                <F label={t('fCm')} value={tr.heightCm} />
              </VSection>
              <VSection title={t('secWeight')} emoji="⚖️">
                <F label={t('fLbs')} value={tr.weightLbs} />
                <F label={t('fOz')} value={tr.weightOz} />
                <F label={t('fKg')} value={tr.weightKg} />
              </VSection>
              <VSection title={t('secBP')} emoji="❤️">
                <F label={t('fSystolic')} value={tr.systolicMmhg} />
                <F label={t('fDiastolic')} value={tr.diastolicMmhg} />
              </VSection>
              <VSection title={t('secHeart')} emoji="🫁">
                <F label={t('fPulse')} value={tr.pulseBpm} />
                <F label={t('fResp')} value={tr.respiratoryRate} />
              </VSection>
              <VSection title={t('secTempPain')} emoji="🌡️">
                <F label={t('fTempF')} value={tr.tempFahrenheit} />
                <F label={t('fTempC')} value={tr.tempCelsius} />
                <F label={t('fPain')} value={tr.painScale} accent={tr.painScale != null && tr.painScale >= 7 ? 'amber' : undefined} />
              </VSection>
              <VSection title={t('secOxygen')} emoji="🫧">
                <F label={t('fO2')} value={tr.o2Saturation} />
                <div className="col-span-1 sm:col-span-2 min-w-0">
                  <F label={t('fComment')} value={tr.o2Comment} />
                  <div className="text-[10px] text-text-muted mt-1.5">
                    {tr.onRoomAir ? `✓ ${t('roomAir')}` : `⚠ ${t('onSupplementalO2')}`}
                  </div>
                </div>
              </VSection>
            </div>

            <ReadingDivider label={t('triage2ndReading')} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
              <VSection title={`${t('secBP')} (2)`} emoji="❤️">
                <F label={t('fSystolic')} value={tr.systolicMmhg2} />
                <F label={t('fDiastolic')} value={tr.diastolicMmhg2} />
              </VSection>
              <VSection title={`${t('secHeart')} (2)`} emoji="🫁">
                <F label={t('fPulse')} value={tr.pulseBpm2} />
                <F label={t('fResp')} value={tr.respiratoryRate2} />
              </VSection>
              <VSection title={`${t('secTempPain')} (2)`} emoji="🌡️">
                <F label={t('fTempF')} value={tr.tempFahrenheit2} />
                <F label={t('fTempC')} value={tr.tempCelsius2} />
              </VSection>
              <VSection title={t('secVision')} emoji="👁️">
                <F label={t('fRight')} value={tr.visualAcuityRight} />
                <F label={t('fLeft')} value={tr.visualAcuityLeft} />
                <F label={t('fBoth')} value={tr.visualAcuityBoth} />
                <div className="col-span-2 sm:col-span-3 text-[10px] text-text-muted">
                  {tr.visionCorrected ? `✓ ${t('visionCorrectedFull')}` : `· ${t('visionNotCorrected')}`}
                </div>
              </VSection>
            </div>
          </div>
          )}
        </div>
      )}

      {/* ── Nodo 3: área de trabajo del doctor ──
          Layout de 2 columnas como el v2: contexto clínico del paciente a la
          izquierda (solo lectura) + tabs de trabajo a la derecha.
          En mobile/iPad vertical el contexto se apila arriba. */}
      {view === 3 && (
        /**
         * El contexto del paciente acompaña SOLO a la nota (Erick, 2026-08-13).
         *
         * En los otros cuatro tabs el contenido son tablas —labs con precio y
         * total, cargos con dos columnas de precio y badges, los totales del
         * resumen— y ahí el ancho es el recurso escaso: quitarles 290 px fijos
         * para un panel de referencia que en ese momento no se está usando es un
         * mal cambio. En la nota es al revés: se está redactando, y las alergias,
         * los problemas y los medicamentos son el material de consulta.
         *
         * Lo que se pierde en Recetas lo cubre ScriptSure con sus propios widgets
         * de paciente; y para todo lo demás está el botón "Historial médico" de
         * la barra de la nota, que abre la ficha completa.
         */
        <div className="space-y-4">
          {/* La barra de tabs va FUERA de la grilla y a lo ancho: si viviera en la
              columna derecha, al pasar a un tab sin panel se correría 290 px a la
              izquierda y el tab recién tocado se movería de abajo del dedo. */}
          {/* Tabs del doctor — mobile: grilla (icono arriba, etiqueta abajo),
              mismo patrón que el bottom nav. Antes era una fila de 402px dentro
              de 343px y "Servicios" quedaba cortada. Desde sm: fila normal.

              Son 3 columnas y no 4 porque los tabs son SEIS: con 4 quedaba una
              segunda fila de dos sueltas contra un hueco de la mitad del ancho.
              3+3 llena las dos filas. */}
          <div className="grid grid-cols-3 sm:flex sm:gap-1 border-b border-border">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-1.5 min-h-11 sm:min-h-0 px-1 sm:px-3.5 py-2 text-[10px] sm:text-[13px] font-semibold border-b-2 -mb-px transition-colors text-center sm:whitespace-nowrap ${
                  tab === id ? 'text-violet-text border-violet' : 'text-text-muted border-transparent hover:text-text-1'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="max-w-full truncate">{label}</span>
              </button>
            ))}
          </div>

          <div className={`grid grid-cols-1 gap-4 items-start ${tab === 'notes' ? 'lg:grid-cols-[290px_1fr]' : ''}`}>
          {tab === 'notes' && (
            <div className="lg:sticky lg:top-4 space-y-2">
              <PatientContextPanel patient={patientContext} />
              <MensajesDelCasoCard
                datos={mensajes}
                currentUserId={userId}
                onCitar={puedeEscribirNota ? (html) => notaRef.current?.citarEnHpi(html) : null}
                motivoBloqueo={t('quoteBlockedSigned')}
                /* Acá sí hay a dónde ir: el modal del expediente está montado en
                   esta página y el botón "Ver caso" del encabezado usa la misma
                   URL. */
                onVerCaso={a.caseId ? () => router.push(conCasoAbierto(pathname, searchParams, a.caseId!, 'mensajes'), { scroll: false }) : null}
              />
            </div>
          )}
          <div className="space-y-4 min-w-0">
          {tab === 'notes' && (
            <>
              <MensajeUrgenteStrip datos={mensajes} currentUserId={userId} />
              <VisitNoteEditor
                ref={notaRef}
                onPuedeEscribirChange={setPuedeEscribirNota}
                appointmentId={a.id}
                patientId={patientContext.id}
                note={note}
                templates={templates}
                userId={userId}
              />
            </>
          )}
          {/* DOCUMENTOS — el mismo explorador del expediente, solo. Lo que se
              sube acá está en el tab Documentos del caso y al revés, y acá
              caen también los archivos compartidos por mensajería (carpeta
              `Messages` — ver `lib/messaging-documents.ts`).

              Sin caso vinculado no hay expediente donde vivan los archivos: se
              dice el motivo en vez de mostrar un explorador vacío. */}
          {tab === 'documentos' && (
            a.caseId ? (
              <DocumentsTab caseId={a.caseId} />
            ) : (
              <EmptyState.Rich icon={FolderOpen} title={t('docsNoCaseTitle')} subtitle={t('docsNoCaseHint')} />
            )
          )}
          {tab === 'labs' && (
            <LabsTab
              appointmentId={a.id}
              userId={userId}
              defaultProviderId={a.servicesPanel.provider?.id ?? null}
            />
          )}
          {tab === 'rx' && (
            <div className="space-y-4">
              <RxIntegrationStatus appointmentId={a.id} />
              <MedicationHistory appointmentId={a.id} medications={patientContext.history.medications} />
            </div>
          )}
          {/* Servicios — mismo panel de Day Admission. El botón de pagos sale
              solo cuando el provider recibió él al paciente: ahí no hay
              mostrador donde cobrar al salir. Con asistente sigue oculto, que es
              el reparto normal. */}
          {tab === 'services' && (
            <AppointmentDetailPanel
              inline
              noBorder
              hidePayments={!llegadaPropia}
              initialTab="services"
              appointment={a.servicesPanel}
              coverage={a.coverage}
              onClose={() => {}}
              onRefresh={() => router.refresh()}
            />
          )}
          {/* Férulas / DME — mismo componente que usa el asistente en Day Admission */}
          {tab === 'braces' && <BracesTab appointmentId={a.id} />}
          </div>
          </div>
        </div>
      )}

      {/* ── Nodo 4: Resumen y salida ── */}
      {view === 4 && (
        <VisitSummary
          isOnline={a.isOnline}
          edadPaciente={edadEnAnios(patientContext.dateOfBirth)}
          llegadaMarcadaPorElProvider={llegadaPropia}
          // El monto sale de la facturación, que es la única autoridad. El botón
          // no cobra acá: lleva al tab de Servicios, donde vive el modal con el
          // detalle línea por línea. El Resumen es la puerta, no una segunda
          // pantalla de cobro.
          balanceDue={saldoVisita}
          onCollect={() => { setTab('services'); setView(3); }}
          // Solo lo mira el cierre de una visita ONLINE: sin el estado no se
          // puede distinguir "terminé" de "cita cerrada".
          appointmentStatus={a.status}
          appointmentId={a.id}
          note={note}
          triage={a.triage}
          hasTriage={hasTriage}
          services={(a.servicesPanel.plannedServiceCodes ?? []) as Array<{ id: string; code: string; description: string; fee?: number }>}
          checkedInAt={a.checkedInAt}
          doctorDoneAt={a.doctorDoneAt}
          checkedOutAt={a.checkedOutAt}
          onFix={(target) => { setTab(target); setView(3); }}
          followUp={a.servicesPanel.case ? {
            caseId: a.servicesPanel.case.id,
            caseCode: a.servicesPanel.case.caseCode,
            patient: { firstName: a.patient.firstName, lastName: a.patient.lastName },
            defaultProviderId: a.servicesPanel.provider?.id ?? null,
          } : null}
        />
      )}
    </div>
  );
}
