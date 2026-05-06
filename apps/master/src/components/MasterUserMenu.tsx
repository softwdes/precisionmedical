'use client';

import { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { signOut, updateAdminProfile, updatePassword } from '@/actions/profile';

const V = '#534AB7';

type ModalType = 'profile' | 'password' | null;

const ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '8px 10px', borderRadius: '6px', fontSize: '13px',
  color: 'var(--fg-base)', textDecoration: 'none',
  width: '100%', background: 'none', border: 'none',
  cursor: 'pointer', textAlign: 'left',
};

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(4px)',
  zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '16px',
};

const MODAL: React.CSSProperties = {
  width: '100%', maxWidth: '420px',
  background: '#0d0d0f',
  border: '1px solid rgba(83,74,183,0.25)',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
};

const MODAL_HEAD: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '20px 24px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const MODAL_BODY: React.CSSProperties = {
  padding: '24px',
  display: 'flex', flexDirection: 'column', gap: '16px',
};

const MODAL_FOOT: React.CSSProperties = {
  padding: '16px 24px',
  borderTop: '1px solid rgba(255,255,255,0.08)',
  display: 'flex', gap: '10px', justifyContent: 'flex-end',
  background: 'rgba(0,0,0,0.3)',
};

const ERROR_BOX: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(255,80,80,0.1)',
  border: '1px solid rgba(255,80,80,0.3)',
  borderRadius: '6px', fontSize: '13px', color: '#ff6b6b',
};

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px', display: 'flex' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  );
}

export default function MasterUserMenu() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);

  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);

  const [profileError,  setProfileError]  = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isPending, startTransition] = useTransition();

  const [toastMsg,     setToastMsg]     = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      const fullName = (user.user_metadata?.full_name as string | undefined) ?? '';
      setName(fullName);
      setDataLoaded(true);
    })();
  }, [supabase]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const show  = setTimeout(() => setToastVisible(true), 10);
    const hide  = setTimeout(() => setToastVisible(false), 3400);
    const clear = setTimeout(() => setToastMsg(''), 3750);
    return () => { clearTimeout(show); clearTimeout(hide); clearTimeout(clear); };
  }, [toastMsg]);

  const displayName = name || email;
  const initials = name
    ? name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
    : email.slice(0, 2).toUpperCase();

  function openModal(type: ModalType) {
    setDropdownOpen(false);
    setProfileError('');
    setPasswordError('');
    setModal(type);
  }

  function showToast(msg: string) {
    setToastVisible(false);
    setToastMsg('');
    setTimeout(() => setToastMsg(msg), 20);
  }

  function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newName = ((fd.get('full_name') as string) ?? '').trim();
    setProfileError('');
    startTransition(async () => {
      const res = await updateAdminProfile(null, fd);
      if (res?.error) {
        setProfileError(res.error);
      } else {
        setName(newName);
        setModal(null);
        showToast('Perfil actualizado correctamente');
      }
    });
  }

  function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPasswordError('');
    startTransition(async () => {
      const res = await updatePassword(null, fd);
      if (res?.error) {
        setPasswordError(res.error);
      } else {
        setModal(null);
        showToast('Contraseña actualizada correctamente');
      }
    });
  }

  return (
    <>
      {/* ── Chip + dropdown ─────────────────────────────────────────── */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <div
          className="user-chip"
          role="button"
          tabIndex={0}
          onClick={() => setDropdownOpen(o => !o)}
          onKeyDown={e => e.key === 'Enter' && setDropdownOpen(o => !o)}
          style={{ cursor: 'pointer' }}
        >
          <div>
            <div className="user-name">{displayName || '...'}</div>
            <div className="user-role">Super Admin</div>
          </div>
          <span className="user-avatar" style={{
            background: V, color: '#fff',
            fontWeight: 700, fontSize: '13px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {initials || '?'}
          </span>
        </div>

        {dropdownOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            width: '200px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 1000, overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg-base)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName || '...'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '2px' }}>Super Admin</div>
            </div>
            <div style={{ padding: '6px' }}>
              <button onClick={() => openModal('profile')} style={ITEM}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>
                </svg>
                Editar perfil
              </button>
              <button onClick={() => openModal('password')} style={ITEM}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Cambiar contraseña
              </button>
              <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
              <form action={signOut}>
                <button type="submit" style={{ ...ITEM, color: '#ff6b6b' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Salir
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ── Editar perfil modal ─────────────────────────────────────── */}
      {modal === 'profile' && (
        <div style={OVERLAY} onClick={() => !isPending && setModal(null)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <div style={MODAL_HEAD}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: V }}>Editar Perfil</div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>Actualiza tu información</div>
              </div>
              <CloseBtn onClick={() => !isPending && setModal(null)} />
            </div>
            <form onSubmit={handleProfileSubmit}>
              <div style={MODAL_BODY}>
                {profileError && <div style={ERROR_BOX}>{profileError}</div>}
                <div className="form-group">
                  <label className="label">Correo electrónico</label>
                  <input type="email" className="input" value={email} disabled style={{ opacity: 0.45, cursor: 'not-allowed' }} />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="mm-name">Nombre *</label>
                  <input
                    id="mm-name" name="full_name" type="text" className="input"
                    value={name} onChange={e => setName(e.target.value)}
                    required disabled={!dataLoaded || isPending}
                    placeholder="Ej: Admin Principal"
                  />
                </div>
              </div>
              <div style={MODAL_FOOT}>
                <button type="button" onClick={() => setModal(null)} className="btn btn-outline" disabled={isPending}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isPending || !dataLoaded} style={{ background: V, borderColor: V }}>
                  {isPending ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Cambiar contraseña modal ────────────────────────────────── */}
      {modal === 'password' && (
        <div style={OVERLAY} onClick={() => !isPending && setModal(null)}>
          <div style={{ ...MODAL, maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div style={MODAL_HEAD}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: V }}>Cambiar Contraseña</div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>Elige una contraseña segura</div>
              </div>
              <CloseBtn onClick={() => !isPending && setModal(null)} />
            </div>
            <form onSubmit={handlePasswordSubmit}>
              <div style={MODAL_BODY}>
                {passwordError && <div style={ERROR_BOX}>{passwordError}</div>}
                <div className="form-group">
                  <label className="label" htmlFor="mpw-new">Nueva contraseña</label>
                  <input id="mpw-new" name="password" type="password" className="input" required minLength={8} placeholder="Mínimo 8 caracteres" autoComplete="new-password" disabled={isPending} />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="mpw-confirm">Confirmar contraseña</label>
                  <input id="mpw-confirm" name="confirm" type="password" className="input" required minLength={8} placeholder="Repite la nueva contraseña" autoComplete="new-password" disabled={isPending} />
                </div>
              </div>
              <div style={MODAL_FOOT}>
                <button type="button" onClick={() => setModal(null)} className="btn btn-outline" disabled={isPending}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isPending} style={{ background: V, borderColor: V }}>
                  {isPending ? 'Actualizando...' : 'Actualizar contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────── */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: '28px', right: '28px', zIndex: 3000,
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '13px 18px',
          background: 'var(--bg-elevated)',
          border: `1px solid rgba(83,74,183,0.35)`,
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          fontSize: '14px', fontWeight: 500, color: 'var(--fg-base)',
          pointerEvents: 'none',
          transform: toastVisible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          opacity: toastVisible ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
        }}>
          <span style={{ width: 22, height: 22, background: V, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          {toastMsg}
        </div>
      )}
    </>
  );
}
