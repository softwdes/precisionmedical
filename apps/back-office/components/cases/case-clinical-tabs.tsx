'use client';

/**
 * Tabs clínicos del detalle de caso — ESPEJO de la consulta del doctor.
 *
 * Criterio de Erick (2026-08-08): el caso usa los MISMOS cinco tabs que el
 * doctor ya conoce de su consulta (Notes · Labs · Prescription · Services ·
 * Braces), en el mismo orden y con los mismos íconos. La diferencia no es de
 * estructura sino de alcance: la consulta muestra UNA visita; el caso muestra
 * TODAS, agrupadas por visita.
 *
 * Fuentes REALES: `VisitNote`, `lab_orders`, `prescriptions` (ScriptSure),
 * `plannedServiceCodes` + `appointment_services` (los DOS catálogos) y
 * `appointment_braces`. La captura manual vieja (JSON `medicalHistory`, data
 * migrada del v2) queda como sección "Registros manuales" colapsada.
 *
 * "Repetir" una receta (el caso de la farmacia sin stock días después) SOLO
 * aparece con `canPrescribe` (variante doctor) — prescribir es firmar una
 * orden médica y no se delega. El server lo re-valida (checkAppointmentAccess).
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Pill, FlaskConical, Scan, HeartPulse, FileText, Printer, Loader2, Upload,
  AlertTriangle, MapPin, RotateCcw, Building2, Home,
  Bandage, Briefcase, Plus, Trash2, ArrowRight, Ban,
} from 'lucide-react';
import { Button } from '@precision/ui';
import { EmptyState, TagPill } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import {
  ScriptSureWidgetDialog, launchRefill, type WidgetStatus,
} from '@/components/visit/scriptsure-widget-dialog';
import { STATUS_KEY as RX_STATUS_KEY, STATUS_CLASS as RX_STATUS_CLASS, soloEntregadas } from '@/components/visit/rx-integration-status';
import { MedicationHistory, type MedicationEntry } from '@/components/visit/medication-history';
import { LabOrderDialog } from '@/components/visit/lab-order-dialog';
import { LabOrderPrintDialog } from '@/components/visit/lab-order-print-dialog';
import { BracePickerDialog, type CatalogBrace, type Side as BraceSide } from '@/components/visit/brace-picker-dialog';
import { ChargePickerDialog, type BillableItem } from '@/components/visit/charge-picker-dialog';
import type { CoverageDTO } from '@/lib/coverage';
import { codigosRepetidos, horaCobro } from '@/lib/repeated-charges';

// ─── Payload de /api/admin/cases/[id]/clinical ────────────────────────────────

interface RxRow {
  id: string;
  drugName: string;
  deaSchedule: string | null;
  dose: string;
  frequency: string;
  quantityTotal: number;
  refills: number;
  pharmacyName: string | null;
  status: string;
  dawSentAt: string | null;
  createdAt: string;
  canRefill: boolean;
}

interface LabRow {
  id: string;
  groupId: string | null;
  orderType: string;
  studyName: string;
  studyCode: string | null;
  clinicalIndication: string;
  urgency: string;
  collectionSite: string;
  preferredCenter: string | null;
  icd10Codes: string[];
  status: string;
  orderedAt: string;
  resultFileName: string | null;
}

interface Visit {
  appointmentId: string;
  scheduledFor: string;
  status: string;
  providerName: string | null;
  providerId: string | null;
  note: {
    status: string;
    signedAt: string | null;
    signedByName: string | null;
    diagnoses: Array<{ icd10Code: string | null; icd10Label: string | null; snomedLabel: string | null }>;
  } | null;
  prescriptions: RxRow[];
  labOrders: LabRow[];
  // `category` viaja aunque no se muestre: el PATCH de la cita lo exige, y sin
  // él la lista entera se rechaza con 400.
  services: Array<{ id: string; code: string; description: string; fee?: number; category: string }>;
  braces: Array<{ id: string; code: string; name: string; sizeLabel: string | null; unitPrice: number; side: string; quantity: number }>;
  cashServices: Array<{ id: string; code: string; name: string; unitPrice: number; unitLabel: string | null; quantity: number; catalogItemId: number | null; chargedAt: string }>;
}

interface ClinicalPayload {
  visits: Visit[];
  medications: MedicationEntry[];
  latestAppointmentId: string | null;
  /** Cobertura resuelta del caso — ordena los catálogos en el picker de cargos */
  coverage: CoverageDTO | null;
}

function useCaseClinical(caseId: string): ClinicalPayload & {
  loading: boolean; error: boolean; reload: () => Promise<void>;
} {
  const [data, setData] = React.useState<ClinicalPayload>({ visits: [], medications: [], latestAppointmentId: null, coverage: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const reload = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/clinical`);
      if (!res.ok) throw new Error('load');
      const d = await res.json() as ClinicalPayload;
      setData({
        visits: d.visits ?? [],
        medications: d.medications ?? [],
        latestAppointmentId: d.latestAppointmentId ?? null,
        coverage: d.coverage ?? null,
      });
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  React.useEffect(() => { void reload(); }, [reload]);
  return { ...data, loading, error, reload };
}

const money = (n: number): string => `$${n.toFixed(2)}`;

function fmtVisit(iso: string): string {
  return new Date(iso).toLocaleDateString('es-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}

const LAB_STATUS_CLASS: Record<string, string> = {
  ORDERED: 'bg-amber/15 text-amber border-amber/30',
  IN_PROGRESS: 'bg-cyan/15 text-cyan border-cyan/30',
  RESULTED: 'bg-emerald/15 text-emerald border-emerald/30',
  VOIDED: 'bg-white/5 text-text-muted border-border',
};

const LAB_CATEGORY_ICON: Record<string, React.ElementType> = {
  LABORATORY: FlaskConical, IMAGING: Scan, CARDIOLOGY: HeartPulse, OTHER: FlaskConical,
};

/** Cabecera de visita — misma línea en los cinco tabs. `action` = botón de
 *  gestión de ESA visita (nueva orden, cargos, férulas).
 *
 *  `dateIso` la usa el tab de labs: una orden se puede crear días después de la
 *  visita (el paciente vuelve porque la farmacia no tenía las pastillas), y lo
 *  que importa arriba es CUÁNDO se pidió. La visita queda como referencia en
 *  `note`. */
function VisitHeader({ visit, action, dateIso, note }: {
  visit: Visit; action?: React.ReactNode; dateIso?: string; note?: string;
}): React.ReactElement {
  return (
    // Sin border-b: el cambio de fondo ya separa la cabecera de las filas
    // (Erick: la línea se veía gruesa y no combinaba)
    <div className="px-3 py-2 flex items-center gap-2 flex-wrap bg-bg-2/40">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
        {fmtVisit(dateIso ?? visit.scheduledFor)}
      </span>
      {visit.providerName && (
        <span className="text-[11px] text-text-2">· Dr. {visit.providerName}</span>
      )}
      {note && <span className="text-[11px] text-text-muted">· {note}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/** Mismo día calendario en la zona de la clínica (no comparar ISO crudo: los
 *  timestamps son UTC y a partir de las 18:00 locales cambian de día). */
function mismoDia(a: string, b: string): boolean {
  const dia = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  return dia(a) === dia(b);
}

/** Botón chico de gestión en la cabecera de una visita */
function ManageButton({ label, onClick }: { label: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold text-violet bg-violet/10 border border-violet/30 hover:bg-violet/20 hover:border-violet/50 transition-colors"
    >
      <Plus className="w-3 h-3" /> {label}
    </button>
  );
}

function LoadingRow(): React.ReactElement {
  return (
    <div className="py-10 flex items-center justify-center text-text-muted text-[12px] gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
    </div>
  );
}

function LoadErrorRow(): React.ReactElement {
  const t = useTranslations('phoenix.caseTabs.clinical');
  return (
    <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
      <AlertTriangle className="w-3.5 h-3.5" /> {t('loadError')}
    </div>
  );
}

/*
 * "Registros manuales" ELIMINADO (Erick 2026-08-08).
 *
 * Era la captura vieja del v2 (`patient.medicalHistory.labs` / `.medications`
 * en JSON), que se conservaba como referencia. Se quitó por dos razones, las
 * dos comprobadas contra la base:
 *  1. La tabla de prescripciones manuales repetía el Medication History — las
 *     dos leen `medicalHistory.medications`.
 *  2. En labs había **3 filas en TODA la base** (3 pacientes) contra 16
 *     órdenes reales, y una de ellas duplicaba en pantalla una orden real.
 * Una sección permanente en cada caso no se justifica por 3 filas de prueba.
 * El JSON sigue en la base: no se borró nada, solo se dejó de mostrar.
 */

type RxStatusKnown = keyof typeof RX_STATUS_KEY;
const rxStatusOf = (s: string): RxStatusKnown => (s in RX_STATUS_KEY ? (s as RxStatusKnown) : 'DRAFT');

// NOTA: el caso NO lleva tab Notes — las notas del doctor viven en el
// Historial Médico del paciente (decisión de Erick 2026-08-08).

// ─── Tab: Labs — órdenes + resultados, por visita ─────────────────────────────

/**
 * Labs del caso — días después de la visita. Acá la hoja YA se imprimió y se
 * entregó, así que un estudio se ANULA (queda visible tachado), no se borra:
 * si el resultado llega igual, tiene contra qué reconciliarse. Quitar solo se
 * puede durante la visita (consulta / Day Admission).
 */
export function CaseLabsTab({ caseId, patientId }: {
  caseId: string;
  patientId: string;
}): React.ReactElement {
  const t = useTranslations('phoenix.caseTabs.clinical');
  const td = useTranslations('phoenix.doctor');
  const { visits, latestAppointmentId, loading, error, reload } = useCaseClinical(caseId);

  const latestVisit = visits.find((v) => v.appointmentId === latestAppointmentId) ?? visits[0] ?? null;

  // "New order" abre DIRECTO el formulario (feedback de Erick: el paso
  // intermedio con la misma lista era ambiguo). La orden se cuelga de la
  // visita más reciente que ya ocurrió.
  const [orderOpen, setOrderOpen] = React.useState(false);
  const handleCreate = async (payload: Parameters<React.ComponentProps<typeof LabOrderDialog>['onCreate']>[0]): Promise<void> => {
    if (!latestVisit) return;
    const res = await fetch(`/api/admin/lab-orders/${latestVisit.appointmentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('create');
    await reload();
  };

  // Anular (asistente) o quitar (médico) — mismos endpoints que la consulta
  const [voidTarget, setVoidTarget] = React.useState<LabRow | null>(null);
  const voidOrder = async (id: string): Promise<void> => {
    setBusyLabId(id);
    try {
      const res = await fetch(`/api/admin/lab-orders/item/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'VOIDED' }),
      });
      if (!res.ok) setLabError(td('labErrVoid'));
      else await reload();
    } finally {
      setBusyLabId(null);
      setVoidTarget(null);
    }
  };


  // Visor de impresión en modal (no otra pestaña) — la hoja trae su propio
  // botón "Imprimir" adentro.
  const [printGroup, setPrintGroup] = React.useState<string | null>(null);

  const [busyLabId, setBusyLabId] = React.useState<string | null>(null);
  const [labError, setLabError] = React.useState<string | null>(null);
  const fileInputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const openResult = async (id: string): Promise<void> => {
    setBusyLabId(id);
    try {
      const res = await fetch(`/api/admin/lab-orders/item/${id}/result`);
      const d = await res.json() as { url?: string };
      if (d.url) window.open(d.url, '_blank', 'noopener');
      else setLabError(td('labErrResult'));
    } catch {
      setLabError(td('labErrResult'));
    } finally {
      setBusyLabId(null);
    }
  };

  const uploadResult = async (id: string, file: File): Promise<void> => {
    setBusyLabId(id);
    setLabError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/lab-orders/item/${id}/result`, { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setLabError(d.error === 'FILE_TOO_LARGE' ? td('labErrTooLarge')
          : d.error === 'INVALID_TYPE' ? td('labErrType')
          : td('labErrUpload'));
        return;
      }
      await reload();
    } catch {
      setLabError(td('labErrUpload'));
    } finally {
      setBusyLabId(null);
    }
  };

  if (loading) return <LoadingRow />;
  if (error) return <LoadErrorRow />;

  const labVisits = visits.filter((v) => v.labOrders.length > 0);

  return (
    <div className="space-y-4">
      {/* Barra de acción — nueva orden sobre la visita más reciente que ya
          ocurrió (el paciente que llama días después). Abre el formulario
          directo, sin pasos intermedios. */}
      {latestVisit && (
        <div className="flex items-center justify-end">
          <Button onClick={() => setOrderOpen(true)} className="h-9 gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {td('labNewOrder')}
          </Button>
        </div>
      )}

      {labError && (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {labError}
        </div>
      )}

      {labVisits.length === 0 ? (
        <EmptyState.Rich icon={FlaskConical} title={t('labsEmpty')} subtitle="" />
      ) : (
        <div className="space-y-3">
          {/* Una tarjeta por ORDEN (groupId), no por visita: los estudios
              pedidos juntos comparten diagnósticos, urgencia y hoja impresa —
              y una misma visita puede tener varias órdenes. Antes se listaban
              todas juntas y solo la primera tenía botón de imprimir. */}
          {labVisits.flatMap((v) => {
            const grupos = new Map<string, LabRow[]>();
            for (const o of v.labOrders) {
              const k = o.groupId ?? o.id;
              grupos.set(k, [...(grupos.get(k) ?? []), o]);
            }
            return [...grupos.entries()].map(([gid, items]) => {
            const head = items[0];
            return (
            <div key={gid} className="rounded-lg bg-bg-1 overflow-hidden">
              <VisitHeader
                visit={v}
                dateIso={head.orderedAt}
                note={mismoDia(head.orderedAt, v.scheduledFor)
                  ? undefined
                  : td('labFromVisit', { date: fmtVisit(v.scheduledFor) })}
                action={head.groupId ? (
                  <button
                    type="button"
                    onClick={() => setPrintGroup(head.groupId!)}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold text-text-2 border border-border hover:text-violet hover:border-violet/40 transition-colors"
                  >
                    <Printer className="w-3 h-3" /> {td('labPrintOrder')}
                  </button>
                ) : undefined}
              />
              {/* Sin líneas divisorias — regla de Erick: nada de bordes en listas */}
              <div>
                {items.map((o) => {
                  const Icon = LAB_CATEGORY_ICON[o.orderType] ?? FlaskConical;
                  const busy = busyLabId === o.id;
                  const voided = o.status === 'VOIDED';
                  const inHouse = o.collectionSite === 'IN_HOUSE';
                  return (
                    <div key={o.id} className={`px-3 py-2 flex items-center gap-2.5 flex-wrap ${voided ? 'opacity-50' : ''}`}>
                      <Icon className="w-3.5 h-3.5 text-cyan shrink-0" />
                      {o.studyCode && <span className="font-mono text-[10.5px] text-cyan shrink-0">{o.studyCode}</span>}
                      <span className="text-[12.5px] text-text-1 flex-1 min-w-[140px]">{o.studyName}</span>
                      {o.urgency !== 'ROUTINE' && (
                        <TagPill
                          label={td(`labUrgency_${o.urgency}`)}
                          colorClass={o.urgency === 'STAT' ? 'bg-rose/15 text-rose border-rose/30' : 'bg-amber/15 text-amber border-amber/30'}
                        />
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                        {inHouse ? <Home className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                        {td(`labCollection_${o.collectionSite}`)}
                      </span>
                      <TagPill label={td(`labStatus_${o.status}`)} colorClass={LAB_STATUS_CLASS[o.status] ?? ''} />

                      <div className="flex items-center gap-1.5 shrink-0">
                        {o.resultFileName ? (
                          <button
                            type="button"
                            onClick={() => void openResult(o.id)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald hover:underline"
                          >
                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                            {td('labViewResult')}
                          </button>
                        ) : !voided ? (
                          <>
                            <input
                              type="file"
                              accept="application/pdf,image/jpeg,image/png"
                              className="hidden"
                              ref={(el) => { fileInputs.current[o.id] = el; }}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void uploadResult(o.id, f);
                                e.target.value = '';
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => fileInputs.current[o.id]?.click()}
                              disabled={busy}
                              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-violet hover:underline"
                            >
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                              {td('labUploadResult')}
                            </button>
                            {/* Con TEXTO, no solo ícono (el ⊘ no se leía como
                                "eliminar"). Anular, no borrar: acá la hoja ya
                                se entregó. Solo mientras no haya resultado. */}
                            <button
                              type="button"
                              onClick={() => setVoidTarget(o)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-text-muted hover:text-rose"
                            >
                              <Ban className="w-3 h-3" />
                              {td('labVoid')}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Diagnósticos que justifican la orden + indicación clínica.
                  Son del GRUPO, no de cada estudio — por eso van al pie de la
                  orden. Faltaban acá: se guardaban y se imprimían en la hoja,
                  pero en el caso no se veían (Erick 2026-08-08). */}
              {(head.icd10Codes.length > 0 || head.clinicalIndication.trim() || head.preferredCenter) && (
                <div className="px-3 py-2 bg-bg-2/30 space-y-1">
                  {head.icd10Codes.length > 0 && (
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted shrink-0 mt-0.5">
                        {td('labDiagnoses')}
                      </span>
                      {head.icd10Codes.map((c) => (
                        <span key={c} className="text-[11.5px] text-text-2">{c}</span>
                      ))}
                    </div>
                  )}
                  {head.clinicalIndication.trim() && (
                    <div className="text-[11.5px] text-text-2">
                      <span className="text-text-muted">{td('labIndication')}: </span>
                      {head.clinicalIndication}
                    </div>
                  )}
                  {head.preferredCenter && (
                    <div className="text-[11.5px] text-text-2">
                      <span className="text-text-muted">{td('labCenter')}: </span>
                      {head.preferredCenter}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
            });
          })}
        </div>
      )}


      {/* Nueva orden — el mismo formulario de la consulta, directo */}
      {latestVisit && (
        <LabOrderDialog
          open={orderOpen}
          onClose={() => setOrderOpen(false)}
          userId={null}
          defaultProviderId={latestVisit.providerId}
          onCreate={handleCreate}
        />
      )}

      {/* Visor de impresión — compartido con el Resumen del asistente */}
      <LabOrderPrintDialog groupId={printGroup} onClose={() => setPrintGroup(null)} />

      {/* Confirmaciones — mismas claves que la consulta */}
      <ConfirmDialog
        open={!!voidTarget}
        onCancel={() => setVoidTarget(null)}
        onConfirm={() => { if (voidTarget) void voidOrder(voidTarget.id); }}
        title={td('labVoidTitle')}
        description={td('labVoidConfirm', { study: voidTarget?.studyName ?? '' })}
        confirmLabel={td('labVoid')}
        variant="danger"
      />

    </div>
  );
}

// ─── Tab: Prescription — recetas ScriptSure + conciliación, espejo del doctor ─

export function CaseRxTab({ caseId, canPrescribe }: {
  caseId: string;
  /** true solo en la variante doctor — habilita "Repetir" (refill) */
  canPrescribe: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.caseTabs.clinical');
  const td = useTranslations('phoenix.doctor');
  const { visits, medications, latestAppointmentId, loading, error, reload } = useCaseClinical(caseId);

  // ── Repetir receta (widget de ScriptSure, compartido con My Day) ──
  const [widgetOpen, setWidgetOpen] = React.useState(false);
  const [widgetStatus, setWidgetStatus] = React.useState<WidgetStatus>('loading');
  const [widgetUrl, setWidgetUrl] = React.useState<string | null>(null);
  const [widgetError, setWidgetError] = React.useState<string | null>(null);
  const [refillingId, setRefillingId] = React.useState<string | null>(null);
  // Cita de la receta repetida — al cerrar se sincroniza ESA cita con ScriptSure
  const syncApptRef = React.useRef<string | null>(null);

  const startRefill = async (rx: RxRow, appointmentId: string): Promise<void> => {
    setRefillingId(rx.id);
    setWidgetOpen(true);
    setWidgetStatus('loading');
    setWidgetUrl(null);
    setWidgetError(null);
    syncApptRef.current = appointmentId;
    const result = await launchRefill(rx.id);
    setWidgetStatus(result.status);
    setWidgetUrl(result.url);
    setWidgetError(result.errorDetail);
    setRefillingId(null);
  };

  const closeWidget = (): void => {
    setWidgetOpen(false);
    setWidgetUrl(null);
    // El doctor pudo enviar la receta dentro del widget — pull atado a esta
    // acción (nunca polling, regla de DAW) y recarga de la lista.
    const apptId = syncApptRef.current;
    syncApptRef.current = null;
    void (async () => {
      if (apptId) {
        try { await fetch(`/api/admin/scriptsure/sync/${apptId}`, { method: 'POST' }); } catch { /* el webhook es la otra vía */ }
      }
      await reload();
    })();
  };

  // Prescripción NUEVA (no repetición): mismo widget Drug List, sobre la
  // visita más reciente que ya ocurrió. Mismo mapeo de errores que la consulta.
  const openNewRx = async (): Promise<void> => {
    if (!latestAppointmentId) return;
    setWidgetOpen(true);
    setWidgetStatus('loading');
    setWidgetUrl(null);
    setWidgetError(null);
    syncApptRef.current = latestAppointmentId;
    try {
      const res = await fetch(`/api/admin/scriptsure/widget/${latestAppointmentId}?widget=drug-list`);
      if (res.status === 409) { setWidgetStatus('not_onboarded'); return; }
      if (res.status === 422) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setWidgetStatus(body?.error === 'PATIENT_MISSING_DOB' ? 'missing_dob' : 'missing_address');
        return;
      }
      if (!res.ok) { setWidgetStatus('error'); return; }
      const data = (await res.json()) as { url: string };
      setWidgetUrl(data.url);
      setWidgetStatus('ready');
    } catch {
      setWidgetStatus('error');
    }
  };

  if (loading) return <LoadingRow />;
  if (error) return <LoadErrorRow />;

  // El mostrador solo ve lo que llegó a la farmacia; el doctor ve todo, porque
  // es el único que puede reenviar una que falló (ver `soloEntregadas`).
  const rxVisits = visits
    .map((v) => (canPrescribe ? v : { ...v, prescriptions: soloEntregadas(v.prescriptions) }))
    .filter((v) => v.prescriptions.length > 0);

  return (
    <div className="space-y-4">
      {/* Prescribir — SOLO doctor. Mismo CTA violet del tab de la consulta,
          abre el widget Drug List sobre la visita más reciente. */}
      {canPrescribe && latestAppointmentId && (
        <button
          type="button"
          onClick={() => void openNewRx()}
          className="group relative w-full flex items-center gap-4 text-left rounded-xl px-5 py-4 overflow-hidden transition-all duration-200 hover:scale-[1.005] active:scale-[0.995]"
          style={{
            background: 'linear-gradient(135deg,#7C3AED 0%,#8B5CF6 55%,#A78BFA 100%)',
            boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
          }}
        >
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.06] transition-colors" />
          <div className="relative w-11 h-11 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center shrink-0 backdrop-blur-sm">
            <Pill className="w-5 h-5 text-white" />
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="text-[15px] font-bold text-white tracking-tight">{td('rxNewPrescription')}</div>
            <div className="text-[11.5px] text-white/75 mt-0.5">{td('rxNewPrescriptionHint')}</div>
          </div>
          <ArrowRight className="relative w-5 h-5 text-white/80 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
      )}

      {/* Recetas electrónicas por visita */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Pill className="w-4 h-4 text-brand" />
          <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider flex-1">{t('rxSection')}</h3>
          {!canPrescribe && rxVisits.length > 0 && (
            <span className="text-[10.5px] text-text-muted">{t('rxDoctorHint')}</span>
          )}
        </div>

        {rxVisits.length === 0 ? (
          <EmptyState.Rich icon={Pill} title={t('rxEmpty')} subtitle="" />
        ) : (
          <div className="space-y-3">
            {rxVisits.map((v) => (
              <div key={v.appointmentId} className="rounded-lg bg-bg-1 overflow-hidden">
                <VisitHeader visit={v} />
                {/* Sin líneas divisorias — regla de Erick: nada de bordes en listas */}
              <div>
                  {v.prescriptions.map((rx) => (
                    <div key={rx.id} className="px-3 py-2.5 flex items-start gap-3 flex-wrap">
                      <div className="flex-1 min-w-[180px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-text-1">{rx.drugName}</span>
                          {rx.deaSchedule && (
                            <TagPill label={`DEA ${rx.deaSchedule}`} colorClass="bg-amber/15 text-amber border-amber/30" />
                          )}
                          <TagPill
                            label={td(`rxStatus_${RX_STATUS_KEY[rxStatusOf(rx.status)]}`)}
                            colorClass={RX_STATUS_CLASS[rxStatusOf(rx.status)]}
                          />
                        </div>
                        {rx.status === 'ERROR' && (
                          <p className="text-[11px] text-rose mt-1 flex items-start gap-1.5">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            {td('rxErrorNotice')}
                          </p>
                        )}
                        <div className="text-[11.5px] text-text-2 mt-1">
                          {[rx.dose !== '—' ? rx.dose : null, rx.frequency !== '—' ? rx.frequency : null]
                            .filter(Boolean).join(' · ') || null}
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-3 flex-wrap">
                          {rx.quantityTotal > 0 && <span>{td('rxQty')}: {rx.quantityTotal}</span>}
                          <span>{td('rxRefills')}: {rx.refills}</span>
                          {rx.pharmacyName && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {rx.pharmacyName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-[10.5px] text-text-muted">
                          {new Date(rx.dawSentAt ?? rx.createdAt).toLocaleString(undefined, {
                            day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                          })}
                        </span>
                        {/* Repetir = prescribir → solo el doctor lo ve; el server
                            lo re-valida aunque alguien fabrique el request */}
                        {canPrescribe && rx.canRefill && (
                          <button
                            type="button"
                            onClick={() => void startRefill(rx, v.appointmentId)}
                            disabled={refillingId === rx.id}
                            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-violet hover:underline disabled:opacity-60"
                          >
                            {refillingId === rx.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RotateCcw className="w-3 h-3" />}
                            {td('rxRefill')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conciliación de medicamentos — igual que el tab del doctor: Activo /
          Anterior / "No recetado por mí". El POST agrega al historial del
          paciente vía la cita más reciente del caso. */}
      {latestAppointmentId && (
        <MedicationHistory appointmentId={latestAppointmentId} medications={medications} />
      )}
      {/* Sin "Registros manuales" acá: la tabla de prescripciones manuales lee
          `patient.medicalHistory.medications`, que es EXACTAMENTE lo que ya
          muestra el Medication History de arriba — era el mismo dato dos veces
          (Erick 2026-08-08). Los labs manuales siguen en el tab Laboratorios. */}

      {/* Widget de ScriptSure — el mismo modal de la consulta del doctor */}
      <ScriptSureWidgetDialog
        open={widgetOpen}
        kind="drug-list"
        status={widgetStatus}
        url={widgetUrl}
        errorDetail={widgetError}
        onClose={closeWidget}
      />
    </div>
  );
}

// ─── Tab: Services — los DOS catálogos, por visita ────────────────────────────

/**
 * Cargos de la visita: se agregan y se quitan EN LA LISTA, sin diálogo
 * intermedio (antes había uno que repetía la misma lista de abajo). Los
 * handlers son espejo de los del panel de Day Admission
 * (appointment-detail-panel): el CPT vive en el JSON `plannedServiceCodes`
 * (PATCH + sync-billing) y el cargo en efectivo en su tabla
 * (`appointment_services`, POST / anular con PATCH).
 */
/** Qué cargos ya tiene la visita y cuántas veces, en el formato de `key` del
 *  picker. El de efectivo se cuenta: el mismo ítem puede cobrarse dos veces. */
function cargosDeLaVisita(v: Visit): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const s of v.services) m.set(`s${s.id}`, 1);
  for (const c of v.cashServices) {
    const k = c.catalogItemId !== null ? `c${c.catalogItemId}` : `c-${c.code}`;
    m.set(k, (m.get(k) ?? 0) + c.quantity);
  }
  return m;
}

export function CaseServicesTab({ caseId }: { caseId: string }): React.ReactElement {
  const t = useTranslations('phoenix.caseTabs.clinical');
  const tc = useTranslations('phoenix.charges');
  const { visits, coverage, latestAppointmentId, loading, error, reload } = useCaseClinical(caseId);

  // La visita objetivo se guarda por id, NO por objeto: el picker queda abierto
  // mientras se agregan varios cargos y cada uno recarga la lista — con un
  // snapshot, el segundo cargo pisaría al primero.
  const [pickerApptId, setPickerApptId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmCpt, setConfirmCpt] = React.useState<{ apptId: string; id: string } | null>(null);
  const [confirmCash, setConfirmCash] = React.useState<string | null>(null);

  const latestVisit = visits.find((v) => v.appointmentId === latestAppointmentId) ?? visits[0] ?? null;
  const pickerVisit = visits.find((v) => v.appointmentId === pickerApptId) ?? null;

  /** Los CPT viven en el arreglo `plannedServiceCodes` de la cita: agregar y
   *  quitar es reescribirlo entero. */
  const patchCpt = async (apptId: string, list: Visit['services']): Promise<void> => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedServiceCodes: list }),
      });
      if (!res.ok) return;
      // Cada CPT genera su fila de facturación — sin esto el saldo queda viejo
      await fetch(`/api/admin/appointments/${apptId}/sync-billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }),
      }).catch(() => {});
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const addBillable = async (item: BillableItem): Promise<void> => {
    const v = pickerVisit;
    if (!v) return;
    if (item.source === 'INSURANCE') {
      if (v.services.find((s) => s.id === item.refId)) return;
      // `category` NO es opcional: el PATCH lo exige y sin él devuelve 400 —
      // por eso agregar un CPT desde el caso nunca llegaba a guardar.
      await patchCpt(v.appointmentId, [
        ...v.services,
        { id: item.refId, code: item.code, description: item.name, fee: item.price, category: item.category ?? '' },
      ]);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cash-services/${v.appointmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogItemId: Number(item.refId),
          code: item.code,
          name: item.name,
          unitPrice: item.price,
          cptCode: item.insuranceCode,
          unitLabel: item.unitLabel,
          quantity: 1,
        }),
      });
      if (res.ok) await reload();
    } finally {
      setSaving(false);
    }
  };

  /** Anular, no borrar: el cargo en efectivo ya pudo haberse cobrado. */
  const voidCash = async (id: string): Promise<void> => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cash-services/item/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'VOIDED' }),
      });
      if (res.ok) await reload();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingRow />;
  if (error) return <LoadErrorRow />;

  const withServices = visits.filter((v) => v.services.length > 0 || v.cashServices.length > 0);

  return (
    <div className="space-y-3">
      {/* Agregar sobre la visita más reciente — el staff carga cargos porque
          es quien cobra al final. Va DIRECTO al catálogo: el paso intermedio
          repetía la misma lista que ya se ve abajo. */}
      {latestVisit && coverage && (
        <div className="flex items-center justify-end gap-2">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />}
          <Button onClick={() => setPickerApptId(latestVisit.appointmentId)} className="h-9 gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {tc('addCharge')}
          </Button>
        </div>
      )}

      {withServices.length === 0 ? (
        <EmptyState.Rich icon={Briefcase} title={t('servicesEmpty')} subtitle="" />
      ) : withServices.map((v) => {
        const insuranceTotal = v.services.reduce((s, c) => s + (Number(c.fee) || 0), 0);
        const cashTotal = v.cashServices.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
        return (
          <div key={v.appointmentId} className="rounded-lg bg-bg-1 overflow-hidden">
            {/* Sin botón propio: el CTA de arriba ya agrega sobre la visita más
                reciente, que es la única a la que se le cargan cargos nuevos. */}
            <VisitHeader visit={v} />
            <div className="p-3 space-y-2.5">
              {v.services.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{tc('badgeInsurance')}</div>
                  {v.services.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-[12.5px] group">
                      <span className="font-mono text-[11px] text-cyan shrink-0 w-[70px]">{s.code}</span>
                      <span className="text-text-2 flex-1 min-w-0">{s.description}</span>
                      {s.fee !== undefined && <span className="text-text-2 shrink-0 tabular-nums">{money(Number(s.fee))}</span>}
                      <RemoveChargeButton
                        label={`${tc('badgeInsurance')} ${s.code}`}
                        disabled={saving}
                        onClick={() => setConfirmCpt({ apptId: v.appointmentId, id: s.id })}
                      />
                    </div>
                  ))}
                </div>
              )}

              {v.cashServices.length > 0 && (() => {
                // Con el mismo ítem cobrado dos veces, los renglones son
                // idénticos y no se puede confirmar cuál se borró. La hora los
                // separa, y solo aparece cuando hace falta.
                const repetidos = codigosRepetidos(v.cashServices);
                return (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{tc('badgeCash')}</div>
                    {v.cashServices.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-[12.5px] group">
                        <span className="font-mono text-[11px] text-emerald shrink-0 w-[70px] truncate" title={c.code}>{c.code}</span>
                        <span className="text-text-2 flex-1 min-w-0">
                          {c.name}
                          {c.quantity > 1 && <span className="text-text-muted"> ×{c.quantity}</span>}
                          {repetidos.has(c.code) && (
                            <span className="text-text-muted"> · {horaCobro(c.chargedAt)}</span>
                          )}
                        </span>
                        <span className="text-text-2 shrink-0 tabular-nums">{money(c.unitPrice * c.quantity)}</span>
                        <RemoveChargeButton
                          label={`${tc('badgeCash')} ${c.code}${repetidos.has(c.code) ? ` · ${horaCobro(c.chargedAt)}` : ''}`}
                          disabled={saving}
                          onClick={() => setConfirmCash(c.id)}
                        />
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Mismo desglose del Resumen y el tab de cargos de la consulta */}
              <div className="flex items-center justify-end gap-3 flex-wrap border-t border-border/60 pt-2">
                {insuranceTotal > 0 && (
                  <span className="text-[11px] text-text-muted">
                    {tc('totalToInsurance')} <b className="text-cyan text-[12.5px] ml-0.5 tabular-nums">{money(insuranceTotal)}</b>
                  </span>
                )}
                {cashTotal > 0 && (
                  <span className="text-[11px] text-text-muted">
                    {tc('badgeCash')} <b className="text-emerald text-[12.5px] ml-0.5 tabular-nums">{money(cashTotal)}</b>
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Catálogo con los dos circuitos (con seguro / sin seguro) */}
      {pickerVisit && coverage && (
        <ChargePickerDialog
          coverage={coverage}
          added={cargosDeLaVisita(pickerVisit)}
          onClose={() => setPickerApptId(null)}
          onAdd={addBillable}
        />
      )}

      <ConfirmDialog
        open={!!confirmCpt}
        onCancel={() => setConfirmCpt(null)}
        onConfirm={() => {
          const c = confirmCpt;
          setConfirmCpt(null);
          const v = visits.find((x) => x.appointmentId === c?.apptId);
          if (c && v) void patchCpt(c.apptId, v.services.filter((s) => s.id !== c.id));
        }}
        title={t('removeServiceTitle')}
        description={t('removeServiceBody')}
        confirmLabel={t('removeLabel')}
        variant="danger"
      />
      {/* Anular, no borrar — mismas claves que el panel de Day Admission */}
      <ConfirmDialog
        open={!!confirmCash}
        onCancel={() => setConfirmCash(null)}
        onConfirm={() => { if (confirmCash) void voidCash(confirmCash); setConfirmCash(null); }}
        title={tc('voidTitle')}
        description={tc('voidBody')}
        confirmLabel={tc('voidTitle')}
        variant="danger"
      />
    </div>
  );
}

/** Quitar un cargo de la lista de la visita. Discreto hasta que el mouse pasa
 *  por la fila — la lista se lee mucho más de lo que se edita. */
function RemoveChargeButton({ label, disabled, onClick }: {
  label: string; disabled: boolean; onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="p-1 rounded shrink-0 text-text-muted/40 group-hover:text-text-muted hover:!text-rose hover:bg-rose/10 transition-colors disabled:opacity-40"
    >
      <Trash2 className="w-3 h-3" />
    </button>
  );
}

// ─── Tab: Braces — férulas entregadas, por visita ─────────────────────────────

/** Férulas ya entregadas en esa visita y cuántas, por código — el picker las
 *  marca. Dos del mismo modelo (izquierda y derecha) son dos entregas reales,
 *  así que se cuenta en vez de bloquear. */
function ferulasDeLaVisita(v: Visit | null): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const b of v?.braces ?? []) m.set(b.code, (m.get(b.code) ?? 0) + b.quantity);
  return m;
}

export function CaseBracesTab({ caseId }: { caseId: string }): React.ReactElement {
  const t = useTranslations('phoenix.caseTabs.clinical');
  const td = useTranslations('phoenix.doctor');
  const { visits, latestAppointmentId, loading, error, reload } = useCaseClinical(caseId);

  // Igual que Servicios: se entrega y se quita EN LA LISTA. El diálogo
  // intermedio metía adentro el BracesTab entero de la consulta, así que la
  // lista, el conteo y el total aparecían dos veces.
  const [pickerApptId, setPickerApptId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmBrace, setConfirmBrace] = React.useState<{ id: string; name: string } | null>(null);

  const latestVisit = visits.find((v) => v.appointmentId === latestAppointmentId) ?? visits[0] ?? null;
  // Por id, no por objeto: el picker queda abierto entre entregas y cada una
  // recarga la lista (mismo motivo que en Servicios).
  const pickerVisit = visits.find((v) => v.appointmentId === pickerApptId) ?? null;

  const entregar = async (item: CatalogBrace, side: BraceSide, quantity: number): Promise<void> => {
    if (!pickerApptId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/braces/${pickerApptId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogItemId: item.id,
          code: item.code,
          name: item.name,
          sizeLabel: item.sizeLabel,
          hcpcsCode: item.hcpcsCode,
          unitPrice: item.publicPrice ?? 0,
          side,
          quantity,
        }),
      });
      // El picker queda abierto: se entregan varias férulas sin reabrir
      if (res.ok) await reload();
    } finally {
      setSaving(false);
    }
  };

  /**
   * VOIDED, no RETURNED. En este punto el paciente todavía no pagó — si dice
   * que no la quiere, la férula nunca salió de la clínica y eso NO es una
   * devolución. Anotarlo como devolución inflaba el dato el día que alguien
   * quiera saber cuántas férulas devuelven de verdad. El cobro se retira solo
   * si nadie pagó (lib/brace-billing.ts); lo pagado se reembolsa anulando el
   * pago, nunca por detrás.
   */
  const quitar = async (id: string): Promise<void> => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/braces/item/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'VOIDED' }),
      });
      if (res.ok) await reload();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingRow />;
  if (error) return <LoadErrorRow />;

  const withBraces = visits.filter((v) => v.braces.length > 0);

  return (
    <div className="space-y-3">
      {latestVisit && (
        <div className="flex items-center justify-end gap-2">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />}
          <Button onClick={() => setPickerApptId(latestVisit.appointmentId)} className="h-9 gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {td('braceAdd')}
          </Button>
        </div>
      )}

      {withBraces.length === 0 ? (
        <EmptyState.Rich icon={Bandage} title={t('bracesEmpty')} subtitle="" />
      ) : withBraces.map((v) => {
        const bracesTotal = v.braces.reduce((s, b) => s + b.unitPrice * b.quantity, 0);
        return (
          <div key={v.appointmentId} className="rounded-lg bg-bg-1 overflow-hidden">
            {/* Sin botón propio: el CTA de arriba entrega sobre la visita más
                reciente, que es la única que recibe férulas nuevas. */}
            <VisitHeader visit={v} />
            <div className="p-3 space-y-1">
              {v.braces.map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-[12.5px] group">
                  <span className="font-mono text-[11px] text-brand shrink-0 w-[70px] truncate" title={b.code}>{b.code}</span>
                  <span className="text-text-2 flex-1 min-w-0">
                    {b.name}
                    {b.sizeLabel && <span className="text-text-muted"> · {b.sizeLabel}</span>}
                    {b.side !== 'NA' && <span className="text-text-muted"> · {b.side}</span>}
                    {b.quantity > 1 && <span className="text-text-muted"> ×{b.quantity}</span>}
                  </span>
                  <span className="text-text-2 shrink-0 tabular-nums">{money(b.unitPrice * b.quantity)}</span>
                  <RemoveChargeButton
                    label={`${td('tabBraces')} ${b.name}`}
                    disabled={saving}
                    onClick={() => setConfirmBrace({ id: b.id, name: b.name })}
                  />
                </div>
              ))}
              <div className="flex items-center justify-end border-t border-border/60 pt-2 mt-1">
                <span className="text-[11px] text-text-muted">{td('braceTotal', { amount: money(bracesTotal) })}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Catálogo de férulas — directo, con talla, lado y cantidad */}
      {pickerApptId && (
        <BracePickerDialog
          onClose={() => setPickerApptId(null)}
          onAdd={entregar}
          added={ferulasDeLaVisita(pickerVisit)}
        />
      )}

      <ConfirmDialog
        open={!!confirmBrace}
        onCancel={() => setConfirmBrace(null)}
        onConfirm={() => { if (confirmBrace) void quitar(confirmBrace.id); setConfirmBrace(null); }}
        title={t('removeBraceTitle')}
        description={t('removeBraceBody', { name: confirmBrace?.name ?? '' })}
        confirmLabel={t('removeLabel')}
        variant="danger"
      />
    </div>
  );
}
