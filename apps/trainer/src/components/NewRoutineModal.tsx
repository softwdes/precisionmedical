'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { createRoutineTemplateModal } from '@/actions';

interface Goal { id: string; label: string; }

interface Exercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  rpe: number;
}

const DEFAULT_EXERCISE: Exercise = {
  name: '', sets: 3, reps: '8-12', rest_seconds: 90, rpe: 7,
};

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#000',
  zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
};
const MODAL: React.CSSProperties = {
  width: '100%', maxWidth: '700px', background: '#0d0d0f',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
  overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
  maxHeight: '92dvh', overflowY: 'auto',
};
const MODAL_HEAD: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
  position: 'sticky', top: 0, background: '#0d0d0f', zIndex: 1,
};
const MODAL_BODY: React.CSSProperties = {
  padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px',
};
const MODAL_FOOT: React.CSSProperties = {
  padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)',
  display: 'flex', gap: '10px', justifyContent: 'flex-end',
  background: 'rgba(0,0,0,0.3)', position: 'sticky', bottom: 0,
};
const SECTION_TITLE: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '12px',
};
const ERROR_BOX: React.CSSProperties = {
  padding: '10px 14px', background: 'rgba(255,80,80,0.1)',
  border: '1px solid rgba(255,80,80,0.3)', borderRadius: '6px', fontSize: '13px', color: '#ff6b6b',
};
const EXERCISE_CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', padding: '16px',
};

interface Props { label?: string; className?: string; }

export default function NewRoutineModal({ label = 'Nueva Plantilla', className = 'btn btn-primary' }: Props) {
  const [open, setOpen] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([{ ...DEFAULT_EXERCISE }]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isPending) setOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isPending]);

  useEffect(() => {
    if (!open) return;
    supabase.from('goals').select('id, label').order('sort_order').then(({ data }) => {
      setGoals(data ?? []);
    });
  }, [open, supabase]);

  function openModal() {
    setExercises([{ ...DEFAULT_EXERCISE }]);
    setError('');
    setOpen(true);
  }

  function addExercise() {
    setExercises(prev => [...prev, { ...DEFAULT_EXERCISE }]);
  }

  function removeExercise(i: number) {
    setExercises(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateExercise(i: number, field: keyof Exercise, value: string | number) {
    setExercises(prev => {
      const next = [...prev];
      (next[i] as any)[field] = value;
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('payload', JSON.stringify({ exercises }));
    setError('');
    startTransition(async () => {
      const res = await createRoutineTemplateModal(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button className={className} onClick={openModal}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {label}
      </button>

      {open && (
        <div style={OVERLAY} onClick={() => !isPending && setOpen(false)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <div style={MODAL_HEAD}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent)' }}>Nueva Plantilla de Rutina</div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>Completa la información de la rutina</div>
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

                {/* Información de la rutina */}
                <div>
                  <div style={SECTION_TITLE}>Información de la Rutina</div>
                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label className="label" htmlFor="nr-name">Nombre de la Rutina *</label>
                    <input
                      id="nr-name" name="name" type="text" className="input" required
                      placeholder="Ej: Día 1 - Empuje"
                      disabled={isPending}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="label" htmlFor="nr-goal">Objetivo</label>
                      <select id="nr-goal" name="goal" className="select" disabled={isPending || goals.length === 0}>
                        <option value="">{goals.length === 0 ? 'Cargando...' : 'Seleccionar...'}</option>
                        {goals.map(g => (
                          <option key={g.id} value={g.id}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="label" htmlFor="nr-weeks">Duración (semanas)</label>
                      <input
                        id="nr-weeks" name="weeks" type="number" className="input"
                        defaultValue={4} min={1} max={52}
                        disabled={isPending}
                      />
                    </div>
                  </div>
                </div>

                {/* Ejercicios */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={SECTION_TITLE}>Ejercicios</div>
                    <button
                      type="button"
                      onClick={addExercise}
                      disabled={isPending}
                      className="btn btn-outline"
                      style={{ fontSize: '12px', padding: '0 12px', height: '30px' }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: '13px', height: '13px' }}>
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Agregar
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {exercises.map((ex, i) => (
                      <div key={i} style={EXERCISE_CARD}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Ejercicio {i + 1}
                          </span>
                          {exercises.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeExercise(i)}
                              disabled={isPending}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '2px', display: 'flex' }}
                              title="Eliminar"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                              </svg>
                            </button>
                          )}
                        </div>

                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label className="label">Nombre del Ejercicio *</label>
                          <input
                            type="text" className="input" required
                            value={ex.name}
                            onChange={e => updateExercise(i, 'name', e.target.value)}
                            placeholder="Ej: Press de banca con barra"
                            disabled={isPending}
                          />
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label className="label">Series</label>
                            <input
                              type="number" className="input"
                              value={ex.sets} min={1} max={10}
                              onChange={e => updateExercise(i, 'sets', parseInt(e.target.value))}
                              disabled={isPending}
                            />
                          </div>
                          <div className="form-group">
                            <label className="label">Repeticiones</label>
                            <input
                              type="text" className="input"
                              value={ex.reps}
                              onChange={e => updateExercise(i, 'reps', e.target.value)}
                              placeholder="8-12"
                              disabled={isPending}
                            />
                          </div>
                          <div className="form-group">
                            <label className="label">Descanso (seg)</label>
                            <input
                              type="number" className="input"
                              value={ex.rest_seconds} min={0} max={600}
                              onChange={e => updateExercise(i, 'rest_seconds', parseInt(e.target.value))}
                              disabled={isPending}
                            />
                          </div>
                          <div className="form-group">
                            <label className="label">RPE</label>
                            <input
                              type="number" className="input"
                              value={ex.rpe} min={1} max={10}
                              onChange={e => updateExercise(i, 'rpe', parseInt(e.target.value))}
                              disabled={isPending}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={MODAL_FOOT}>
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} disabled={isPending}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? 'Creando...' : 'Crear Plantilla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
