'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { createStudentModal } from '@/actions/students';
import PhoneField from '@/components/PhoneField';

interface Goal { id: string; label: string; }

interface SuccessData {
  name: string;
  email: string | null;
  emailError?: string;
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(4px)',
  zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '16px',
};

const MODAL: React.CSSProperties = {
  width: '100%', maxWidth: '520px',
  background: '#0d0d0f',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
  maxHeight: '92dvh',
  overflowY: 'auto',
};

const MODAL_HEAD: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '20px 24px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  position: 'sticky', top: 0,
  background: '#0d0d0f',
  zIndex: 1,
};

const MODAL_BODY: React.CSSProperties = {
  padding: '24px',
  display: 'flex', flexDirection: 'column', gap: '20px',
};

const MODAL_FOOT: React.CSSProperties = {
  padding: '16px 24px',
  paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
  borderTop: '1px solid rgba(255,255,255,0.08)',
  display: 'flex', gap: '10px', justifyContent: 'flex-end',
  background: 'rgba(0,0,0,0.3)',
  position: 'sticky', bottom: 0,
};

const ERROR_BOX: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(255,80,80,0.1)',
  border: '1px solid rgba(255,80,80,0.3)',
  borderRadius: '6px', fontSize: '13px', color: '#ff6b6b',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  marginBottom: '12px',
};

export default function NewStudentModal() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [comboGoal, setComboGoal] = useState('');
  const [phoneValue, setPhoneValue] = useState('');
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [countdown, setCountdown] = useState(100);
  const router = useRouter();

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'
  ), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (successData) { setSuccessData(null); setOpen(false); }
      else if (!isPending) setOpen(false);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [successData, isPending]);

  useEffect(() => {
    if (!open) return;
    supabase.from('goals').select('id, label').order('sort_order').then(({ data }) => {
      setGoals(data ?? []);
    });
  }, [open, supabase]);

  useEffect(() => {
    if (!successData) return;
    setCountdown(100);
    let current = 100;
    const step = 100 / 30;
    const interval = setInterval(() => {
      current = Math.max(0, current - step);
      setCountdown(current);
    }, 100);
    const timer = setTimeout(() => { setSuccessData(null); setOpen(false); }, 3000);
    return () => { clearInterval(interval); clearTimeout(timer); };
  }, [successData]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get('full_name') as string)?.trim();
    const email = (fd.get('email') as string)?.trim() || null;
    setError('');
    startTransition(async () => {
      const res = await createStudentModal(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        router.refresh();
        setSuccessData({ name, email, emailError: (res as any)?.emailError });
      }
    });
  }

  function openModal() {
    setError('');
    setSelectedGoals([]);
    setComboGoal('');
    setPhoneValue('');
    setSuccessData(null);
    setOpen(true);
  }

  function addGoal() {
    if (!comboGoal || selectedGoals.includes(comboGoal)) return;
    setSelectedGoals(prev => [...prev, comboGoal]);
    setComboGoal('');
  }

  function removeGoal(id: string) {
    setSelectedGoals(prev => prev.filter(g => g !== id));
  }

  return (
    <>
      <style>{`
        @keyframes drawCircle { to { stroke-dashoffset: 0; } }
        @keyframes drawCheck  { to { stroke-dashoffset: 0; } }
        @keyframes fadeScaleIn { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
      `}</style>

      <button className="btn btn-primary" onClick={openModal}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nuevo Alumno
      </button>

      {open && (
        <div
          style={OVERLAY}
          onClick={() => !isPending && (successData ? (setSuccessData(null), setOpen(false)) : setOpen(false))}
        >
          <div style={MODAL} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={MODAL_HEAD}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent)' }}>
                  {successData ? 'Alumno Creado' : 'Nuevo Alumno'}
                </div>
                {!successData && (
                  <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>
                    Completa la información del alumno
                  </div>
                )}
              </div>
              <button
                onClick={() => successData ? (setSuccessData(null), setOpen(false)) : (!isPending && setOpen(false))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px', display: 'flex' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {successData ? (
              /* ── Success screen ── */
              <div style={{
                padding: '44px 28px 36px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px',
                textAlign: 'center',
                animation: 'fadeScaleIn 0.3s ease',
              }}>

                {/* Animated circle + checkmark */}
                <div style={{ width: 80, height: 80 }}>
                  <svg viewBox="0 0 80 80" width="80" height="80" style={{ overflow: 'visible' }}>
                    <circle cx="40" cy="40" r="36" fill="rgba(63,248,200,0.06)" stroke="rgba(63,248,200,0.1)" strokeWidth="1.5" />
                    <circle
                      cx="40" cy="40" r="36"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                      strokeDasharray="226"
                      strokeDashoffset="226"
                      strokeLinecap="round"
                      transform="rotate(-90 40 40)"
                      style={{ animation: 'drawCircle 0.65s cubic-bezier(0.4,0,0.2,1) forwards' }}
                    />
                    <polyline
                      points="24,40 34,51 56,28"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="48"
                      strokeDashoffset="48"
                      style={{ animation: 'drawCheck 0.35s 0.5s cubic-bezier(0.4,0,0.2,1) forwards' }}
                    />
                  </svg>
                </div>

                {/* Name */}
                <div>
                  <div style={{
                    fontSize: '11px', fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--fg-muted)', marginBottom: '6px',
                  }}>
                    Alumno creado exitosamente
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--fg-base)' }}>
                    {successData.name}
                  </div>
                </div>

                {/* Email sent */}
                {successData.email && !successData.emailError && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px',
                    background: 'rgba(63,248,200,0.06)',
                    border: '1px solid rgba(63,248,200,0.2)',
                    borderRadius: '8px',
                    width: '100%', boxSizing: 'border-box',
                    textAlign: 'left',
                  }}>
                    <span style={{
                      width: '32px', height: '32px', flexShrink: 0,
                      background: 'rgba(63,248,200,0.12)', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    </span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>Invitación enviada</div>
                      <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '1px' }}>{successData.email}</div>
                    </div>
                  </div>
                )}

                {/* No email */}
                {!successData.email && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    width: '100%', boxSizing: 'border-box',
                    textAlign: 'left',
                  }}>
                    <span style={{
                      width: '32px', height: '32px', flexShrink: 0,
                      background: 'rgba(255,255,255,0.06)', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                    </span>
                    <div style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>
                      Sin email registrado — no se envió invitación
                    </div>
                  </div>
                )}

                {/* Email error */}
                {successData.emailError && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px',
                    background: 'rgba(255,80,80,0.06)',
                    border: '1px solid rgba(255,80,80,0.2)',
                    borderRadius: '8px',
                    width: '100%', boxSizing: 'border-box',
                    textAlign: 'left',
                  }}>
                    <span style={{
                      width: '32px', height: '32px', flexShrink: 0,
                      background: 'rgba(255,80,80,0.1)', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                    </span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#ff6b6b' }}>Error al enviar invitación</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,107,107,0.7)', marginTop: '1px' }}>{successData.emailError}</div>
                    </div>
                  </div>
                )}

                {/* Auto-close progress bar + close button */}
                <div style={{ width: '100%', paddingTop: '4px' }}>
                  <div style={{
                    height: '2px', background: 'rgba(255,255,255,0.06)',
                    borderRadius: '1px', overflow: 'hidden', marginBottom: '14px',
                  }}>
                    <div style={{
                      height: '100%', background: 'var(--accent)',
                      width: `${countdown}%`,
                      transition: 'width 0.1s linear',
                    }} />
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => { setSuccessData(null); setOpen(false); }}
                    style={{ width: '100%' }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleSubmit}>
                <div style={MODAL_BODY}>
                  {error && <div style={ERROR_BOX}>{error}</div>}

                  <div>
                    <div style={SECTION_TITLE}>Información Personal</div>
                    <div className="form-group" style={{ marginBottom: '14px' }}>
                      <label className="label" htmlFor="ns-name">Nombre Completo *</label>
                      <input
                        id="ns-name" name="full_name" type="text"
                        className="input" required
                        placeholder="Ej: Juan Pérez García"
                        disabled={isPending}
                      />
                    </div>
                    <div className="form-row" style={{ marginBottom: '14px' }}>
                      <div className="form-group">
                        <label className="label" htmlFor="ns-email">Email</label>
                        <input id="ns-email" name="email" type="email" className="input" placeholder="correo@ejemplo.com" disabled={isPending} />
                      </div>
                      <div className="form-group">
                        <label className="label" htmlFor="ns-phone">Celular</label>
                        <PhoneField id="ns-phone" value={phoneValue} onChange={setPhoneValue} disabled={isPending} />
                        <input type="hidden" name="phone" value={phoneValue} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="label" htmlFor="ns-birth">Fecha de Nacimiento</label>
                        <input id="ns-birth" name="birth_date" type="date" className="input" disabled={isPending} />
                      </div>
                      <div className="form-group">
                        <label className="label" htmlFor="ns-level">Nivel de Experiencia</label>
                        <select id="ns-level" name="experience_level" className="select" disabled={isPending}>
                          <option value="">Seleccionar...</option>
                          <option value="beginner">Principiante</option>
                          <option value="intermediate">Intermedio</option>
                          <option value="advanced">Avanzado</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={SECTION_TITLE}>Objetivos de Entrenamiento</div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: selectedGoals.length > 0 ? '10px' : 0 }}>
                      <select
                        className="select"
                        style={{ flex: 1 }}
                        value={comboGoal}
                        onChange={e => setComboGoal(e.target.value)}
                        disabled={isPending || goals.length === 0}
                      >
                        <option value="">{goals.length === 0 ? 'Cargando...' : 'Seleccionar objetivo...'}</option>
                        {goals.filter(g => !selectedGoals.includes(g.id)).map(g => (
                          <option key={g.id} value={g.id}>{g.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={addGoal}
                        disabled={!comboGoal || isPending}
                        style={{
                          flexShrink: 0, width: '38px', height: '38px',
                          background: comboGoal ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                          border: '1px solid ' + (comboGoal ? 'var(--accent)' : 'rgba(255,255,255,0.12)'),
                          borderRadius: 'var(--radius-sm)', cursor: comboGoal ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.2s, border-color 0.2s',
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke={comboGoal ? '#000' : 'var(--fg-muted)'} strokeWidth="2.5" strokeLinecap="round" style={{ width: '16px', height: '16px' }}>
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </button>
                    </div>
                    {selectedGoals.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {selectedGoals.map(id => {
                          const label = goals.find(g => g.id === id)?.label ?? id;
                          return (
                            <span key={id} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              padding: '4px 10px', borderRadius: '20px',
                              background: 'rgba(63,248,200,0.1)',
                              border: '1px solid rgba(63,248,200,0.3)',
                              fontSize: '12px', color: 'var(--accent)', fontWeight: 500,
                            }}>
                              {label}
                              <input type="hidden" name="goals" value={id} />
                              <button
                                type="button"
                                onClick={() => removeGoal(id)}
                                disabled={isPending}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--accent)', opacity: 0.7, lineHeight: 1 }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: '12px', height: '12px' }}>
                                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={SECTION_TITLE}>Equipamiento Disponible</div>
                    <div className="radio-group">
                      <label className="radio-label">
                        <input type="radio" name="available_equipment" value="full_gym" disabled={isPending} />
                        <span>Gym Completo</span>
                      </label>
                      <label className="radio-label">
                        <input type="radio" name="available_equipment" value="home_basic" disabled={isPending} />
                        <span>Gym Básico (Casa)</span>
                      </label>
                      <label className="radio-label">
                        <input type="radio" name="available_equipment" value="bodyweight" disabled={isPending} />
                        <span>Solo Peso Corporal</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div style={MODAL_FOOT}>
                  <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} disabled={isPending}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isPending}>
                    {isPending ? 'Creando...' : 'Crear Alumno'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
