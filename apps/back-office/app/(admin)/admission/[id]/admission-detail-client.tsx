'use client';
import { localeApp } from '@/lib/fechas';

/**
 * B.15 — Triage & Verification
 *
 * Flujo completo de 4 pasos:
 *   1. Check-in (B.14)          — ya completado al llegar aquí
 *   2. Triage & Verification    — esta pantalla: vitales + docs + enviar a sala
 *   3. In Room (Doctor)         — módulo del doctor (separado)
 *   4. Services & Payments      — post-consulta, vinculado al caso/cita existente
 *
 * Color de identidad: emerald (Regla #5 · B.14-B.15)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft, CheckCircle2, Clock, AlertTriangle, RefreshCw,
  Stethoscope, Building2, FileText,
  User, ShieldCheck,
} from 'lucide-react';
import { PageHeader }   from '@/components/ui-phoenix/page-header';
import { OnlineMeetingBox } from '@/components/visit/online-visit';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill, type StatusState } from '@/components/ui-phoenix/status-pill';
import { IntakeFormLinkDialog } from '@/components/cases/intake-form-link-dialog';
import { AppointmentDetailPanel } from '@/components/calendar/appointment-detail-panel';
import { CoverageChip } from '@/components/coverage/coverage-chip';
import type { CoverageDTO } from '@/lib/coverage';
import type { PatientContext } from '@/lib/patient-context';
import {
  TriageVitalsForm, EMPTY_VITALS,
  type TriageRecord, type VitalsState, type TriageVitalsFormHandle,
} from '@/components/visit/triage-vitals-form';
import { DoctorStepPanel } from './doctor-step-panel';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConsentsData {
  treatment?: boolean;
  financial?: boolean;
  financialSignatureSvg?: string;
  hipaa?: boolean;
}

interface ApptDetail {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  type: string;
  status: string;
  checkedInAt: string | null;
  /** El doctor marcó que terminó con el paciente (portal médico) */
  doctorDoneAt?: string | null;
  /** Telemedicina — el asistente es quien le pasa el enlace al paciente. */
  isOnline?: boolean;
  meetingUrl?: string | null;
  /** Hora de salida — cierra el reloj de tiempo en clínica */
  checkedOutAt?: string | null;
  /** Última corrección de vitales después de que el paciente pasó a sala */
  triageCorrection?: { at: string; by: string | null } | null;
  notes: string | null;
  triageRecord: TriageRecord | null;
  patient: {
    id: string; firstName: string; lastName: string;
    phone: string | null; email: string | null; dateOfBirth: string | null;
  };
  /** Contexto clínico para el panel del paso 3 — el mismo que ve el doctor. */
  patientContext: PatientContext | null;
  provider: { id: string; firstName: string; lastName: string; specialty: string } | null;
  clinic: { id: string; name: string };
  case: {
    id: string; caseCode: string; caseType: string;
    accidentDate: string | null; accidentType: string | null;
    pipVerifiedAt: string | null; intakeFormCompletedAt: string | null;
    primaryPolicyNumber: string | null;
    consentsData: ConsentsData | null;
    pipActive: boolean; consentsCompleted: boolean; isMVA: boolean;
    lawFirm: { id: string; firmName: string | null; phone: string | null; email: string | null } | null;
    attorney: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
    primaryInsurance: { id: string; name: string; shortCode: string; color: string; claimsPhone: string | null } | null;
  } | null;
  plannedServiceCodes: { id: string; code: string; description: string; fee: number; category: string }[];
  /** ¿Quién paga? El asistente lo resuelve acá antes de pasar al paciente a sala. */
  coverage: CoverageDTO;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  AUTO_ACCIDENT:   'Auto Accident',
  FAMILY_PRACTICE: 'Family Practice',
  URGENT_CARE:     'Urgent Care',
  FOLLOW_UP:       'Follow-up',
  CONSULTATION:    'Consultation',
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(localeApp(), { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });
}

// ─── Small reusable pieces ────────────────────────────────────────────────────
function ChecklistCard({ done, label, meta }: { done: boolean; label: string; meta?: string }) {
  return (
    <div className={`rounded-lg p-3 flex items-start gap-2.5 ${done ? 'bg-emerald/5' : 'bg-bg-2/30'}`}>
      {done
        ? <CheckCircle2 className="w-4 h-4 text-emerald shrink-0 mt-0.5" />
        : <Clock className="w-4 h-4 text-amber shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] font-semibold ${done ? 'text-emerald' : 'text-text-2'}`}>{label}</div>
        {meta && <div className="text-[10px] text-text-muted mt-0.5">{meta}</div>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdmissionDetailClient({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const t = useTranslations('phoenix.admission');
  const [detail,    setDetail]    = useState<ApptDetail | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [admitting, setAdmitting] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [showServices, setShowServices] = useState(false);
  const [viewStep,     setViewStep]     = useState<number | null>(null); // null = auto
  const [billingHistory, setBillingHistory] = useState<Array<{
    id: string; serviceCode: string | null; serviceDescription: string | null;
    totalCost: number; balanceDue: number; amountPaid: number;
    /** La cita que generó el cargo — con esto se recorta el cobro a ESTA visita. */
    appointmentId: string | null;
    appointmentDate: string | null;
    /** PATIENT = se cobra al salir · INSURANCE = lo gestiona el encargado después */
    payer?: 'PATIENT' | 'INSURANCE';
  }>>([]);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [confirm1,  setConfirm1]  = useState(false);
  const [confirm2,  setConfirm2]  = useState(false);
  /**
   * Espejo de solo lectura del formulario de vitales.
   *
   * El estado y el guardado viven dentro de `TriageVitalsForm` (compartido con la
   * consulta del doctor). Esta copia existe para UNA cosa: el resumen del step 3
   * muestra los valores EN VIVO, no los últimos guardados.
   */
  const [vitals, setVitals] = useState<VitalsState>(EMPTY_VITALS);
  /** "Pasar a sala" guarda los vitales pendientes antes de admitir, por acá. */
  const vitalsRef = useRef<TriageVitalsFormHandle>(null);

  /**
   * Refetch SILENCIOSO para la sincronización en vivo.
   *
   * `load()` no sirve para esto y usarlo fue un error: prende el skeleton de
   * pantalla completa (la MA veía "Loading…" cada 20 s) y además LIMPIA el
   * formulario de vitales, el flag de cambios sin guardar y las confirmaciones —
   * está escrito para cuando cambia de paciente, no para un refresco de fondo.
   * Con el polling encima, le borraba a la MA lo que estaba tipeando.
   *
   * Esto solo trae los datos de la cita (estado, doctorDoneAt, cobertura, saldo).
   * El formulario de vitales es de la MA mientras está en esta pantalla: no se
   * toca sin que ella lo pida.
   */
  const syncDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/admission/${appointmentId}`);
      const data = await res.json();
      if (data.ok) setDetail(data.appointment);
    } catch { /* la pantalla se queda con lo último bueno */ }
  }, [appointmentId]);

  const load = useCallback(async () => {
    setLoading(true);
    // Los vitales ya no se limpian acá: el formulario se remonta con
    // `key={appointmentId}` y arranca del triaje que trae la respuesta, así que
    // los valores de un paciente no pueden filtrarse al siguiente.
    setConfirm1(false);
    setConfirm2(false);
    try {
      const res  = await fetch(`/api/admin/admission/${appointmentId}`);
      const data = await res.json();
      if (data.ok) setDetail(data.appointment);
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Facturación del caso — de acá sale el total a cobrar de ESTA cita.
   *
   * Es una función y no un efecto de una sola vez: cuando el asistente agrega un
   * cargo hay que volver a pedirla o el total sigue mostrando el de antes. Vivía
   * en un `useEffect` con un guard `billingLoaded` que la corría UNA vez, así que
   * agregar una inyección no movía el total hasta recargar la página entera.
   */
  const loadBilling = useCallback(async (): Promise<void> => {
    const caseId = detail?.case?.id;
    if (!caseId) return;
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/billing`);
      const data = await res.json() as { billings?: typeof billingHistory };
      setBillingHistory(data.billings ?? []);
    } catch { /* se queda con lo último bueno */ }
  }, [detail?.case?.id]);

  useEffect(() => {
    if (!detail?.case?.id || billingLoaded) return;
    setBillingLoaded(true);
    void loadBilling();
  }, [detail?.case?.id, billingLoaded, loadBilling]);

  /**
   * Refresco después de una ACCIÓN del usuario (agregó un cargo, entregó una
   * férula). Silencioso a propósito.
   *
   * Antes esto era `load()`, que prende el skeleton de pantalla completa: el
   * asistente agregaba un cargo y la pantalla entera se iba a gris hasta que
   * volviera la respuesta —los ~10 s que se ven en local contra la base remota, y
   * el "Loading… Admission" que reportó Erick—. `load()` está escrito para
   * cambiar de paciente, no para refrescar después de tocar un botón.
   */
  const refreshAfterAction = useCallback(async (): Promise<void> => {
    await Promise.all([syncDetail(), loadBilling()]);
  }, [syncDetail, loadBilling]);

  async function admit() {
    setAdmitting(true);
    try {
      // "Pasar a la sala" también guarda: antes solo llamaba a /admit, así que
      // si la MA cargaba los vitales y apretaba este botón sin pasar por
      // "Guardar", los signos vitales se perdían en silencio. Había un cartel
      // "Unsaved" avisando, pero un cartel se ignora cuando hay pacientes
      // esperando.
      // Si el guardado falla NO se admite: mejor que el paciente quede en
      // triaje que pase a sala con los vitales perdidos.
      if (!(await vitalsRef.current?.saveIfDirty() ?? true)) return;
      await fetch(`/api/admin/admission/${appointmentId}/admit`, { method: 'POST' });
      await load();
    } finally {
      setAdmitting(false);
    }
  }

  if (loading || !detail) {
    return (
      <div className="flex flex-col">
        <PageHeader title={t('loading')} subtitle={t('detailPageSubtitle')} />
        <div className="px-6 pb-6 space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-40 rounded-lg bg-bg-2/40 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const d = detail;
  const patientName = `${d.patient.firstName} ${d.patient.lastName}`;
  const isAlreadyInRoom = d.status === 'IN_PROGRESS' || d.status === 'COMPLETED';
  const consentsOk = !!d.case?.consentsCompleted;
  const canAdmit = confirm1 && confirm2 && consentsOk && !isAlreadyInRoom;

  // Los vitales quedan SIEMPRE editables (decisión de Erick 2026-07-29): en la
  // clínica el encargado corrige después de que el paciente pasó a sala y no
  // tiene sentido pedirle un clic extra. Lo que importa es la traza, y esa vive
  // en el servidor: toda escritura post-admisión se audita como
  // TRIAGE_VITALS_CORRECTED y la pantalla muestra quién y cuándo la hizo.
  const vitalsCorrection = d.triageCorrection ?? null;

  const cd = d.case?.consentsData ?? {} as ConsentsData;
  const overallState: StatusState = isAlreadyInRoom ? 'success' : consentsOk ? 'success' : 'warning';

  const docItems = [
    {
      done:  !!d.case?.intakeFormCompletedAt,
      label: t('docHealthForm'),
      meta:  d.case?.intakeFormCompletedAt ? t('docIntakeFormCompleted', { date: fmtDate(d.case.intakeFormCompletedAt) }) : undefined,
    },
    {
      done:  consentsOk,
      label: t('docConsentsSigned'),
      meta:  consentsOk ? t('docConsentsSignedMeta') : t('docConsentsPending'),
    },
    {
      done:  !!d.case?.pipActive,
      label: t('docPipVerified'),
      meta:  d.case?.pipVerifiedAt ? t('docPipVerifiedOn', { date: fmtDate(d.case.pipVerifiedAt) }) : t('docPipNotVerified'),
    },
  ];

  // Patient intake info (from consentsData or case)
  const intakeChiefComplaint = vitals.chiefComplaint || d.notes || null;

  /**
   * Vitales para el resumen del step 3: **el valor en vivo gana, el guardado es
   * el respaldo**.
   *
   * El espejo `vitals` arranca vacío y lo llena el `TriageVitalsForm` con su
   * `onChange`. Pero ese formulario vive en el STEP 2, y los dos bloques son
   * mutuamente excluyentes: con el paciente ya en sala el formulario no se monta,
   * el `onChange` nunca dispara y el espejo se queda en `EMPTY_VITALS`. El
   * resumen concluía "no hay triaje" con el triaje guardado en la base — que es
   * justo el estado en el que se mira esta pantalla.
   *
   * No se seedea `vitals` desde el registro a propósito, por dos razones: el
   * formulario hace conversiones propias (F→C, pulgadas→cm, libras→kg) y
   * duplicar ese mapeo acá es pedir que se desincronicen; y escribir en `vitals`
   * desde afuera es lo que ya le borró a la MA lo que estaba tipeando (ver el
   * comentario del refetch silencioso).
   */
  const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));
  const enVivoOGuardado = (v: string, guardado: number | null | undefined): number | null =>
    numOrNull(v) ?? guardado ?? null;
  const tr = d.triageRecord;
  const summaryTriage = {
    systolicMmhg:    enVivoOGuardado(vitals.systolicMmhg,    tr?.systolicMmhg),
    diastolicMmhg:   enVivoOGuardado(vitals.diastolicMmhg,   tr?.diastolicMmhg),
    pulseBpm:        enVivoOGuardado(vitals.pulseBpm,        tr?.pulseBpm),
    respiratoryRate: enVivoOGuardado(vitals.respiratoryRate, tr?.respiratoryRate),
    tempFahrenheit:  enVivoOGuardado(vitals.tempFahrenheit,  tr?.tempFahrenheit),
    painScale:       enVivoOGuardado(vitals.painScale,       tr?.painScale),
    o2Saturation:    enVivoOGuardado(vitals.o2Saturation,    tr?.o2Saturation),
    // El orden importa: lo que se está tipeando, después el motivo del TRIAJE, y
    // solo al final la nota de la cita. `intakeChiefComplaint` ya cae en `d.notes`,
    // así que ponerlo primero haría que una nota administrativa ("llamó para
    // reprogramar") le gane al motivo clínico real.
    chiefComplaint:  vitals.chiefComplaint || tr?.chiefComplaint || intakeChiefComplaint,
  };
  const accidentInfo = d.case?.accidentDate
    ? `${fmtDate(d.case.accidentDate)}${d.case.accidentType ? ` · ${d.case.accidentType}` : ''}`
    : null;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={patientName}
        subtitle={d.case?.caseCode ?? t('detailPageSubtitle')}
        action={
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-emerald/40 hover:text-emerald transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('dailyQueue')}
          </button>
        }
      />

      <div className="px-4 sm:px-6 pb-8 space-y-4">

        {/* ── Videollamada ──
            Arriba de todo, y no en una tarjeta más abajo, porque cambia lo
            primero que hace el asistente: a un paciente online no lo va a buscar
            a la sala de espera, le manda el enlace. */}
        {d.isOnline && <OnlineMeetingBox meetingUrl={d.meetingUrl ?? null} />}

        {/* ── Flow diagram ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-bg-2 rounded-lg overflow-hidden">
          {[
            { num: 1, done: true,             active: false,                                          title: t('flowStep1'), desc: t('flowStep1Desc') },
            { num: 2, done: isAlreadyInRoom, active: !isAlreadyInRoom,                              title: t('flowStep2'), desc: t('flowStep2Desc') },
            { num: 3, done: d.status === 'COMPLETED', active: isAlreadyInRoom && d.status !== 'COMPLETED', title: t('flowStep3'), desc: t('flowStep3AssistantDesc') },
          ].map(step => (
            <div
              key={step.num}
              className={`p-3 ${step.active ? 'bg-emerald/5' : 'bg-bg-1'}`}
            >
              <div className={`text-[9px] uppercase tracking-wider font-bold mb-1 ${step.done ? 'text-emerald' : step.active ? 'text-emerald' : 'text-text-muted'}`}>
                {step.done ? `Step ${step.num} ✓` : step.active ? `Step ${step.num} — Current` : `Step ${step.num}`}
              </div>
              <div className={`text-[11.5px] font-bold mb-0.5 ${step.done || step.active ? 'text-text-1' : 'text-text-muted'}`}>{step.title}</div>
              <div className="text-[10px] text-text-muted leading-relaxed">{step.desc}</div>
            </div>
          ))}
        </div>

        {/* ── Stepper ── */}
        <div className="flex items-center gap-2">
          {[
            { label: t('flowStep1'), done: true,             active: false },
            { label: t('flowStep2'), done: isAlreadyInRoom, active: !isAlreadyInRoom },
            { label: t('flowStep3'), done: d.status === 'COMPLETED', active: isAlreadyInRoom && d.status !== 'COMPLETED' },
          ].map((step, i, arr) => {
            const navigable = step.done || step.active;
            // Recuadro siempre visible en el paso efectivo: el navegado manualmente
            // o, en modo auto, el paso actual del flujo (feedback "dónde estoy")
            const autoStep = !isAlreadyInRoom ? 2 : 3;
            const isSelected = (viewStep ?? autoStep) === i + 1;
            return (
              <div key={i} className="flex items-center gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  disabled={!navigable}
                  onClick={() => navigable ? setViewStep(isSelected ? null : i + 1) : undefined}
                  className={`flex items-center gap-1.5 shrink-0 rounded-md px-1.5 py-1 transition-all ${navigable ? 'hover:bg-bg-2 cursor-pointer' : 'cursor-default'} ${isSelected ? 'bg-bg-2 ring-1 ring-emerald/40' : ''}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${step.done ? 'bg-emerald text-white' : step.active ? 'bg-brand text-white' : 'bg-bg-3 text-text-muted'}`}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <span className={`text-[10px] font-semibold hidden sm:inline ${step.done || step.active ? (step.done ? 'text-emerald' : 'text-text-1') : 'text-text-muted'}`}>
                    {step.label}
                  </span>
                </button>
                {i < arr.length - 1 && <div className="flex-1 h-px bg-bg-3" />}
              </div>
            );
          })}
        </div>

        {/* ── View-step override banner ── */}
        {viewStep !== null && (
          <div className="rounded-lg border border-amber/30 bg-amber/5 px-4 py-2.5 flex items-center gap-3">
            <span className="text-amber text-[11px] font-semibold">Viewing Step {viewStep} — read-only</span>
            <button
              type="button"
              onClick={() => setViewStep(null)}
              className="ml-auto text-[11px] text-text-muted hover:text-text-1 border border-border rounded px-2 py-0.5 transition-colors"
            >
              ← Back to current step
            </button>
          </div>
        )}

        {/* ── Gate banner ── */}
        {!isAlreadyInRoom && viewStep === null && (
          consentsOk ? (
            <div className="rounded-lg border border-emerald/30 bg-emerald/5 p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald/15 flex items-center justify-center text-sm flex-shrink-0">✅</div>
              <div className="flex-1">
                <div className="font-bold text-emerald text-[13px]">{t('gateReadyTitle')}</div>
                <div className="text-[11px] text-text-2 mt-0.5">{t('gateReadySub')}</div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-rose/30 bg-rose/5 p-3 flex items-center gap-3 flex-wrap">
              <div className="w-8 h-8 rounded-full bg-rose/15 flex items-center justify-center text-sm flex-shrink-0">🚫</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-rose text-[13px]">{t('gateBlockedTitle')}</div>
                <div className="text-[11px] text-text-2 mt-0.5">{t('gateBlockedSub')}</div>
              </div>
              <button
                type="button"
                onClick={() => setPortalOpen(true)}
                className="px-3 py-1.5 bg-rose text-white text-[11px] font-semibold rounded-md shrink-0 hover:bg-rose/90 transition-colors"
              >
                ✉ {t('resendFormBtn')}
              </button>
            </div>
          )
        )}

        {/* ── Docs checklist — full width ── */}
        {(!isAlreadyInRoom || viewStep === 2) && (
          <div>
            <div className="text-[9.5px] uppercase tracking-wider font-bold text-text-muted mb-2 flex items-center gap-1.5">
              <FileText className="w-3 h-3" />{t('sectionDocuments')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {docItems.map((item, i) => (
                <ChecklistCard key={i} done={item.done} label={item.label} meta={item.meta} />
              ))}
            </div>
          </div>
        )}

        {/* Step 3: In Room (Doctor) — resumen, nota, labs, servicios y checkout.
            Absorbe el viejo step 4: el asistente completa lo que el doctor no
            hizo, cobra y cierra la cita desde el mismo lugar. */}
        {(isAlreadyInRoom || d.status === 'COMPLETED' || viewStep === 3) && viewStep !== 2 && (
          <DoctorStepPanel
            appointmentId={d.id}
            patientId={d.patient.id}
            patientContext={d.patientContext ?? null}
            appointmentStatus={d.status}
            checkedInAt={d.checkedInAt}
            doctorDoneAt={d.doctorDoneAt ?? null}
            checkedOutAt={d.checkedOutAt ?? null}
            providerName={d.provider ? `Dr. ${d.provider.firstName} ${d.provider.lastName}` : null}
            triage={summaryTriage}
            hasTriage={!!d.triageRecord}
            servicesPanel={{
              id:                  d.id,
              scheduledFor:        d.scheduledFor,
              durationMinutes:     d.durationMinutes,
              type:                d.type,
              status:              d.status,
              notes:               d.notes,
              visitNumber:         0,
              plannedServiceCodes: d.plannedServiceCodes ?? [],
              patient:         d.patient,
              provider:        d.provider,
              clinic:          d.clinic,
              case: d.case ? {
                id:                    d.case.id,
                caseCode:              d.case.caseCode,
                accidentType:          d.case.accidentType,
                accidentDate:          d.case.accidentDate,
                status:                'ACTIVE',
                intakeFormCompletedAt: d.case.intakeFormCompletedAt,
                attorney:              d.case.attorney ? {
                  id: d.case.attorney.id,
                  firmName:  d.case.lawFirm?.firmName ?? null,
                  firstName: d.case.attorney.firstName ?? '',
                  lastName:  d.case.attorney.lastName ?? '',
                  phone:     null,
                  email:     d.case.attorney.email,
                } : null,
                primaryInsurance: d.case.primaryInsurance ?? null,
              } : null,
            }}
            /* Lo que se cobra en el mostrador HOY: solo lo de ESTA cita y solo lo
               que paga el PACIENTE.
               · Por cita (Erick 2026-08-13): antes sumaba el saldo de todo el
                 caso, así que en una visita sin cargos igual aparecía "Total
                 balance $357.20" arrastrado de otras fechas — al lado de un "sin
                 cargos en esta visita". El saldo del caso se ve en Pacientes.
               · Sin los CPT: se le cobran al seguro o al abogado meses después;
                 pedírselos en el mostrador era cobrarle plata que no le toca
                 (Erick 2026-08-08). */
            billingTotal={billingHistory
              .filter(b => b.appointmentId === d.id && b.payer !== 'INSURANCE')
              .reduce((s, b) => s + b.balanceDue, 0) || undefined}
            /* El historial del caso baja al tab de Pagar como referencia
               plegable: son cargos de OTRAS fechas y en Servicios competía con
               los de la visita. */
            coverage={d.coverage}
            onRefresh={() => { void refreshAfterAction(); }}
            onSync={syncDetail}
          />
        )}


        {/* ── Main 2-col layout ── */}
        {(!isAlreadyInRoom || viewStep === 2) && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

            {/* ── LEFT: Patient info + Vitals form ── */}
            <div className="space-y-4">

              {/* Patient info (read-only from intake) */}
              <div className="rounded-lg bg-bg-2/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-4 h-4 text-emerald" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionPatientInfo')}</span>
                  <span className="ml-auto text-[9px] text-text-muted">{t('patientInfoReadOnly')}</span>
                </div>
                <div className="flex items-start gap-3 mb-3">
                  <PersonAvatar firstName={d.patient.firstName} lastName={d.patient.lastName} size={10} />
                  <div>
                    <div className="font-bold text-text-1">{patientName}</div>
                    {d.case && <div className="font-mono text-[11px] text-emerald">{d.case.caseCode}</div>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted mt-1">
                      {d.provider && <span className="flex items-center gap-1"><Stethoscope className="w-3 h-3" />Dr. {d.provider.firstName} {d.provider.lastName}</span>}
                      <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{d.clinic.name}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtTime(d.scheduledFor)} · {d.durationMinutes} min</span>
                    </div>
                  </div>
                  <StatusPill label={isAlreadyInRoom ? t('statusInRoom') : t('statusInAdmission')} state={overallState} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {[
                    { key: t('infoType'),          val: TYPE_LABELS[d.type] ?? d.type },
                    { key: t('infoAccidentDate'),   val: accidentInfo },
                    { key: t('infoChiefComplaint'), val: intakeChiefComplaint },
                    { key: t('infoInsurance'),      val: d.case?.primaryInsurance?.name ?? t('noInsuranceRegistered') },
                    { key: t('infoAllergies'),      val: (cd as Record<string, unknown>).allergies as string | null ?? t('infoNoAllergies') },
                    { key: t('infoPip'),            val: d.case?.pipActive ? t('pipActive') : t('pipNotVerified') },
                  ].map(row => row.val ? (
                    <div key={row.key} className="flex justify-between items-start py-1.5 border-b border-bg-3 last:border-0 gap-2">
                      <span className="text-[10.5px] text-text-muted shrink-0">{row.key}</span>
                      <span className="text-[11px] text-text-1 font-medium text-right">{row.val}</span>
                    </div>
                  ) : null)}
                </div>
              </div>

              {/* Signos vitales — el MISMO componente que usa la consulta del
                  doctor. Vivia inline aca y por eso el portal medico no lo tenia:
                  cuando el asistente no habia cargado nada, al doctor le salia un
                  "no hay triaje" y no podia hacer nada (Erick, 2026-08-13).

                  `key`: al cambiar de cita se remonta y arranca del triaje nuevo.
                  El formulario NO escucha su prop `initial` a proposito — si lo
                  hiciera, un refresco de fondo le borraria a la MA lo tipeado. */}
              <TriageVitalsForm
                key={appointmentId}
                ref={vitalsRef}
                appointmentId={appointmentId}
                initial={d.triageRecord}
                correction={vitalsCorrection}
                onChange={setVitals}
              />
            </div>

            {/* ── RIGHT: Appointment + Coverage + Confirm + CTA + Step 4 preview ── */}
            <div className="space-y-4">

              {/* Appointment summary */}
              <div className="rounded-lg bg-bg-2/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Stethoscope className="w-4 h-4 text-emerald" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionAppointment')}</span>
                </div>
                <div className="space-y-2">
                  {[
                    { k: t('infoType'),    v: TYPE_LABELS[d.type] ?? d.type },
                    { k: 'Doctor',         v: d.provider ? `Dr. ${d.provider.firstName} ${d.provider.lastName}` : '—' },
                    { k: 'Time',           v: `${fmtTime(d.scheduledFor)} · ${d.durationMinutes} min` },
                    { k: 'Clinic',         v: d.clinic.name },
                    { k: 'Case',           v: d.case?.caseCode },
                  ].filter(r => r.v).map(row => (
                    <div key={row.k} className="flex justify-between items-center text-[11px] border-b border-border pb-1.5 last:border-0">
                      <span className="text-text-muted">{row.k}</span>
                      <span className="text-text-1 font-medium">{row.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coverage */}
              <div className="rounded-lg bg-bg-2/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-emerald" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionCoverage')}</span>
                </div>
                {/* El chip primero: es el dato que el asistente necesita antes de
                    pasar al paciente a sala, y acá SÍ es editable — este es el
                    lugar donde recepción y el asistente lo resuelven. Antes este
                    bloque solo mostraba "Sin seguro registrado", un aviso que no
                    se podía accionar desde ninguna parte. */}
                <div className="mb-2.5">
                  <CoverageChip caseId={d.case?.id ?? null} coverage={d.coverage} size="md" />
                </div>
                {d.case?.primaryInsurance ? (
                  <div className={`rounded-md border p-2.5 ${d.case.pipActive ? 'border-emerald/30 bg-emerald/5' : 'border-amber/30 bg-amber/5'}`}>
                    <div className="font-semibold text-text-1 text-[12px] mb-1">{d.case.primaryInsurance.name}</div>
                    <StatusPill label={d.case.pipActive ? t('pipActive') : t('pipNotVerified')} state={d.case.pipActive ? 'success' : 'warning'} />
                    {d.case.primaryPolicyNumber && <div className="text-[10px] text-text-muted font-mono mt-1">{d.case.primaryPolicyNumber}</div>}
                  </div>
                ) : d.coverage.type === 'UNKNOWN' ? (
                  <div className="rounded-md border border-amber/30 bg-amber/5 p-2.5 text-[11px] text-amber flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{t('noInsuranceRegistered')}
                  </div>
                ) : null}
              </div>

              {/* Confirmations + CTA */}
              <div className="rounded-lg bg-bg-2/30 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">
                  {t('confirmBeforeRoom')}
                </div>
                {[
                  { id: 'c1', checked: confirm1, onToggle: () => setConfirm1(v => !v), label: t('confirmVitalsSaved') },
                  { id: 'c2', checked: confirm2, onToggle: () => setConfirm2(v => !v), label: t('confirmPatientReady') },
                ].map(item => (
                  <label
                    key={item.id}
                    /* Con el paciente ya en sala estos checks no hacen nada
                       (canAdmit exige !isAlreadyInRoom), pero seguían siendo
                       clickeables y eso sugería que la acción estaba disponible */
                    onClick={isAlreadyInRoom ? undefined : item.onToggle}
                    className={`flex items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors group mb-2 ${
                      isAlreadyInRoom
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer hover:border-emerald/30'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                      // Ya admitido → se muestran como cumplidos, que es el hecho
                      (item.checked || isAlreadyInRoom)
                        ? 'bg-emerald border-emerald'
                        : `border border-border bg-bg-2 ${isAlreadyInRoom ? '' : 'group-hover:border-emerald/40'}`
                    }`}>
                      {(item.checked || isAlreadyInRoom) && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-[11px] ${(item.checked || isAlreadyInRoom) ? 'text-emerald' : 'text-text-2'}`}>{item.label}</span>
                  </label>
                ))}

                {!consentsOk && (
                  <div className="rounded-md border border-rose/30 bg-rose/5 p-2.5 text-[11px] text-rose flex items-start gap-1.5 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{t('alertCannotSend')}</span>
                  </div>
                )}
                {consentsOk && (
                  <div className="rounded-md border border-emerald/30 bg-emerald/5 p-2.5 text-[11px] text-emerald flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('alertAllVerified')}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap border-t border-border pt-3 mt-3">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-text-2 text-[11px] hover:bg-white/5 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />{t('goBack')}
                  </button>
                  <button
                    type="button"
                    onClick={admit}
                    disabled={!canAdmit || admitting}
                    className="flex items-center gap-2 px-4 py-2 rounded-md bg-emerald text-white text-[12px] font-bold hover:bg-emerald/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {admitting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />{t('processing')}</> : (
                      <>{d.provider ? t('passToRoomWithDoctor', { lastName: d.provider.lastName }) : t('passToRoom')}</>
                    )}
                  </button>
                </div>
              </div>


            </div>
          </div>
        )}

      </div>

      {/* QR + link dialog — se abre desde el banner de consentimientos pendientes */}
      {d.case && (
        <IntakeFormLinkDialog
          open={portalOpen}
          onOpenChange={setPortalOpen}
          caseInfo={{
            id:       d.case.id,
            caseCode: d.case.caseCode,
            patient: {
              firstName: d.patient.firstName,
              lastName:  d.patient.lastName,
              phone:     d.patient.phone,
              email:     d.patient.email,
            },
          }}
        />
      )}
    </div>
  );
}

// ─── Historial de facturación (registros migrados del v2) ─────────────────────
// Vivía dentro del viejo step 4; ahora se inyecta en el tab Servicios del step 3.
