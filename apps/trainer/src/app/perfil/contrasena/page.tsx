'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import { updatePassword } from '@/actions';

export default function ContrasenaPage() {
  const [state, action, isPending] = useActionState(updatePassword, null);

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
            Panel del Entrenador <span className="sep">//</span>
            <Link href="/perfil" className="crumb">Perfil</Link> <span className="sep">//</span>
            <span className="crumb-active">Contraseña</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Seguridad // 01</span>
            <h1>Cambiar Contraseña</h1>
          </section>

          <form action={action} style={{ maxWidth: '400px' }}>
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
                    Contraseña actualizada correctamente.
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="label" htmlFor="password">Nueva contraseña</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    className="input"
                    placeholder="Mínimo 8 caracteres"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>

                <div className="form-group">
                  <label className="label" htmlFor="confirm">Confirmar contraseña</label>
                  <input
                    id="confirm"
                    name="confirm"
                    type="password"
                    className="input"
                    placeholder="Repite la nueva contraseña"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                {isPending ? 'Guardando...' : 'Actualizar contraseña'}
              </button>
              <Link href="/perfil" className="btn btn-outline">Cancelar</Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
