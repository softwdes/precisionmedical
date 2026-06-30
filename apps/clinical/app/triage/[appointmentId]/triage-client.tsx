'use client';

/**
 * B.16 — Triaje MA · Client Component
 *
 * iPad-optimizado con dark theme clínico.
 * Colores: emerald como accent de identidad (Regla #5 · mockup aprobado).
 *
 * Layout mockup canónico:
 *   • Sidebar 240px: avatar + personal info + contact + PIP + secondary ins
 *                    + allergies + problem list + active med + emergency contact
 *   • Main: Height (full) → Weight (full) → BP+Corazón (2-col)
 *           → Temp+O2 (2-col) → Vision (full, toggle abajo)
 *           → Note info / Chief complaint (con toolbar)
 *   • Footer: "📌 Capturado por" + "Pasar a Dr. X ✓"
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PatientInfo {
  id: string; firstName: string; lastName: string;
  dateOfBirth: string | null; phone: string | null; email: string | null;
  accidentType: string | null; insuranceCarrier: string | null; policyNumber: string | null;
  lawyerReferrer: { id: string; firmName: string | null; firstName: string | null; lastName: string | null; phone: string | null } | null;
}

interface AppointmentData {
  id: string; scheduledFor: string; type: string; status: string;
  patient: PatientInfo;
  case: {
    id: string; caseCode: string; accidentType: string | null;
    primaryInsurance: { id: string; name: string; claimsPhone: string | null } | null;
    primaryPolicyNumber: string | null;
    attorney: { id: string; firstName: string | null; lastName: string | null } | null;
    lawFirm: { id: string; firmName: string | null } | null;
  } | null;
  clinic: { id: string; name: string };
  provider: { id: string; firstName: string; lastName: string; specialty: string } | null;
  triageRecord: TriageData | null;
}

interface TriageData {
  heightFt?: number | null; heightIn?: number | null; heightCm?: number | null;
  weightLbs?: number | null; weightOz?: number | null; weightKg?: number | null;
  systolicMmhg?: number | null; diastolicMmhg?: number | null;
  pulseBpm?: number | null;
  tempFahrenheit?: number | null; tempCelsius?: number | null;
  o2Saturation?: number | null; onRoomAir?: boolean;
  visualAcuityRight?: string | null; visualAcuityLeft?: string | null; visualAcuityBoth?: string | null;
  visionCorrected?: boolean;
  chiefComplaint?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcAge(dob: string | null): string {
  if (!dob) return '';
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} y.o.`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

// ─── Conversion helpers ────────────────────────────────────────────────────────
const ftIn_to_cm = (ft: number | null | undefined, inches: number | null | undefined) => {
  if (ft == null && inches == null) return null;
  return parseFloat(((ft ?? 0) * 12 * 2.54 + (inches ?? 0) * 2.54).toFixed(1));
};
const lbs_to_kg = (lbs: number | null | undefined, oz: number | null | undefined) => {
  if (lbs == null) return null;
  return parseFloat(((lbs + (oz ?? 0) / 16) * 0.453592).toFixed(1));
};
const f_to_c = (f: number | null | undefined) => {
  if (f == null) return null;
  return parseFloat(((f - 32) * 5 / 9).toFixed(1));
};

// ─── VitalCard ────────────────────────────────────────────────────────────────
function VitalCard({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10, padding: '10px 14px',
    }}>
      <div style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600, marginBottom: 8 }}>
        {emoji} {title}
      </div>
      {children}
    </div>
  );
}

// ─── VitalField: plain input matching mockup style ────────────────────────────
function VitalField({
  label, value, onChange, placeholder, readOnly = false,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; readOnly?: boolean;
}) {
  return (
    <div>
      <div style={{
        fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em',
        color: 'rgba(255,255,255,0.45)', marginBottom: 3, fontWeight: 600,
      }}>
        {label}
      </div>
      <input
        type={readOnly ? 'text' : 'number'}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '6px 10px',
          background: readOnly ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${readOnly ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.10)'}`,
          borderRadius: 6,
          color: readOnly ? 'rgba(255,255,255,0.45)' : '#fff',
          fontFamily: 'monospace', fontSize: 13, fontWeight: 600,
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { if (!readOnly) e.target.style.borderColor = 'rgba(163,148,252,0.45)'; }}
        onBlur={e => { if (!readOnly) e.target.style.borderColor = 'rgba(255,255,255,0.10)'; }}
      />
    </div>
  );
}

// ─── Sidebar inline section ───────────────────────────────────────────────────
function SbSection({
  label, amber = false, children, defaultOpen = false, onEdit,
}: {
  label: string; amber?: boolean; children: React.ReactNode; defaultOpen?: boolean; onEdit?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{
          fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
          color: amber ? '#fbbf24' : 'rgba(255,255,255,0.40)',
        }}>
          {label}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {onEdit && (
            <span
              onClick={onEdit}
              title="Editar"
              style={{ fontSize: 11, color: 'rgba(99,102,241,0.7)', cursor: 'pointer', lineHeight: 1 }}
            >✏</span>
          )}
          <span
            style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setOpen(o => !o)}
          >
            {open ? '▾' : '▸'}
          </span>
        </div>
      </div>
      {open && children}
    </div>
  );
}

function SbRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.75 }}>
      <span style={{ color: 'rgba(255,255,255,0.45)' }}>{label}: </span>{value ?? '—'}
    </div>
  );
}

function EmptySlot({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 10, color: 'rgba(255,255,255,0.40)', fontStyle: 'italic',
      padding: '7px 10px', textAlign: 'center',
      background: 'rgba(255,255,255,0.02)',
      border: '1px dashed rgba(255,255,255,0.08)',
      borderRadius: 6,
    }}>
      {text}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TriageClient({
  appointmentId,
  currentUserName = 'MA',
}: {
  appointmentId: string;
  currentUserName?: string;
}) {
  const router = useRouter();
  const t  = useTranslations('clinical.triage');
  const tc = useTranslations('clinical.common');
  const [appt,    setAppt]    = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Insurance modal state ─────────────────────────────────────────────────
  const [insModal,       setInsModal]       = useState(false);
  const [insQuery,       setInsQuery]       = useState('');
  const [insResults,     setInsResults]     = useState<{id:string;label:string;subtitle:string}[]>([]);
  const [insSelected,    setInsSelected]    = useState<{id:string;name:string;claimsPhone:string|null}|null>(null);
  const [insPolicy,      setInsPolicy]      = useState('');
  const [insSaving,      setInsSaving]      = useState(false);

  // ─── Legal modal state ─────────────────────────────────────────────────────
  const [legalModal,     setLegalModal]     = useState(false);
  const [firmQuery,      setFirmQuery]      = useState('');
  const [firmResults,    setFirmResults]    = useState<{id:string;label:string;subtitle:string}[]>([]);
  const [firmSelected,   setFirmSelected]   = useState<{id:string;firmName:string}|null>(null);
  const [attQuery,       setAttQuery]       = useState('');
  const [attResults,     setAttResults]     = useState<{id:string;label:string;subtitle:string}[]>([]);
  const [attSelected,    setAttSelected]    = useState<{id:string;firstName:string|null;lastName:string|null}|null>(null);
  const [legalSaving,    setLegalSaving]    = useState(false);

  // ─── Insurance search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!insModal) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/insurances/autocomplete?q=${encodeURIComponent(insQuery)}`);
      const d = await res.json().catch(() => ({ results: [] }));
      setInsResults(d.results ?? []);
    }, 200);
    return () => clearTimeout(timer);
  }, [insQuery, insModal]);

  // ─── Firm search ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!legalModal) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/lawyers/autocomplete?q=${encodeURIComponent(firmQuery)}`);
      const d = await res.json().catch(() => ({ results: [] }));
      setFirmResults(d.results ?? []);
    }, 200);
    return () => clearTimeout(timer);
  }, [firmQuery, legalModal]);

  // ─── Attorney search (requires firm) ──────────────────────────────────────
  useEffect(() => {
    if (!legalModal || !firmSelected) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/lawyers/autocomplete?q=${encodeURIComponent(attQuery)}&firmId=${firmSelected.id}`);
      const d = await res.json().catch(() => ({ results: [] }));
      setAttResults(d.results ?? []);
    }, 200);
    return () => clearTimeout(timer);
  }, [attQuery, firmSelected, legalModal]);

  function openInsModal() {
    const c = appt?.case;
    setInsSelected(c?.primaryInsurance ?? null);
    setInsPolicy(c?.primaryPolicyNumber ?? '');
    setInsQuery('');
    setInsResults([]);
    setInsModal(true);
  }

  function openLegalModal() {
    const c = appt?.case;
    setFirmSelected(c?.lawFirm ? { id: c.lawFirm.id, firmName: c.lawFirm.firmName ?? '' } : null);
    setAttSelected(c?.attorney ?? null);
    setFirmQuery('');
    setAttQuery('');
    setFirmResults([]);
    setAttResults([]);
    setLegalModal(true);
  }

  async function saveInsurance() {
    if (!appt?.case) return;
    setInsSaving(true);
    await fetch(`/api/cases/${appt.case.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primaryInsuranceId:  insSelected?.id ?? null,
        primaryPolicyNumber: insPolicy.trim() || null,
      }),
    });
    setInsModal(false);
    setInsSaving(false);
    const res = await fetch(`/api/triage/${appointmentId}`);
    const d = await res.json();
    if (d.ok) setAppt(d.appointment);
  }

  async function saveLegal() {
    if (!appt?.case) return;
    setLegalSaving(true);
    await fetch(`/api/cases/${appt.case.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lawFirmId:  firmSelected?.id ?? null,
        attorneyId: attSelected?.id ?? null,
      }),
    });
    setLegalModal(false);
    setLegalSaving(false);
    const res = await fetch(`/api/triage/${appointmentId}`);
    const d = await res.json();
    if (d.ok) setAppt(d.appointment);
  }

  // ─── Vital Signs State ─────────────────────────────────────────────────────
  const [heightFt,  setHeightFt]  = useState('');
  const [heightIn,  setHeightIn]  = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [weightOz,  setWeightOz]  = useState('');
  const [systolic,  setSystolic]  = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse,     setPulse]     = useState('');
  const [tempF,     setTempF]     = useState('');
  const [o2,        setO2]        = useState('');
  const [onRoomAir, setOnRoomAir] = useState(true);
  const [visRight,  setVisRight]  = useState('');
  const [visLeft,   setVisLeft]   = useState('');
  const [visBoth,   setVisBoth]   = useState('');
  const [corrected, setCorrected] = useState(false);
  const [complaint, setComplaint] = useState('');

  // ─── Derived (auto-convert) ────────────────────────────────────────────────
  const heightCm = ftIn_to_cm(parseFloat(heightFt) || null, parseFloat(heightIn) || null);
  const weightKg = lbs_to_kg(parseFloat(weightLbs) || null, parseFloat(weightOz) || null);
  const tempC    = f_to_c(parseFloat(tempF) || null);

  // ─── Load appointment ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const res  = await fetch(`/api/triage/${appointmentId}`);
    const data = await res.json();
    if (data.ok) {
      setAppt(data.appointment);
      const rec = data.appointment.triageRecord;
      if (rec) {
        if (rec.heightFt  != null) setHeightFt(String(rec.heightFt));
        if (rec.heightIn  != null) setHeightIn(String(rec.heightIn));
        if (rec.weightLbs != null) setWeightLbs(String(rec.weightLbs));
        if (rec.weightOz  != null) setWeightOz(String(rec.weightOz));
        if (rec.systolicMmhg  != null) setSystolic(String(rec.systolicMmhg));
        if (rec.diastolicMmhg != null) setDiastolic(String(rec.diastolicMmhg));
        if (rec.pulseBpm      != null) setPulse(String(rec.pulseBpm));
        if (rec.tempFahrenheit != null) setTempF(String(rec.tempFahrenheit));
        if (rec.o2Saturation  != null) setO2(String(rec.o2Saturation));
        setOnRoomAir(rec.onRoomAir ?? true);
        if (rec.visualAcuityRight != null) setVisRight(rec.visualAcuityRight);
        if (rec.visualAcuityLeft  != null) setVisLeft(rec.visualAcuityLeft);
        if (rec.visualAcuityBoth  != null) setVisBoth(rec.visualAcuityBoth);
        setCorrected(rec.visionCorrected ?? false);
        if (rec.chiefComplaint != null) setComplaint(rec.chiefComplaint);
      }
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => { void load(); }, [load]);

  // ─── Save / Complete ───────────────────────────────────────────────────────
  const buildPayload = useCallback(() => ({
    heightFt:      parseFloat(heightFt)  || null,
    heightIn:      parseFloat(heightIn)  || null,
    heightCm,
    weightLbs:     parseFloat(weightLbs) || null,
    weightOz:      parseFloat(weightOz)  || null,
    weightKg,
    systolicMmhg:  parseFloat(systolic)  || null,
    diastolicMmhg: parseFloat(diastolic) || null,
    pulseBpm:      parseFloat(pulse)     || null,
    tempFahrenheit: parseFloat(tempF)    || null,
    tempCelsius:   tempC,
    o2Saturation:  parseFloat(o2)        || null,
    onRoomAir,
    visualAcuityRight: visRight || null,
    visualAcuityLeft:  visLeft  || null,
    visualAcuityBoth:  visBoth  || null,
    visionCorrected:   corrected,
    chiefComplaint:    complaint || null,
    capturedByName:    currentUserName,
  }), [
    heightFt, heightIn, heightCm, weightLbs, weightOz, weightKg,
    systolic, diastolic, pulse, tempF, tempC, o2, onRoomAir,
    visRight, visLeft, visBoth, corrected, complaint, currentUserName,
  ]);

  async function handleSave(complete = false) {
    setSaving(true);
    try {
      await fetch(`/api/triage/${appointmentId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload()),
      });

      if (complete) {
        router.push('/');
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  // Auto-save every 30s (silent — no visual flash)
  useEffect(() => {
    if (loading) return;
    autoSaveRef.current = setInterval(() => {
      void fetch(`/api/triage/${appointmentId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload()),
      });
    }, 30_000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [loading, appointmentId, buildPayload]);

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading || !appt) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1224' }}>
        <Loader2 style={{ width: 32, height: 32, color: '#10b981', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const p      = appt.patient;
  const c      = appt.case;
  const dr     = appt.provider;
  const drName = dr ? `Dr. ${dr.lastName}` : 'el doctor';
  const now    = new Date().toISOString();

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0a1224' }}>

      {/* ═══ SIDEBAR ════════════════════════════════════════════════════════════ */}
      <aside style={{
        width: 240, minWidth: 240, height: '100vh',
        background: 'rgba(255,255,255,0.015)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        overflow: 'hidden',
      }}>

        {/* Patient header */}
        <div style={{ padding: '14px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 12,
            }}>
              {p.firstName[0]}{p.lastName[0]}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 12 }}>
                {p.lastName.toUpperCase()}, {p.firstName}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
                {c?.caseCode ?? '—'} · {calcAge(p.dateOfBirth)}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable sections */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 0 12px' }}>

          {/* Personal Info */}
          <SbSection label={t('sidebar.personalInfo')} defaultOpen>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.75, marginBottom: 12 }}>
              <SbRow label={t('sidebar.dob')}      value={p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('en-US', { timeZone: 'UTC' }) : null} />
              <SbRow label={t('sidebar.sex')}      value="—" />
              <SbRow label={t('sidebar.language')} value="Spanish" />
            </div>
          </SbSection>

          {/* Contact */}
          <SbSection label={t('sidebar.contact')} defaultOpen>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.75, marginBottom: 12 }}>
              {p.phone && <div>📱 {p.phone}</div>}
              {p.email && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.55)' }}>{p.email}</div>}
              {!p.phone && !p.email && <div style={{ color: 'rgba(255,255,255,0.40)', fontStyle: 'italic' }}>{t('sidebar.noData')}</div>}
            </div>
          </SbSection>

          {/* Primary Insurance · PIP */}
          <SbSection label={t('sidebar.primaryInsurance')} defaultOpen onEdit={appt.case ? openInsModal : undefined}>
            {c?.primaryInsurance ? (
              <div style={{
                fontSize: 10.5, lineHeight: 1.65, marginBottom: 12,
                padding: '6px 9px',
                background: 'rgba(6,182,212,0.05)',
                borderLeft: '2px solid rgba(6,182,212,0.40)',
                borderRadius: 4,
              }}>
                <div style={{ fontWeight: 600, color: '#67e8f9' }}>🇺🇸 {c.primaryInsurance.name}</div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.55)' }}>
                  Póliza: {c.primaryPolicyNumber ?? '—'}
                  {c.primaryInsurance.claimsPhone && ` · ${c.primaryInsurance.claimsPhone}`}
                </div>
              </div>
            ) : (
              <EmptySlot text={t('sidebar.noInsurance')} />
            )}
          </SbSection>

          {/* Secondary Insurance */}
          <SbSection label={t('sidebar.secondaryInsurance')}>
            <div style={{ marginBottom: 12 }}>
              <EmptySlot text={t('sidebar.noSecondaryInsurance')} />
            </div>
          </SbSection>

          {/* Allergies */}
          <SbSection label={t('sidebar.allergies')} amber defaultOpen>
            <div style={{
              fontSize: 10.5, color: '#fbbf24', lineHeight: 1.65, marginBottom: 12,
              padding: '6px 9px',
              background: 'rgba(245,158,11,0.06)',
              borderLeft: '2px solid rgba(245,158,11,0.40)',
              borderRadius: 4,
            }}>
              <div>{t('sidebar.noAllergies')}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.50)', marginTop: 2 }}>
                {t('sidebar.confirmAllergies')}
              </div>
            </div>
          </SbSection>

          {/* Problem List */}
          <SbSection label={t('sidebar.problems')}>
            <div style={{ marginBottom: 12 }}>
              <EmptySlot text={t('sidebar.noProblems')} />
            </div>
          </SbSection>

          {/* Active Medication */}
          <SbSection label={t('sidebar.medications')}>
            <div style={{ marginBottom: 12 }}>
              <EmptySlot text={t('sidebar.noMedications')} />
            </div>
          </SbSection>

          {/* Lawyer / Attorney */}
          <SbSection label={t('sidebar.attorney')} defaultOpen={!!(c?.attorney || c?.lawFirm)} onEdit={appt.case ? openLegalModal : undefined}>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.75, marginBottom: 12 }}>
              {c?.lawFirm
                ? <div>{c.lawFirm.firmName}</div>
                : <EmptySlot text={t('sidebar.noAttorney')} />}
              {c?.attorney && (
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                  {`${c.attorney.firstName ?? ''} ${c.attorney.lastName ?? ''}`.trim()}
                </div>
              )}
            </div>
          </SbSection>

          {/* Emergency Contact */}
          <SbSection label={t('sidebar.emergencyContact')}>
            <div style={{ marginBottom: 12 }}>
              <EmptySlot text={t('sidebar.noEmergencyContact')} />
            </div>
          </SbSection>
        </div>

        {/* Footer: clinic + time */}
        <div style={{
          padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 10, color: 'rgba(255,255,255,0.40)', flexShrink: 0,
        }}>
          {appt.clinic.name} · {fmtTime(appt.scheduledFor)}
        </div>
      </aside>

      {/* ═══ MAIN ═══════════════════════════════════════════════════════════════ */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{
          padding: '14px 24px', flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.01)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{t('vitalsTitle')}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              {t('vitalsSubtitle')}
            </div>
          </div>
          <span style={{
            padding: '4px 10px', borderRadius: 6,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
            color: '#fbbf24', fontSize: 10, fontWeight: 700,
          }}>
            {t('statusBadge')}
          </span>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* ── Height (full width, 3-col) ── */}
          <VitalCard emoji="📏" title={t('vitals.height')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <VitalField label={t('vitals.feet')}   value={heightFt} onChange={setHeightFt} placeholder="5" />
              <VitalField label={t('vitals.inches')} value={heightIn} onChange={setHeightIn} placeholder="8" />
              <VitalField label={t('vitals.cm')}     value={heightCm != null ? String(heightCm) : ''} readOnly placeholder="—" />
            </div>
          </VitalCard>

          {/* ── Weight (full width, 3-col) ── */}
          <VitalCard emoji="⚖️" title={t('vitals.weight')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <VitalField label={t('vitals.lbs')}   value={weightLbs} onChange={setWeightLbs} placeholder="150" />
              <VitalField label={t('vitals.oz')}    value={weightOz}  onChange={setWeightOz}  placeholder="0"   />
              <VitalField label={t('vitals.kg')}    value={weightKg != null ? String(weightKg) : ''} readOnly placeholder="—" />
            </div>
          </VitalCard>

          {/* ── Blood Pressure + Corazón & Pulmones (2-col) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <VitalCard emoji="❤️" title={t('vitals.bloodPressure')}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <VitalField label={t('vitals.systolic')}  value={systolic}  onChange={setSystolic}  placeholder="120" />
                <VitalField label={t('vitals.diastolic')} value={diastolic} onChange={setDiastolic} placeholder="80"  />
              </div>
            </VitalCard>

            <VitalCard emoji="💓" title={t('vitals.heartLungs')}>
              <VitalField label={t('vitals.pulse')} value={pulse} onChange={setPulse} placeholder="72" />
            </VitalCard>
          </div>

          {/* ── Temperature + Oxygen (2-col) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <VitalCard emoji="🌡️" title={t('vitals.temperature')}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <VitalField label={t('vitals.fahrenheit')} value={tempF} onChange={setTempF} placeholder="98.6" />
                <VitalField label={t('vitals.celsius')}    value={tempC != null ? String(tempC) : ''} readOnly placeholder="—" />
              </div>
            </VitalCard>

            <VitalCard emoji="💨" title={t('vitals.oxygen')}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
                <VitalField label="O₂ saturation (%)" value={o2} onChange={setO2} placeholder="98" />
                <div style={{ paddingBottom: 2 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.45)', marginBottom: 6, fontWeight: 600, textAlign: 'center' }}>
                    {t('vitals.onRoomAir')}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOnRoomAir(v => !v)}
                    style={{
                      width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                      background: onRoomAir ? '#10b981' : 'rgba(255,255,255,0.10)',
                      position: 'relative', transition: 'background 0.2s', display: 'block',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3,
                      left: onRoomAir ? 21 : 3,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', display: 'block',
                    }} />
                  </button>
                </div>
              </div>
            </VitalCard>
          </div>

          {/* ── Vision (full width) — toggle al FONDO ── */}
          <VitalCard emoji="👁️" title={t('vitals.vision')}>
            {/* 3 eye fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[
                { labelKey: 'vitals.rightEye', val: visRight, set: setVisRight },
                { labelKey: 'vitals.leftEye',  val: visLeft,  set: setVisLeft  },
                { labelKey: 'vitals.bothEyes', val: visBoth,  set: setVisBoth  },
              ].map(eye => (
                <div key={eye.labelKey}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.45)', marginBottom: 3, fontWeight: 600 }}>
                    {t(eye.labelKey as Parameters<typeof t>[0])}
                  </div>
                  <input
                    type="number"
                    value={eye.val}
                    onChange={e => eye.set(e.target.value)}
                    placeholder="20"
                    style={{
                      width: '100%', padding: '6px 10px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 6, color: '#fff',
                      fontFamily: 'monospace', fontSize: 13, fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Toggle Uncorrected/Corrected — ABAJO con separador */}
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.05)',
              paddingTop: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { labelKey: 'vitals.uncorrected', val: false },
                  { labelKey: 'vitals.corrected',   val: true  },
                ].map(opt => (
                  <button
                    key={opt.labelKey}
                    type="button"
                    onClick={() => setCorrected(opt.val)}
                    style={{
                      padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                      background: corrected === opt.val ? '#6366f1' : 'rgba(255,255,255,0.05)',
                      color: corrected === opt.val ? '#fff' : 'rgba(255,255,255,0.55)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t(opt.labelKey as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)' }}>
                {corrected ? t('vitals.withGlasses') : t('vitals.uncorrected')}
              </span>
            </div>
          </VitalCard>

          {/* ── Note information · Chief Complaint ── */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: '10px 14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600 }}>
                📝 Note information · Chief complaint
              </div>
              <button
                type="button"
                style={{
                  fontSize: 10, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                  background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.30)',
                  color: '#a5b4fc', fontWeight: 600,
                }}
              >
                {t('templates')}
              </button>
            </div>

            {/* Toolbar */}
            <div style={{
              display: 'flex', gap: 2, padding: '5px 8px',
              background: 'rgba(0,0,0,0.20)', borderRadius: '6px 6px 0 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              flexWrap: 'wrap',
            }}>
              {['H', 'B', 'I'].map(btn => (
                <button key={btn} type="button" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.60)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 3 }}>{btn}</button>
              ))}
              <div style={{ width: 1, background: 'rgba(255,255,255,0.10)', margin: '0 3px' }} />
              {['☰', '≡', '"', '🔗'].map(btn => (
                <button key={btn} type="button" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.60)', cursor: 'pointer', fontSize: 11, padding: '2px 5px', borderRadius: 3 }}>{btn}</button>
              ))}
            </div>

            {/* Editor */}
            <textarea
              value={complaint}
              onChange={e => setComplaint(e.target.value)}
              placeholder="Dolor cervical y lumbar post-accidente automovilístico... Tipo: rear-end · velocidad baja · sin airbag..."
              maxLength={2000}
              rows={4}
              style={{
                width: '100%', resize: 'vertical', minHeight: 80,
                padding: '9px 12px',
                background: 'rgba(0,0,0,0.15)',
                border: 'none', borderRadius: '0 0 6px 6px',
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'inherit', fontSize: 11, lineHeight: 1.6,
                outline: 'none', display: 'block',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)' }}>
                {t('templatesHint')}
              </span>
              <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)' }}>
                {complaint.length} / 2000
              </span>
            </div>
          </div>

          {/* Captured by */}
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.40)', paddingBottom: 4 }}>
            {t('capturedBy', { name: currentUserName, time: fmtTime(now) })}
            <span style={{ marginLeft: 10, fontSize: 9, opacity: 0.6 }}>{t('autosave')}</span>
          </div>
        </div>

        {/* ═══ FOOTER ══════════════════════════════════════════════════════════ */}
        <div style={{
          padding: '12px 24px', flexShrink: 0,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.01)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent', color: 'rgba(255,255,255,0.60)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saved
              ? <><CheckCircle2 style={{ width: 14, height: 14, color: '#10b981' }} /> {tc('saved')}</>
              : t('saveDraft')
            }
          </button>

          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            style={{
              padding: '10px 22px', borderRadius: 10,
              background: saving ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.18)',
              border: '1px solid rgba(16,185,129,0.35)',
              color: '#34d399', fontSize: 13, fontWeight: 800,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s',
            }}
          >
            {saving
              ? <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />
              : <CheckCircle2 style={{ width: 15, height: 15 }} />
            }
            {t('passToDoctor', { doctor: drName })}
          </button>
        </div>
      </main>

      {/* ═══ INSURANCE MODAL ════════════════════════════════════════════════════ */}
      {insModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setInsModal(false)}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14, padding: 24, width: '100%', maxWidth: 420,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {t('editInsurance')}
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginBottom: 18 }}>
              {appt?.case?.caseCode}
            </div>

            {/* Search aseguradora */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.40)', fontWeight: 600, marginBottom: 6 }}>
                {t('insurer')}
              </div>
              {insSelected ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.30)',
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#67e8f9' }}>{insSelected.name}</div>
                    {insSelected.claimsPhone && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{insSelected.claimsPhone}</div>}
                  </div>
                  <button onClick={() => { setInsSelected(null); setInsQuery(''); }}
                    style={{ fontSize: 16, color: 'rgba(255,255,255,0.40)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>
              ) : (
                <>
                  <input
                    autoFocus
                    value={insQuery}
                    onChange={e => setInsQuery(e.target.value)}
                    placeholder={t('searchInsurer')}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                      color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  {insResults.length > 0 && (
                    <div style={{
                      marginTop: 4, borderRadius: 8, overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.08)', background: '#131c34',
                    }}>
                      {insResults.map(r => (
                        <div key={r.id}
                          onClick={() => {
                            setInsSelected({ id: r.id, name: r.label, claimsPhone: null });
                            setInsQuery(''); setInsResults([]);
                          }}
                          style={{
                            padding: '8px 12px', cursor: 'pointer', fontSize: 11,
                            color: 'rgba(255,255,255,0.80)',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ fontWeight: 600 }}>{r.label}</div>
                          {r.subtitle && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>{r.subtitle}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Policy number */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.40)', fontWeight: 600, marginBottom: 6 }}>
                {t('policyNumber')}
              </div>
              <input
                value={insPolicy}
                onChange={e => setInsPolicy(e.target.value)}
                placeholder={t('policyPlaceholder')}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                  color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'monospace',
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setInsModal(false)} style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.70)', cursor: 'pointer',
              }}>{tc('cancel')}</button>
              <button onClick={saveInsurance} disabled={insSaving} style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: insSaving ? 'rgba(6,182,212,0.15)' : 'rgba(6,182,212,0.20)',
                border: '1px solid rgba(6,182,212,0.40)',
                color: '#67e8f9', cursor: insSaving ? 'not-allowed' : 'pointer',
              }}>
                {insSaving ? tc('saving') : tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ LEGAL MODAL ════════════════════════════════════════════════════════ */}
      {legalModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setLegalModal(false)}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14, padding: 24, width: '100%', maxWidth: 420,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {t('editLegal')}
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginBottom: 18 }}>
              {appt?.case?.caseCode}
            </div>

            {/* Firm */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.40)', fontWeight: 600, marginBottom: 6 }}>
                {t('firm')}
              </div>
              {firmSelected ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.30)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>{firmSelected.firmName}</div>
                  <button onClick={() => { setFirmSelected(null); setFirmQuery(''); setAttSelected(null); setAttResults([]); }}
                    style={{ fontSize: 16, color: 'rgba(255,255,255,0.40)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>
              ) : (
                <>
                  <input
                    autoFocus
                    value={firmQuery}
                    onChange={e => setFirmQuery(e.target.value)}
                    placeholder={t('searchFirm')}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8, boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                      color: '#fff', fontSize: 12, outline: 'none',
                    }}
                  />
                  {firmResults.length > 0 && (
                    <div style={{
                      marginTop: 4, borderRadius: 8, overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.08)', background: '#131c34',
                    }}>
                      {firmResults.map(r => (
                        <div key={r.id}
                          onClick={() => {
                            setFirmSelected({ id: r.id, firmName: r.label });
                            setFirmQuery(''); setFirmResults([]);
                            setAttSelected(null); setAttQuery('');
                          }}
                          style={{
                            padding: '8px 12px', cursor: 'pointer', fontSize: 11,
                            color: 'rgba(255,255,255,0.80)',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ fontWeight: 600 }}>{r.label}</div>
                          {r.subtitle && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>{r.subtitle}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Attorney (only if firm selected) */}
            {firmSelected && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.40)', fontWeight: 600, marginBottom: 6 }}>
                  {t('attorney')}
                </div>
                {attSelected ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)',
                  }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>
                      {`${attSelected.firstName ?? ''} ${attSelected.lastName ?? ''}`.trim()}
                    </div>
                    <button onClick={() => { setAttSelected(null); setAttQuery(''); }}
                      style={{ fontSize: 16, color: 'rgba(255,255,255,0.40)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
                  </div>
                ) : (
                  <>
                    <input
                      value={attQuery}
                      onChange={e => setAttQuery(e.target.value)}
                      placeholder={t('searchAttorney')}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8, boxSizing: 'border-box',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                        color: '#fff', fontSize: 12, outline: 'none',
                      }}
                    />
                    {attResults.length > 0 && (
                      <div style={{
                        marginTop: 4, borderRadius: 8, overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.08)', background: '#131c34',
                      }}>
                        {attResults.map(r => (
                          <div key={r.id}
                            onClick={() => {
                              const [fn, ...rest] = r.label.split(' ');
                              setAttSelected({ id: r.id, firstName: fn ?? null, lastName: rest.join(' ') || null });
                              setAttQuery(''); setAttResults([]);
                            }}
                            style={{
                              padding: '8px 12px', cursor: 'pointer', fontSize: 11,
                              color: 'rgba(255,255,255,0.80)',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ fontWeight: 600 }}>{r.label}</div>
                            {r.subtitle && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>{r.subtitle}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setLegalModal(false)} style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.70)', cursor: 'pointer',
              }}>{tc('cancel')}</button>
              <button onClick={saveLegal} disabled={legalSaving} style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: legalSaving ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.20)',
                border: '1px solid rgba(99,102,241,0.40)',
                color: '#a5b4fc', cursor: legalSaving ? 'not-allowed' : 'pointer',
              }}>
                {legalSaving ? tc('saving') : tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
