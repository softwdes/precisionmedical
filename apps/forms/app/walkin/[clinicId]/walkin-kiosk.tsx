'use client';

/**
 * B.5 — Walk-in kiosk client
 *
 * Diseño: fullscreen tablet/iPad, fondo oscuro, texto grande para lectura fácil.
 * Flujo: Datos → Procesando → Listo (redirige al intake wizard /c/[token])
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'form' | 'loading' | 'done' | 'error';

interface WalkinKioskProps {
  clinicId:   string;
  clinicName: string;
}

const style = {
  container: {
    minHeight: '100vh',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'linear-gradient(180deg, #060810 0%, #0a0f1e 100%)',
    padding: '40px 24px',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  logo: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 40,
    padding: '8px 20px',
    borderRadius: 24,
    background: 'rgba(6,182,212,0.10)',
    border: '1px solid rgba(6,182,212,0.25)',
    color: '#06B6D4',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.10em',
  },
  title: {
    fontSize: 30,
    fontWeight: 900,
    color: '#fff',
    textAlign: 'center' as const,
    marginBottom: 8,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.50)',
    textAlign: 'center' as const,
    marginBottom: 40,
    lineHeight: 1.6,
    maxWidth: 400,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 20,
    padding: '32px 28px',
  },
  label: {
    display: 'block' as const,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: 'rgba(255,255,255,0.50)',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: '16px 18px',
    fontSize: 18,
    fontWeight: 600,
    color: '#fff',
    outline: 'none' as const,
    boxSizing: 'border-box' as const,
    marginBottom: 20,
  },
  btn: {
    width: '100%',
    background: 'linear-gradient(135deg, #0891b2, #06b6d4)',
    color: '#fff',
    border: 'none',
    borderRadius: 14,
    padding: '18px 24px',
    fontSize: 17,
    fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: '0.03em',
  },
  btnDisabled: {
    background: 'rgba(255,255,255,0.10)',
    color: 'rgba(255,255,255,0.35)',
    cursor: 'not-allowed' as const,
  },
  langToggle: {
    display: 'flex' as const,
    gap: 8,
    marginBottom: 28,
    justifyContent: 'center' as const,
  },
  langBtn: (active: boolean) => ({
    padding: '6px 18px',
    borderRadius: 20,
    border: `1px solid ${active ? 'rgba(6,182,212,0.50)' : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(6,182,212,0.15)' : 'transparent',
    color: active ? '#06B6D4' : 'rgba(255,255,255,0.40)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  }),
};

const COPY = {
  es: {
    title:       'Bienvenido / Welcome',
    sub:         'Ingresa tus datos para comenzar tu registro. · Enter your information to start your registration.',
    labelFirst:  'Nombre / First name',
    labelLast:   'Apellido / Last name',
    labelPhone:  'Teléfono / Phone',
    phonePH:     '(801) 555-0100',
    btnStart:    'Comenzar registro →',
    loading:     'Creando tu registro...',
    doneTitle:   '¡Listo! / All set!',
    doneSub:     'Te vamos a llevar al formulario en un momento...',
    errorTitle:  'Algo salió mal',
    errorSub:    'Por favor pídele ayuda a la recepción.',
    retry:       'Intentar de nuevo',
  },
  en: {
    title:       'Welcome / Bienvenido',
    sub:         'Enter your information to start your registration. · Ingresa tus datos para comenzar.',
    labelFirst:  'First name / Nombre',
    labelLast:   'Last name / Apellido',
    labelPhone:  'Phone / Teléfono',
    phonePH:     '(801) 555-0100',
    btnStart:    'Start registration →',
    loading:     'Creating your record...',
    doneTitle:   'All set! / ¡Listo!',
    doneSub:     'Taking you to the form in a moment...',
    errorTitle:  'Something went wrong',
    errorSub:    'Please ask the front desk for help.',
    retry:       'Try again',
  },
} as const;

export function WalkinKiosk({ clinicId, clinicName }: WalkinKioskProps) {
  const [lang,      setLang]      = useState<'es' | 'en'>('es');
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [phone,     setPhone]     = useState('');
  const [step,      setStep]      = useState<Step>('form');
  const router = useRouter();

  const c = COPY[lang];
  const canSubmit = firstName.trim() && lastName.trim() && phone.trim().length >= 7;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStep('loading');

    try {
      const res = await fetch(`/api/walkin/${clinicId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          phone:     phone.trim(),
          language:  lang,
        }),
      });
      const json = await res.json() as { ok: boolean; token?: string; error?: string };

      if (!json.ok || !json.token) {
        setStep('error');
        return;
      }

      setStep('done');
      setTimeout(() => {
        router.push(`/c/${json.token}`);
      }, 1500);
    } catch {
      setStep('error');
    }
  }

  if (step === 'loading') {
    return (
      <div style={style.container}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 24 }}>⏳</div>
          <div style={{ ...style.title, fontSize: 22 }}>{c.loading}</div>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div style={style.container}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 72, marginBottom: 24 }}>✅</div>
          <div style={style.title}>{c.doneTitle}</div>
          <div style={{ ...style.subtitle, marginTop: 12 }}>{c.doneSub}</div>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div style={style.container}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>⚠️</div>
          <div style={style.title}>{c.errorTitle}</div>
          <div style={{ ...style.subtitle, marginTop: 12 }}>{c.errorSub}</div>
          <button
            type="button"
            onClick={() => setStep('form')}
            style={{ ...style.btn, marginTop: 24 }}
          >
            {c.retry}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={style.container}>
      <div style={style.logo}>PRECISION MEDICAL · {clinicName.toUpperCase()}</div>

      <h1 style={style.title}>{c.title}</h1>
      <p style={style.subtitle}>{c.sub}</p>

      {/* Language toggle */}
      <div style={style.langToggle}>
        {(['es', 'en'] as const).map(l => (
          <button key={l} type="button" style={style.langBtn(lang === l)} onClick={() => setLang(l)}>
            {l === 'es' ? '🇲🇽 Español' : '🇺🇸 English'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={style.card}>
        <label style={style.label}>{c.labelFirst}</label>
        <input
          style={style.input}
          type="text"
          autoComplete="given-name"
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
          placeholder="María"
          required
        />

        <label style={style.label}>{c.labelLast}</label>
        <input
          style={style.input}
          type="text"
          autoComplete="family-name"
          value={lastName}
          onChange={e => setLastName(e.target.value)}
          placeholder="García"
          required
        />

        <label style={style.label}>{c.labelPhone}</label>
        <input
          style={style.input}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder={c.phonePH}
          required
        />

        <button
          type="submit"
          disabled={!canSubmit}
          style={{ ...style.btn, ...(!canSubmit ? style.btnDisabled : {}) }}
        >
          {c.btnStart}
        </button>
      </form>

      <div style={{ marginTop: 28, fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', maxWidth: 360, lineHeight: 1.7 }}>
        🔒 Tu información está protegida bajo HIPAA. No compartimos tu información sin tu consentimiento.
      </div>
    </div>
  );
}
