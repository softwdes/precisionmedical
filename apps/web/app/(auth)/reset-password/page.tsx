'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient as createBrowserClient } from '@precision-medical/auth/client';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '@/lib/trpc/client';

export default function ResetPasswordPage(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const activateSelf = api.users.activateSelf.useMutation();

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) { setSessionReady(true); return; }
    const supabase = createBrowserClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
      if (err) setError('El enlace expiró o ya fue usado. Solicita uno nuevo.');
      else router.replace('/reset-password');
      setSessionReady(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { error: authError } = await supabase.auth.updateUser({ password });

      if (authError) {
        setError('Unable to update password. The link may have expired.');
        return;
      }

      await activateSelf.mutateAsync().catch(() => { /* non-critical */ });
      await supabase.auth.signOut();

      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .pm-field { transition: border-color 150ms, border-width 150ms; }
        .pm-field:focus-within { border-bottom: 2px solid rgba(99,102,241,0.6) !important; }
        .pm-input {
          background: transparent; border: none; outline: none;
          color: #F5F7FB; font-size: 13px; flex: 1; min-width: 0; font-family: inherit;
        }
        .pm-input::placeholder { color: #6B7592; }
        .pm-btn { transition: transform 150ms ease, box-shadow 150ms ease; }
        .pm-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 36px rgba(99,102,241,0.55) !important;
        }
        @media (max-width: 640px) {
          .pm-logo-box { width: 52px !important; height: 52px !important; border-radius: 16px !important; }
          .pm-title   { font-size: 18px !important; }
          .pm-glow-1  { width: 266px !important; height: 266px !important; }
          .pm-glow-2  { width: 210px !important; height: 210px !important; }
        }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#07090F',
          backgroundImage: [
            'linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)',
          ].join(','),
          backgroundSize: '40px 40px',
          position: 'relative',
          overflow: 'hidden',
          padding: '2rem 1rem',
          fontFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
        }}
      >
        {/* Glow 1 — top-right */}
        <div className="pm-glow-1" style={{ position: 'absolute', width: 380, height: 380, top: -100, right: -80, background: 'radial-gradient(circle, rgba(99,102,241,0.20) 0%, transparent 60%)', pointerEvents: 'none' }} />
        {/* Glow 2 — bottom-left */}
        <div className="pm-glow-2" style={{ position: 'absolute', width: 300, height: 300, bottom: -80, left: -100, background: 'radial-gradient(circle, rgba(6,182,212,0.14) 0%, transparent 60%)', pointerEvents: 'none' }} />
        {/* Glow 3 — center */}
        <div style={{ position: 'absolute', width: 200, height: 200, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* ── Floating Logo ── */}
          <div style={{ textAlign: 'center', marginBottom: '1.75rem', animation: 'fadeUp 600ms cubic-bezier(0.16, 1, 0.3, 1) both' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <div style={{ position: 'absolute', top: -12, left: -12, right: -12, bottom: -12, borderRadius: 30, border: '1px solid rgba(99,102,241,0.08)' }} />
              <div style={{ position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: 24, border: '1px solid rgba(99,102,241,0.20)' }} />
              <div className="pm-logo-box" style={{ width: 60, height: 60, borderRadius: 18, background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #06B6D4 100%)', boxShadow: '0 0 40px rgba(99,102,241,0.50), 0 0 80px rgba(99,102,241,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'white', fontWeight: 800, fontSize: 17 }}>LM</span>
              </div>
            </div>
            <p className="pm-title" style={{ color: '#F5F7FB', fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px', margin: '0 0 3px' }}>
              New Password
            </p>
            <p style={{ color: '#4A5474', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Precision Medical · Utah, USA
            </p>
          </div>

          {/* ── Card ── */}
          <div
            style={{
              width: 340,
              maxWidth: '90vw',
              background: 'rgba(15,21,36,0.75)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 20,
              padding: '1.75rem 2rem',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              animation: 'fadeUp 600ms 150ms cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            {!sessionReady ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <svg style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
            ) : done ? (
              /* ── Success state ── */
              <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', marginBottom: '1rem' }}>
                  <CheckCircle size={22} color="#10B981" />
                </div>
                <p style={{ color: '#F5F7FB', fontWeight: 700, fontSize: 15, margin: '0 0 8px' }}>Contraseña creada</p>
                <p style={{ color: '#4A5474', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                  Tu contraseña fue creada exitosamente. Redirigiendo al login...
                </p>
              </div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleSubmit}>
                <p style={{ color: '#4A5474', fontSize: 12, lineHeight: 1.6, margin: '0 0 1.25rem' }}>
                  Choose a strong password with at least 8 characters.
                </p>

                {/* New password */}
                <div className="pm-field" style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '9px 0', marginBottom: 4 }}>
                  <Lock size={15} color="#6366F1" style={{ flexShrink: 0 }} />
                  <input
                    className="pm-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="New password"
                    required
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
                  >
                    {showPassword ? <EyeOff size={14} color="#4A5474" /> : <Eye size={14} color="#4A5474" />}
                  </button>
                </div>

                {/* Confirm password */}
                <div className="pm-field" style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '9px 0', marginBottom: 4 }}>
                  <Lock size={15} color="#4A5474" style={{ flexShrink: 0 }} />
                  <input
                    className="pm-input"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Confirm password"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
                  >
                    {showConfirm ? <EyeOff size={14} color="#4A5474" /> : <Eye size={14} color="#4A5474" />}
                  </button>
                </div>

                {/* Password strength hint */}
                {password.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                    {[...Array(4)].map((_, i) => {
                      const strength = password.length >= 12 ? 4 : password.length >= 10 ? 3 : password.length >= 8 ? 2 : 1;
                      const active = i < strength;
                      const color = strength >= 4 ? '#10B981' : strength >= 3 ? '#6366F1' : strength >= 2 ? '#F59E0B' : '#F43F5E';
                      return (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: 3,
                            borderRadius: 2,
                            background: active ? color : 'rgba(255,255,255,0.07)',
                            transition: 'background 200ms',
                          }}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: '#F43F5E', fontSize: 12 }}>
                    <AlertCircle size={13} color="#F43F5E" style={{ flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="pm-btn"
                  style={{
                    width: '100%',
                    marginTop: '1.25rem',
                    background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #06B6D4 100%)',
                    borderRadius: 12,
                    padding: 13,
                    textAlign: 'center',
                    boxShadow: '0 8px 32px rgba(99,102,241,0.45), 0 2px 8px rgba(99,102,241,0.20)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 14,
                    border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: loading ? 0.85 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {loading ? (
                    <>
                      <svg style={{ animation: 'spin 1s linear infinite' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      Updating...
                    </>
                  ) : 'Update password'}
                </button>
              </form>
            )}
          </div>

          {/* ── Footer ── */}
          <p
            style={{
              color: '#2C3248',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginTop: '1.25rem',
              animation: 'fadeUp 400ms 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            Precision Medical · LM Super Admin · v2.6
          </p>
        </div>
      </div>
    </>
  );
}
