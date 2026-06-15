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
  label, amber = false, children, defaultOpen = false,
}: {
  label: string; amber?: boolean; children: React.ReactNode; defaultOpen?: boolean;
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
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', cursor: 'pointer' }}>✏</span>
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
  const [appt,    setAppt]    = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const t = data.appointment.triageRecord;
      if (t) {
        if (t.heightFt  != null) setHeightFt(String(t.heightFt));
        if (t.heightIn  != null) setHeightIn(String(t.heightIn));
        if (t.weightLbs != null) setWeightLbs(String(t.weightLbs));
        if (t.weightOz  != null) setWeightOz(String(t.weightOz));
        if (t.systolicMmhg  != null) setSystolic(String(t.systolicMmhg));
        if (t.diastolicMmhg != null) setDiastolic(String(t.diastolicMmhg));
        if (t.pulseBpm      != null) setPulse(String(t.pulseBpm));
        if (t.tempFahrenheit != null) setTempF(String(t.tempFahrenheit));
        if (t.o2Saturation  != null) setO2(String(t.o2Saturation));
        setOnRoomAir(t.onRoomAir ?? true);
        if (t.visualAcuityRight != null) setVisRight(t.visualAcuityRight);
        if (t.visualAcuityLeft  != null) setVisLeft(t.visualAcuityLeft);
        if (t.visualAcuityBoth  != null) setVisBoth(t.visualAcuityBoth);
        setCorrected(t.visionCorrected ?? false);
        if (t.chiefComplaint != null) setComplaint(t.chiefComplaint);
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
          <SbSection label="Personal Info" defaultOpen>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.75, marginBottom: 12 }}>
              <SbRow label="DOB"      value={p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('en-US', { timeZone: 'UTC' }) : null} />
              <SbRow label="Sex"      value="—" />
              <SbRow label="Language" value="Spanish" />
            </div>
          </SbSection>

          {/* Contact */}
          <SbSection label="Contact" defaultOpen>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.75, marginBottom: 12 }}>
              {p.phone && <div>📱 {p.phone}</div>}
              {p.email && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.55)' }}>{p.email}</div>}
              {!p.phone && !p.email && <div style={{ color: 'rgba(255,255,255,0.40)', fontStyle: 'italic' }}>Sin datos</div>}
            </div>
          </SbSection>

          {/* Primary Insurance · PIP */}
          <SbSection label="Primary Insurance · PIP" defaultOpen>
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
              <EmptySlot text="Sin seguro registrado" />
            )}
          </SbSection>

          {/* Secondary Insurance */}
          <SbSection label="Secondary Insurance">
            <div style={{ marginBottom: 12 }}>
              <EmptySlot text="No secondary insurance registered" />
            </div>
          </SbSection>

          {/* Allergies */}
          <SbSection label="⚠ Allergies" amber defaultOpen>
            <div style={{
              fontSize: 10.5, color: '#fbbf24', lineHeight: 1.65, marginBottom: 12,
              padding: '6px 9px',
              background: 'rgba(245,158,11,0.06)',
              borderLeft: '2px solid rgba(245,158,11,0.40)',
              borderRadius: 4,
            }}>
              <div>Revisar con el paciente</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.50)', marginTop: 2 }}>
                Confirmar alergias a medicamentos
              </div>
            </div>
          </SbSection>

          {/* Problem List */}
          <SbSection label="♡ Problem List">
            <div style={{ marginBottom: 12 }}>
              <EmptySlot text="No active problems" />
            </div>
          </SbSection>

          {/* Active Medication */}
          <SbSection label="⛓ Active Medication">
            <div style={{ marginBottom: 12 }}>
              <EmptySlot text="No active medications" />
            </div>
          </SbSection>

          {/* Lawyer / Attorney */}
          {(c?.attorney || c?.lawFirm) && (
            <SbSection label="Attorney" defaultOpen>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.75, marginBottom: 12 }}>
                {c?.lawFirm && <div>{c.lawFirm.firmName}</div>}
                {c?.attorney && (
                  <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.55)' }}>
                    {`${c.attorney.firstName ?? ''} ${c.attorney.lastName ?? ''}`.trim()}
                  </div>
                )}
              </div>
            </SbSection>
          )}

          {/* Emergency Contact */}
          <SbSection label="Emergency Contact">
            <div style={{ marginBottom: 12 }}>
              <EmptySlot text="Not registered" />
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
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>📈 Vital signs</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              Captura rápida · 5 min · sincroniza con la visita del doctor automáticamente
            </div>
          </div>
          <span style={{
            padding: '4px 10px', borderRadius: 6,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
            color: '#fbbf24', fontSize: 10, fontWeight: 700,
          }}>
            ⏱ En triaje
          </span>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* ── Height (full width, 3-col) ── */}
          <VitalCard emoji="📏" title="Height">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <VitalField label="Feet"   value={heightFt} onChange={setHeightFt} placeholder="5" />
              <VitalField label="Inches" value={heightIn} onChange={setHeightIn} placeholder="8" />
              <VitalField label="Cms ⇄"  value={heightCm != null ? String(heightCm) : ''} readOnly placeholder="—" />
            </div>
          </VitalCard>

          {/* ── Weight (full width, 3-col) ── */}
          <VitalCard emoji="⚖️" title="Weight">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <VitalField label="Lbs"    value={weightLbs} onChange={setWeightLbs} placeholder="150" />
              <VitalField label="Oz"     value={weightOz}  onChange={setWeightOz}  placeholder="0"   />
              <VitalField label="Kgs ⇄"  value={weightKg != null ? String(weightKg) : ''} readOnly placeholder="—" />
            </div>
          </VitalCard>

          {/* ── Blood Pressure + Corazón & Pulmones (2-col) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <VitalCard emoji="❤️" title="Blood pressure">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <VitalField label="Systolic mmHg"  value={systolic}  onChange={setSystolic}  placeholder="120" />
                <VitalField label="Diastolic mmHg" value={diastolic} onChange={setDiastolic} placeholder="80"  />
              </div>
            </VitalCard>

            <VitalCard emoji="💓" title="Corazón &amp; Pulmones">
              <VitalField label="Pulse (bpm)" value={pulse} onChange={setPulse} placeholder="72" />
            </VitalCard>
          </div>

          {/* ── Temperature + Oxygen (2-col) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <VitalCard emoji="🌡️" title="Temperature">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <VitalField label="°F"    value={tempF} onChange={setTempF} placeholder="98.6" />
                <VitalField label="°C ⇄"  value={tempC != null ? String(tempC) : ''} readOnly placeholder="—" />
              </div>
            </VitalCard>

            <VitalCard emoji="💨" title="Oxygen">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
                <VitalField label="O₂ saturation (%)" value={o2} onChange={setO2} placeholder="98" />
                <div style={{ paddingBottom: 2 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.45)', marginBottom: 6, fontWeight: 600, textAlign: 'center' }}>
                    On room air
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
          <VitalCard emoji="👁️" title="Vision">
            {/* 3 eye fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Right · 20/', val: visRight, set: setVisRight },
                { label: 'Left · 20/',  val: visLeft,  set: setVisLeft  },
                { label: 'Both · 20/',  val: visBoth,  set: setVisBoth  },
              ].map(eye => (
                <div key={eye.label}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.45)', marginBottom: 3, fontWeight: 600 }}>
                    {eye.label}
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
                  { label: 'Uncorrected', val: false },
                  { label: 'Corrected',   val: true  },
                ].map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setCorrected(opt.val)}
                    style={{
                      padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                      background: corrected === opt.val ? '#6366f1' : 'rgba(255,255,255,0.05)',
                      color: corrected === opt.val ? '#fff' : 'rgba(255,255,255,0.55)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)' }}>
                {corrected ? 'Con gafas / lentes' : 'Sin gafas / lentes'}
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
                📄 Templates
              </button>
            </div>

            {/* Toolbar */}
            <div style={{
              display: 'flex', gap: 2, padding: '5px 8px',
              background: 'rgba(0,0,0,0.20)', borderRadius: '6px 6px 0 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              flexWrap: 'wrap',
            }}>
              {['H', 'B', 'I'].map(t => (
                <button key={t} type="button" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.60)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 3 }}>{t}</button>
              ))}
              <div style={{ width: 1, background: 'rgba(255,255,255,0.10)', margin: '0 3px' }} />
              {['☰', '≡', '"', '🔗'].map(t => (
                <button key={t} type="button" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.60)', cursor: 'pointer', fontSize: 11, padding: '2px 5px', borderRadius: 3 }}>{t}</button>
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
                💡 Usa <strong style={{ color: 'rgba(255,255,255,0.70)' }}>Templates</strong> para pre-cargar plantillas comunes (whiplash, lumbar agudo, etc.)
              </span>
              <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)' }}>
                {complaint.length} / 2000
              </span>
            </div>
          </div>

          {/* Captured by */}
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.40)', paddingBottom: 4 }}>
            📌 Capturado por: <strong style={{ color: 'rgba(255,255,255,0.65)' }}>{currentUserName}</strong> · {fmtTime(now)}
            <span style={{ marginLeft: 10, fontSize: 9, opacity: 0.6 }}>Auto-guardado cada 30 seg.</span>
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
              ? <><CheckCircle2 style={{ width: 14, height: 14, color: '#10b981' }} /> Guardado</>
              : 'Guardar borrador'
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
            Pasar a {drName} ✓
          </button>
        </div>
      </main>
    </div>
  );
}
