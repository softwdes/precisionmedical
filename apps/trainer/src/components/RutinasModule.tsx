'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { createRutinaTemplate, deleteRutinaTemplate, assignRutinaToAlumno } from '@/actions/rutinas';
import type { RutinaTemplateRow } from '@/actions/rutinas';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ejercicio { id: string; name: string; muscle_group: string | null; }
interface Student { id: string; full_name: string; }

interface ExForm {
  _id: string;
  ejercicio_id: string;
  sets: number;
  reps: string;
  descanso_seg: number;
  notas: string;
}
interface DayForm {
  _id: string;
  nombre: string;
  ejercicios: ExForm[];
}
interface TplForm {
  nombre: string;
  nivel: string;
  dias_semana: number;
  duracion_semanas: number;
  objetivo: string;
  descripcion: string;
  dias: DayForm[];
}

interface TemplateDia {
  id: string;
  orden: number;
  nombre: string;
  template_ejercicios: {
    id: string; orden: number; ejercicio_id: string | null; sets: number;
    reps: string; descanso_seg: number; notas: string | null;
    exercises: { name: string; muscle_group: string | null } | null;
  }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);
const newEx = (): ExForm => ({ _id: uid(), ejercicio_id: '', sets: 3, reps: '8-12', descanso_seg: 90, notas: '' });
const newDay = (n: number): DayForm => ({ _id: uid(), nombre: `Día ${n}`, ejercicios: [newEx()] });
const defaultTplForm = (): TplForm => ({
  nombre: '', nivel: '', dias_semana: 3, duracion_semanas: 4,
  objetivo: '', descripcion: '', dias: [newDay(1)],
});

const NIVELES = ['Principiante', 'Intermedio', 'Avanzado'];
const OBJETIVOS = ['Hipertrofia', 'Fuerza máxima', 'Pérdida de peso', 'Tonificación', 'Resistencia'];

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

// ── Shared styles ─────────────────────────────────────────────────────────────

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

// ── Day/Exercise form helpers (shared between template form + custom wizard) ──

function DaysEditor({
  dias, exercises, isPending, onChange,
}: {
  dias: DayForm[];
  exercises: Ejercicio[];
  isPending: boolean;
  onChange: (dias: DayForm[]) => void;
}) {
  function updDay(id: string, val: string) {
    onChange(dias.map(d => d._id === id ? { ...d, nombre: val } : d));
  }
  function addDay() {
    onChange([...dias, newDay(dias.length + 1)]);
  }
  function rmDay(id: string) {
    onChange(dias.filter(d => d._id !== id));
  }
  function addEx(dayId: string) {
    onChange(dias.map(d => d._id === dayId ? { ...d, ejercicios: [...d.ejercicios, newEx()] } : d));
  }
  function rmEx(dayId: string, exId: string) {
    onChange(dias.map(d => d._id === dayId ? { ...d, ejercicios: d.ejercicios.filter(e => e._id !== exId) } : d));
  }
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
            <input
              className="input"
              style={{ flex: 1 }}
              value={day.nombre}
              onChange={e => updDay(day._id, e.target.value)}
              placeholder={`Día ${di + 1}`}
              disabled={isPending}
            />
            {dias.length > 1 && (
              <button type="button" onClick={() => rmDay(day._id)} disabled={isPending}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '4px', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            )}
          </div>

          {/* Exercise table header */}
          <div style={{ ...EX_ROW, marginBottom: '6px' }}>
            {['Ejercicio', 'Sets', 'Reps', 'Descanso', 'Notas', ''].map(h => (
              <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
            ))}
          </div>

          {day.ejercicios.map(ex => (
            <div key={ex._id} style={{ ...EX_ROW, marginBottom: '6px' }}>
              <select className="select" value={ex.ejercicio_id} onChange={e => updEx(day._id, ex._id, 'ejercicio_id', e.target.value)} disabled={isPending} style={{ fontSize: '13px' }}>
                <option value="">Seleccionar...</option>
                {exercises.map(ej => (
                  <option key={ej.id} value={ej.id}>{ej.name}{ej.muscle_group ? ` (${ej.muscle_group})` : ''}</option>
                ))}
              </select>
              <input className="input" type="number" min={1} max={20} value={ex.sets} onChange={e => updEx(day._id, ex._id, 'sets', parseInt(e.target.value) || 1)} disabled={isPending} style={{ textAlign: 'center', fontSize: '13px' }} />
              <input className="input" value={ex.reps} onChange={e => updEx(day._id, ex._id, 'reps', e.target.value)} placeholder="8-12" disabled={isPending} style={{ fontSize: '13px' }} />
              <input className="input" type="number" min={0} value={ex.descanso_seg} onChange={e => updEx(day._id, ex._id, 'descanso_seg', parseInt(e.target.value) || 0)} disabled={isPending} style={{ textAlign: 'center', fontSize: '13px' }} />
              <input className="input" value={ex.notas} onChange={e => updEx(day._id, ex._id, 'notas', e.target.value)} placeholder="Notas..." disabled={isPending} style={{ fontSize: '13px' }} />
              <button type="button" onClick={() => rmEx(day._id, ex._id)} disabled={isPending || day.ejercicios.length <= 1}
                style={{ background: 'none', border: 'none', cursor: day.ejercicios.length <= 1 ? 'not-allowed' : 'pointer', color: '#f87171', opacity: day.ejercicios.length <= 1 ? 0.3 : 1, padding: '4px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 14, height: 14 }}>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}

          <button type="button" onClick={() => addEx(day._id)} disabled={isPending}
            className="btn btn-ghost" style={{ fontSize: '12px', marginTop: '8px', height: '28px', padding: '0 10px' }}>
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

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  initialTemplates: RutinaTemplateRow[];
  students: Student[];
  exercises: Ejercicio[];
}

export default function RutinasModule({ initialTemplates, students, exercises }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Supabase client ──
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  // ── Tab ──
  const [tab, setTab] = useState<'templates' | 'asignar'>('templates');

  // ── Templates state ──
  const [templates, setTemplates] = useState<RutinaTemplateRow[]>(initialTemplates);
  const [showForm, setShowForm] = useState(false);
  const [tplForm, setTplForm] = useState<TplForm>(defaultTplForm);
  const [savingTpl, setSavingTpl] = useState(false);
  const [saveTplErr, setSaveTplErr] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState('');

  // ── Wizard state ──
  const [wStep, setWStep] = useState<1 | 2 | 3 | 4>(1);
  const [wAlumno, setWAlumno] = useState('');
  const [wFecha, setWFecha] = useState('');
  const [wTemplate, setWTemplate] = useState<string | 'custom' | null>(null);
  const [wTemplateDias, setWTemplateDias] = useState<TemplateDia[]>([]);
  const [wSelectedDias, setWSelectedDias] = useState<string[]>([]);
  const [wCustomDias, setWCustomDias] = useState<DayForm[]>([newDay(1)]);
  const [loadingDias, setLoadingDias] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignErr, setAssignErr] = useState('');
  const [assignOk, setAssignOk] = useState(false);

  // ── Template handlers ──

  async function saveTemplate() {
    if (!tplForm.nombre.trim()) { setSaveTplErr('El nombre es requerido'); return; }
    if (tplForm.dias.length === 0) { setSaveTplErr('Agrega al menos un día'); return; }
    setSavingTpl(true); setSaveTplErr('');
    const res = await createRutinaTemplate({
      ...tplForm,
      dias: tplForm.dias.map((d, i) => ({
        orden: i + 1,
        nombre: d.nombre,
        ejercicios: d.ejercicios.map((e, j) => ({
          orden: j + 1,
          ejercicio_id: e.ejercicio_id || null,
          sets: e.sets, reps: e.reps, descanso_seg: e.descanso_seg, notas: e.notas || null,
        })),
      })),
    });
    setSavingTpl(false);
    if (res.error) { setSaveTplErr(res.error); return; }
    setShowForm(false);
    setTplForm(defaultTplForm());
    router.refresh();
  }

  async function confirmDelete() {
    if (!deletingId) return;
    startTransition(async () => {
      const res = await deleteRutinaTemplate(deletingId);
      if (res.error) { setDeleteErr(res.error); return; }
      setTemplates(prev => prev.filter(t => t.id !== deletingId));
      setDeletingId(null);
      setDeleteErr('');
    });
  }

  // ── Wizard handlers ──

  async function goToStep3(templateId: string | 'custom') {
    setWTemplate(templateId);
    if (templateId === 'custom') {
      setWCustomDias([newDay(1)]);
      setWStep(3);
      return;
    }
    setLoadingDias(true);
    const { data } = await supabase
      .from('template_dias')
      .select('*, template_ejercicios(*, exercises(name, muscle_group))')
      .eq('template_id', templateId)
      .order('orden');
    setWTemplateDias((data ?? []) as TemplateDia[]);
    setWSelectedDias((data ?? []).map((d: any) => d.id));
    setLoadingDias(false);
    setWStep(3);
  }

  async function confirmAssign() {
    setAssigning(true); setAssignErr('');
    const tpl = templates.find(t => t.id === wTemplate);
    const nombre = tpl ? tpl.nombre : 'Rutina personalizada';

    let dias;
    if (wTemplate !== 'custom') {
      const selected = wTemplateDias.filter(d => wSelectedDias.includes(d.id));
      dias = selected.map((d, i) => ({
        orden: i + 1,
        nombre: d.nombre,
        ejercicios: d.template_ejercicios.map((e, j) => ({
          orden: j + 1,
          ejercicio_id: e.ejercicio_id,
          sets: e.sets, reps: e.reps, descanso_seg: e.descanso_seg, notas: e.notas,
        })),
      }));
    } else {
      dias = wCustomDias.map((d, i) => ({
        orden: i + 1,
        nombre: d.nombre,
        ejercicios: d.ejercicios.map((e, j) => ({
          orden: j + 1,
          ejercicio_id: e.ejercicio_id || null,
          sets: e.sets, reps: e.reps, descanso_seg: e.descanso_seg, notas: e.notas || null,
        })),
      }));
    }

    const res = await assignRutinaToAlumno({
      alumno_id: wAlumno,
      fecha_inicio: wFecha,
      template_id: wTemplate !== 'custom' ? wTemplate : null,
      nombre,
      dias,
    });

    setAssigning(false);
    if (res.error) { setAssignErr(res.error); return; }
    setAssignOk(true);
    setTimeout(() => {
      setAssignOk(false);
      setWStep(1); setWAlumno(''); setWFecha(''); setWTemplate(null);
      setWTemplateDias([]); setWSelectedDias([]); setWCustomDias([newDay(1)]);
      setTab('templates');
    }, 1800);
  }

  function resetWizard() {
    setWStep(1); setWAlumno(''); setWFecha(''); setWTemplate(null);
    setWTemplateDias([]); setWSelectedDias([]); setWCustomDias([newDay(1)]);
    setAssignErr('');
  }

  // ── Summary helpers ──
  const wAlumnoName = students.find(s => s.id === wAlumno)?.full_name ?? '';
  const wTemplateName = wTemplate === 'custom' ? 'Rutina personalizada' : (templates.find(t => t.id === wTemplate)?.nombre ?? '');

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0' }}>
        {(['templates', 'asignar'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 18px',
            fontSize: '13px', fontWeight: 600,
            color: tab === t ? 'var(--accent)' : 'var(--fg-muted)',
            borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
            transition: 'color 0.15s',
          }}>
            {t === 'templates' ? 'Templates' : 'Asignar Rutina'}
          </button>
        ))}
      </div>

      {/* ── TEMPLATES TAB ───────────────────────────────────────────────── */}
      {tab === 'templates' && (
        <div>
          <div className="row-between" style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '14px', color: 'var(--fg-muted)' }}>
              {templates.length} template{templates.length !== 1 ? 's' : ''} guardados
            </span>
            {!showForm && (
              <button className="btn btn-primary" onClick={() => { setShowForm(true); setTplForm(defaultTplForm()); setSaveTplErr(''); }}>
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
              <button className="btn btn-outline" onClick={() => { setShowForm(true); setSaveTplErr(''); }}>Crear Primer Template</button>
            </div>
          )}

          {templates.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: showForm ? '32px' : 0 }}>
              {templates.map(tpl => (
                <div key={tpl.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--fg-strong)', marginBottom: '4px' }}>{tpl.nombre}</div>
                      {tpl.nivel && <span className="badge badge-mint-soft" style={{ fontSize: '11px' }}>{tpl.nivel}</span>}
                    </div>
                    <button onClick={() => { setDeletingId(tpl.id); setDeleteErr(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '4px', flexShrink: 0 }} title="Eliminar">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Días/sem', val: tpl.dias_semana },
                      { label: 'Semanas', val: tpl.duracion_semanas },
                      { label: 'Días', val: tpl.template_dias.length },
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

          {/* ── Template form ── */}
          {showForm && (
            <div className="card" style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent)' }}>Nuevo Template</div>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {saveTplErr && <div style={{ ...ERR, marginBottom: '20px' }}>{saveTplErr}</div>}

              {/* Basic info */}
              <div style={{ marginBottom: '24px' }}>
                <div style={SECTION_TITLE}>Información del Template</div>
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="label">Nombre del Template *</label>
                  <input className="input" value={tplForm.nombre} onChange={e => setTplForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Fuerza 3 días" disabled={savingTpl} />
                </div>
                <div className="form-row" style={{ marginBottom: '14px' }}>
                  <div className="form-group">
                    <label className="label">Nivel</label>
                    <select className="select" value={tplForm.nivel} onChange={e => setTplForm(f => ({ ...f, nivel: e.target.value }))} disabled={savingTpl}>
                      <option value="">Seleccionar...</option>
                      {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Objetivo</label>
                    <select className="select" value={tplForm.objetivo} onChange={e => setTplForm(f => ({ ...f, objetivo: e.target.value }))} disabled={savingTpl}>
                      <option value="">Seleccionar...</option>
                      {OBJETIVOS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row" style={{ marginBottom: '14px' }}>
                  <div className="form-group">
                    <label className="label">Días por semana</label>
                    <input className="input" type="number" min={1} max={7} value={tplForm.dias_semana} onChange={e => setTplForm(f => ({ ...f, dias_semana: parseInt(e.target.value) || 1 }))} disabled={savingTpl} />
                  </div>
                  <div className="form-group">
                    <label className="label">Duración (semanas)</label>
                    <input className="input" type="number" min={1} max={52} value={tplForm.duracion_semanas} onChange={e => setTplForm(f => ({ ...f, duracion_semanas: parseInt(e.target.value) || 1 }))} disabled={savingTpl} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="label">Descripción</label>
                  <textarea className="input" rows={2} value={tplForm.descripcion} onChange={e => setTplForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción opcional..." disabled={savingTpl} style={{ resize: 'vertical', minHeight: '60px' }} />
                </div>
              </div>

              {/* Days */}
              <div style={{ marginBottom: '24px' }}>
                <div style={SECTION_TITLE}>Días de Entrenamiento</div>
                <DaysEditor dias={tplForm.dias} exercises={exercises} isPending={savingTpl} onChange={dias => setTplForm(f => ({ ...f, dias }))} />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setShowForm(false)} disabled={savingTpl}>Cancelar</button>
                <button className="btn btn-primary" onClick={saveTemplate} disabled={savingTpl}>
                  {savingTpl ? 'Guardando...' : 'Guardar Template'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ASIGNAR RUTINA TAB ───────────────────────────────────────────── */}
      {tab === 'asignar' && (
        <div>
          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
            {[1, 2, 3, 4].map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '13px',
                  background: wStep >= s ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                  color: wStep >= s ? '#000' : 'var(--fg-muted)',
                  border: wStep === s ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'background 0.2s',
                }}>{s}</div>
                <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 600, color: wStep >= s ? 'var(--fg)' : 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                  {['Alumno', 'Template', 'Días', 'Confirmar'][i]}
                </span>
                {i < 3 && <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)', margin: '0 16px', minWidth: '24px' }} />}
              </div>
            ))}
          </div>

          {/* ── Step 1 ── */}
          {wStep === 1 && (
            <div className="card">
              <div style={{ ...SECTION_TITLE, marginBottom: '20px' }}>Seleccionar Alumno y Fecha</div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="label">Alumno *</label>
                <select className="select" value={wAlumno} onChange={e => setWAlumno(e.target.value)}>
                  <option value="">Seleccionar alumno...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="label">Fecha de inicio *</label>
                <input className="input" type="date" value={wFecha} onChange={e => setWFecha(e.target.value)} />
              </div>
              <button className="btn btn-primary" disabled={!wAlumno || !wFecha} onClick={() => setWStep(2)}>
                Siguiente →
              </button>
            </div>
          )}

          {/* ── Step 2 ── */}
          {wStep === 2 && (
            <div>
              <div style={{ ...SECTION_TITLE, marginBottom: '20px' }}>Seleccionar Template</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                {templates.map(tpl => (
                  <div key={tpl.id} onClick={() => goToStep3(tpl.id)}
                    style={{
                      ...CARD, cursor: 'pointer',
                      border: `1px solid ${wTemplate === tpl.id ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                      background: wTemplate === tpl.id ? 'rgba(63,248,200,0.06)' : 'rgba(255,255,255,0.03)',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}>
                    <div style={{ fontWeight: 700, marginBottom: '6px' }}>{tpl.nombre}</div>
                    {tpl.nivel && <div style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '8px' }}>{tpl.nivel}</div>}
                    <div style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>
                      {tpl.dias_semana} días/sem · {tpl.duracion_semanas} semanas · {tpl.template_dias.length} días
                    </div>
                    {tpl.objetivo && <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '4px' }}>{tpl.objetivo}</div>}
                  </div>
                ))}

                {/* Custom option */}
                <div onClick={() => goToStep3('custom')}
                  style={{
                    ...CARD, cursor: 'pointer',
                    border: `1px solid ${wTemplate === 'custom' ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                    background: wTemplate === 'custom' ? 'rgba(63,248,200,0.06)' : 'rgba(255,255,255,0.03)',
                    transition: 'border-color 0.15s, background 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100px',
                  }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px', color: 'var(--accent)' }}>＋</div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Rutina nueva personalizada</div>
                  <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '4px' }}>Crear desde cero</div>
                </div>
              </div>
              <button className="btn btn-outline" onClick={() => setWStep(1)}>← Volver</button>
            </div>
          )}

          {/* ── Step 3 ── */}
          {wStep === 3 && (
            <div>
              <div style={{ ...SECTION_TITLE, marginBottom: '20px' }}>
                {wTemplate === 'custom' ? 'Crear Días y Ejercicios' : 'Seleccionar Días del Template'}
              </div>

              {loadingDias && <div style={{ color: 'var(--fg-muted)', marginBottom: '24px' }}>Cargando días...</div>}

              {/* Template days as checkboxes */}
              {wTemplate !== 'custom' && !loadingDias && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                  {wTemplateDias.map(dia => (
                    <label key={dia.id} style={{ ...CARD, display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={wSelectedDias.includes(dia.id)}
                        onChange={e => setWSelectedDias(prev => e.target.checked ? [...prev, dia.id] : prev.filter(id => id !== dia.id))}
                        style={{ marginTop: '2px', accentColor: 'var(--accent)', flexShrink: 0, width: 16, height: 16 }} />
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>{dia.nombre}</div>
                        {dia.template_ejercicios.length > 0 && (
                          <div style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>
                            {dia.template_ejercicios.map(e => e.exercises?.name ?? 'Ejercicio').join(' · ')}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Custom days form */}
              {wTemplate === 'custom' && (
                <div style={{ marginBottom: '24px' }}>
                  <DaysEditor dias={wCustomDias} exercises={exercises} isPending={false} onChange={setWCustomDias} />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-outline" onClick={() => setWStep(2)}>← Volver</button>
                <button className="btn btn-primary"
                  disabled={wTemplate !== 'custom' && wSelectedDias.length === 0}
                  onClick={() => setWStep(4)}>
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4 ── */}
          {wStep === 4 && (
            <div>
              <div style={{ ...SECTION_TITLE, marginBottom: '20px' }}>Confirmar Asignación</div>

              {assignOk && (
                <div style={{ padding: '16px', background: 'rgba(63,248,200,0.1)', border: '1px solid rgba(63,248,200,0.3)', borderRadius: '8px', color: 'var(--accent)', fontWeight: 600, marginBottom: '20px', textAlign: 'center' }}>
                  ✓ Rutina asignada correctamente
                </div>
              )}

              {assignErr && <div style={{ ...ERR, marginBottom: '16px' }}>{assignErr}</div>}

              <div className="card" style={{ marginBottom: '16px' }}>
                {[
                  { label: 'Alumno', val: wAlumnoName },
                  { label: 'Template', val: wTemplateName },
                  { label: 'Fecha de inicio', val: wFecha ? fmtDate(wFecha) : '-' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '13px' }}>
                    <span style={{ color: 'var(--fg-muted)' }}>{row.label}</span>
                    <span style={{ fontWeight: 600 }}>{row.val}</span>
                  </div>
                ))}
              </div>

              {/* Days summary */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ ...SECTION_TITLE }}>Días incluidos</div>
                {(wTemplate !== 'custom'
                  ? wTemplateDias.filter(d => wSelectedDias.includes(d.id))
                  : wCustomDias.map(d => ({
                      id: d._id, nombre: d.nombre,
                      template_ejercicios: d.ejercicios.map(e => ({
                        id: e._id, exercises: exercises.find(ex => ex.id === e.ejercicio_id) ?? null,
                        ...e,
                      })),
                    }))
                ).map((dia: any, i) => (
                  <div key={dia.id} style={{ ...CARD, marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>{dia.nombre}</div>
                    {(dia.template_ejercicios ?? []).map((e: any, j: number) => (
                      <div key={e.id ?? j} style={{ fontSize: '12px', color: 'var(--fg-muted)', display: 'flex', gap: '12px', padding: '3px 0' }}>
                        <span style={{ color: 'var(--fg)' }}>{e.exercises?.name ?? (exercises.find(ex => ex.id === e.ejercicio_id)?.name ?? '—')}</span>
                        <span>{e.sets} × {e.reps}</span>
                        {e.descanso_seg > 0 && <span>{e.descanso_seg}s descanso</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-outline" onClick={() => setWStep(3)} disabled={assigning}>← Volver</button>
                <button className="btn btn-outline" onClick={resetWizard} disabled={assigning}>Cancelar</button>
                <button className="btn btn-primary" onClick={confirmAssign} disabled={assigning || assignOk}>
                  {assigning ? 'Asignando...' : 'Confirmar y Asignar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DELETE CONFIRM ─────────────────────────────────────────────── */}
      {deletingId && (
        <div style={{ ...OVERLAY, zIndex: 2100 }} onClick={() => !isPending && setDeletingId(null)}>
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
              <button className="btn btn-outline" onClick={() => { setDeletingId(null); setDeleteErr(''); }} disabled={isPending}>Cancelar</button>
              <button onClick={confirmDelete} disabled={isPending}
                style={{ padding: '0 20px', height: '38px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                {isPending ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
