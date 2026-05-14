'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { EditIcon, DeleteIcon, XIcon } from '@/components/Icons';

interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  focus_type: string | null;
  equipment: string | null;
  nivel_dificultad: number | null;
  url_video: string | null;
  activo: boolean | null;
}

const MUSCLE_COLORS: Record<string, string> = {
  'Pecho':     '#a78bfa',
  'Espalda':   '#60a5fa',
  'Hombros':   '#38bdf8',
  'Bíceps':    '#34d399',
  'Tríceps':   '#fb923c',
  'Piernas':   '#facc15',
  'Glúteos':   '#f472b6',
  'Core':      '#f87171',
  'Cardio':    '#3FF8C8',
  'Full Body': '#94a3b8',
};

const TIPO_COLORS: Record<string, string> = {
  'Fuerza':    'var(--accent)',
  'Cardio':    '#f97316',
  'Movilidad': '#60a5fa',
};

const GRUPOS = ['Pecho','Espalda','Hombros','Bíceps','Tríceps','Piernas','Glúteos','Core','Cardio','Full Body'];
const TIPOS  = ['Fuerza','Cardio','Movilidad'];

const EMPTY_FORM = {
  name: '', muscle_group: '', focus_type: 'Fuerza', equipment: '',
  nivel_dificultad: 2, url_video: '',
};

// ── CONFIRM DELETE ─────────────────────────────────────────────
function ConfirmDelete({ label, onClose, onConfirm }: {
  label: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid #f87171',
          borderRadius: 'var(--radius)',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 24px 64px rgba(248,113,113,0.2)',
        }}
      >
        <div style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
            <div style={{
              flexShrink: 0, width: 40, height: 40,
              borderRadius: '50%', background: 'rgba(248,113,113,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" style={{ width: 20, height: 20 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm)', color: 'var(--fg-strong)', marginBottom: 'var(--space-2)' }}>
                ¿Eliminar ejercicio?
              </p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                Estás a punto de eliminar <strong style={{ color: 'var(--fg)' }}>{label}</strong>. Esta acción no se puede deshacer.
              </p>
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--border)',
        }}>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button
            onClick={onConfirm}
            style={{
              padding: '0 var(--space-5)', height: '38px',
              background: '#dc2626', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-sans)', fontWeight: 'var(--weight-bold)',
              fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wider)',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EDIT MODAL ─────────────────────────────────────────────────
function EditModal({ exercise, onClose, onSave, saving, error }: {
  exercise: Exercise;
  onClose: () => void;
  onSave: (form: typeof EMPTY_FORM) => void;
  saving: boolean;
  error: string;
}) {
  const [form, setForm] = useState({
    name: exercise.name,
    muscle_group: exercise.muscle_group ?? '',
    focus_type: exercise.focus_type ?? 'Fuerza',
    equipment: exercise.equipment ?? '',
    nivel_dificultad: exercise.nivel_dificultad ?? 2,
    url_video: exercise.url_video ?? '',
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Enter' && !e.shiftKey && !(e.target instanceof HTMLTextAreaElement) && !saving) onSave(form);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onSave, saving, form]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--space-5) var(--space-6)',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--fg-strong)' }}>
            Editar Ejercicio
          </span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><XIcon /></button>
        </div>

        <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Nombre del ejercicio *</label>
              <input className="input" autoFocus value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Grupo muscular *</label>
              <select className="select" value={form.muscle_group}
                onChange={e => setForm(p => ({ ...p, muscle_group: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Tipo</label>
              <select className="select" value={form.focus_type}
                onChange={e => setForm(p => ({ ...p, focus_type: e.target.value }))}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Dificultad (1–5)</label>
              <select className="select" value={form.nivel_dificultad}
                onChange={e => setForm(p => ({ ...p, nivel_dificultad: parseInt(e.target.value) }))}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Equipamiento</label>
              <input className="input" placeholder="Barra, banco, mancuernas..."
                value={form.equipment} onChange={e => setForm(p => ({ ...p, equipment: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="label">URL Video (opcional)</label>
            <input className="input" placeholder="https://youtube.com/..."
              value={form.url_video} onChange={e => setForm(p => ({ ...p, url_video: e.target.value }))} />
          </div>
          {error && (
            <p style={{ fontSize: 'var(--text-xs)', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>
              {error}
            </p>
          )}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--border)',
        }}>
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DISPLAY COMPONENTS ────────────────────────────────────────
function Stars({ n }: { n: number }) {
  return (
    <span style={{ display: 'flex', gap: '2px' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ fontSize: '11px', color: i < n ? '#fbbf24' : 'var(--border-strong)' }}>★</span>
      ))}
    </span>
  );
}

function MuscleTag({ group }: { group: string }) {
  const color = MUSCLE_COLORS[group] ?? '#94a3b8';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '2px',
      background: `${color}20`, color, border: `1px solid ${color}40`,
      fontSize: 'var(--text-2xs)', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.06em',
      whiteSpace: 'nowrap',
    }}>
      {group}
    </span>
  );
}

function TipoTag({ tipo }: { tipo: string }) {
  const color = TIPO_COLORS[tipo] ?? 'var(--fg-muted)';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '2px',
      background: `${color}15`, color,
      fontSize: 'var(--text-2xs)', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {tipo}
    </span>
  );
}

// ── MAIN MODULE ───────────────────────────────────────────────
export default function EjerciciosModule({ initialExercises }: { initialExercises?: Exercise[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'
  ), []);

  const [exercises, setExercises] = useState<Exercise[]>(initialExercises ?? []);
  const [loadingInitial, setLoadingInitial] = useState(!initialExercises);

  useEffect(() => {
    if (initialExercises) return;
    supabase
      .from('exercises')
      .select('id, name, muscle_group, focus_type, equipment, nivel_dificultad, url_video, activo')
      .eq('activo', true)
      .order('muscle_group')
      .order('name')
      .then(({ data }) => {
        if (data) setExercises(data as Exercise[]);
        setLoadingInitial(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [search, setSearch] = useState('');
  const [filterGrupo, setFilterGrupo] = useState('');
  const [filterTipo, setFilterTipo]   = useState('');

  // Add modal
  const [showModal, setShowModal]     = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [formErr, setFormErr]         = useState('');

  // Edit modal
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [editErr, setEditErr]                 = useState('');
  const [editSaving, setEditSaving]           = useState(false);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<Exercise | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return exercises.filter(e =>
      (e.activo !== false) &&
      (!q || e.name.toLowerCase().includes(q)) &&
      (!filterGrupo || e.muscle_group === filterGrupo) &&
      (!filterTipo  || e.focus_type   === filterTipo)
    );
  }, [exercises, search, filterGrupo, filterTipo]);

  async function handleAdd() {
    if (!form.name.trim() || !form.muscle_group) { setFormErr('Nombre y grupo muscular son requeridos'); return; }
    setFormErr('');
    startTransition(async () => {
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          name: form.name.trim(),
          muscle_group: form.muscle_group,
          focus_type: form.focus_type,
          equipment: form.equipment || null,
          nivel_dificultad: form.nivel_dificultad,
          url_video: form.url_video || null,
          activo: true,
        })
        .select('id, name, muscle_group, focus_type, equipment, nivel_dificultad, url_video, activo')
        .single();
      if (error) { setFormErr(error.message); return; }
      if (data) setExercises(prev => [...prev, data as Exercise].sort((a, b) => a.name.localeCompare(b.name)));
      setShowModal(false);
      setForm(EMPTY_FORM);
      router.refresh();
    });
  }

  async function handleEdit(f: typeof EMPTY_FORM) {
    if (!f.name.trim() || !f.muscle_group) { setEditErr('Nombre y grupo muscular son requeridos'); return; }
    if (!editingExercise) return;
    setEditErr('');
    setEditSaving(true);
    const { data, error } = await supabase
      .from('exercises')
      .update({
        name: f.name.trim(),
        muscle_group: f.muscle_group,
        focus_type: f.focus_type,
        equipment: f.equipment || null,
        nivel_dificultad: f.nivel_dificultad,
        url_video: f.url_video || null,
      })
      .eq('id', editingExercise.id)
      .select('id, name, muscle_group, focus_type, equipment, nivel_dificultad, url_video, activo')
      .single();
    setEditSaving(false);
    if (error) { setEditErr(error.message); return; }
    if (data) setExercises(prev => prev.map(e => e.id === editingExercise.id ? data as Exercise : e));
    setEditingExercise(null);
    router.refresh();
  }

  async function handleDelete(ex: Exercise) {
    await supabase.from('exercises').update({ activo: false }).eq('id', ex.id);
    setExercises(prev => prev.filter(e => e.id !== ex.id));
    setConfirmDelete(null);
    router.refresh();
  }

  if (loadingInitial) return (
    <div className="card-body card-body--padded">
      <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>Cargando...</p>
    </div>
  );

  return (
    <div>
      {confirmDelete && (
        <ConfirmDelete
          label={confirmDelete.name}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}

      {editingExercise && (
        <EditModal
          exercise={editingExercise}
          onClose={() => { setEditingExercise(null); setEditErr(''); }}
          onSave={handleEdit}
          saving={editSaving}
          error={editErr}
        />
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <div style={{ flex: '1', minWidth: '220px' }}>
          <input
            className="input"
            placeholder="Buscar ejercicio..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => { setShowModal(true); setFormErr(''); setForm(EMPTY_FORM); }}>
          + Agregar Ejercicio
        </button>
      </div>

      {/* Filter pills — muscle group */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <button
          onClick={() => setFilterGrupo('')}
          style={{
            padding: '4px 12px', borderRadius: 'var(--radius-pill)', border: '1px solid',
            borderColor: !filterGrupo ? 'var(--accent)' : 'var(--border-strong)',
            background: !filterGrupo ? 'var(--accent-soft)' : 'transparent',
            color: !filterGrupo ? 'var(--accent)' : 'var(--fg-muted)',
            fontSize: 'var(--text-2xs)', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', cursor: 'pointer',
          }}
        >Todos</button>
        {GRUPOS.map(g => {
          const color = MUSCLE_COLORS[g] ?? '#94a3b8';
          const active = filterGrupo === g;
          return (
            <button
              key={g}
              onClick={() => setFilterGrupo(active ? '' : g)}
              style={{
                padding: '4px 12px', borderRadius: 'var(--radius-pill)', border: '1px solid',
                borderColor: active ? color : 'var(--border-strong)',
                background: active ? `${color}20` : 'transparent',
                color: active ? color : 'var(--fg-muted)',
                fontSize: 'var(--text-2xs)', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', cursor: 'pointer',
              }}
            >{g}</button>
          );
        })}
      </div>

      {/* Filter pills — tipo */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
        {TIPOS.map(t => {
          const color = TIPO_COLORS[t];
          const active = filterTipo === t;
          return (
            <button
              key={t}
              onClick={() => setFilterTipo(active ? '' : t)}
              style={{
                padding: '4px 12px', borderRadius: 'var(--radius-pill)', border: '1px solid',
                borderColor: active ? color : 'var(--border-strong)',
                background: active ? `${color}20` : 'transparent',
                color: active ? color : 'var(--fg-muted)',
                fontSize: 'var(--text-2xs)', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', cursor: 'pointer',
              }}
            >{t}</button>
          );
        })}
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-head">
          <div className="card-head-left">
            <div className="card-title">Directorio de Ejercicios</div>
            <div className="card-subtitle">{filtered.length} ejercicios</div>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              {search || filterGrupo || filterTipo ? 'Sin resultados para los filtros aplicados' : 'No hay ejercicios cargados'}
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Grupo Muscular</th>
                    <th>Tipo</th>
                    <th>Dificultad</th>
                    <th>Equipamiento</th>
                    <th style={{ width: 90 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(ex => (
                    <tr key={ex.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--fg-strong)' }}>{ex.name}</span>
                          {ex.url_video && (
                            <a href={ex.url_video} target="_blank" rel="noreferrer"
                               style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>
                              ▶ Ver video
                            </a>
                          )}
                        </div>
                      </td>
                      <td>{ex.muscle_group ? <MuscleTag group={ex.muscle_group} /> : '—'}</td>
                      <td>{ex.focus_type ? <TipoTag tipo={ex.focus_type} /> : '—'}</td>
                      <td><Stars n={ex.nivel_dificultad ?? 1} /></td>
                      <td style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', maxWidth: '200px' }}>
                        {ex.equipment ?? '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                          <button className="btn btn-ghost btn-icon" onClick={() => { setEditErr(''); setEditingExercise(ex); }} title="Editar"><EditIcon /></button>
                          <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(ex)} title="Eliminar"><DeleteIcon /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Agregar Ejercicio</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="label">Nombre del ejercicio *</label>
                  <input className="input" placeholder="Press de banca plano"
                    value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Grupo muscular *</label>
                  <select className="select" value={form.muscle_group}
                    onChange={e => setForm(p => ({ ...p, muscle_group: e.target.value }))}>
                    <option value="">— Seleccionar —</option>
                    {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Tipo</label>
                  <select className="select" value={form.focus_type}
                    onChange={e => setForm(p => ({ ...p, focus_type: e.target.value }))}>
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Dificultad (1–5)</label>
                  <select className="select" value={form.nivel_dificultad}
                    onChange={e => setForm(p => ({ ...p, nivel_dificultad: parseInt(e.target.value) }))}>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Equipamiento</label>
                  <input className="input" placeholder="Barra, banco, mancuernas..."
                    value={form.equipment} onChange={e => setForm(p => ({ ...p, equipment: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="label">URL Video (opcional)</label>
                <input className="input" placeholder="https://youtube.com/..."
                  value={form.url_video} onChange={e => setForm(p => ({ ...p, url_video: e.target.value }))} />
              </div>
              {formErr && (
                <p style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>{formErr}</p>
              )}
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleAdd} disabled={isPending}>
                  {isPending ? 'Guardando...' : 'Agregar Ejercicio'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
