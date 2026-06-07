'use client';

/**
 * B.16 — Triaje MA · Client Component
 *
 * iPad-optimizado con dark theme clínico.
 * Colores: emerald como accent de identidad (Regla #5 · mockup aprobado).
 *
 * Layout:
 *   • Sidebar izquierdo (240px fijo): contexto del paciente, colapsable por sección
 *   • Área principal: formulario de signos vitales + chief complaint
 *   • Footer: botón "Pasar al doctor ✓"
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, ChevronRight, ArrowLeftRight,
  Activity, Heart, Thermometer, Wind, Eye,
  FileText, User, Phone, Shield, AlertTriangle,
  CheckCircle2, Loader2, X,
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
  return `${years} a.`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
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

// ─── Sub-components ───────────────────────────────────────────────────────────
function SidebarSection({
  title, icon: Icon, children, defaultOpen = false,
}: { title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Icon style={{ width: 14, height: 14, color: '#10b981', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.65)' }}>
          {title}
        </span>
        {open
          ? <ChevronDown style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.35)' }} />
          : <ChevronRight style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.35)' }} />
        }
      </button>
      {open && (
        <div style={{ padding: '4px 14px 12px 14px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function SidebarField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.40)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>{value || '—'}</div>
    </div>
  );
}

function VitalInput({
  label, value, onChange, placeholder, unit, readOnly = false, wide = false,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; unit: string; readOnly?: boolean; wide?: boolean;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a5b4fc', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type={readOnly ? 'text' : 'number'}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          style={{
            width: wide ? 80 : 64,
            padding: '8px 10px',
            background: readOnly ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${readOnly ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 8,
            color: readOnly ? 'rgba(255,255,255,0.45)' : '#fff',
            fontFamily: 'monospace',
            fontSize: 16,
            fontWeight: 600,
            outline: 'none',
            textAlign: 'center',
          }}
        />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', minWidth: 30 }}>{unit}</span>
      </div>
    </div>
  );
}

function VitalCard({
  emoji, title, children,
}: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.07)',
      background: 'rgba(255,255,255,0.02)',
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{emoji}</span> {title}
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TriageClient({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [appt,    setAppt]    = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

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
  async function handleSave(complete = false) {
    setSaving(true);
    try {
      const payload = {
        heightFt:     parseFloat(heightFt)  || null,
        heightIn:     parseFloat(heightIn)  || null,
        heightCm,
        weightLbs:    parseFloat(weightLbs) || null,
        weightOz:     parseFloat(weightOz)  || null,
        weightKg,
        systolicMmhg: parseFloat(systolic)  || null,
        diastolicMmhg: parseFloat(diastolic) || null,
        pulseBpm:     parseFloat(pulse)     || null,
        tempFahrenheit: parseFloat(tempF)   || null,
        tempCelsius:  tempC,
        o2Saturation: parseFloat(o2)        || null,
        onRoomAir,
        visualAcuityRight: visRight || null,
        visualAcuityLeft:  visLeft  || null,
        visualAcuityBoth:  visBoth  || null,
        visionCorrected:   corrected,
        chiefComplaint:    complaint || null,
        capturedByName:    'MA',
      };

      await fetch(`/api/triage/${appointmentId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
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

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading || !appt) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 style={{ width: 32, height: 32, color: '#10b981', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const p       = appt.patient;
  const c       = appt.case;
  const dr      = appt.provider;
  const drName  = dr ? `Dr. ${dr.lastName}` : 'el doctor';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0a1224' }}>

      {/* ─── Left Sidebar ─────────────────────────────────────────────────── */}
      <aside style={{
        width: 240, minWidth: 240, height: '100vh',
        background: 'rgba(255,255,255,0.015)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        overflow: 'auto', flexShrink: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Patient Header */}
        <div style={{ padding: '16px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: 14, marginBottom: 8,
          }}>
            {p.firstName[0]}{p.lastName[0]}
          </div>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>
            {p.lastName.toUpperCase()}, {p.firstName}
          </div>
          {c && (
            <div style={{ fontSize: 11, color: '#10b981', fontFamily: 'monospace', fontWeight: 600 }}>
              {c.caseCode}
            </div>
          )}
          {p.dateOfBirth && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 2 }}>
              {calcAge(p.dateOfBirth)}
            </div>
          )}
        </div>

        {/* Sections */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <SidebarSection title="Datos personales" icon={User} defaultOpen>
            <SidebarField label="Fecha NAC" value={p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('es-US', { timeZone: 'UTC' }) : null} />
          </SidebarSection>

          <SidebarSection title="Contacto" icon={Phone}>
            <SidebarField label="Teléfono" value={p.phone} />
            <SidebarField label="Email"    value={p.email} />
          </SidebarSection>

          {c?.primaryInsurance && (
            <SidebarSection title="PIP · Seguro" icon={Shield} defaultOpen>
              <SidebarField label="Aseguradora"  value={c.primaryInsurance.name} />
              <SidebarField label="Póliza"        value={c.primaryPolicyNumber} />
              <SidebarField label="Claims Phone" value={c.primaryInsurance.claimsPhone} />
            </SidebarSection>
          )}

          {(c?.attorney || c?.lawFirm) && (
            <SidebarSection title="Abogado" icon={FileText}>
              {c.lawFirm && <SidebarField label="Firma" value={c.lawFirm.firmName} />}
              {c.attorney && (
                <SidebarField
                  label="Attorney"
                  value={`${c.attorney.firstName ?? ''} ${c.attorney.lastName ?? ''}`.trim()}
                />
              )}
            </SidebarSection>
          )}

          {/* Allergies — placeholder: highlighted amber */}
          <SidebarSection title="Alergias" icon={AlertTriangle}>
            <div style={{ fontSize: 11, color: '#fbbf24', background: 'rgba(245,158,11,0.06)', borderRadius: 6, padding: '6px 8px' }}>
              Revisar en expediente
            </div>
          </SidebarSection>
        </div>

        {/* Clinic + time */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
          {appt.clinic.name} · {fmtTime(appt.scheduledFor)}
        </div>
      </aside>

      {/* ─── Main Area ────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.01)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
              📈 Vital signs
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 2 }}>
              Captura rápida · 5 min · sincroniza con la visita del doctor automáticamente
            </div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 6,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
            color: '#fbbf24', fontSize: 11, fontWeight: 700,
          }}>
            ⏱ En triaje
          </div>
        </div>

        {/* Vitals Grid */}
        <div style={{ padding: '20px 24px', flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>

            {/* Height */}
            <VitalCard emoji="📏" title="Height">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <VitalInput label="Feet" value={heightFt} onChange={setHeightFt} placeholder="5" unit="ft" />
                <VitalInput label="Inches" value={heightIn} onChange={setHeightIn} placeholder="8" unit="in" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <ArrowLeftRight style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.35)' }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 16, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
                    {heightCm ?? '—'}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>cm</span>
                </div>
              </div>
            </VitalCard>

            {/* Weight */}
            <VitalCard emoji="⚖️" title="Weight">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <VitalInput label="Lbs" value={weightLbs} onChange={setWeightLbs} placeholder="150" unit="lbs" />
                <VitalInput label="Oz" value={weightOz} onChange={setWeightOz} placeholder="0" unit="oz" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <ArrowLeftRight style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.35)' }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 16, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
                    {weightKg ?? '—'}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>kg</span>
                </div>
              </div>
            </VitalCard>

            {/* Blood Pressure */}
            <VitalCard emoji="❤️" title="Blood Pressure">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <VitalInput label="Systolic"  value={systolic}  onChange={setSystolic}  placeholder="120" unit="mmHg" />
                <VitalInput label="Diastolic" value={diastolic} onChange={setDiastolic} placeholder="80"  unit="mmHg" />
              </div>
            </VitalCard>

            {/* Pulse */}
            <VitalCard emoji="💓" title="Heart Rate">
              <VitalInput label="Pulse" value={pulse} onChange={setPulse} placeholder="72" unit="bpm" wide />
            </VitalCard>

            {/* Temperature */}
            <VitalCard emoji="🌡️" title="Temperature">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <VitalInput label="Fahrenheit" value={tempF} onChange={setTempF} placeholder="98.6" unit="°F" wide />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <ArrowLeftRight style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.35)' }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 16, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
                    {tempC ?? '—'}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>°C</span>
                </div>
              </div>
            </VitalCard>

            {/* Oxygen */}
            <VitalCard emoji="💨" title="Oxygen">
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <VitalInput label="O₂ Saturation" value={o2} onChange={setO2} placeholder="98" unit="%" wide />
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a5b4fc', marginBottom: 8, fontWeight: 600 }}>
                    On room air
                  </div>
                  <button
                    type="button"
                    onClick={() => setOnRoomAir(v => !v)}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: onRoomAir ? '#10b981' : 'rgba(255,255,255,0.12)',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3, left: onRoomAir ? 23 : 3,
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', display: 'block',
                    }} />
                  </button>
                </div>
              </div>
            </VitalCard>
          </div>

          {/* Vision Acuity — full width */}
          <VitalCard emoji="👁️" title="Vision Acuity">
            {/* Corrected/Uncorrected toggle */}
            <div style={{ marginBottom: 14, display: 'flex', gap: 6 }}>
              {[
                { label: 'Uncorrected', val: false, sub: 'Sin gafas / lentes' },
                { label: 'Corrected',   val: true,  sub: 'Con gafas / lentes' },
              ].map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setCorrected(opt.val)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: corrected === opt.val ? '#6366f1' : 'rgba(255,255,255,0.06)',
                    color: corrected === opt.val ? '#fff' : 'rgba(255,255,255,0.55)',
                    fontSize: 12, fontWeight: corrected === opt.val ? 700 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                  <div style={{ fontSize: 9, color: corrected === opt.val ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)', marginTop: 2 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
            {/* Vision inputs */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Right eye', val: visRight, set: setVisRight },
                { label: 'Left eye',  val: visLeft,  set: setVisLeft  },
                { label: 'Both',      val: visBoth,  set: setVisBoth  },
              ].map(eye => (
                <div key={eye.label}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a5b4fc', marginBottom: 6, fontWeight: 600 }}>{eye.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.50)', fontFamily: 'monospace' }}>20/</span>
                    <input
                      type="number"
                      value={eye.val}
                      onChange={e => eye.set(e.target.value)}
                      placeholder="20"
                      style={{
                        width: 56, padding: '8px 8px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8, color: '#fff',
                        fontFamily: 'monospace', fontSize: 16, fontWeight: 600,
                        outline: 'none', textAlign: 'center',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </VitalCard>

          {/* Chief Complaint */}
          <div style={{
            marginTop: 16,
            borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.02)', padding: '16px 18px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              📝 Chief complaint
            </div>
            <textarea
              value={complaint}
              onChange={e => setComplaint(e.target.value)}
              placeholder="Paciente refiere dolor cervical y lumbar desde el accidente del... Tipo de accidente: frontal · velocidad baja · sin airbag..."
              maxLength={2000}
              rows={4}
              style={{
                width: '100%', resize: 'vertical', minHeight: 80,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, color: '#fff',
                fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6,
                outline: 'none',
              }}
            />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 6, textAlign: 'right' }}>
              {complaint.length} / 2000 chars
            </div>
          </div>

          {/* Metadata */}
          <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            📌 Capturado por: <strong style={{ color: 'rgba(255,255,255,0.55)' }}>MA</strong> · {fmtTime(new Date().toISOString())}
          </div>
        </div>

        {/* ─── Footer ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.01)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          {/* Save draft */}
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
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

          {/* Complete triage */}
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            style={{
              padding: '10px 24px', borderRadius: 10,
              background: saving ? 'rgba(16,185,129,0.20)' : 'rgba(16,185,129,0.15)',
              border: '1px solid rgba(16,185,129,0.35)',
              color: '#34d399',
              fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s',
            }}
          >
            {saving
              ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
              : <CheckCircle2 style={{ width: 16, height: 16 }} />
            }
            Pasar a {drName} ✓
          </button>
        </div>
      </main>
    </div>
  );
}
