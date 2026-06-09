'use client';

/**
 * B.5–B.8 — IntakeWizard · Portal del Paciente
 *
 * Mobile-first. Dark background #0a1224. Colores portal:
 *   cyan   #06B6D4 (accent principal)
 *   indigo #6366F1 (buttons)
 *   emerald #10B981 (success / firma)
 *
 * Pasos:
 *   1 · Landing        — saludo, Sifo bot, lista de pasos (B.5)
 *   2 · Datos personales (B.6 p1)
 *   3 · Tu accidente    (B.6 p2)
 *   4 · Tu seguro       (B.6 p3)
 *   5 · Identificación  (B.7 — file upload Phase 1A)
 *   6 · Firma del Lien  (B.8 — canvas)
 *   7 · Confirmación    (B.9 — redirige a /c/[token]/done)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientData {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  insuranceCarrier: string | null;
  policyNumber: string | null;
}

interface AccidentData {
  date: string | null;
  type: string | null;
  notes: string | null;
  location: string | null;
}

interface Props {
  token: string;
  caseId: string;
  caseCode: string;
  patient: PatientData;
  accident: AccidentData;
  casePolicyNumber: string | null;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type AccidentType = 'AUTO' | 'MOTORCYCLE' | 'PEDESTRIAN' | 'WORKPLACE' | 'OTHER';

// ─── Sifo hints por paso ──────────────────────────────────────────────────────

const SIFO_HINTS: Record<number, string> = {
  1:  '¡Hola! Soy Sifo ✨ Te guío en cada paso. Solo toma ~5 minutos.',
  2:  'Verifica que tus datos coincidan con tu ID. Los usaremos en tus documentos médicos.',
  3:  'La fecha exacta del accidente es clave para procesar tu caso correctamente.',
  4:  'Tu seguro PIP (Personal Injury Protection) cubre los tratamientos del accidente.',
  5:  'Necesitamos tu ID para verificar tu identidad. Tus fotos están seguras 🔒',
  6:  'Esta firma autoriza a Precision Medical a tratar tu lesión bajo lien. Es legal y vinculante.',
};

// ─── Estilos base ─────────────────────────────────────────────────────────────

const BG        = '#0a1224';
const CYAN      = '#06B6D4';
const INDIGO    = '#6366F1';
const EMERALD   = '#10B981';
const CARD_BG   = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';

const S = {
  screen: {
    minHeight: '100vh',
    background: BG,
    color: '#fff',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  } as React.CSSProperties,

  container: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 16px 60px',
  } as React.CSSProperties,

  topBar: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    background: BG,
    borderBottom: `1px solid ${CARD_BORDER}`,
    padding: '10px 16px',
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  textarea: {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    resize: 'none' as const,
    fontFamily: 'inherit',
    minHeight: 88,
    boxSizing: 'border-box',
  } as React.CSSProperties,

  btnPrimary: {
    width: '100%',
    padding: '14px',
    background: `linear-gradient(135deg, ${INDIGO}, #8B5CF6)`,
    border: 'none',
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.01em',
  } as React.CSSProperties,

  btnEmerald: {
    width: '100%',
    padding: '14px',
    background: `linear-gradient(135deg, ${EMERALD}, #06B6D4)`,
    border: 'none',
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  btnOutline: {
    padding: '12px 20px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  card: {
    background: CARD_BG,
    border: `1px solid ${CARD_BORDER}`,
    borderRadius: 12,
    padding: 16,
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 6,
  } as React.CSSProperties,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoToInput(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10); // yyyy-MM-dd
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function IntakeWizard({ token, caseId: _caseId, caseCode, patient, accident, casePolicyNumber }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── Form state ──────────────────────────────────────────────────────────────
  const [personal, setPersonal] = useState({
    firstName:   patient.firstName,
    lastName:    patient.lastName,
    dateOfBirth: isoToInput(patient.dateOfBirth),
    phone:       patient.phone ?? '',
    email:       patient.email ?? '',
  });

  const [acc, setAcc] = useState({
    date:     isoToInput(accident.date),
    type:     (accident.type ?? 'AUTO') as AccidentType,
    location: accident.location ?? '',
    notes:    accident.notes ?? '',
  });

  const [insurance, setInsurance] = useState({
    carrier:      patient.insuranceCarrier ?? '',
    policyNumber: casePolicyNumber ?? patient.policyNumber ?? '',
  });

  // Phase 1A: ID photos — we collect them but don't upload to avoid PHI storage pre-BAA
  const [idPhotos, setIdPhotos] = useState({
    selfie:          null as File | null,
    dlFront:         null as File | null,
    dlBack:          null as File | null,
    insuranceCard:   null as File | null,
  });

  // Canvas signature (B.8)
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const isDrawing     = useRef(false);
  const [hasSig, setHasSig]         = useState(false);
  const [signerName, setSignerName] = useState(`${patient.firstName} ${patient.lastName}`);
  const [signerEmail, setSignerEmail] = useState(patient.email ?? '');
  const [agreed, setAgreed]         = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Canvas drawing ──────────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawing.current = true;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = EMERALD;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setHasSig(true);
  }, []);

  const endDraw = useCallback(() => {
    isDrawing.current = false;
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }, []);

  // Canvas size on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width  = parent.clientWidth;
      canvas.height = 160;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ── Save step data to API ───────────────────────────────────────────────────
  const saveStepData = async (stepNum: number) => {
    setSaving(true);
    setSaveError('');
    try {
      let body: Record<string, unknown> = {};
      if (stepNum === 2) body = { personal };
      if (stepNum === 3) body = { accident: acc };
      if (stepNum === 4) body = { insurance };

      const res = await fetch(`/api/intake/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: stepNum, data: body }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setSaveError('Error guardando. Intenta de nuevo.');
      return false;
    } finally {
      setSaving(false);
    }
    return true;
  };

  const goNext = async (fromStep: Step) => {
    if ([2, 3, 4].includes(fromStep)) {
      const ok = await saveStepData(fromStep);
      if (!ok) return;
    }
    setStep(s => (s + 1) as Step);
    window.scrollTo(0, 0);
  };

  const goBack = () => {
    setStep(s => (s - 1) as Step);
    window.scrollTo(0, 0);
  };

  // ── Submit lien signature ──────────────────────────────────────────────────
  const submitSignature = async () => {
    if (!hasSig || !signerName.trim() || !agreed) return;
    setSubmitting(true);
    setSaveError('');
    try {
      const canvas = canvasRef.current;
      const svgData = canvas ? canvas.toDataURL('image/png') : '';

      const res = await fetch(`/api/intake/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName:  signerName.trim(),
          signerEmail: signerEmail.trim() || null,
          signatureSvg: svgData,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push(`/c/${token}/done`);
    } catch {
      setSaveError('Error al firmar. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const totalSteps = 6;
  const progressSteps = step <= 6 ? step : 6;

  return (
    <div style={S.screen}>

      {/* Top progress bar */}
      {step < 7 && (
        <div style={S.topBar}>
          <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Logo chip */}
            <div style={{
              padding: '4px 10px', borderRadius: 20,
              background: `rgba(6,182,212,0.10)`, border: `1px solid rgba(6,182,212,0.25)`,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: CYAN,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              PM
            </div>

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
                <div
                  key={s}
                  style={{
                    height: 4,
                    flex: 1,
                    borderRadius: 2,
                    background: s < progressSteps
                      ? EMERALD
                      : s === progressSteps
                        ? CYAN
                        : 'rgba(255,255,255,0.12)',
                    transition: 'background 0.3s',
                  }}
                />
              ))}
            </div>

            {/* Step counter */}
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', flexShrink: 0 }}>
              {progressSteps}/{totalSteps}
            </span>
          </div>
        </div>
      )}

      <div style={S.container}>

        {/* ══════════════ STEP 1 — Landing / B.5 ══════════════════════════════ */}
        {step === 1 && (
          <div style={{ paddingTop: 40 }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20,
                padding: '6px 14px', borderRadius: 20,
                background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.25)',
              }}>
                <span style={{ color: CYAN, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>
                  PRECISION MEDICAL
                </span>
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 10, lineHeight: 1.2 }}>
                Hola, {patient.firstName} 👋
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.65 }}>
                Te acompaño en tu registro inicial. Solo toma 5 minutos.
              </p>
            </div>

            {/* Case code */}
            <div style={{ ...S.card, marginBottom: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
                Número de caso
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: '#A5B4FC', letterSpacing: '0.06em' }}>
                {caseCode}
              </div>
              {accident.date && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                  Accidente: {fmtDate(accident.date)}
                </div>
              )}
            </div>

            {/* 5-step list */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
                Lo que completarás hoy
              </div>
              {[
                { icon: '👤', label: 'Datos personales' },
                { icon: '🚗', label: 'Detalles del accidente' },
                { icon: '🏥', label: 'Información de tu seguro' },
                { icon: '📸', label: 'Foto de identificación' },
                { icon: '✍️', label: 'Firma del acuerdo de lien' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0',
                  borderBottom: i < 4 ? `1px solid ${CARD_BORDER}` : 'none',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: `rgba(6,182,212,0.10)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15,
                  }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                      Paso {i + 1} · {item.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Sifo */}
            <SifoHint hint={SIFO_HINTS[1]} />

            <button type="button" style={{ ...S.btnPrimary, marginTop: 20 }} onClick={() => goNext(1 as Step)}>
              Comenzar →
            </button>
            <p style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
              🔒 Tu información es confidencial y segura
            </p>
          </div>
        )}

        {/* ══════════════ STEP 2 — Datos personales ════════════════════════════ */}
        {step === 2 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="👤" title="Datos personales" sub="Verifica que tu información esté correcta." />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Nombre">
                  <input
                    type="text" style={S.input}
                    value={personal.firstName}
                    onChange={e => setPersonal(p => ({ ...p, firstName: e.target.value }))}
                  />
                </Field>
                <Field label="Apellido">
                  <input
                    type="text" style={S.input}
                    value={personal.lastName}
                    onChange={e => setPersonal(p => ({ ...p, lastName: e.target.value }))}
                  />
                </Field>
              </div>

              <Field label="Fecha de nacimiento">
                <input
                  type="date" style={S.input}
                  value={personal.dateOfBirth}
                  onChange={e => setPersonal(p => ({ ...p, dateOfBirth: e.target.value }))}
                />
              </Field>

              <Field label="Teléfono">
                <input
                  type="tel" style={S.input}
                  value={personal.phone}
                  placeholder="(801) 555-0100"
                  onChange={e => setPersonal(p => ({ ...p, phone: e.target.value }))}
                />
              </Field>

              <Field label="Correo electrónico">
                <input
                  type="email" style={S.input}
                  value={personal.email}
                  placeholder="correo@ejemplo.com"
                  onChange={e => setPersonal(p => ({ ...p, email: e.target.value }))}
                />
              </Field>
            </div>

            <SifoHint hint={SIFO_HINTS[2]} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(2 as Step)} />
          </div>
        )}

        {/* ══════════════ STEP 3 — Tu accidente ════════════════════════════════ */}
        {step === 3 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="🚗" title="Tu accidente" sub="Necesitamos los detalles del accidente para procesar tu caso." />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Fecha del accidente">
                <input
                  type="date" style={S.input}
                  value={acc.date}
                  onChange={e => setAcc(a => ({ ...a, date: e.target.value }))}
                />
              </Field>

              <Field label="Tipo de accidente">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {([
                    { key: 'AUTO',       label: '🚗 Auto' },
                    { key: 'MOTORCYCLE', label: '🏍️ Moto' },
                    { key: 'PEDESTRIAN', label: '🚶 Peatón' },
                    { key: 'WORKPLACE',  label: '🏭 Trabajo' },
                    { key: 'OTHER',      label: '❓ Otro' },
                  ] as { key: AccidentType; label: string }[]).map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAcc(a => ({ ...a, type: opt.key }))}
                      style={{
                        padding: '10px 6px',
                        borderRadius: 8,
                        border: acc.type === opt.key
                          ? `1px solid rgba(6,182,212,0.60)`
                          : `1px solid rgba(255,255,255,0.10)`,
                        background: acc.type === opt.key
                          ? 'rgba(6,182,212,0.12)'
                          : 'rgba(255,255,255,0.03)',
                        color: acc.type === opt.key ? CYAN : 'rgba(255,255,255,0.60)',
                        fontSize: 12,
                        fontWeight: acc.type === opt.key ? 700 : 400,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'center',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Ubicación del accidente">
                <input
                  type="text" style={S.input}
                  value={acc.location}
                  placeholder="Ej: I-15 y 500 S, Provo, UT"
                  onChange={e => setAcc(a => ({ ...a, location: e.target.value }))}
                />
              </Field>

              <Field label="Describe brevemente cómo ocurrió">
                <textarea
                  style={S.textarea}
                  value={acc.notes}
                  placeholder="Ej: Me impactaron por detrás mientras esperaba en semáforo..."
                  onChange={e => setAcc(a => ({ ...a, notes: e.target.value }))}
                />
              </Field>
            </div>

            <SifoHint hint={SIFO_HINTS[3]} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(3 as Step)} />
          </div>
        )}

        {/* ══════════════ STEP 4 — Tu seguro ═══════════════════════════════════ */}
        {step === 4 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="🏥" title="Tu seguro" sub="Información de tu seguro Personal Injury Protection (PIP)." />

            {/* PIP info banner */}
            <div style={{
              ...S.card, marginBottom: 16,
              background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.20)',
            }}>
              <div style={{ fontSize: 12, color: CYAN, fontWeight: 700, marginBottom: 4 }}>
                ¿Qué es el PIP?
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)', lineHeight: 1.55 }}>
                Personal Injury Protection (PIP) es la cobertura de tu seguro de auto que paga los tratamientos médicos causados por el accidente, sin importar quién tuvo la culpa.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Compañía aseguradora (PIP)">
                <input
                  type="text" style={S.input}
                  value={insurance.carrier}
                  placeholder="Ej: State Farm, Progressive, GEICO..."
                  onChange={e => setInsurance(i => ({ ...i, carrier: e.target.value }))}
                />
              </Field>

              <Field label="Número de póliza">
                <input
                  type="text" style={S.input}
                  value={insurance.policyNumber}
                  placeholder="Ej: POL-123456789"
                  onChange={e => setInsurance(i => ({ ...i, policyNumber: e.target.value }))}
                />
              </Field>
            </div>

            <SifoHint hint={SIFO_HINTS[4]} />
            <SaveError error={saveError} />
            <NavButtons saving={saving} onBack={goBack} onNext={() => goNext(4 as Step)} />
          </div>
        )}

        {/* ══════════════ STEP 5 — Identificación / B.7 ═══════════════════════ */}
        {step === 5 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader icon="📸" title="Tu identificación" sub="Necesitamos tu ID para verificar tu identidad. Fase 1A: fotos se revisan en tu primera visita." />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Selfie */}
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Selfie
                </div>
                {/* Oval overlay hint */}
                <div style={{
                  position: 'relative', width: 160, height: 200, margin: '0 auto 12px',
                  border: '2px dashed rgba(6,182,212,0.40)', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(6,182,212,0.04)',
                }}>
                  {idPhotos.selfie ? (
                    <div style={{ fontSize: 40 }}>✅</div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 28 }}>🤳</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>Centra tu rostro</div>
                    </div>
                  )}
                </div>
                <PhotoInput
                  label={idPhotos.selfie ? `✓ ${idPhotos.selfie.name}` : 'Seleccionar selfie'}
                  accept="image/*"
                  capture="user"
                  onChange={file => setIdPhotos(p => ({ ...p, selfie: file }))}
                  color={CYAN}
                />
              </div>

              {/* Driver's License */}
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Licencia de conducir
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <PhotoInput
                    label={idPhotos.dlFront ? `✓ ${idPhotos.dlFront.name}` : '📷 Frente de la licencia'}
                    accept="image/*"
                    onChange={file => setIdPhotos(p => ({ ...p, dlFront: file }))}
                    color={INDIGO}
                  />
                  <PhotoInput
                    label={idPhotos.dlBack ? `✓ ${idPhotos.dlBack.name}` : '📷 Reverso de la licencia'}
                    accept="image/*"
                    onChange={file => setIdPhotos(p => ({ ...p, dlBack: file }))}
                    color={INDIGO}
                  />
                </div>
              </div>

              {/* Insurance card */}
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Tarjeta de seguro
                </div>
                <PhotoInput
                  label={idPhotos.insuranceCard ? `✓ ${idPhotos.insuranceCard.name}` : '📷 Foto de tu tarjeta de seguro'}
                  accept="image/*"
                  onChange={file => setIdPhotos(p => ({ ...p, insuranceCard: file }))}
                  color={EMERALD}
                />
              </div>

              {/* Phase 1A note */}
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)',
                fontSize: 12, color: 'rgba(245,158,11,0.80)',
              }}>
                📋 <strong>Fase de Registro:</strong> Tus fotos serán revisadas en tu primera visita. No se almacenan en el sistema hasta completar el protocolo de seguridad HIPAA.
              </div>
            </div>

            <SifoHint hint={SIFO_HINTS[5]} />
            <NavButtons saving={false} onBack={goBack} onNext={() => { setStep(6); window.scrollTo(0, 0); }} nextLabel="Continuar a firma →" />
          </div>
        )}

        {/* ══════════════ STEP 6 — Firma del Lien / B.8 ══════════════════════ */}
        {step === 6 && (
          <div style={{ paddingTop: 28 }}>
            <StepHeader
              icon="✍️"
              title="Firma del Lien"
              sub="Este acuerdo autoriza a Precision Medical a tratar tu lesión. Es un documento legal."
            />

            {/* Legal text */}
            <div style={{
              ...S.card, marginBottom: 16,
              maxHeight: 160, overflowY: 'auto',
              fontSize: 12, color: 'rgba(255,255,255,0.60)', lineHeight: 1.70,
            }}>
              <strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
                Acuerdo de Lien Médico — Precision Medical Care
              </strong>
              Al firmar este documento, autorizo a Precision Medical Care a proporcionar los tratamientos médicos necesarios para las lesiones derivadas del accidente. Entiendo y acepto que:{'\n\n'}
              • Los costos del tratamiento serán cubiertos bajo lien contra la demanda de lesiones personales.{'\n'}
              • Precision Medical Care tiene derecho a cobrar directamente de cualquier liquidación, sentencia o pago de seguros.{'\n'}
              • Tengo el derecho de conocer todos los cargos y de recibir una copia de este acuerdo.{'\n'}
              • Puedo retirar este consentimiento en cualquier momento mediante aviso escrito.{'\n\n'}
              Esta firma tiene validez legal conforme a ESIGN Act y UETA (Utah Code § 46-4-101 et seq.).
            </div>

            {/* Canvas pad */}
            <Field label="Tu firma (dibuja aquí)">
              <div style={{
                position: 'relative',
                border: `1px solid rgba(16,185,129,0.35)`,
                borderRadius: 10,
                background: 'rgba(16,185,129,0.04)',
                overflow: 'hidden',
                touchAction: 'none',
              }}>
                <canvas
                  ref={canvasRef}
                  style={{ display: 'block', cursor: 'crosshair' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
                {!hasSig && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                    fontSize: 13, color: 'rgba(255,255,255,0.20)',
                  }}>
                    ✍️ Dibuja tu firma aquí
                  </div>
                )}
              </div>
              {hasSig && (
                <button
                  type="button"
                  onClick={clearCanvas}
                  style={{
                    marginTop: 6, padding: '4px 12px', borderRadius: 6,
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.45)', fontSize: 11, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  × Borrar y volver a firmar
                </button>
              )}
            </Field>

            <div style={{ height: 14 }} />

            <Field label="Nombre completo del firmante">
              <input
                type="text" style={S.input}
                value={signerName}
                placeholder="Nombre completo"
                onChange={e => setSignerName(e.target.value)}
              />
            </Field>

            <div style={{ height: 12 }} />

            <Field label="Correo electrónico (opcional)">
              <input
                type="email" style={S.input}
                value={signerEmail}
                placeholder="para recibir copia"
                onChange={e => setSignerEmail(e.target.value)}
              />
            </Field>

            <div style={{ height: 16 }} />

            {/* Agreement checkbox */}
            <label style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
              background: agreed ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)',
              border: agreed ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.08)',
              marginBottom: 20,
            }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: EMERALD, cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                He leído y acepto el Acuerdo de Lien Médico. Entiendo que esta firma es legalmente vinculante.
              </span>
            </label>

            {saveError && <SaveError error={saveError} />}

            <SifoHint hint={SIFO_HINTS[6]} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={submitSignature}
                disabled={!hasSig || !signerName.trim() || !agreed || submitting}
                style={{
                  ...S.btnEmerald,
                  opacity: (!hasSig || !signerName.trim() || !agreed || submitting) ? 0.45 : 1,
                  cursor: (!hasSig || !signerName.trim() || !agreed || submitting) ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? '⏳ Firmando...' : '✓ Firmar y completar registro'}
              </button>
              <button type="button" style={S.btnOutline} onClick={goBack}>
                ← Atrás
              </button>
            </div>
            <p style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.20)' }}>
              🔒 Firmado digitalmente — ESIGN Act · UETA Utah
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepHeader({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{title}</h2>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>{sub}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.10em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.40)', marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function SifoHint({ hint }: { hint: string }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      marginTop: 20, marginBottom: 4,
      padding: '10px 14px', borderRadius: 10,
      background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13,
      }}>✨</div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#A5B4FC', marginBottom: 2, letterSpacing: '0.08em' }}>
          SIFO
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          {hint}
        </div>
      </div>
    </div>
  );
}

function SaveError({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div style={{
      marginTop: 12, padding: '10px 14px',
      background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)',
      borderRadius: 8, color: '#F87171', fontSize: 13,
    }}>
      ⚠️ {error}
    </div>
  );
}

function NavButtons({
  saving, onBack, onNext, nextLabel,
}: {
  saving: boolean;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
      <button type="button" style={{ ...S.btnOutline, flex: '0 0 auto' }} onClick={onBack}>
        ← Atrás
      </button>
      <button
        type="button"
        disabled={saving}
        style={{
          ...S.btnPrimary, flex: 1,
          opacity: saving ? 0.6 : 1,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
        onClick={onNext}
      >
        {saving ? '⏳ Guardando...' : (nextLabel ?? 'Continuar →')}
      </button>
    </div>
  );
}

function PhotoInput({
  label, accept, capture, onChange, color,
}: {
  label: string;
  accept: string;
  capture?: string;
  onChange: (f: File) => void;
  color: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture as 'user' | 'environment' | undefined}
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%', padding: '12px 16px',
          borderRadius: 10,
          background: `rgba(${color === CYAN ? '6,182,212' : color === INDIGO ? '99,102,241' : '16,185,129'},0.07)`,
          border: `1px solid ${color}40`,
          color: label.startsWith('✓') ? '#10B981' : color,
          fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        {label.startsWith('✓') ? '✓' : '📷'} {label.startsWith('✓') ? label.slice(2) : label}
      </button>
    </div>
  );
}
