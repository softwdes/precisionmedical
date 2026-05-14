'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage(): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.status === 404) {
        setError('This email is not registered in the system.');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; detail?: string };
        setError(`[${body.error ?? res.status}] ${body.detail ?? 'Unable to send reset link.'}`);
        return;
      }

      setSent(true);
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
              Reset Password
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
            {sent ? (
              /* ── Success state ── */
              <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', marginBottom: '1rem' }}>
                  <CheckCircle size={22} color="#10B981" />
                </div>
                <p style={{ color: '#F5F7FB', fontWeight: 700, fontSize: 15, margin: '0 0 8px' }}>Check your email</p>
                <p style={{ color: '#4A5474', fontSize: 12, lineHeight: 1.6, margin: '0 0 1.5rem' }}>
                  We sent a reset link to <span style={{ color: '#8B9CC8' }}>{email}</span>. Check your inbox and click the link to create a new password.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  style={{
                    width: '100%',
                    background: 'rgba(99,102,241,0.12)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    borderRadius: 12,
                    padding: '11px 13px',
                    color: '#6366F1',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Back to Sign in
                </button>
              </div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleSubmit}>
                <p style={{ color: '#4A5474', fontSize: 12, lineHeight: 1.6, margin: '0 0 1.25rem' }}>
                  Enter your account email and we'll send you a link to reset your password.
                </p>

                {/* Email */}
                <div className="pm-field" style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '9px 0', marginBottom: 4 }}>
                  <Mail size={15} color="#4A5474" style={{ flexShrink: 0 }} />
                  <input
                    className="pm-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@yourcompany.com"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                {/* Error */}
                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4, color: '#F43F5E', fontSize: 12 }}>
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
                      Sending...
                    </>
                  ) : 'Send reset link'}
                </button>

                {/* Back to login */}
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginTop: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: '#4A5474', fontSize: 12, fontFamily: 'inherit' }}
                >
                  <ArrowLeft size={13} color="#4A5474" />
                  Back to Sign in
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
