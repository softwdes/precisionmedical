'use client';

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
  Stethoscope, Building2, ChevronRight, FileText, Activity,
  User, ShieldCheck,
} from 'lucide-react';
import { PageHeader }   from '@/components/ui-phoenix/page-header';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill, type StatusState } from '@/components/ui-phoenix/status-pill';
import { IntakeFormLinkDialog } from '@/components/cases/intake-form-link-dialog';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TriageRecord {
  heightFt: number | null; heightIn: number | null; heightCm: number | null;
  weightLbs: number | null; weightOz: number | null; weightKg: number | null;
  systolicMmhg: number | null; diastolicMmhg: number | null;
  pulseBpm: number | null; respiratoryRate: number | null;
  tempFahrenheit: number | null; tempCelsius: number | null;
  painScale: number | null;
  o2Saturation: number | null; o2Comment: string | null; onRoomAir: boolean;
  systolicMmhg2: number | null; diastolicMmhg2: number | null;
  pulseBpm2: number | null; respiratoryRate2: number | null;
  tempFahrenheit2: number | null; tempCelsius2: number | null;
  visualAcuityRight: string | null; visualAcuityLeft: string | null;
  visualAcuityBoth: string | null; visionCorrected: boolean;
  chiefComplaint: string | null;
}

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
  notes: string | null;
  triageRecord: TriageRecord | null;
  patient: {
    id: string; firstName: string; lastName: string;
    phone: string | null; email: string | null; dateOfBirth: string | null;
  };
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
  return new Date(iso).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });
}

// ─── Small reusable pieces ────────────────────────────────────────────────────
function ChecklistCard({ done, label, meta }: { done: boolean; label: string; meta?: string }) {
  return (
    <div className={`rounded-lg border p-3 flex items-start gap-2.5 ${done ? 'bg-emerald/5 border-emerald/25' : 'bg-bg-2/30 border-border'}`}>
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

function VitalGroup({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-bg-2/50 border border-border p-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-cyan">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan">{title}</span>
      </div>
      {children}
    </div>
  );
}

function VField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function VInput({ value, onChange, placeholder, type = 'number', step }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; step?: string;
}) {
  return (
    <input
      type={type}
      step={step}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder ?? '0'}
      className="w-full bg-bg-3 border border-border/80 rounded-md px-2.5 py-1.5 text-center text-[13px] font-semibold text-text-1 placeholder:text-text-muted placeholder:font-normal outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/20 transition-all"
    />
  );
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between mt-2">
      <span className="text-[11px] text-text-2">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-8 h-4.5 rounded-full transition-colors shrink-0 ${on ? 'bg-cyan' : 'bg-bg-3 border border-border'}`}
        style={{ height: '18px' }}
      >
        <span
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm ${on ? 'left-[14px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

// ─── Vitals state type ────────────────────────────────────────────────────────
interface VitalsState {
  heightFt: string; heightIn: string; heightCm: string;
  weightLbs: string; weightOz: string; weightKg: string;
  systolicMmhg: string; diastolicMmhg: string;
  pulseBpm: string; respiratoryRate: string;
  tempFahrenheit: string; tempCelsius: string;
  painScale: string;
  o2Saturation: string; o2Comment: string; onRoomAir: boolean;
  systolicMmhg2: string; diastolicMmhg2: string;
  pulseBpm2: string; respiratoryRate2: string;
  tempFahrenheit2: string; tempCelsius2: string;
  visualAcuityRight: string; visualAcuityLeft: string; visualAcuityBoth: string;
  visionCorrected: boolean;
  chiefComplaint: string;
}

const EMPTY_VITALS: VitalsState = {
  heightFt: '', heightIn: '', heightCm: '',
  weightLbs: '', weightOz: '', weightKg: '',
  systolicMmhg: '', diastolicMmhg: '',
  pulseBpm: '', respiratoryRate: '',
  tempFahrenheit: '', tempCelsius: '',
  painScale: '',
  o2Saturation: '', o2Comment: '', onRoomAir: true,
  systolicMmhg2: '', diastolicMmhg2: '',
  pulseBpm2: '', respiratoryRate2: '',
  tempFahrenheit2: '', tempCelsius2: '',
  visualAcuityRight: '', visualAcuityLeft: '', visualAcuityBoth: '',
  visionCorrected: false,
  chiefComplaint: '',
};

// ─── Unit conversion helpers ──────────────────────────────────────────────────
function ftInToCm(ft: string, inches: string): string {
  const f = parseFloat(ft) || 0, i = parseFloat(inches) || 0;
  if (!f && !i) return '';
  return String(Math.round((f * 12 + i) * 2.54 * 10) / 10);
}
function cmToFtIn(cm: string): { ft: string; inches: string } {
  const c = parseFloat(cm);
  if (!c || c <= 0) return { ft: '', inches: '' };
  const totalIn = c / 2.54;
  return { ft: String(Math.floor(totalIn / 12)), inches: String(Math.round(totalIn % 12)) };
}
function lbsOzToKg(lbs: string, oz: string): string {
  const l = parseFloat(lbs) || 0, o = parseFloat(oz) || 0;
  if (!l && !o) return '';
  return String(Math.round((l * 16 + o) * 28.3495 / 1000 * 10) / 10);
}
function kgToLbs(kg: string): { lbs: string; oz: string } {
  const k = parseFloat(kg);
  if (!k || k <= 0) return { lbs: '', oz: '0' };
  const totalOz = k * 1000 / 28.3495;
  return { lbs: String(Math.floor(totalOz / 16)), oz: '0' };
}
function fToC(f: string): string {
  const v = parseFloat(f);
  if (isNaN(v)) return '';
  return String(Math.round(((v - 32) * 5 / 9) * 10) / 10);
}
function cToF(c: string): string {
  const v = parseFloat(c);
  if (isNaN(v)) return '';
  return String(Math.round((v * 9 / 5 + 32) * 10) / 10);
}

function triageToState(tr: TriageRecord | null): VitalsState {
  if (!tr) return EMPTY_VITALS;
  const heightCm = ftInToCm(tr.heightFt?.toString() ?? '', tr.heightIn?.toString() ?? '');
  const weightKg = lbsOzToKg(tr.weightLbs?.toString() ?? '', tr.weightOz?.toString() ?? '');
  const tempC    = fToC(tr.tempFahrenheit?.toString() ?? '');
  const tempC2   = fToC(tr.tempFahrenheit2?.toString() ?? '');
  return {
    heightFt:         tr.heightFt?.toString()         ?? '',
    heightIn:         tr.heightIn?.toString()         ?? '',
    heightCm:         tr.heightCm?.toString()         ?? heightCm,
    weightLbs:        tr.weightLbs?.toString()        ?? '',
    weightOz:         tr.weightOz?.toString()         ?? '',
    weightKg:         tr.weightKg?.toString()         ?? weightKg,
    systolicMmhg:     tr.systolicMmhg?.toString()     ?? '',
    diastolicMmhg:    tr.diastolicMmhg?.toString()    ?? '',
    pulseBpm:         tr.pulseBpm?.toString()         ?? '',
    respiratoryRate:  tr.respiratoryRate?.toString()  ?? '',
    tempFahrenheit:   tr.tempFahrenheit?.toString()   ?? '',
    tempCelsius:      tr.tempCelsius?.toString()      ?? tempC,
    painScale:        tr.painScale?.toString()        ?? '',
    o2Saturation:     tr.o2Saturation?.toString()     ?? '',
    o2Comment:        tr.o2Comment                    ?? '',
    onRoomAir:        tr.onRoomAir,
    systolicMmhg2:    tr.systolicMmhg2?.toString()    ?? '',
    diastolicMmhg2:   tr.diastolicMmhg2?.toString()   ?? '',
    pulseBpm2:        tr.pulseBpm2?.toString()        ?? '',
    respiratoryRate2: tr.respiratoryRate2?.toString() ?? '',
    tempFahrenheit2:  tr.tempFahrenheit2?.toString()  ?? '',
    tempCelsius2:     tr.tempCelsius2?.toString()     ?? tempC2,
    visualAcuityRight:tr.visualAcuityRight            ?? '',
    visualAcuityLeft: tr.visualAcuityLeft             ?? '',
    visualAcuityBoth: tr.visualAcuityBoth             ?? '',
    visionCorrected:  tr.visionCorrected,
    chiefComplaint:   tr.chiefComplaint               ?? '',
  };
}

function stateToPayload(v: VitalsState): Record<string, unknown> {
  const num = (s: string) => s.trim() ? parseFloat(s) : undefined;
  const int = (s: string) => s.trim() ? parseInt(s, 10) : undefined;
  return {
    heightFt:         int(v.heightFt),
    heightIn:         int(v.heightIn),
    weightLbs:        int(v.weightLbs),
    weightOz:         int(v.weightOz),
    systolicMmhg:     int(v.systolicMmhg),
    diastolicMmhg:    int(v.diastolicMmhg),
    pulseBpm:         int(v.pulseBpm),
    respiratoryRate:  int(v.respiratoryRate),
    tempFahrenheit:   num(v.tempFahrenheit),
    painScale:        int(v.painScale),
    o2Saturation:     int(v.o2Saturation),
    o2Comment:        v.o2Comment.trim() || undefined,
    onRoomAir:        v.onRoomAir,
    systolicMmhg2:    int(v.systolicMmhg2),
    diastolicMmhg2:   int(v.diastolicMmhg2),
    pulseBpm2:        int(v.pulseBpm2),
    respiratoryRate2: int(v.respiratoryRate2),
    tempFahrenheit2:  num(v.tempFahrenheit2),
    visualAcuityRight:v.visualAcuityRight.trim() || undefined,
    visualAcuityLeft: v.visualAcuityLeft.trim()  || undefined,
    visualAcuityBoth: v.visualAcuityBoth.trim()  || undefined,
    visionCorrected:  v.visionCorrected,
    chiefComplaint:   v.chiefComplaint.trim() || undefined,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdmissionDetailClient({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const t = useTranslations('phoenix.admission');
  const [detail,    setDetail]    = useState<ApptDetail | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [admitting, setAdmitting] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [confirm1,  setConfirm1]  = useState(false);
  const [confirm2,  setConfirm2]  = useState(false);
  const [vitals,    setVitals]    = useState<VitalsState>(EMPTY_VITALS);
  const [vitalsDirty, setVitalsDirty] = useState(false);
  const [vitalsSaving, setVitalsSaving] = useState(false);
  const [vitalsSaved,  setVitalsSaved]  = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setVitals(EMPTY_VITALS);   // clear immediately so old patient's values never bleed through
    setVitalsDirty(false);
    setVitalsSaved(false);
    setConfirm1(false);
    setConfirm2(false);
    try {
      const res  = await fetch(`/api/admin/admission/${appointmentId}`);
      const data = await res.json();
      if (data.ok) {
        setDetail(data.appointment);
        setVitals(triageToState(data.appointment.triageRecord ?? null));
        setVitalsDirty(false);
      }
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => { void load(); }, [load]);

  function dirty() { setVitalsDirty(true); setVitalsSaved(false); }

  function setV<K extends keyof VitalsState>(key: K, val: VitalsState[K]) {
    setVitals(prev => ({ ...prev, [key]: val }));
    dirty();
  }

  // ── Bidirectional setters ──────────────────────────────────────────────────
  function setHeightFt(val: string) {
    setVitals(prev => ({ ...prev, heightFt: val, heightCm: ftInToCm(val, prev.heightIn) }));
    dirty();
  }
  function setHeightIn(val: string) {
    setVitals(prev => ({ ...prev, heightIn: val, heightCm: ftInToCm(prev.heightFt, val) }));
    dirty();
  }
  function setHeightCm(val: string) {
    const { ft, inches } = cmToFtIn(val);
    setVitals(prev => ({ ...prev, heightCm: val, heightFt: ft, heightIn: inches }));
    dirty();
  }
  function setWeightLbs(val: string) {
    setVitals(prev => ({ ...prev, weightLbs: val, weightKg: lbsOzToKg(val, prev.weightOz) }));
    dirty();
  }
  function setWeightOz(val: string) {
    setVitals(prev => ({ ...prev, weightOz: val, weightKg: lbsOzToKg(prev.weightLbs, val) }));
    dirty();
  }
  function setWeightKg(val: string) {
    const { lbs } = kgToLbs(val);
    setVitals(prev => ({ ...prev, weightKg: val, weightLbs: lbs, weightOz: '0' }));
    dirty();
  }
  function setTempF(val: string) {
    setVitals(prev => ({ ...prev, tempFahrenheit: val, tempCelsius: fToC(val) }));
    dirty();
  }
  function setTempC(val: string) {
    setVitals(prev => ({ ...prev, tempCelsius: val, tempFahrenheit: cToF(val) }));
    dirty();
  }
  function setTempF2(val: string) {
    setVitals(prev => ({ ...prev, tempFahrenheit2: val, tempCelsius2: fToC(val) }));
    dirty();
  }
  function setTempC2(val: string) {
    setVitals(prev => ({ ...prev, tempCelsius2: val, tempFahrenheit2: cToF(val) }));
    dirty();
  }

  async function saveVitals() {
    setVitalsSaving(true);
    try {
      await fetch(`/api/admin/admission/${appointmentId}/triage`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(stateToPayload(vitals)),
      });
      setVitalsDirty(false);
      setVitalsSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setVitalsSaved(false), 3000);
    } finally {
      setVitalsSaving(false);
    }
  }

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
  const consentsOk = !!d.case?.consentsCompleted;
  const canAdmit = confirm1 && confirm2 && consentsOk && !isAlreadyInRoom;

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

        {/* ── Flow diagram ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
          {[
            { num: 1, done: true,  active: false, title: t('flowStep1'), desc: t('flowStep1Desc') },
            { num: 2, done: false, active: true,  title: t('flowStep2'), desc: t('flowStep2Desc') },
            { num: 3, done: false, active: false, title: t('flowStep3'), desc: t('flowStep3Desc') },
            { num: 4, done: false, active: false, title: t('flowStep4'), desc: t('flowStep4Desc') },
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
            { label: t('flowStep1'), done: true,  active: false },
            { label: t('flowStep2'), done: false, active: true  },
            { label: t('flowStep3'), done: false, active: false },
            { label: t('flowStep4'), done: false, active: false },
          ].map((step, i, arr) => (
            <div key={i} className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step.done ? 'bg-emerald text-white' : step.active ? 'bg-brand text-white' : 'bg-bg-3 text-text-muted'}`}>
                  {step.done ? '✓' : i + 1}
                </div>
                <span className={`text-[10px] font-semibold hidden sm:inline ${step.done || step.active ? (step.done ? 'text-emerald' : 'text-text-1') : 'text-text-muted'}`}>
                  {step.label}
                </span>
              </div>
              {i < arr.length - 1 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* ── Gate banner ── */}
        {!isAlreadyInRoom && (
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
        {!isAlreadyInRoom && (
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

        {/* ── Main 2-col layout ── */}
        {!isAlreadyInRoom && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

            {/* ── LEFT: Patient info + Vitals form ── */}
            <div className="space-y-4">

              {/* Patient info (read-only from intake) */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
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
                    <div key={row.key} className="flex justify-between items-start py-1.5 border-b border-border/50 last:border-0 gap-2">
                      <span className="text-[10.5px] text-text-muted shrink-0">{row.key}</span>
                      <span className="text-[11px] text-text-1 font-medium text-right">{row.val}</span>
                    </div>
                  ) : null)}
                </div>
              </div>

              {/* Vitals form */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-cyan" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionVitals')}</span>
                  {vitalsDirty && !vitalsSaved && (
                    <span className="ml-auto text-[9px] text-amber bg-amber/10 border border-amber/20 px-2 py-0.5 rounded-full">Unsaved</span>
                  )}
                  {vitalsSaved && (
                    <span className="ml-auto text-[9px] text-emerald bg-emerald/10 border border-emerald/20 px-2 py-0.5 rounded-full">✓ Saved</span>
                  )}
                </div>

                {/* 1st reading */}
                <div className="text-[9px] uppercase tracking-wider font-bold text-cyan mb-2 flex items-center gap-2 after:flex-1 after:h-px after:bg-cyan/20">
                  {t('firstReading')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  <VitalGroup icon={<span>📏</span>} title={t('vitHeight')}>
                    <div className="grid grid-cols-3 gap-2">
                      <VField label={t('vitFeet')}><VInput value={vitals.heightFt} onChange={setHeightFt} placeholder="5" /></VField>
                      <VField label={t('vitInches')}><VInput value={vitals.heightIn} onChange={setHeightIn} placeholder="6" /></VField>
                      <VField label={t('vitCms')}><VInput value={vitals.heightCm} onChange={setHeightCm} placeholder="—" /></VField>
                    </div>
                  </VitalGroup>
                  <VitalGroup icon={<span>⚖️</span>} title={t('vitWeight')}>
                    <div className="grid grid-cols-3 gap-2">
                      <VField label={t('vitLbs')}><VInput value={vitals.weightLbs} onChange={setWeightLbs} placeholder="150" /></VField>
                      <VField label={t('vitOz')}><VInput value={vitals.weightOz} onChange={setWeightOz} placeholder="0" /></VField>
                      <VField label="kg"><VInput value={vitals.weightKg} onChange={setWeightKg} placeholder="—" step="0.1" /></VField>
                    </div>
                  </VitalGroup>
                  <VitalGroup icon={<span>💓</span>} title={t('vitBloodPressure')}>
                    <div className="grid grid-cols-2 gap-2">
                      <VField label={t('vitSystolic')}><VInput value={vitals.systolicMmhg} onChange={v => setV('systolicMmhg', v)} placeholder="120" /></VField>
                      <VField label={t('vitDiastolic')}><VInput value={vitals.diastolicMmhg} onChange={v => setV('diastolicMmhg', v)} placeholder="80" /></VField>
                    </div>
                  </VitalGroup>
                  <VitalGroup icon={<span>🫀</span>} title={t('vitHeartLungs')}>
                    <div className="grid grid-cols-2 gap-2">
                      <VField label={t('vitPulse')}><VInput value={vitals.pulseBpm} onChange={v => setV('pulseBpm', v)} placeholder="72" /></VField>
                      <VField label={t('vitRespRate')}><VInput value={vitals.respiratoryRate} onChange={v => setV('respiratoryRate', v)} placeholder="16" /></VField>
                    </div>
                  </VitalGroup>
                  <VitalGroup icon={<span>🌡️</span>} title={t('vitTempPain')}>
                    <div className="grid grid-cols-3 gap-2">
                      <VField label={t('vitTempF')}><VInput value={vitals.tempFahrenheit} onChange={setTempF} placeholder="98.6" step="0.1" /></VField>
                      <VField label={t('vitTempC')}><VInput value={vitals.tempCelsius} onChange={setTempC} placeholder="37.0" step="0.1" /></VField>
                      <VField label={t('vitPain')}><VInput value={vitals.painScale} onChange={v => setV('painScale', v)} placeholder="0" /></VField>
                    </div>
                  </VitalGroup>
                  <VitalGroup icon={<span>💨</span>} title={t('vitOxygen')}>
                    <div className="grid grid-cols-2 gap-2">
                      <VField label={t('vitO2')}><VInput value={vitals.o2Saturation} onChange={v => setV('o2Saturation', v)} placeholder="98" /></VField>
                      <VField label={t('vitO2Comment')}><VInput value={vitals.o2Comment} onChange={v => setV('o2Comment', v)} placeholder="..." type="text" /></VField>
                    </div>
                    <Toggle on={!vitals.onRoomAir} onToggle={() => setV('onRoomAir', !vitals.onRoomAir)} label={t('vitOnOxygen')} />
                  </VitalGroup>
                </div>

                {/* 2nd reading */}
                <div className="text-[9px] uppercase tracking-wider font-bold text-cyan mb-2 mt-4 flex items-center gap-2 after:flex-1 after:h-px after:bg-cyan/20">
                  {t('secondReading')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <VitalGroup icon={<span>💓</span>} title={`${t('vitBloodPressure')} (2)`}>
                    <div className="grid grid-cols-2 gap-2">
                      <VField label={t('vitSystolic')}><VInput value={vitals.systolicMmhg2} onChange={v => setV('systolicMmhg2', v)} placeholder="0" /></VField>
                      <VField label={t('vitDiastolic')}><VInput value={vitals.diastolicMmhg2} onChange={v => setV('diastolicMmhg2', v)} placeholder="0" /></VField>
                    </div>
                  </VitalGroup>
                  <VitalGroup icon={<span>🫀</span>} title={`${t('vitHeartLungs')} (2)`}>
                    <div className="grid grid-cols-2 gap-2">
                      <VField label={t('vitPulse')}><VInput value={vitals.pulseBpm2} onChange={v => setV('pulseBpm2', v)} placeholder="0" /></VField>
                      <VField label={t('vitRespRate')}><VInput value={vitals.respiratoryRate2} onChange={v => setV('respiratoryRate2', v)} placeholder="0" /></VField>
                    </div>
                  </VitalGroup>
                  <VitalGroup icon={<span>🌡️</span>} title={`${t('vitTempPain')} (2)`}>
                    <div className="grid grid-cols-2 gap-2">
                      <VField label={t('vitTempF')}><VInput value={vitals.tempFahrenheit2} onChange={setTempF2} placeholder="0.0" step="0.1" /></VField>
                      <VField label={t('vitTempC')}><VInput value={vitals.tempCelsius2} onChange={setTempC2} placeholder="0.0" step="0.1" /></VField>
                    </div>
                  </VitalGroup>
                  <VitalGroup icon={<span>👁️</span>} title={t('vitVision')}>
                    <div className="grid grid-cols-3 gap-2">
                      <VField label={t('vitVisionRight')}><VInput value={vitals.visualAcuityRight} onChange={v => setV('visualAcuityRight', v)} placeholder="20" /></VField>
                      <VField label={t('vitVisionLeft')}><VInput value={vitals.visualAcuityLeft} onChange={v => setV('visualAcuityLeft', v)} placeholder="20" /></VField>
                      <VField label={t('vitVisionBoth')}><VInput value={vitals.visualAcuityBoth} onChange={v => setV('visualAcuityBoth', v)} placeholder="20" /></VField>
                    </div>
                    <Toggle on={vitals.visionCorrected} onToggle={() => setV('visionCorrected', !vitals.visionCorrected)} label={t('vitVisionCorrected')} />
                  </VitalGroup>
                </div>

                {/* Save bar */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-[10px] text-text-muted">{t('vitalsNote')}</span>
                  <button
                    type="button"
                    onClick={saveVitals}
                    disabled={vitalsSaving || !vitalsDirty}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan/10 border border-cyan/25 text-cyan text-[11px] font-semibold hover:bg-cyan/18 disabled:opacity-40 transition-colors"
                  >
                    {vitalsSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : '💾'}
                    {vitalsSaving ? t('processing') : t('vitalsSaveBtn')}
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT: Appointment + Coverage + Confirm + CTA + Step 4 preview ── */}
            <div className="space-y-4">

              {/* Appointment summary */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
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
                    <div key={row.k} className="flex justify-between items-center text-[11px] border-b border-border/40 pb-1.5 last:border-0">
                      <span className="text-text-muted">{row.k}</span>
                      <span className="text-text-1 font-medium">{row.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coverage */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-emerald" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionCoverage')}</span>
                </div>
                {d.case?.primaryInsurance ? (
                  <div className={`rounded-md border p-2.5 ${d.case.pipActive ? 'border-emerald/30 bg-emerald/5' : 'border-amber/30 bg-amber/5'}`}>
                    <div className="font-semibold text-text-1 text-[12px] mb-1">{d.case.primaryInsurance.name}</div>
                    <StatusPill label={d.case.pipActive ? t('pipActive') : t('pipNotVerified')} state={d.case.pipActive ? 'success' : 'warning'} />
                    {d.case.primaryPolicyNumber && <div className="text-[10px] text-text-muted font-mono mt-1">{d.case.primaryPolicyNumber}</div>}
                  </div>
                ) : (
                  <div className="rounded-md border border-amber/30 bg-amber/5 p-2.5 text-[11px] text-amber flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{t('noInsuranceRegistered')}
                  </div>
                )}
              </div>

              {/* Confirmations + CTA */}
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">
                  {t('confirmBeforeRoom')}
                </div>
                {[
                  { id: 'c1', checked: confirm1, onToggle: () => setConfirm1(v => !v), label: t('confirmVitalsSaved') },
                  { id: 'c2', checked: confirm2, onToggle: () => setConfirm2(v => !v), label: t('confirmPatientReady') },
                ].map(item => (
                  <label
                    key={item.id}
                    onClick={item.onToggle}
                    className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2.5 cursor-pointer hover:border-emerald/30 transition-colors group mb-2"
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${item.checked ? 'bg-emerald border-emerald' : 'border border-border bg-bg-2 group-hover:border-emerald/40'}`}>
                      {item.checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-[11px] ${item.checked ? 'text-emerald' : 'text-text-2'}`}>{item.label}</span>
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

                <div className="flex items-center justify-between gap-3 border-t border-border pt-3 mt-3">
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

              {/* Step 4 preview */}
              <div className="rounded-lg border border-border/60 bg-bg-1/50 p-4">
                <div className="text-[9.5px] uppercase tracking-wider font-bold text-text-muted mb-2">{t('step4AfterTitle')}</div>
                <div className="text-[11px] text-text-2 leading-relaxed mb-3">{t('step4AfterDesc')}</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: t('step4ServicesLabel'), sub: t('step4ServicesDesc') },
                    { label: t('step4PaymentsLabel'), sub: t('step4PaymentsDesc') },
                  ].map(card => (
                    <div key={card.label} className="bg-bg-2 border border-border rounded-md p-2.5 text-center">
                      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">{card.label}</div>
                      <div className="text-[11px] font-semibold text-text-2">{card.sub}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-text-muted mt-2">{t('step4AvailableAfter')}</div>
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
