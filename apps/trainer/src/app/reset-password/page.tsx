'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import '../login/login.css';

type PageState = 'loading' | 'form' | 'success' | 'invalid' | 'token_error';

const ACCENT = '#00c8b4';

export default function ResetPasswordPage() {
  const [state, setState] = useState<PageState>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [showPass, setShowPass] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: 'implicit' } }
  ), []);

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const type = params.get('type');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if ((type === 'recovery' || type === 'invite') && accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            setState('token_error');
            setFormError(error.message);
          } else {
            setState('form');
          }
        });
    } else {
      setState('invalid');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state === 'form') passwordRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (state !== 'success') return;
    if (countdown <= 0) {
      window.location.href = 'https://app.neuraltrainergym.com/login?setup=ok';
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [state, countdown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (password.length < 8) { setFormError('La contraseña debe tener al menos 8 caracteres'); return; }
    if (password !== confirm) { setFormError('Las contraseñas no coinciden'); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setSubmitting(false); setFormError(error.message); return; }
    await supabase.auth.signOut();
    setSubmitting(false);
    setState('success');
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#020c10', position: 'relative', overflow: 'hidden',
      padding: '40px 16px', boxSizing: 'border-box',
    }}>

      {/* Grid overlay */}
      <div className="login-grid" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(0,200,180,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,200,180,0.04) 1px, transparent 1px)
        `,
      }} />

      {/* Corner glows */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          radial-gradient(ellipse at 0% 0%,    rgba(0,200,180,0.07) 0%, transparent 50%),
          radial-gradient(ellipse at 100% 100%, rgba(0,200,180,0.07) 0%, transparent 50%),
          radial-gradient(ellipse at 100% 0%,   rgba(0,200,180,0.04) 0%, transparent 40%),
          radial-gradient(ellipse at 0% 100%,   rgba(0,200,180,0.04) 0%, transparent 40%)
        `,
      }} />

      {/* HUD corners */}
      <div className="login-hud" style={{ position: 'absolute', top: 20, left: 20, borderTop: `2px solid ${ACCENT}`, borderLeft: `2px solid ${ACCENT}`, pointerEvents: 'none' }} />
      <div className="login-hud" style={{ position: 'absolute', top: 20, right: 20, borderTop: `2px solid ${ACCENT}`, borderRight: `2px solid ${ACCENT}`, pointerEvents: 'none' }} />
      <div className="login-hud" style={{ position: 'absolute', bottom: 20, left: 20, borderBottom: `2px solid ${ACCENT}`, borderLeft: `2px solid ${ACCENT}`, pointerEvents: 'none' }} />
      <div className="login-hud" style={{ position: 'absolute', bottom: 20, right: 20, borderBottom: `2px solid ${ACCENT}`, borderRight: `2px solid ${ACCENT}`, pointerEvents: 'none' }} />

      <div className="login-wrapper" style={{ position: 'relative', zIndex: 1 }}>

        {/* Brand header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <svg className="login-logo" viewBox="0 0 24 24" fill="none"
            stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 12px rgba(0,200,180,0.5))', flexShrink: 0 }}>
            <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
          <div>
            <div className="login-title" style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, color: '#ffffff', letterSpacing: '0.06em', lineHeight: 1.1 }}>
              NEURAL
            </div>
            <div className="login-title" style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, color: ACCENT, letterSpacing: '0.06em', lineHeight: 1.2 }}>
              TRAINER GYM
            </div>
            <div className="login-subtitle" style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 600, color: ACCENT, textTransform: 'uppercase', marginTop: '10px', opacity: 0.8 }}>
              Configurar acceso
            </div>
          </div>
        </div>

        {/* Form card */}
        <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
            background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, zIndex: 1,
          }} />
          <div className="login-card" style={{
            background: 'rgba(5,20,25,0.85)',
            border: `1px solid rgba(0,200,180,0.2)`, borderTop: 'none',
            borderRadius: '6px', backdropFilter: 'blur(10px)',
            boxSizing: 'border-box', width: '100%',
          }}>

            {/* Loading */}
            {state === 'loading' && (
              <div style={{ textAlign: 'center', padding: '28px 0', color: ACCENT, fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                Verificando enlace...
              </div>
            )}

            {/* Invalid link */}
            {state === 'invalid' && (
              <div style={{ textAlign: 'center', padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ff8080" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div style={{ color: '#ff8080', fontSize: '13px', fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.7, fontWeight: 600 }}>
                  Enlace inválido o ya utilizado.<br />
                  Contacta a tu administrador para obtener un nuevo enlace de acceso.
                </div>
              </div>
            )}

            {/* Token error */}
            {state === 'token_error' && (
              <div style={{ textAlign: 'center', padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ff8080" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div style={{ color: '#ff8080', fontSize: '13px', fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.7, fontWeight: 600 }}>
                  {formError || 'El enlace ha expirado.'}<br />
                  Solicita un nuevo enlace a tu administrador.
                </div>
              </div>
            )}

            {/* Password form */}
            {state === 'form' && (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <label style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 600, color: ACCENT, textTransform: 'uppercase', letterSpacing: '2px' }}>
                    Nueva contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={passwordRef}
                      type={showPass ? 'text' : 'password'}
                      className="login-input"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required minLength={8}
                      autoComplete="new-password"
                      disabled={submitting}
                      style={{
                        background: 'rgba(0,200,180,0.04)', border: `1px solid rgba(0,200,180,0.2)`,
                        borderRadius: '4px', color: '#c8f0eb', fontSize: '16px',
                        padding: '10px 42px 10px 14px', width: '100%', boxSizing: 'border-box',
                        fontFamily: "'Rajdhani', sans-serif", fontWeight: 400,
                      }}
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: `rgba(0,200,180,0.5)`, display: 'flex', padding: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        {showPass
                          ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                          : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                      </svg>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <label style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 600, color: ACCENT, textTransform: 'uppercase', letterSpacing: '2px' }}>
                    Confirmar contraseña
                  </label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="login-input"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repetir contraseña"
                    required minLength={8}
                    autoComplete="new-password"
                    disabled={submitting}
                    style={{
                      background: 'rgba(0,200,180,0.04)', border: `1px solid rgba(0,200,180,0.2)`,
                      borderRadius: '4px', color: '#c8f0eb', fontSize: '16px',
                      padding: '10px 14px', width: '100%', boxSizing: 'border-box',
                      fontFamily: "'Rajdhani', sans-serif", fontWeight: 400,
                    }}
                  />
                </div>

                {formError && (
                  <div style={{
                    padding: '10px 14px',
                    background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.22)',
                    borderRadius: '4px', fontSize: '13px', color: '#ff8080',
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.5px',
                  }}>
                    {formError}
                  </div>
                )}

                <button type="submit" className="login-btn" disabled={submitting}
                  style={{
                    background: ACCENT, color: '#020c10', border: 'none',
                    borderRadius: '4px', padding: '14px', width: '100%', minHeight: '44px',
                    fontFamily: "'Orbitron', sans-serif", fontWeight: 900,
                    fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase',
                    cursor: submitting ? 'wait' : 'pointer', boxSizing: 'border-box',
                  }}>
                  {submitting ? 'GUARDANDO...' : 'ESTABLECER CONTRASEÑA'}
                </button>

              </form>
            )}

            {/* Success */}
            {state === 'success' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center' }}>

                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: `rgba(0,200,180,0.12)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${ACCENT}`,
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>

                <div>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: '13px', color: ACCENT, letterSpacing: '0.05em', marginBottom: '10px' }}>
                    CONTRASEÑA CONFIGURADA
                  </div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', color: 'rgba(0,200,180,0.7)', lineHeight: 1.7 }}>
                    Tu contraseña fue establecida correctamente.<br />
                    Serás redirigido al login en{' '}
                    <strong style={{ color: ACCENT, fontFamily: "'Orbitron', sans-serif", fontSize: '14px' }}>{countdown}</strong>
                    {' '}segundos.
                  </div>
                </div>

                <a
                  href="https://app.neuraltrainergym.com/login?setup=ok"
                  style={{
                    display: 'block', background: ACCENT, color: '#020c10',
                    textDecoration: 'none', borderRadius: '4px', padding: '14px',
                    width: '100%', fontFamily: "'Orbitron', sans-serif", fontWeight: 900,
                    fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase',
                    textAlign: 'center', boxSizing: 'border-box',
                  }}>
                  IR AL LOGIN
                </a>

              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
