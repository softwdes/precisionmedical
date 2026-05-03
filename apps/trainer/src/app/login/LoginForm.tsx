'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import './login.css';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push('/');
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#020c10',
      position: 'relative',
      overflow: 'hidden',
      padding: '40px 16px',
      boxSizing: 'border-box',
    }}>

      {/* ── Grid overlay ───────────────────────────────────── */}
      <div className="login-grid" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(0,200,180,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,200,180,0.04) 1px, transparent 1px)
        `,
      }} />

      {/* ── Radial corner glows ─────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          radial-gradient(ellipse at 0% 0%,    rgba(0,200,180,0.07) 0%, transparent 50%),
          radial-gradient(ellipse at 100% 100%, rgba(0,200,180,0.07) 0%, transparent 50%),
          radial-gradient(ellipse at 100% 0%,   rgba(0,200,180,0.04) 0%, transparent 40%),
          radial-gradient(ellipse at 0% 100%,   rgba(0,200,180,0.04) 0%, transparent 40%)
        `,
      }} />

      {/* ── HUD corners ─────────────────────────────────────── */}
      <div className="login-hud" style={{ position: 'absolute', top: 20, left: 20, borderTop: '2px solid #00c8b4', borderLeft: '2px solid #00c8b4', pointerEvents: 'none' }} />
      <div className="login-hud" style={{ position: 'absolute', top: 20, right: 20, borderTop: '2px solid #00c8b4', borderRight: '2px solid #00c8b4', pointerEvents: 'none' }} />
      <div className="login-hud" style={{ position: 'absolute', bottom: 20, left: 20, borderBottom: '2px solid #00c8b4', borderLeft: '2px solid #00c8b4', pointerEvents: 'none' }} />
      <div className="login-hud" style={{ position: 'absolute', bottom: 20, right: 20, borderBottom: '2px solid #00c8b4', borderRight: '2px solid #00c8b4', pointerEvents: 'none' }} />

      {/* ── Main content ────────────────────────────────────── */}
      <div className="login-wrapper" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Brand header ──────────────────────────────────── */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>

          <svg className="login-logo" viewBox="0 0 24 24" fill="none"
            stroke="#00c8b4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 12px rgba(0,200,180,0.5))', flexShrink: 0 }}>
            <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>

          <div>
            <div className="login-title" style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, color: '#ffffff', letterSpacing: '0.06em', lineHeight: 1.1 }}>
              NEURAL
            </div>
            <div className="login-title" style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, color: '#00c8b4', letterSpacing: '0.06em', lineHeight: 1.2 }}>
              TRAINER GYM
            </div>
            <div className="login-subtitle" style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 600, color: '#00c8b4', textTransform: 'uppercase', marginTop: '10px', opacity: 0.8 }}>
              Sistema de Personal Trainer
            </div>
          </div>

          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '9px', fontWeight: 600,
            color: 'rgba(0,200,180,0.45)',
            textTransform: 'uppercase', letterSpacing: '2px',
            borderTop: '1px solid rgba(0,200,180,0.15)',
            paddingTop: '10px', width: '100%', textAlign: 'center',
          }}>
            AMBIROS NEURAL FACTORY
          </div>
        </div>

        {/* ── Status line ───────────────────────────────────── */}
        <div className="login-status" style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '9px', color: 'rgba(0,200,180,0.35)',
          letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'center',
        }}>
          SYS.NEURAL // AUTH MODULE v2.4 // SECURE ACCESS
        </div>

        {/* ── Form card ─────────────────────────────────────── */}
        <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
            background: 'linear-gradient(90deg, transparent, #00c8b4, transparent)', zIndex: 1,
          }} />
          <div className="login-card" style={{
            background: 'rgba(5,20,25,0.85)',
            border: '1px solid rgba(0,200,180,0.2)', borderTop: 'none',
            borderRadius: '6px', backdropFilter: 'blur(10px)',
            boxSizing: 'border-box', width: '100%',
          }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <label style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 600, color: '#00c8b4', textTransform: 'uppercase', letterSpacing: '2px' }}>
                  Email
                </label>
                <input
                  type="email" className="login-input"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="trainer@ejemplo.com" required autoComplete="email"
                  style={{
                    background: 'rgba(0,200,180,0.04)', border: '1px solid rgba(0,200,180,0.2)',
                    borderRadius: '4px', color: '#c8f0eb', fontSize: '16px',
                    padding: '10px 14px', width: '100%', boxSizing: 'border-box',
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 400,
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <label style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 600, color: '#00c8b4', textTransform: 'uppercase', letterSpacing: '2px' }}>
                  Contraseña
                </label>
                <input
                  type="password" className="login-input"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password"
                  style={{
                    background: 'rgba(0,200,180,0.04)', border: '1px solid rgba(0,200,180,0.2)',
                    borderRadius: '4px', color: '#c8f0eb', fontSize: '16px',
                    padding: '10px 14px', width: '100%', boxSizing: 'border-box',
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 400,
                  }}
                />
              </div>

              {error && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.22)',
                  borderRadius: '4px', fontSize: '13px', color: '#ff8080',
                  fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.5px',
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit" className="login-btn" disabled={loading}
                style={{
                  background: '#00c8b4', color: '#020c10', border: 'none',
                  borderRadius: '4px', padding: '14px', width: '100%', minHeight: '44px',
                  fontFamily: "'Orbitron', sans-serif", fontWeight: 900,
                  fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase',
                  cursor: 'pointer', boxSizing: 'border-box',
                }}
              >
                {loading ? 'VERIFICANDO...' : 'INGRESAR'}
              </button>

            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
