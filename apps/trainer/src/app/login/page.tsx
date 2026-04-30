'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
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

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/');
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
    }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: 'var(--space-8)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--fg-base)' }}>Precision</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Trainer Panel</div>
        </div>

        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <label style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', fontWeight: 500 }}>Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="trainer@ejemplo.com"
                required
                autoComplete="email"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <label style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', fontWeight: 500 }}>Contraseña</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                padding: 'var(--space-3)',
                background: 'rgba(255,80,80,0.1)',
                border: '1px solid rgba(255,80,80,0.3)',
                borderRadius: 'var(--radius)',
                fontSize: 'var(--text-sm)',
                color: '#ff6b6b',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ marginTop: 'var(--space-2)', width: '100%', justifyContent: 'center' }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
