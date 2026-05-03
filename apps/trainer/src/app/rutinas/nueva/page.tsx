'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createRoutineTemplate } from '@/actions/routines';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';

interface Exercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  rpe: number;
  technique_cues: string[];
  alternatives: string[];
}

const DEFAULT_EXERCISE: Exercise = {
  name: '', sets: 3, reps: '8-12', rest_seconds: 90, rpe: 7, technique_cues: [], alternatives: [],
};

export default function NewRoutinePage() {
  const [exercises, setExercises] = useState<Exercise[]>([{ ...DEFAULT_EXERCISE }]);

  const addExercise = () => setExercises(prev => [...prev, { ...DEFAULT_EXERCISE }]);

  const removeExercise = (index: number) =>
    setExercises(prev => prev.filter((_, i) => i !== index));

  const updateExercise = (index: number, field: keyof Exercise, value: any) =>
    setExercises(prev => {
      const updated = [...prev];
      (updated[index] as any)[field] = value;
      return updated;
    });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('payload', JSON.stringify({ exercises }));
    createRoutineTemplate(formData);
  };

  return (
    <div className="app">
      <AppSidebar active="rutinas" />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span>
            <Link href="/rutinas" className="crumb">Rutinas</Link> <span className="sep">//</span>
            <span className="crumb-active">Nueva Plantilla</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Protocolo // 01</span>
            <h1>Nueva Plantilla de Rutina</h1>
          </section>

          <form onSubmit={handleSubmit}>
            <div className="card" style={{ maxWidth: '900px', marginBottom: 'var(--space-6)' }}>
              <div className="card-body card-body--padded">
                <div className="form-section">
                  <h3 className="form-section-title">Información de la Rutina</h3>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="label" htmlFor="name">Nombre de la Rutina *</label>
                      <input type="text" id="name" name="name" className="input" required placeholder="Ej: Día 1 - Empuje" />
                    </div>
                    <div className="form-group">
                      <label className="label" htmlFor="goal">Objetivo</label>
                      <select id="goal" name="goal" className="select">
                        <option value="">Seleccionar...</option>
                        <option value="hypertrophy">Hipertrofia</option>
                        <option value="strength">Fuerza</option>
                        <option value="fat_loss">Pérdida de Grasa</option>
                        <option value="endurance">Resistencia</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="label" htmlFor="weeks">Duración (semanas)</label>
                      <input type="number" id="weeks" name="weeks" className="input" defaultValue="4" min="1" max="52" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="row-between" style={{ marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--text-xl)' }}>Ejercicios</h2>
              <button type="button" onClick={addExercise} className="btn btn-outline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Agregar Ejercicio
              </button>
            </div>

            <div className="exercises-list">
              {exercises.map((exercise, index) => (
                <div key={index} className="card exercise-card">
                  <div className="card-head">
                    <div className="card-head-left">
                      <div className="card-title">Ejercicio {index + 1}</div>
                    </div>
                    {exercises.length > 1 && (
                      <button type="button" onClick={() => removeExercise(index)} className="btn btn-ghost btn-icon" title="Eliminar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    )}
                  </div>
                  <div className="card-body card-body--padded">
                    <div className="form-group">
                      <label className="label">Nombre del Ejercicio *</label>
                      <input
                        type="text" className="input"
                        value={exercise.name}
                        onChange={(e) => updateExercise(index, 'name', e.target.value)}
                        placeholder="Ej: Press de banca con barra"
                        required
                      />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="label">Series</label>
                        <input type="number" className="input" value={exercise.sets}
                          onChange={(e) => updateExercise(index, 'sets', parseInt(e.target.value))} min="1" max="10" />
                      </div>
                      <div className="form-group">
                        <label className="label">Repeticiones</label>
                        <input type="text" className="input" value={exercise.reps}
                          onChange={(e) => updateExercise(index, 'reps', e.target.value)} placeholder="8-12" />
                      </div>
                      <div className="form-group">
                        <label className="label">Descanso (seg)</label>
                        <input type="number" className="input" value={exercise.rest_seconds}
                          onChange={(e) => updateExercise(index, 'rest_seconds', parseInt(e.target.value))} min="0" max="300" />
                      </div>
                      <div className="form-group">
                        <label className="label">RPE (1-10)</label>
                        <input type="number" className="input" value={exercise.rpe}
                          onChange={(e) => updateExercise(index, 'rpe', parseInt(e.target.value))} min="1" max="10" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="form-actions" style={{ marginTop: 'var(--space-6)' }}>
              <Link href="/rutinas" className="btn btn-outline">Cancelar</Link>
              <button type="submit" className="btn btn-primary">Crear Plantilla</button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
