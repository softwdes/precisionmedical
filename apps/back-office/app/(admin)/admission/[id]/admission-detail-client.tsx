'use client';

/**
 * B.15 — Admisión "Pagos y Cobros"
 *
 * Antes de pasar al doctor, recepción verifica:
 *   1. Documentos (PIP verificado, lien firmado, form completado)
 *   2. Responsabilidad financiera del día (quién paga y cuánto)
 *   3. Confirma con el paciente → "Pasar a la sala"
 *
 * Color de identidad: emerald (Regla #5)
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft, ShieldCheck, Scale, CheckCircle2, Clock,
  DollarSign, FileText, Stethoscope, AlertTriangle,
  ChevronRight, Building2, Phone, RefreshCw,
} from 'lucide-react';
import { PageHeader }   from '@/components/ui-phoenix/page-header';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill, type StatusState } from '@/components/ui-phoenix/status-pill';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ApptDetail {
  id:              string;
  scheduledFor:    string;
  durationMinutes: number;
  type:            string;
  status:          string;
  checkedInAt:     string | null;
  notes:           string | null;
  patient: {
    id: string; firstName: string; lastName: string;
    phone: string | null; email: string | null; dateOfBirth: string | null;
  };
  provider: { id: string; firstName: string; lastName: string; specialty: string } | null;
  clinic:   { id: string; name: string };
  case: {
    id: string; caseCode: string; caseType: string;
    accidentDate: string | null; pipVerifiedAt: string | null;
    intakeFormCompletedAt: string | null; primaryPolicyNumber: string | null;
    pipActive: boolean; lienSigned: boolean; isMVA: boolean;
    lawFirm: { id: string; firmName: string | null; phone: string | null; email: string | null } | null;
    attorney: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
    primaryInsurance: {
      id: string; name: string; shortCode: string; color: string;
      claimsPhone: string | null; claimsEmail: string | null;
    } | null;
  } | null;
  financial: {
    serviceEstimate: number; pipCovers: number;
    patientOwes: number | null; currency: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  AUTO_ACCIDENT:  'Auto Accident',
  FAMILY_PRACTICE:'Family Practice',
  URGENT_CARE:    'Urgent Care',
  FOLLOW_UP:      'Follow-up',
  CONSULTATION:   'Consulta',
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}

function fmtUSD(n: number | null) {
  if (n === null) return 'TBD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// ─── ChecklistRow ─────────────────────────────────────────────────────────────
function ChecklistRow({ done, label, meta }: { done: boolean; label: string; meta?: string }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-md px-3 py-2 ${done ? 'bg-emerald/5' : 'bg-bg-2/50'}`}>
      {done
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0 mt-0.5" />
        : <Clock className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] ${done ? 'text-emerald' : 'text-text-2'}`}>{label}</div>
        {meta && <div className="text-[10px] text-text-muted">{meta}</div>}
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
  // Confirmaciones antes de pasar a sala
  const [confirm1,  setConfirm1]  = useState(false);
  const [confirm2,  setConfirm2]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/admission/${appointmentId}`);
      const data = await res.json();
      if (data.ok) setDetail(data.appointment);
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => { void load(); }, [load]);

  async function admit() {
    setAdmitting(true);
    try {
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
  const canAdmit = confirm1 && confirm2 && !isAlreadyInRoom;
  const overallState: StatusState = isAlreadyInRoom ? 'success'
    : d.case?.pipActive && d.case?.lienSigned ? 'success'
    : 'warning';

  // Checklists
  const docItems = [
    {
      done:  !!d.case?.intakeFormCompletedAt,
      label: t('docIntakeForm'),
      meta:  d.case?.intakeFormCompletedAt ? t('docIntakeFormCompleted', { date: fmtDate(d.case.intakeFormCompletedAt) }) : undefined,
    },
    {
      done:  !!d.case?.pipActive,
      label: t('docPipVerified'),
      meta:  d.case?.pipVerifiedAt ? t('docPipVerifiedOn', { date: fmtDate(d.case.pipVerifiedAt) }) : t('docPipNotVerified'),
    },
    {
      done:  !!d.case?.lienSigned,
      label: t('docLienSigned'),
      meta:  d.case?.lienSigned ? t('docLienSignedMeta') : t('docLienPending'),
    },
  ];

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

      <div className="px-4 sm:px-6 pb-8 space-y-5">

        {/* ── Stepper ── */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald flex items-center justify-center text-white text-[11px] font-bold">✓</div>
            <span className="text-emerald text-[11px] font-semibold hidden sm:inline">{t('stepCheckIn')}</span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
              isAlreadyInRoom
                ? 'bg-emerald text-white'
                : 'bg-brand text-white'
            }`}>2</div>
            <span className={`text-[11px] font-semibold hidden sm:inline ${isAlreadyInRoom ? 'text-emerald' : 'text-text-1'}`}>
              {t('stepPayments')}
            </span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
              isAlreadyInRoom ? 'bg-violet text-white' : 'bg-bg-2 text-text-muted'
            }`}>3</div>
            <span className={`text-[11px] font-semibold hidden sm:inline ${isAlreadyInRoom ? 'text-violet' : 'text-text-muted'}`}>
              {t('stepInRoom')}
            </span>
          </div>
        </div>

        {/* ── Profile banner ── */}
        <div className="rounded-lg border border-emerald/25 bg-emerald/5 p-4">
          <div className="flex items-start gap-3 flex-wrap">
            <PersonAvatar firstName={d.patient.firstName} lastName={d.patient.lastName} size={10} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold text-text-1">{patientName}</span>
                {d.case && <span className="font-mono text-[11px] text-emerald">{d.case.caseCode}</span>}
                <StatusPill label={isAlreadyInRoom ? t('statusInRoom') : t('statusInAdmission')} state={overallState} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {fmtTime(d.scheduledFor)} · {d.durationMinutes} min
                </span>
                {d.provider && (
                  <span className="flex items-center gap-1">
                    <Stethoscope className="w-3 h-3" />
                    Dr. {d.provider.firstName} {d.provider.lastName}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {d.clinic.name}
                </span>
                <span>{TYPE_LABELS[d.type] ?? d.type}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Ya en sala banner ── */}
        {isAlreadyInRoom && (
          <div className="rounded-lg border border-violet/40 bg-violet/10 p-4 flex items-center gap-3">
            <Stethoscope className="w-5 h-5 text-violet shrink-0" />
            <div>
              <div className="text-violet font-bold text-sm">
                {d.status === 'COMPLETED' ? t('visitCompleted') : t('patientPassedToRoom')}
              </div>
              <div className="text-violet/70 text-[11px]">
                {d.provider ? t('withDoctorName', { firstName: d.provider.firstName, lastName: d.provider.lastName }) : t('noProviderAssigned')}
              </div>
            </div>
            {d.status === 'IN_PROGRESS' && (
              <button
                type="button"
                onClick={() => router.push('/calendar')}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet text-white text-xs font-semibold hover:bg-violet/90 shrink-0"
              >
                {t('viewCalendar')} <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* ── 2-column grid ── */}
        {!isAlreadyInRoom && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* ── Columna izq: Servicio + Cobertura + Lien ── */}
            <div className="space-y-4">
              {/* Servicio del día */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Stethoscope className="w-4 h-4 text-emerald" />
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionServiceToday')}</span>
                </div>
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 text-sm">
                  <div className="font-semibold text-text-1">{TYPE_LABELS[d.type] ?? d.type}</div>
                  {d.provider && (
                    <div className="text-text-muted text-[11px] mt-0.5">
                      Dr. {d.provider.firstName} {d.provider.lastName} · {t('estimatedMinutes', { minutes: d.durationMinutes })}
                    </div>
                  )}
                  <div className="text-text-muted text-[11px] mt-0.5">{t('cptAssignedAfterVisit')}</div>
                </div>
              </div>

              {/* Cobertura PIP */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald" />
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionCoverage')}</span>
                  </div>
                  {d.case?.primaryInsurance && (
                    <div
                      className="inline-flex items-center justify-center w-6 h-6 rounded text-[9px] font-black text-white"
                      style={{ backgroundColor: d.case.primaryInsurance.color }}
                    >
                      {d.case.primaryInsurance.shortCode}
                    </div>
                  )}
                </div>
                {d.case?.primaryInsurance ? (
                  <div className={`rounded-md border p-3 ${d.case.pipActive ? 'border-emerald/30 bg-emerald/5' : 'border-amber/30 bg-amber/5'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-text-1 text-sm">{d.case.primaryInsurance.name}</span>
                      <StatusPill label={d.case.pipActive ? t('pipActive') : t('pipNotVerified')} state={d.case.pipActive ? 'success' : 'warning'} />
                    </div>
                    {d.case.primaryPolicyNumber && (
                      <div className="text-[10px] text-text-muted font-mono">{d.case.primaryPolicyNumber}</div>
                    )}
                    {d.case.pipVerifiedAt && (
                      <div className="text-[10px] text-emerald mt-1">
                        {t('pipVerifiedBy', { date: fmtDate(d.case.pipVerifiedAt) })}
                      </div>
                    )}
                    {d.case.primaryInsurance.claimsPhone && (
                      <a href={`tel:${d.case.primaryInsurance.claimsPhone}`} className="flex items-center gap-1 text-[10px] text-cyan mt-1 hover:text-cyan/80">
                        <Phone className="w-3 h-3" /> {d.case.primaryInsurance.claimsPhone}
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-amber/30 bg-amber/5 p-3 text-[11px] text-amber">
                    <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                    {t('noInsuranceRegistered')}
                  </div>
                )}
              </div>

              {/* Lien */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Scale className="w-4 h-4 text-emerald" />
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionLien')}</span>
                </div>
                {d.case?.lienSigned ? (
                  <div className="rounded-md border border-emerald/30 bg-emerald/5 p-3 text-[11px] text-emerald space-y-0.5">
                    <div>{t('lienSignedByPatient')}</div>
                    {d.case.attorney && (
                      <div>{t('lienSignedByAttorney', { firstName: d.case.attorney.firstName, lastName: d.case.attorney.lastName })}</div>
                    )}
                    {d.case.lawFirm?.firmName && (
                      <div className="text-text-muted">{d.case.lawFirm.firmName}</div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-amber/30 bg-amber/5 p-3 text-[11px] text-amber">
                    <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                    {t('lienPending')}
                  </div>
                )}
              </div>
            </div>

            {/* ── Columna der: Financiero + Confirmaciones ── */}
            <div className="space-y-4">
              {/* Cargo del día */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-emerald" />
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionDailyCharge')}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[12px] text-text-2">
                    <span>{TYPE_LABELS[d.type] ?? d.type} ({t('estimated')})</span>
                    <span>{fmtUSD(d.financial.serviceEstimate)}</span>
                  </div>
                  {d.financial.pipCovers > 0 && (
                    <div className="flex justify-between text-[12px] text-emerald">
                      <span>{t('appliesToPip')}</span>
                      <span>−{fmtUSD(d.financial.pipCovers)}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 flex justify-between font-bold text-sm">
                    <span className="text-text-1">{t('patientPays')}</span>
                    <span className={d.financial.patientOwes === 0 ? 'text-emerald' : 'text-text-1'}>
                      {fmtUSD(d.financial.patientOwes)}
                    </span>
                  </div>
                  {d.financial.patientOwes === 0 && (
                    <div className="text-[10px] text-text-muted">
                      {d.case?.isMVA ? t('mvaNoCopayCopy') : t('noChargeToPatient')}
                    </div>
                  )}
                  {d.financial.patientOwes === null && (
                    <div className="text-[10px] text-amber">
                      <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                      {t('chargeToBeDefinedCopy')}
                    </div>
                  )}
                </div>
              </div>

              {/* Nota operativa */}
              {d.case?.isMVA && (
                <div className="rounded-md border border-amber/30 bg-amber/5 px-3 py-2.5 text-[11px] text-amber leading-relaxed">
                  {t('mvaOperationalNote')}
                </div>
              )}

              {/* Docs checklist */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-emerald" />
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionDocuments')}</span>
                </div>
                <div className="space-y-1.5">
                  {docItems.map((item, i) => (
                    <ChecklistRow key={i} done={item.done} label={item.label} meta={item.meta} />
                  ))}
                </div>
              </div>

              {/* Confirmaciones */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-text-muted mb-3">
                  {t('confirmBeforeRoom')}
                </div>
                <div className="space-y-2">
                  {[
                    {
                      id: 'c1', checked: confirm1,
                      onChange: () => setConfirm1(v => !v),
                      label: d.financial.patientOwes === 0
                        ? t('confirmNoPaymentExplained')
                        : t('confirmPaymentCollected', { amount: fmtUSD(d.financial.patientOwes) }),
                    },
                    {
                      id: 'c2', checked: confirm2,
                      onChange: () => setConfirm2(v => !v),
                      label: t('confirmAdmissionCopyGiven'),
                    },
                  ].map(item => (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2.5 cursor-pointer hover:border-emerald/30 transition-colors group"
                    >
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                          item.checked
                            ? 'bg-emerald border-emerald'
                            : 'border border-border bg-bg-2 group-hover:border-emerald/40'
                        }`}
                        onClick={item.onChange}
                      >
                        {item.checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <span className={`text-[12px] ${item.checked ? 'text-emerald' : 'text-text-2'}`}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        {!isAlreadyInRoom && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md border border-border text-text-2 text-sm hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('goBack')}
            </button>
            <button
              type="button"
              onClick={admit}
              disabled={!canAdmit || admitting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-md bg-emerald text-white text-sm font-bold hover:bg-emerald/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {admitting ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t('processing')}</>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {d.provider ? t('passToRoomWithDoctor', { lastName: d.provider.lastName }) : t('passToRoom')}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
