'use client';

import { useState, useEffect, useMemo, useActionState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import { updateTrainerProfile } from '@/actions';

export default function PerfilPage() {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [state, action, isPending] = useActionState(updateTrainerProfile, null);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      const { data } = await supabase
        .from('trainers')
        .select('business_name, bio, specialties')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setName(data.business_name ?? '');
        setBio(data.bio ?? '');
        setSpecialties((data.specialties as string[] | null)?.join(', ') ?? '');
      }
      setLoaded(true);
    })();
  }, [supabase]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </span>
          <div>
            <div className="brand-name">Precision</div>
            <div className="brand-tag">Trainer</div>
          </div>
        </div>
        <nav className="nav">
          <Link href="/" className="nav-item">Dashboard</Link>
          <Link href="/alumnos" className="nav-item">Alumnos</Link>
          <Link href="/rutinas" className="nav-item">Rutinas</Link>
          <Link href="/horarios" className="nav-item">Horarios</Link>
          <Link href="/facturacion" className="nav-item">Facturación</Link>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <span className="crumb-active">Perfil</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Cuenta // 01</span>
            <h1>Editar Perfil</h1>
          </section>

          <form action={action} style={{ maxWidth: '560px' }}>
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
              <div className="card-body card-body--padded">
                {state?.error && (
                  <div style={{
                    padding: 'var(--space-3)',
                    background: 'rgba(255,80,80,0.1)',
                    border: '1px solid rgba(255,80,80,0.3)',
                    borderRadius: 'var(--radius)',
                    fontSize: 'var(--text-sm)',
                    color: '#ff6b6b',
                    marginBottom: 'var(--space-4)',
                  }}>
                    {state.error}
                  </div>
                )}
                {state?.success && (
                  <div style={{
                    padding: 'var(--space-3)',
                    background: 'rgba(63,248,200,0.1)',
                    border: '1px solid rgba(63,248,200,0.3)',
                    borderRadius: 'var(--radius)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--accent)',
                    marginBottom: 'var(--space-4)',
                  }}>
                    Perfil actualizado correctamente.
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="label">Correo electrónico</label>
                  <input
                    type="email"
                    className="input"
                    value={email}
                    disabled
                    style={{ opacity: 0.5, cursor: 'not-allowed' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="label" htmlFor="business_name">Nombre / Negocio *</label>
                  <input
                    id="business_name"
                    name="business_name"
                    type="text"
                    className="input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej: Coach Carlos Mendoza"
                    required
                    disabled={!loaded}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="label" htmlFor="bio">Biografía</label>
                  <textarea
                    id="bio"
                    name="bio"
                    className="input"
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder="Cuéntanos sobre ti y tu método de entrenamiento..."
                    rows={4}
                    disabled={!loaded}
                    style={{ resize: 'vertical', minHeight: '100px' }}
                  />
                </div>

                <div className="form-group">
                  <label className="label" htmlFor="specialties">Especialidades</label>
                  <input
                    id="specialties"
                    name="specialties"
                    type="text"
                    className="input"
                    value={specialties}
                    onChange={e => setSpecialties(e.target.value)}
                    placeholder="Hipertrofia, Pérdida de grasa, Fuerza..."
                    disabled={!loaded}
                  />
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: 'var(--space-1)' }}>
                    Separadas por coma
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <button type="submit" className="btn btn-primary" disabled={isPending || !loaded}>
                {isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <Link href="/" className="btn btn-outline">Cancelar</Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
