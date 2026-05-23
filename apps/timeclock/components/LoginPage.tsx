'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Eye, EyeOff, Clock } from 'lucide-react';

export default function LoginPage({ expired }: { expired?: boolean }) {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError('Email o contraseña incorrectos');
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 44,
    padding: '10px 12px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid var(--border)',
    color: 'white',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.15s',
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        position: 'relative',
        overflow: 'hidden',
        padding: '24px 20px',
      }}
    >
      {/* Background glows */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 340, height: 340,
        background: 'radial-gradient(circle at 80% 20%, rgba(16,185,129,0.06), transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        width: 280, height: 280,
        background: 'radial-gradient(circle at 20% 80%, rgba(99,102,241,0.05), transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: 320,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* App icon */}
        <div style={{
          width: 64, height: 64,
          borderRadius: 16,
          background: 'var(--green-dim)',
          border: '1px solid var(--green-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Clock size={28} color="var(--green)" />
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)' }}>
            PM Time Clock
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Precision Medical
          </p>
        </div>

        {/* Session expired notice */}
        {expired && (
          <div style={{
            width: '100%',
            background: 'var(--amber-dim)',
            border: '1px solid var(--amber-border)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
            color: 'var(--amber)',
            textAlign: 'center',
          }}>
            Tu sesión expiró. Inicia sesión de nuevo.
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}
        >
          {/* Email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--green-border)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ ...inputStyle, paddingRight: 44 }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--green-border)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'var(--rose-dim)',
              border: '1px solid var(--rose-border)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              color: 'var(--rose)',
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 10,
              background: loading ? 'rgba(16,185,129,0.7)' : 'var(--green)',
              color: '#060810',
              fontSize: 14,
              fontWeight: 500,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'background 0.15s',
              marginTop: 2,
            }}
          >
            {loading && (
              <span style={{
                width: 16, height: 16,
                border: '2px solid rgba(6,8,16,0.3)',
                borderTopColor: '#060810',
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
                display: 'inline-block',
              }} />
            )}
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        {/* Footer */}
        <p style={{ fontSize: 11, color: 'var(--text-hint)', textAlign: 'center' }}>
          Precision Medical · Solo uso interno
        </p>
      </div>
    </main>
  );
}
