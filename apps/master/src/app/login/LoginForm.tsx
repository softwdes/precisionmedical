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

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) { setError(signInError.message); setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: role } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .single();

      if (!role) {
        await supabase.auth.signOut();
        setError('No tienes permisos de administrador.');
        setLoading(false);
        return;
      }
    }

    router.push('/master/dashboard');
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

      {/* Grid overlay */}
      <div className="login-grid" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(83,74,183,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(83,74,183,0.05) 1px, transparent 1px)
        `,
      }} />

      {/* Radial corner glows */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          radial-gradient(ellipse at 0% 0%,    rgba(83,74,183,0.09) 0%, transparent 50%),
          radial-gradient(ellipse at 100% 100%, rgba(83,74,183,0.09) 0%, transparent 50%),
          radial-gradient(ellipse at 100% 0%,   rgba(83,74,183,0.05) 0%, transparent 40%),
          radial-gradient(ellipse at 0% 100%,   rgba(83,74,183,0.05) 0%, transparent 40%)
        `,
      }} />

      {/* HUD corners */}
      <div className="login-hud" style={{ position: 'absolute', top: 20, left: 20, borderTop: '2px solid #534AB7', borderLeft: '2px solid #534AB7', pointerEvents: 'none' }} />
      <div className="login-hud" style={{ position: 'absolute', top: 20, right: 20, borderTop: '2px solid #534AB7', borderRight: '2px solid #534AB7', pointerEvents: 'none' }} />
      <div className="login-hud" style={{ position: 'absolute', bottom: 20, left: 20, borderBottom: '2px solid #534AB7', borderLeft: '2px solid #534AB7', pointerEvents: 'none' }} />
      <div className="login-hud" style={{ position: 'absolute', bottom: 20, right: 20, borderBottom: '2px solid #534AB7', borderRight: '2px solid #534AB7', pointerEvents: 'none' }} />

      {/* Main content */}
      <div className="login-wrapper" style={{ position: 'relative', zIndex: 1 }}>

        {/* Brand header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>

          <div style={{
            width: 56, height: 56, borderRadius: '14px', background: '#534AB7',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: '0 0 24px rgba(83,74,183,0.4)',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"
              style={{ width: 28, height: 28 }}>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>

          <div>
            <div className="login-title" style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, color: '#ffffff', letterSpacing: '0.06em', lineHeight: 1.1 }}>
              NEURAL
            </div>
            <div className="login-title" style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, color: '#534AB7', letterSpacing: '0.06em', lineHeight: 1.2 }}>
              MASTER
            </div>
            <div className="login-subtitle" style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 600, color: '#534AB7', textTransform: 'uppercase', marginTop: '10px', opacity: 0.8 }}>
              Panel Administrativo
            </div>
          </div>

          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '9px', fontWeight: 600,
            color: 'rgba(83,74,183,0.45)',
            textTransform: 'uppercase', letterSpacing: '2px',
            borderTop: '1px solid rgba(83,74,183,0.15)',
            paddingTop: '10px', width: '100%', textAlign: 'center',
          }}>
            ACCESO RESTRINGIDO // SUPER ADMIN
          </div>
        </div>

        {/* Status line */}
        <div className="login-status" style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '9px', color: 'rgba(83,74,183,0.45)',
          letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'center',
        }}>
          SYS.MASTER // AUTH MODULE v2.4 // SECURE ACCESS
        </div>

        {/* Form card */}
        <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
            background: 'linear-gradient(90deg, transparent, #534AB7, transparent)', zIndex: 1,
          }} />
          <div className="login-card" style={{
            background: 'rgba(5,5,20,0.85)',
            border: '1px solid rgba(83,74,183,0.2)', borderTop: 'none',
            borderRadius: '6px', backdropFilter: 'blur(10px)',
            boxSizing: 'border-box', width: '100%',
          }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <label style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 600, color: '#534AB7', textTransform: 'uppercase', letterSpacing: '2px' }}>
                  Email
                </label>
                <input
                  type="email" className="login-input"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@ejemplo.com" required autoComplete="email"
                  style={{
                    background: 'rgba(83,74,183,0.04)', border: '1px solid rgba(83,74,183,0.2)',
                    borderRadius: '4px', color: '#c8c5f0', fontSize: '16px',
                    padding: '10px 14px', width: '100%', boxSizing: 'border-box',
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 400,
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <label style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 600, color: '#534AB7', textTransform: 'uppercase', letterSpacing: '2px' }}>
                  Contraseña
                </label>
                <input
                  type="password" className="login-input"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password"
                  style={{
                    background: 'rgba(83,74,183,0.04)', border: '1px solid rgba(83,74,183,0.2)',
                    borderRadius: '4px', color: '#c8c5f0', fontSize: '16px',
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
                  background: '#534AB7', color: '#ffffff', border: 'none',
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
