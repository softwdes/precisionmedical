'use client';

import { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { signOut, updateTrainerProfile, updatePassword } from '@/actions/profile';
import { getTrainerPagos, type TrainerPago } from '@/actions/pagos';
import PlansModal from './PlansModal';
import { type Plan } from './PlanAlert';

type ModalType = 'profile' | 'password' | 'pagos' | null;

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
  width: '100%', maxWidth: '460px',
  background: '#0d0d0f',
  border: '1px solid var(--border)',
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

export default function UserMenu() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);

  // Profile data (shared between chip display and edit form)
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [email, setEmail] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [planNombre, setPlanNombre]         = useState('');
  const [planNombreRaw, setPlanNombreRaw]   = useState('');
  const [diasRestantes, setDiasRestantes]   = useState<number | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradePlanes, setUpgradePlanes]   = useState<Plan[]>([]);
  const [pagos, setPagos]                   = useState<TrainerPago[]>([]);
  const [pagosLoading, setPagosLoading]     = useState(false);

  // Form errors
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isPending, startTransition] = useTransition();

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), []);

  // Load profile on mount
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      const { data } = await supabase
        .from('trainers')
        .select('id, business_name, bio, specialties')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setName(data.business_name ?? '');
        setBio(data.bio ?? '');
        setSpecialties((data.specialties as string[] | null)?.join(', ') ?? '');

        const { data: sus } = await supabase
          .from('trainer_suscripciones')
          .select('estado, fecha_fin_trial, fecha_proximo_pago, planes_saas(nombre)')
          .eq('trainer_id', data.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sus) {
          const ps = sus.planes_saas as unknown as { nombre: string } | null;
          if (ps?.nombre) {
            setPlanNombreRaw(ps.nombre);
            const LABELS: Record<string, string> = { basico: 'Básico', vip: 'VIP', premium: 'Premium' };
            setPlanNombre(LABELS[ps.nombre] ?? ps.nombre);
          }
          const fechaRef = sus.fecha_proximo_pago ?? sus.fecha_fin_trial;
          if (fechaRef) {
            setDiasRestantes(Math.ceil((new Date(fechaRef).getTime() - Date.now()) / 86_400_000));
          }
        }
      }
      setDataLoaded(true);
    })();
  }, [supabase]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Close modal with Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // Toast animation lifecycle
  useEffect(() => {
    if (!toastMsg) return;
    const show = setTimeout(() => setToastVisible(true), 10);
    const hide = setTimeout(() => setToastVisible(false), 3400);
    const clear = setTimeout(() => setToastMsg(''), 3750);
    return () => { clearTimeout(show); clearTimeout(hide); clearTimeout(clear); };
  }, [toastMsg]);

  const initials = name
    ? name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
    : '?';

  function openModal(type: ModalType) {
    setDropdownOpen(false);
    setProfileError('');
    setPasswordError('');
    setModal(type);
  }

  async function openPagosModal() {
    setDropdownOpen(false);
    setModal('pagos');
    setPagosLoading(true);
    const data = await getTrainerPagos();
    setPagos(data);
    setPagosLoading(false);
  }

  async function openUpgradeModal() {
    setDropdownOpen(false);
    if (upgradePlanes.length === 0) {
      const { data } = await supabase
        .from('planes_saas')
        .select('id, nombre, precio_mensual, limite_alumnos, limite_ia_diario, incluye_metricas, incluye_whatsapp, incluye_soporte_prioritario')
        .eq('activo', true)
        .order('precio_mensual', { ascending: true });
      if (data) setUpgradePlanes(data as Plan[]);
    }
    setShowUpgradeModal(true);
  }

  function showToast(msg: string) {
    setToastVisible(false);
    setToastMsg('');
    // tiny delay lets the effect re-fire even for identical messages
    setTimeout(() => setToastMsg(msg), 20);
  }

  function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newName = ((fd.get('business_name') as string) ?? '').trim();
    const newBio  = (fd.get('bio') as string) ?? '';
    const newSpec = (fd.get('specialties') as string) ?? '';
    setProfileError('');
    startTransition(async () => {
      const res = await updateTrainerProfile(null, fd);
      if (res?.error) {
        setProfileError(res.error);
      } else {
        setName(newName);
        setBio(newBio);
        setSpecialties(newSpec);
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
      {/* ── Avatar chip + dropdown ──────────────────────────────────── */}
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
            <div className="user-name">
              {name || '...'}
              {planNombre && (
                <span style={{ color: 'var(--accent)', fontWeight: 400, marginLeft: '5px' }}>
                  · {planNombre}
                </span>
              )}
            </div>
            <div className="user-role">Personal Trainer</div>
          </div>
          <span className="user-avatar" style={{
            background: 'var(--accent)', color: 'var(--fg-on-accent)',
            fontWeight: 700, fontSize: '13px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {initials}
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
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg-base)' }}>{name || '...'}</div>
              <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '2px' }}>Personal Trainer</div>
              {planNombre && (
                <div style={{ marginTop: '7px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      background: 'rgba(63,248,200,0.1)', border: '1px solid rgba(63,248,200,0.22)',
                      color: 'var(--accent)', borderRadius: '3px', padding: '1px 6px',
                      fontWeight: 700, fontSize: '10px',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                    }}>
                      {planNombre}
                    </span>
                    {diasRestantes !== null && (
                      <span style={{
                        fontSize: '11px', fontWeight: 600,
                        color: diasRestantes <= 5 ? '#ef4444' : diasRestantes <= 15 ? '#EF9F27' : 'var(--status-paid)',
                      }}>
                        {diasRestantes > 0 ? `${diasRestantes} días` : 'Vencido'}
                      </span>
                    )}
                  </div>
                  {planNombreRaw && planNombreRaw !== 'premium' && (
                    <button
                      onClick={openUpgradeModal}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        marginTop: '7px', width: '100%',
                        background: 'rgba(63,248,200,0.07)', border: '1px solid rgba(63,248,200,0.2)',
                        borderRadius: '4px', padding: '5px 8px',
                        color: 'var(--accent)', fontFamily: 'var(--font-sans)',
                        fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="18 15 12 9 6 15"/>
                      </svg>
                      Ver planes disponibles
                    </button>
                  )}
                </div>
              )}
            </div>
            <div style={{ padding: '6px' }}>
              <button onClick={openPagosModal} style={ITEM}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="8" y1="13" x2="16" y2="13"/>
                  <line x1="8" y1="17" x2="16" y2="17"/>
                </svg>
                Mis Pagos
              </button>
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
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent)' }}>Editar Perfil</div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>Actualiza tu información</div>
              </div>
              <CloseBtn onClick={() => !isPending && setModal(null)} />
            </div>

            <form onSubmit={handleProfileSubmit}>
              <div style={MODAL_BODY}>
                {profileError && <div style={ERROR_BOX}>{profileError}</div>}

                <div className="form-group">
                  <label className="label">Correo electrónico</label>
                  <input
                    type="email" className="input" value={email}
                    disabled style={{ opacity: 0.45, cursor: 'not-allowed' }}
                  />
                </div>

                <div className="form-group">
                  <label className="label" htmlFor="pm-name">Nombre / Negocio *</label>
                  <input
                    id="pm-name" name="business_name" type="text"
                    className="input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    disabled={!dataLoaded || isPending}
                    placeholder="Ej: Coach Carlos Mendoza"
                  />
                </div>

                <div className="form-group">
                  <label className="label" htmlFor="pm-bio">Biografía</label>
                  <textarea
                    id="pm-bio" name="bio"
                    className="input"
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    rows={3}
                    disabled={!dataLoaded || isPending}
                    placeholder="Cuéntanos sobre ti y tu método..."
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div className="form-group">
                  <label className="label" htmlFor="pm-spec">Especialidades</label>
                  <input
                    id="pm-spec" name="specialties" type="text"
                    className="input"
                    value={specialties}
                    onChange={e => setSpecialties(e.target.value)}
                    disabled={!dataLoaded || isPending}
                    placeholder="Hipertrofia, Fuerza, Pérdida de grasa..."
                  />
                  <span style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '4px', display: 'block' }}>
                    Separadas por coma
                  </span>
                </div>
              </div>

              <div style={MODAL_FOOT}>
                <button type="button" onClick={() => setModal(null)} className="btn btn-outline" disabled={isPending}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isPending || !dataLoaded}>
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
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent)' }}>Cambiar Contraseña</div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>Elige una contraseña segura</div>
              </div>
              <CloseBtn onClick={() => !isPending && setModal(null)} />
            </div>

            <form onSubmit={handlePasswordSubmit}>
              <div style={MODAL_BODY}>
                {passwordError && <div style={ERROR_BOX}>{passwordError}</div>}

                <div className="form-group">
                  <label className="label" htmlFor="pw-new">Nueva contraseña</label>
                  <input
                    id="pw-new" name="password" type="password"
                    className="input"
                    required minLength={8}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    disabled={isPending}
                  />
                </div>

                <div className="form-group">
                  <label className="label" htmlFor="pw-confirm">Confirmar contraseña</label>
                  <input
                    id="pw-confirm" name="confirm" type="password"
                    className="input"
                    required minLength={8}
                    placeholder="Repite la nueva contraseña"
                    autoComplete="new-password"
                    disabled={isPending}
                  />
                </div>
              </div>

              <div style={MODAL_FOOT}>
                <button type="button" onClick={() => setModal(null)} className="btn btn-outline" disabled={isPending}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? 'Actualizando...' : 'Actualizar contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Mis Pagos modal ────────────────────────────────────────── */}
      {modal === 'pagos' && (
        <div style={OVERLAY} onClick={() => setModal(null)}>
          <div style={{ ...MODAL, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div style={MODAL_HEAD}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent)' }}>Mis Pagos</div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>Historial de suscripción</div>
              </div>
              <CloseBtn onClick={() => setModal(null)} />
            </div>

            <div style={{ padding: '8px 24px 24px' }}>
              {pagosLoading ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--fg-muted)', fontSize: '13px' }}>
                  Cargando historial...
                </div>
              ) : pagos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 0' }}>
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--fg-subtle)" strokeWidth="1.5" strokeLinecap="round" style={{ margin: '0 auto 12px', display: 'block' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="8" y1="13" x2="16" y2="13"/>
                    <line x1="8" y1="17" x2="16" y2="17"/>
                  </svg>
                  <div style={{ fontSize: '13px', color: 'var(--fg-muted)', marginBottom: '4px' }}>Sin pagos registrados</div>
                  <div style={{ fontSize: '11px', color: 'var(--fg-subtle)' }}>Los pagos son registrados por el administrador</div>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 10px', marginBottom: '2px',
                    fontSize: '10px', fontWeight: 700, color: 'var(--fg-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    <span style={{ width: '88px' }}>Período</span>
                    <span style={{ flex: 1 }}>Plan</span>
                    <span style={{ width: '48px', textAlign: 'right' }}>Monto</span>
                    <span style={{ width: '78px', textAlign: 'right' }}>Estado</span>
                  </div>

                  {/* Rows */}
                  {pagos.map(p => {
                    const PLAN_LABELS: Record<string, string> = { basico: 'Básico', vip: 'VIP', premium: 'Premium' };
                    const planNombrePago = (p.planes_saas as { nombre: string } | null)?.nombre ?? '';
                    const planLabel = PLAN_LABELS[planNombrePago] ?? '—';
                    const [yr, mo] = p.periodo.split('-');
                    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                    const periodoLabel = p.frecuencia === 'anual'
                      ? `Anual ${yr}`
                      : mo && yr ? `${MESES[parseInt(mo, 10) - 1]} ${yr}` : p.periodo;
                    const estadoColor = p.estado === 'pagado' ? 'var(--status-paid)' : p.estado === 'pendiente' ? '#EF9F27' : '#ef4444';
                    const estadoBg    = p.estado === 'pagado' ? 'rgba(29,158,117,0.12)' : p.estado === 'pendiente' ? 'rgba(239,159,39,0.12)' : 'rgba(239,68,68,0.12)';
                    const estadoLabel = p.estado === 'pagado' ? 'Pagado' : p.estado === 'pendiente' ? 'Pendiente' : 'Vencido';

                    return (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 10px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <span style={{ width: '88px', fontSize: '13px', color: 'var(--fg)', fontWeight: 500 }}>
                          {periodoLabel}
                        </span>
                        <span style={{ flex: 1, fontSize: '12px', color: 'var(--fg-muted)' }}>
                          {planLabel}
                        </span>
                        <span style={{ width: '48px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>
                          ${p.monto}
                        </span>
                        <div style={{ width: '78px', display: 'flex', justifyContent: 'flex-end' }}>
                          <span style={{
                            background: estadoBg, color: estadoColor,
                            borderRadius: '3px', padding: '2px 7px',
                            fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                            whiteSpace: 'nowrap',
                          }}>
                            {estadoLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade plans modal ────────────────────────────────────── */}
      {showUpgradeModal && upgradePlanes.length > 0 && (
        <PlansModal
          plans={upgradePlanes}
          planActualNombre={planNombreRaw}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      {/* ── Toast ──────────────────────────────────────────────────── */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          bottom: '28px',
          right: '28px',
          zIndex: 3000,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '13px 18px',
          background: 'var(--bg-elevated)',
          border: '1px solid rgba(63,248,200,0.35)',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--fg-base)',
          pointerEvents: 'none',
          transform: toastVisible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          opacity: toastVisible ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
        }}>
          <span style={{
            width: '22px', height: '22px',
            background: 'var(--accent)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-on-accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          {toastMsg}
        </div>
      )}
    </>
  );
}
