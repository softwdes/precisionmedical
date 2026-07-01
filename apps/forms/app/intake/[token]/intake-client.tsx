'use client';

/**
 * B.5–B.9 — IntakeClient · formulario multi-step del paciente
 *
 * Mobile-first. El paciente llega desde el SMS magic link en su celular.
 * Steps:
 *   1 · Bienvenida         (B.5 — Landing, confirmar identidad)
 *   2 · Datos personales   (B.6 — DOB, teléfono, email, dirección)
 *   3 · Historial médico   (B.7 — medicamentos, alergias, lesiones previas)
 *   4 · Consentimiento     (B.8 — firma digital tipo nombre)
 *   5 · Confirmación       (B.9 — ¡Listo! formulario enviado)
 *
 * Phase 1A: datos pre-llenados del Case. Submit → INTAKE_COMPLETED.
 * Phase 2: PHI en IntakeSubmission (después de BAA).
 */

import { useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface IntakeData {
  caseId: string;
  caseCode: string;
  accidentDate: Date | null;
  accidentType: string | null;
  patient: {
    id: string;
    firstName: string;
    dateOfBirth: Date | null;
    phone: string | null;
    email: string | null;
  };
}

interface PersonalData {
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

interface HealthHistory {
  hasMedications: boolean;
  medications: string;
  hasAllergies: boolean;
  allergies: string;
  hasPreviousInjuries: boolean;
  previousInjuries: string;
  healthStatus: 'excellent' | 'good' | 'fair' | 'poor';
}

interface Consent {
  signature: string;
  agreedToTreatment: boolean;
}

type Step = 1 | 2 | 3 | 4 | 5;
type Lang = 'es' | 'en';

// ─── Strings bilingüe ─────────────────────────────────────────────────────────

const T = {
  es: {
    step1Title: (name: string) => `Hola, ${name} 👋`,
    step1Sub: 'Precision Medical te invita a completar tu formulario de intake antes de tu primera cita.',
    step1Btn: 'Comenzar formulario',
    step1Note: 'Toma aproximadamente 5 minutos',
    step1CaseLabel: 'Tu caso:',

    step2Title: 'Datos personales',
    step2Sub: 'Por favor verifica y completa tu información.',
    dob: 'Fecha de nacimiento',
    phone: 'Teléfono',
    email: 'Correo electrónico',
    address: 'Dirección',
    city: 'Ciudad',
    state: 'Estado',
    zip: 'Código postal',
    emergencyName: 'Contacto de emergencia',
    emergencyPhone: 'Teléfono de emergencia',

    step3Title: 'Historial médico',
    step3Sub: 'Tu información es confidencial.',
    hasMeds: '¿Tomas medicamentos actualmente?',
    medsLabel: 'Lista tus medicamentos:',
    hasAllergies: '¿Tienes alergias conocidas?',
    allergiesLabel: 'Describe tus alergias:',
    hasPrevInjuries: '¿Has tenido lesiones o cirugías previas?',
    prevInjuriesLabel: 'Describe brevemente:',
    healthStatus: 'Estado general de salud',
    excellent: 'Excelente',
    good: 'Buena',
    fair: 'Regular',
    poor: 'Mala',
    yes: 'Sí',
    no: 'No',

    step4Title: 'Consentimiento',
    step4Sub: 'Lee y acepta el consentimiento para continuar.',
    consentText: `Al firmar este formulario, autorizo a Precision Medical Care a proporcionar los tratamientos médicos necesarios relacionados con mi lesión. Entiendo que:\n\n• Mi caso es de lesiones personales relacionadas con un accidente.\n• Los costos del tratamiento pueden ser cubiertos por el seguro correspondiente.\n• Tengo derecho a recibir una copia de este consentimiento.\n• Puedo retirar este consentimiento en cualquier momento por escrito.\n\nCertiftico que la información proporcionada es correcta y completa a mi leal saber y entender.`,
    signatureLabel: 'Escribe tu nombre completo como firma:',
    signaturePlaceholder: 'Tu nombre completo',
    agreeCheckbox: 'Acepto el consentimiento de tratamiento',
    signBtn: 'Firmar y enviar formulario',
    signingNote: 'Tu información es segura y confidencial.',

    step5Title: '¡Formulario enviado!',
    step5Sub: (name: string) => `Gracias, ${name}. Nuestro equipo revisará tu información y se comunicará contigo pronto para confirmar tu cita.`,
    step5Note: '¿Preguntas? Llama al (801) 375-2207',
    step5Case: 'Número de caso:',

    next: 'Continuar',
    back: 'Atrás',
    submitting: 'Enviando...',
    required: 'Campo requerido',
  },
  en: {
    step1Title: (name: string) => `Hello, ${name} 👋`,
    step1Sub: 'Precision Medical invites you to complete your intake form before your first visit.',
    step1Btn: 'Start form',
    step1Note: 'Takes approximately 5 minutes',
    step1CaseLabel: 'Your case:',

    step2Title: 'Personal information',
    step2Sub: 'Please verify and complete your information.',
    dob: 'Date of birth',
    phone: 'Phone number',
    email: 'Email address',
    address: 'Address',
    city: 'City',
    state: 'State',
    zip: 'ZIP code',
    emergencyName: 'Emergency contact name',
    emergencyPhone: 'Emergency contact phone',

    step3Title: 'Medical history',
    step3Sub: 'Your information is confidential.',
    hasMeds: 'Are you currently taking any medications?',
    medsLabel: 'List your medications:',
    hasAllergies: 'Do you have any known allergies?',
    allergiesLabel: 'Describe your allergies:',
    hasPrevInjuries: 'Have you had previous injuries or surgeries?',
    prevInjuriesLabel: 'Briefly describe:',
    healthStatus: 'General health status',
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    yes: 'Yes',
    no: 'No',

    step4Title: 'Consent',
    step4Sub: 'Please read and accept the consent to continue.',
    consentText: `By signing this form, I authorize Precision Medical Care to provide necessary medical treatment related to my injury. I understand that:\n\n• My case is a personal injury case related to an accident.\n• Treatment costs may be covered by the corresponding insurance.\n• I have the right to receive a copy of this consent.\n• I may withdraw this consent at any time in writing.\n\nI certify that the information provided is correct and complete to the best of my knowledge.`,
    signatureLabel: 'Type your full name as signature:',
    signaturePlaceholder: 'Your full name',
    agreeCheckbox: 'I accept the treatment consent',
    signBtn: 'Sign and submit form',
    signingNote: 'Your information is safe and confidential.',

    step5Title: 'Form submitted!',
    step5Sub: (name: string) => `Thank you, ${name}. Our team will review your information and contact you shortly to confirm your appointment.`,
    step5Note: 'Questions? Call (801) 375-2207',
    step5Case: 'Case number:',

    next: 'Continue',
    back: 'Back',
    submitting: 'Sending...',
    required: 'Required field',
  },
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateInput(d: Date | null): string {
  if (!d) return '';
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Estilos base (inline para evitar dependencia de Tailwind en portal) ──────

const S = {
  screen: {
    minHeight: '100vh',
    background: '#060810',
    color: '#fff',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  } as React.CSSProperties,

  container: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 16px 40px',
  } as React.CSSProperties,

  // Barra de progreso top
  progressBar: (current: Step): React.CSSProperties => ({
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: '#060810',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    padding: '12px 16px',
  }),

  // Label de sección
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.40)',
    marginBottom: 6,
    display: 'block',
  },

  input: {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15,
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
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
    minHeight: 80,
  } as React.CSSProperties,

  btnPrimary: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
    border: 'none',
    borderRadius: 10,
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
    color: 'rgba(255,255,255,0.70)',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
  } as React.CSSProperties,

  toggle: (active: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    background: active ? 'rgba(6,182,212,0.15)' : 'transparent',
    border: active ? '1px solid rgba(6,182,212,0.40)' : '1px solid rgba(255,255,255,0.10)',
    borderRadius: 8,
    color: active ? '#06B6D4' : 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    fontFamily: 'inherit',
    flex: 1,
    textAlign: 'center' as const,
  }),
};

// ─── Componente principal ─────────────────────────────────────────────────────

export function IntakeClient({ token, data }: { token: string; data: IntakeData }) {
  const [step, setStep] = useState<Step>(1);
  const [lang, setLang] = useState<Lang>('es');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Form state
  const [personal, setPersonal] = useState<PersonalData>({
    dateOfBirth: formatDateInput(data.patient.dateOfBirth),
    phone: data.patient.phone ?? '',
    email: data.patient.email ?? '',
    address: '',
    city: '',
    state: 'UT',
    zip: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });

  const [health, setHealth] = useState<HealthHistory>({
    hasMedications: false,
    medications: '',
    hasAllergies: false,
    allergies: '',
    hasPreviousInjuries: false,
    previousInjuries: '',
    healthStatus: 'good',
  });

  const [consent, setConsent] = useState<Consent>({
    signature: '',
    agreedToTreatment: false,
  });

  const t = T[lang];
  const totalSteps = 4; // steps 1-4 (5 es la confirmación)

  const handleSubmit = async () => {
    if (!consent.signature.trim() || !consent.agreedToTreatment) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch(`/api/portal/intake/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalData: personal,
          healthHistory: health,
          consent: {
            signature: consent.signature,
            agreedToTreatment: consent.agreedToTreatment,
            agreedAt: new Date().toISOString(),
          },
          language: lang,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStep(5);
    } catch {
      setSubmitError(lang === 'es' ? 'Error al enviar. Intenta de nuevo.' : 'Error submitting. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={S.screen}>

      {/* Progress bar (steps 1-4) */}
      {step < 5 && (
        <div style={S.progressBar(step)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 480, margin: '0 auto' }}>
            {/* Dots */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  style={{
                    width: s === step ? 20 : 8,
                    height: 8,
                    borderRadius: 4,
                    background: s <= step ? '#6366F1' : 'rgba(255,255,255,0.15)',
                    transition: 'all 0.3s',
                  }}
                />
              ))}
            </div>
            {/* Step label */}
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>
              {step}/{totalSteps}
            </span>
            {/* Lang toggle */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['es', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: lang === l ? '1px solid rgba(99,102,241,0.50)' : '1px solid rgba(255,255,255,0.10)',
                    background: lang === l ? 'rgba(99,102,241,0.20)' : 'transparent',
                    color: lang === l ? '#A5B4FC' : 'rgba(255,255,255,0.40)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    letterSpacing: '0.05em',
                  }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={S.container}>

        {/* ─── Step 1 · Bienvenida (B.5) ─────────────────────────────────── */}
        {step === 1 && (
          <div style={{ paddingTop: 40 }}>
            {/* Logo + clinic */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24,
                padding: '6px 14px', borderRadius: 20,
                background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.25)',
              }}>
                <span style={{ color: '#06B6D4', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>
                  PRECISION MEDICAL
                </span>
              </div>

              <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>
                {t.step1Title(data.patient.firstName)}
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.60)', fontSize: 15, lineHeight: 1.6 }}>
                {t.step1Sub}
              </p>
            </div>

            {/* Case info card */}
            <div style={{ ...S.card, marginBottom: 28, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                {t.step1CaseLabel}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#A5B4FC', letterSpacing: '0.05em' }}>
                {data.caseCode}
              </div>
              {data.accidentDate && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 6 }}>
                  DOL: {new Date(data.accidentDate).toLocaleDateString('es-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </div>

            {/* Info bullets */}
            <div style={{ ...S.card, marginBottom: 28 }}>
              {['🔒 Tu información es segura y confidencial', '⏱ Toma aproximadamente 5 minutos', '📋 Información pre-llenada de tu caso'].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < 2 ? 10 : 0 }}>
                  <span style={{ fontSize: 16 }}>{item.slice(0, 2)}</span>
                  <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>{item.slice(3)}</span>
                </div>
              ))}
            </div>

            <button type="button" style={S.btnPrimary} onClick={() => setStep(2)}>
              {t.step1Btn} →
            </button>
            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>
              {t.step1Note}
            </p>
          </div>
        )}

        {/* ─── Step 2 · Datos personales (B.6) ──────────────────────────── */}
        {step === 2 && (
          <div style={{ paddingTop: 28 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{t.step2Title}</h2>
            <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 14, marginBottom: 24 }}>{t.step2Sub}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label={t.dob}>
                <input
                  type="date"
                  lang="en-US"
                  style={S.input}
                  value={personal.dateOfBirth}
                  onChange={(e) => setPersonal(p => ({ ...p, dateOfBirth: e.target.value }))}
                />
              </Field>

              <Field label={t.phone}>
                <input
                  type="tel"
                  style={S.input}
                  value={personal.phone}
                  onChange={(e) => setPersonal(p => ({ ...p, phone: e.target.value }))}
                  placeholder="(801) 555-0100"
                />
              </Field>

              <Field label={t.email}>
                <input
                  type="email"
                  style={S.input}
                  value={personal.email}
                  onChange={(e) => setPersonal(p => ({ ...p, email: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                />
              </Field>

              <Field label={t.address}>
                <input
                  type="text"
                  style={S.input}
                  value={personal.address}
                  onChange={(e) => setPersonal(p => ({ ...p, address: e.target.value }))}
                  placeholder="123 Main St"
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
                <Field label={t.city}>
                  <input
                    type="text"
                    style={S.input}
                    value={personal.city}
                    onChange={(e) => setPersonal(p => ({ ...p, city: e.target.value }))}
                    placeholder="Provo"
                  />
                </Field>
                <Field label={t.zip}>
                  <input
                    type="text"
                    style={S.input}
                    value={personal.zip}
                    onChange={(e) => setPersonal(p => ({ ...p, zip: e.target.value }))}
                    placeholder="84601"
                    maxLength={5}
                  />
                </Field>
              </div>

              <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {lang === 'es' ? 'Contacto de emergencia' : 'Emergency Contact'}
                </div>
                <input
                  type="text"
                  style={S.input}
                  placeholder={t.emergencyName}
                  value={personal.emergencyContactName}
                  onChange={(e) => setPersonal(p => ({ ...p, emergencyContactName: e.target.value }))}
                />
                <input
                  type="tel"
                  style={S.input}
                  placeholder={t.emergencyPhone}
                  value={personal.emergencyContactPhone}
                  onChange={(e) => setPersonal(p => ({ ...p, emergencyContactPhone: e.target.value }))}
                />
              </div>
            </div>

            <NavButtons lang={lang} onBack={() => setStep(1)} onNext={() => setStep(3)} />
          </div>
        )}

        {/* ─── Step 3 · Historial médico (B.7) ──────────────────────────── */}
        {step === 3 && (
          <div style={{ paddingTop: 28 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{t.step3Title}</h2>
            <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 14, marginBottom: 24 }}>{t.step3Sub}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Estado general de salud */}
              <Field label={t.healthStatus}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['excellent', 'good', 'fair', 'poor'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setHealth(h => ({ ...h, healthStatus: v }))}
                      style={S.toggle(health.healthStatus === v)}
                    >
                      {t[v]}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Medicamentos */}
              <YesNoField
                label={t.hasMeds}
                value={health.hasMedications}
                onChange={(v) => setHealth(h => ({ ...h, hasMedications: v }))}
                yesLabel={t.yes}
                noLabel={t.no}
              />
              {health.hasMedications && (
                <Field label={t.medsLabel}>
                  <textarea
                    style={S.textarea}
                    value={health.medications}
                    onChange={(e) => setHealth(h => ({ ...h, medications: e.target.value }))}
                    placeholder={lang === 'es' ? 'Ej: Ibuprofeno 400mg, Lisinopril 10mg...' : 'E.g. Ibuprofen 400mg, Lisinopril 10mg...'}
                  />
                </Field>
              )}

              {/* Alergias */}
              <YesNoField
                label={t.hasAllergies}
                value={health.hasAllergies}
                onChange={(v) => setHealth(h => ({ ...h, hasAllergies: v }))}
                yesLabel={t.yes}
                noLabel={t.no}
              />
              {health.hasAllergies && (
                <Field label={t.allergiesLabel}>
                  <textarea
                    style={S.textarea}
                    value={health.allergies}
                    onChange={(e) => setHealth(h => ({ ...h, allergies: e.target.value }))}
                    placeholder={lang === 'es' ? 'Ej: Penicilina, mariscos...' : 'E.g. Penicillin, shellfish...'}
                  />
                </Field>
              )}

              {/* Lesiones previas */}
              <YesNoField
                label={t.hasPrevInjuries}
                value={health.hasPreviousInjuries}
                onChange={(v) => setHealth(h => ({ ...h, hasPreviousInjuries: v }))}
                yesLabel={t.yes}
                noLabel={t.no}
              />
              {health.hasPreviousInjuries && (
                <Field label={t.prevInjuriesLabel}>
                  <textarea
                    style={S.textarea}
                    value={health.previousInjuries}
                    onChange={(e) => setHealth(h => ({ ...h, previousInjuries: e.target.value }))}
                    placeholder={lang === 'es' ? 'Ej: Cirugía de rodilla en 2019...' : 'E.g. Knee surgery in 2019...'}
                  />
                </Field>
              )}
            </div>

            <NavButtons lang={lang} onBack={() => setStep(2)} onNext={() => setStep(4)} />
          </div>
        )}

        {/* ─── Step 4 · Consentimiento + firma (B.8) ───────────────────── */}
        {step === 4 && (
          <div style={{ paddingTop: 28 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{t.step4Title}</h2>
            <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 14, marginBottom: 24 }}>{t.step4Sub}</p>

            {/* Consent text */}
            <div style={{
              ...S.card, marginBottom: 20,
              maxHeight: 200, overflowY: 'auto',
              fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7,
              whiteSpace: 'pre-line',
            }}>
              {t.consentText}
            </div>

            {/* Agree checkbox */}
            <label style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              marginBottom: 20, cursor: 'pointer',
              padding: '12px 14px',
              background: consent.agreedToTreatment ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
              border: consent.agreedToTreatment ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
            }}>
              <input
                type="checkbox"
                checked={consent.agreedToTreatment}
                onChange={(e) => setConsent(c => ({ ...c, agreedToTreatment: e.target.checked }))}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: '#6366F1', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.80)' }}>{t.agreeCheckbox}</span>
            </label>

            {/* Signature */}
            <Field label={t.signatureLabel}>
              <input
                type="text"
                style={{ ...S.input, fontSize: 18, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
                value={consent.signature}
                onChange={(e) => setConsent(c => ({ ...c, signature: e.target.value }))}
                placeholder={t.signaturePlaceholder}
              />
            </Field>

            {submitError && (
              <div style={{
                marginTop: 12, padding: '10px 14px',
                background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)',
                borderRadius: 8, color: '#F87171', fontSize: 13,
              }}>
                {submitError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!consent.signature.trim() || !consent.agreedToTreatment || submitting}
                style={{
                  ...S.btnPrimary,
                  opacity: (!consent.signature.trim() || !consent.agreedToTreatment || submitting) ? 0.5 : 1,
                  cursor: (!consent.signature.trim() || !consent.agreedToTreatment || submitting) ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? t.submitting : t.signBtn}
              </button>
              <button type="button" style={S.btnOutline} onClick={() => setStep(3)}>
                {t.back}
              </button>
            </div>

            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
              🔒 {t.signingNote}
            </p>
          </div>
        )}

        {/* ─── Step 5 · Confirmación (B.9) ──────────────────────────────── */}
        {step === 5 && (
          <div style={{ paddingTop: 60, textAlign: 'center' }}>
            {/* Check circle animado */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, #10B981, #06B6D4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: 36,
              boxShadow: '0 0 40px rgba(16,185,129,0.35)',
            }}>
              ✓
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
              {t.step5Title}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.60)', fontSize: 15, lineHeight: 1.65, marginBottom: 28 }}>
              {t.step5Sub(data.patient.firstName)}
            </p>

            <div style={{ ...S.card, marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                {t.step5Case}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#A5B4FC', letterSpacing: '0.05em' }}>
                {data.caseCode}
              </div>
            </div>

            <a
              href="tel:+18013752207"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', borderRadius: 10,
                background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.25)',
                color: '#06B6D4', fontSize: 14, fontWeight: 600, textDecoration: 'none',
              }}
            >
              📞 {t.step5Note}
            </a>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 600,
        color: 'rgba(255,255,255,0.50)', marginBottom: 6,
        letterSpacing: '0.05em',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function YesNoField({
  label, value, onChange, yesLabel, noLabel,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 13,
        color: 'rgba(255,255,255,0.75)', marginBottom: 10,
      }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" style={{
          ...({
            padding: '10px 20px',
            borderRadius: 8,
            border: value ? '1px solid rgba(16,185,129,0.50)' : '1px solid rgba(255,255,255,0.12)',
            background: value ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
            color: value ? '#10B981' : 'rgba(255,255,255,0.55)',
            fontSize: 14, fontWeight: value ? 600 : 400,
            cursor: 'pointer', fontFamily: 'inherit', flex: 1,
          } as React.CSSProperties),
        }} onClick={() => onChange(true)}>
          {yesLabel}
        </button>
        <button type="button" style={{
          ...({
            padding: '10px 20px',
            borderRadius: 8,
            border: !value ? '1px solid rgba(99,102,241,0.50)' : '1px solid rgba(255,255,255,0.12)',
            background: !value ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.04)',
            color: !value ? '#A5B4FC' : 'rgba(255,255,255,0.55)',
            fontSize: 14, fontWeight: !value ? 600 : 400,
            cursor: 'pointer', fontFamily: 'inherit', flex: 1,
          } as React.CSSProperties),
        }} onClick={() => onChange(false)}>
          {noLabel}
        </button>
      </div>
    </div>
  );
}

function NavButtons({
  lang, onBack, onNext,
}: {
  lang: Lang;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = T[lang];
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
      <button type="button" style={{ ...S.btnOutline, flex: 1 }} onClick={onBack}>
        ← {t.back}
      </button>
      <button type="button" style={{ ...S.btnPrimary, flex: 2 }} onClick={onNext}>
        {t.next} →
      </button>
    </div>
  );
}
