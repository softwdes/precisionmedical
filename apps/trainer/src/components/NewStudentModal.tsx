'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStudentModal } from '@/actions';

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
  const router = useRouter();

  // Toast state
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const show = setTimeout(() => setToastVisible(true), 10);
    const hide = setTimeout(() => setToastVisible(false), 3400);
    const clear = setTimeout(() => setToastMsg(''), 3750);
    return () => { clearTimeout(show); clearTimeout(hide); clearTimeout(clear); };
  }, [toastMsg]);

  function showToast(msg: string) {
    setToastVisible(false);
    setToastMsg('');
    setTimeout(() => setToastMsg(msg), 20);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError('');
    startTransition(async () => {
      const res = await createStudentModal(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        router.refresh();
        showToast('Alumno creado correctamente');
      }
    });
  }

  function openModal() {
    setError('');
    setOpen(true);
  }

  return (
    <>
      <button className="btn btn-primary" onClick={openModal}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nuevo Alumno
      </button>

      {open && (
        <div style={OVERLAY} onClick={() => !isPending && setOpen(false)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <div style={MODAL_HEAD}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent)' }}>Nuevo Alumno</div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>Completa la información del alumno</div>
              </div>
              <button
                onClick={() => !isPending && setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px', display: 'flex' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

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
                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input type="checkbox" name="goals" value="hypertrophia" disabled={isPending} />
                      <span>Hipertrofia</span>
                    </label>
                    <label className="checkbox-label">
                      <input type="checkbox" name="goals" value="strength" disabled={isPending} />
                      <span>Fuerza</span>
                    </label>
                    <label className="checkbox-label">
                      <input type="checkbox" name="goals" value="fat_loss" disabled={isPending} />
                      <span>Pérdida de Grasa</span>
                    </label>
                    <label className="checkbox-label">
                      <input type="checkbox" name="goals" value="endurance" disabled={isPending} />
                      <span>Resistencia</span>
                    </label>
                  </div>
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
          </div>
        </div>
      )}

      {toastMsg && (
        <div style={{
          position: 'fixed',
          bottom: '28px', right: '28px',
          zIndex: 3000,
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '13px 18px',
          background: 'var(--bg-elevated)',
          border: '1px solid rgba(63,248,200,0.35)',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          fontSize: '14px', fontWeight: 500,
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
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--bg-base)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          {toastMsg}
        </div>
      )}
    </>
  );
}
