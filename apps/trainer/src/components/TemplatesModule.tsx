'use client';

import { useState, useMemo, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { getRutinaTemplates, createRutinaTemplate, deleteRutinaTemplate, getRutinaTemplateDetail, updateRutinaTemplate } from '@/actions/rutinas';
import type { RutinaTemplateRow } from '@/actions/rutinas';

// ── Types ─────────────────────────────────────────────────────
interface Ejercicio { id: string; name: string; muscle_group: string | null; }

interface ExForm {
  _id: string; ejercicio_id: string; sets: number;
  reps: string; descanso_seg: number; notas: string;
}
interface DayForm { _id: string; nombre: string; ejercicios: ExForm[]; }
interface TplForm {
  nombre: string; nivel: string; dias_semana: number; duracion_semanas: number;
  objetivo: string; descripcion: string; dias: DayForm[];
}

// ── Helpers ───────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const newEx = (): ExForm => ({ _id: uid(), ejercicio_id: '', sets: 3, reps: '8-12', descanso_seg: 90, notas: '' });
const newDay = (n: number): DayForm => ({ _id: uid(), nombre: `Día ${n}`, ejercicios: [newEx()] });
const defaultTplForm = (): TplForm => ({
  nombre: '', nivel: '', dias_semana: 3, duracion_semanas: 4,
  objetivo: '', descripcion: '', dias: [newDay(1)],
});

const NIVELES = ['Principiante', 'Intermedio', 'Avanzado'];
const OBJETIVOS = ['Hipertrofia', 'Fuerza máxima', 'Pérdida de peso', 'Tonificación', 'Resistencia'];

// ── Shared styles ─────────────────────────────────────────────
const SECTION_TITLE: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '12px',
};
const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#000', zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
};
const CONFIRM_MODAL: React.CSSProperties = {
  width: '100%', maxWidth: '400px', background: '#0d0d0f',
  border: '1px solid #f87171', borderRadius: '12px',
  boxShadow: '0 24px 64px rgba(248,113,113,0.2)',
};
const ERR: React.CSSProperties = {
  padding: '10px 14px', background: 'rgba(255,80,80,0.1)',
  border: '1px solid rgba(255,80,80,0.3)', borderRadius: '6px', fontSize: '13px', color: '#ff6b6b',
};
const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px', padding: '16px',
};
const EX_ROW: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 60px 80px 80px 1fr 32px',
  gap: '8px', alignItems: 'center',
};

// ── DaysEditor ────────────────────────────────────────────────
function DaysEditor({ dias, exercises, isPending, onChange }: {
  dias: DayForm[];
  exercises: Ejercicio[];
  isPending: boolean;
  onChange: (dias: DayForm[]) => void;
}) {
  function updDay(id: string, val: string) { onChange(dias.map(d => d._id === id ? { ...d, nombre: val } : d)); }
  function addDay() { onChange([...dias, newDay(dias.length + 1)]); }
  function rmDay(id: string) { onChange(dias.filter(d => d._id !== id)); }
  function addEx(dayId: string) { onChange(dias.map(d => d._id === dayId ? { ...d, ejercicios: [...d.ejercicios, newEx()] } : d)); }
  function rmEx(dayId: string, exId: string) { onChange(dias.map(d => d._id === dayId ? { ...d, ejercicios: d.ejercicios.filter(e => e._id !== exId) } : d)); }
  function updEx(dayId: string, exId: string, field: keyof ExForm, val: string | number) {
    onChange(dias.map(d => d._id === dayId
      ? { ...d, ejercicios: d.ejercicios.map(e => e._id === exId ? { ...e, [field]: val } : e) }
      : d));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {dias.map((day, di) => (
        <div key={day._id} style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <input className="input" style={{ flex: 1 }} value={day.nombre}
              onChange={e => updDay(day._id, e.target.value)} placeholder={`Día ${di + 1}`} disabled={isPending} />
            {dias.length > 1 && (
              <button type="button" onClick={() => rmDay(day._id)} disabled={isPending}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '4px', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            )}
          </div>

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: '480px' }}>
              <div style={{ ...EX_ROW, marginBottom: '6px' }}>
                {['Ejercicio', 'Sets', 'Reps', 'Descanso', 'Notas', ''].map(h => (
                  <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                ))}
              </div>

              {day.ejercicios.map(ex => (
                <div key={ex._id} style={{ ...EX_ROW, marginBottom: '6px' }}>
                  <select className="select" value={ex.ejercicio_id}
                    onChange={e => updEx(day._id, ex._id, 'ejercicio_id', e.target.value)} disabled={isPending} style={{ fontSize: '13px' }}>
                    <option value="">Seleccionar...</option>
                    {exercises.map(ej => (
                      <option key={ej.id} value={ej.id}>{ej.name}{ej.muscle_group ? ` (${ej.muscle_group})` : ''}</option>
                    ))}
                  </select>
                  <input className="input" type="number" min={1} max={20} value={ex.sets}
                    onChange={e => updEx(day._id, ex._id, 'sets', parseInt(e.target.value) || 1)} disabled={isPending} style={{ textAlign: 'center', fontSize: '13px' }} />
                  <input className="input" value={ex.reps}
                    onChange={e => updEx(day._id, ex._id, 'reps', e.target.value)} placeholder="8-12" disabled={isPending} style={{ fontSize: '13px' }} />
                  <input className="input" type="number" min={0} value={ex.descanso_seg}
                    onChange={e => updEx(day._id, ex._id, 'descanso_seg', parseInt(e.target.value) || 0)} disabled={isPending} style={{ textAlign: 'center', fontSize: '13px' }} />
                  <input className="input" value={ex.notas}
                    onChange={e => updEx(day._id, ex._id, 'notas', e.target.value)} placeholder="Notas..." disabled={isPending} style={{ fontSize: '13px' }} />
                  <button type="button" onClick={() => rmEx(day._id, ex._id)}
                    disabled={isPending || day.ejercicios.length <= 1}
                    style={{ background: 'none', border: 'none', cursor: day.ejercicios.length <= 1 ? 'not-allowed' : 'pointer', color: '#f87171', opacity: day.ejercicios.length <= 1 ? 0.3 : 1, padding: '4px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 14, height: 14 }}>
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button type="button" onClick={() => addEx(day._id)} disabled={isPending}
            className="btn btn-ghost" style={{ fontSize: '12px', marginTop: '8px', padding: '0 10px', color: 'var(--accent)', borderColor: 'rgba(63,248,200,0.25)' }}>
            + Ejercicio
          </button>
        </div>
      ))}

      <button type="button" onClick={addDay} disabled={isPending} className="btn btn-outline"
        style={{ alignSelf: 'flex-start', fontSize: '13px' }}>
        + Agregar Día
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function TemplatesModule() {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'
  ), []);

  const [templates, setTemplates] = useState<RutinaTemplateRow[]>([]);
  const [exercises, setExercises] = useState<Ejercicio[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [tplForm, setTplForm] = useState<TplForm>(defaultTplForm);
  const [savingTpl, setSavingTpl] = useState(false);
  const [saveTplErr, setSaveTplErr] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([
      getRutinaTemplates(),
      supabase.from('exercises').select('id, name, muscle_group').eq('activo', true).order('name'),
    ]).then(([tpls, { data: exs }]) => {
      setTemplates(tpls);
      setExercises(exs ?? []);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setTplForm(defaultTplForm());
    setSaveTplErr('');
  }

  async function openEdit(id: string) {
    setLoadingEdit(id);
    const detail = await getRutinaTemplateDetail(id);
    setLoadingEdit(null);
    if (!detail) return;
    const dias = [...detail.template_dias]
      .sort((a, b) => a.orden - b.orden)
      .map(d => ({
        _id: uid(),
        nombre: d.nombre,
        ejercicios: [...d.template_ejercicios]
          .sort((a, b) => a.orden - b.orden)
          .map(e => ({
            _id: uid(),
            ejercicio_id: e.ejercicio_id ?? '',
            sets: e.sets,
            reps: e.reps,
            descanso_seg: e.descanso_seg,
            notas: e.notas ?? '',
          })),
      }));
    setTplForm({
      nombre: detail.nombre,
      nivel: detail.nivel ?? '',
      dias_semana: detail.dias_semana,
      duracion_semanas: detail.duracion_semanas,
      objetivo: detail.objetivo ?? '',
      descripcion: detail.descripcion ?? '',
      dias,
    });
    setEditingId(id);
    setShowForm(true);
    setSaveTplErr('');
  }

  async function saveTemplate() {
    if (!tplForm.nombre.trim()) { setSaveTplErr('El nombre es requerido'); return; }
    if (tplForm.dias.length === 0) { setSaveTplErr('Agrega al menos un día'); return; }
    setSavingTpl(true); setSaveTplErr('');
    const diasPayload = tplForm.dias.map((d, i) => ({
      orden: i + 1, nombre: d.nombre,
      ejercicios: d.ejercicios.map((e, j) => ({
        orden: j + 1, ejercicio_id: e.ejercicio_id || null,
        sets: e.sets, reps: e.reps, descanso_seg: e.descanso_seg, notas: e.notas || null,
      })),
    }));
    const res = editingId
      ? await updateRutinaTemplate(editingId, { ...tplForm, dias: diasPayload })
      : await createRutinaTemplate({ ...tplForm, dias: diasPayload });
    setSavingTpl(false);
    if (res.error) { setSaveTplErr(res.error); return; }
    const refreshed = await getRutinaTemplates();
    setTemplates(refreshed);
    closeForm();
  }

  async function confirmDelete() {
    if (!deletingId) return;
    setDeleting(true);
    const res = await deleteRutinaTemplate(deletingId);
    setDeleting(false);
    if (res.error) { setDeleteErr(res.error); return; }
    setTemplates(prev => prev.filter(t => t.id !== deletingId));
    setDeletingId(null);
    setDeleteErr('');
  }

  if (loading) return (
    <div className="card-body card-body--padded">
      <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>Cargando...</p>
    </div>
  );

  return (
    <div>
      <div className="row-between" style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '14px', color: 'var(--fg-muted)' }}>
          {templates.length} template{templates.length !== 1 ? 's' : ''} guardados
        </span>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setEditingId(null); setTplForm(defaultTplForm()); setSaveTplErr(''); setShowForm(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 16, height: 16 }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nuevo Template
          </button>
        )}
      </div>

      {/* Template list */}
      {templates.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ color: 'var(--fg-muted)', marginBottom: '16px' }}>No hay templates creados</div>
          <button className="btn btn-outline" onClick={() => { setEditingId(null); setTplForm(defaultTplForm()); setSaveTplErr(''); setShowForm(true); }}>Crear Primer Template</button>
        </div>
      )}

      {templates.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {templates.map(tpl => (
            <div key={tpl.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--fg-strong)', marginBottom: '4px' }}>{tpl.nombre}</div>
                  {tpl.nivel && <span className="badge badge-mint-soft" style={{ fontSize: '11px' }}>{tpl.nivel}</span>}
                </div>
                <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                  <button onClick={() => openEdit(tpl.id)} disabled={loadingEdit === tpl.id}
                    style={{ background: 'none', border: 'none', cursor: loadingEdit === tpl.id ? 'wait' : 'pointer', color: 'var(--fg-muted)', padding: '4px', opacity: loadingEdit === tpl.id ? 0.4 : 1 }} title="Editar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button onClick={() => { setDeletingId(tpl.id); setDeleteErr(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '4px' }} title="Eliminar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Días/sem', val: tpl.dias_semana },
                  { label: 'Semanas',  val: tpl.duracion_semanas },
                  { label: 'Días',     val: tpl.template_dias.length },
                ].map(m => (
                  <div key={m.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>{m.val}</div>
                    <div style={{ fontSize: '11px', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
                  </div>
                ))}
              </div>
              {tpl.objetivo && (
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>
                  Objetivo: <span style={{ color: 'var(--fg)' }}>{tpl.objetivo}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Template form modal */}
      {showForm && (
        <div style={OVERLAY} onClick={() => !savingTpl && closeForm()}>
          <div
            style={{ width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto', background: '#0d0d0f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent)' }}>
                  {editingId ? 'Editar Template' : 'Nuevo Template'}
                </div>
                <button onClick={closeForm} disabled={savingTpl} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {saveTplErr && <div style={{ ...ERR, marginBottom: '20px' }}>{saveTplErr}</div>}

              <div style={{ marginBottom: '24px' }}>
                <div style={SECTION_TITLE}>Información del Template</div>
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="label">Nombre del Template *</label>
                  <input className="input" value={tplForm.nombre}
                    onChange={e => setTplForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: Fuerza 3 días" disabled={savingTpl} />
                </div>
                <div className="form-row" style={{ marginBottom: '14px' }}>
                  <div className="form-group">
                    <label className="label">Nivel</label>
                    <select className="select" value={tplForm.nivel}
                      onChange={e => setTplForm(f => ({ ...f, nivel: e.target.value }))} disabled={savingTpl}>
                      <option value="">Seleccionar...</option>
                      {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Objetivo</label>
                    <select className="select" value={tplForm.objetivo}
                      onChange={e => setTplForm(f => ({ ...f, objetivo: e.target.value }))} disabled={savingTpl}>
                      <option value="">Seleccionar...</option>
                      {OBJETIVOS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row" style={{ marginBottom: '14px' }}>
                  <div className="form-group">
                    <label className="label">Días por semana</label>
                    <input className="input" type="number" min={1} max={7} value={tplForm.dias_semana}
                      onChange={e => setTplForm(f => ({ ...f, dias_semana: parseInt(e.target.value) || 1 }))} disabled={savingTpl} />
                  </div>
                  <div className="form-group">
                    <label className="label">Duración (semanas)</label>
                    <input className="input" type="number" min={1} max={52} value={tplForm.duracion_semanas}
                      onChange={e => setTplForm(f => ({ ...f, duracion_semanas: parseInt(e.target.value) || 1 }))} disabled={savingTpl} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="label">Descripción</label>
                  <textarea className="input" rows={2} value={tplForm.descripcion}
                    onChange={e => setTplForm(f => ({ ...f, descripcion: e.target.value }))}
                    placeholder="Descripción opcional..." disabled={savingTpl}
                    style={{ resize: 'vertical', minHeight: '60px' }} />
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <div style={SECTION_TITLE}>Días de Entrenamiento</div>
                <DaysEditor dias={tplForm.dias} exercises={exercises} isPending={savingTpl}
                  onChange={dias => setTplForm(f => ({ ...f, dias }))} />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={closeForm} disabled={savingTpl}>Cancelar</button>
                <button className="btn btn-primary" onClick={saveTemplate} disabled={savingTpl}>
                  {savingTpl ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Guardar Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingId && (
        <div style={{ ...OVERLAY, zIndex: 2100 }} onClick={() => !deleting && setDeletingId(null)}>
          <div style={CONFIRM_MODAL} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', background: 'rgba(248,113,113,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" style={{ width: 20, height: 20 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>¿Eliminar template?</p>
                  <p style={{ fontSize: '13px', color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                    Estás a punto de eliminar <strong style={{ color: 'var(--fg)' }}>{templates.find(t => t.id === deletingId)?.nombre}</strong>. Esta acción no se puede deshacer.
                  </p>
                  {deleteErr && <div style={{ ...ERR, marginTop: '12px' }}>{deleteErr}</div>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button className="btn btn-outline" onClick={() => { setDeletingId(null); setDeleteErr(''); }} disabled={deleting}>Cancelar</button>
              <button onClick={confirmDelete} disabled={deleting}
                style={{ padding: '0 20px', height: '38px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
