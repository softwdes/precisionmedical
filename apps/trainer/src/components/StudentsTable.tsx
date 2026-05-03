'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { deleteStudent, updateStudentModal } from '@/actions';

interface Student {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  experience_level: string | null;
  goals: string[] | null;
  available_equipment: string | null;
  birth_date: string | null;
  created_at: string;
}

interface Goal { id: string; label: string; }

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#000',
  zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
};
const MODAL: React.CSSProperties = {
  width: '100%', maxWidth: '520px', background: '#0d0d0f',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
  overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
  maxHeight: '92dvh', overflowY: 'auto',
};
const MODAL_HEAD: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
  position: 'sticky', top: 0, background: '#0d0d0f', zIndex: 1,
};
const MODAL_BODY: React.CSSProperties = { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' };
const MODAL_FOOT: React.CSSProperties = {
  padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)',
  display: 'flex', gap: '10px', justifyContent: 'flex-end',
  background: 'rgba(0,0,0,0.3)', position: 'sticky', bottom: 0,
};
const SECTION_TITLE: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '12px',
};
const INFO_ROW: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '13px',
};
const ERROR_BOX: React.CSSProperties = {
  padding: '10px 14px', background: 'rgba(255,80,80,0.1)',
  border: '1px solid rgba(255,80,80,0.3)', borderRadius: '6px', fontSize: '13px', color: '#ff6b6b',
};
const CLOSE_BTN: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px', display: 'flex',
};
const CONFIRM_MODAL: React.CSSProperties = {
  width: '100%', maxWidth: '400px', background: '#0d0d0f',
  border: '1px solid #f87171', borderRadius: '12px',
  overflow: 'hidden', boxShadow: '0 24px 64px rgba(248,113,113,0.2)',
};

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

interface Metric { id: string; weight_kg: number | null; body_fat_pct: number | null; muscle_mass_kg: number | null; measured_at: string; notes: string | null; }
interface Package { id: string; total_sessions: number; used_sessions: number; amount: number; currency: string; purchased_on: string; expires_on: string | null; }
interface Routine { id: string; name?: string | null; active: boolean; starts_on: string | null; ends_on: string | null; }

export default function StudentsTable({ students: initial, goalsMap }: {
  students: Student[];
  goalsMap: Record<string, string>;
}) {
  const [students, setStudents] = useState(initial);

  useEffect(() => { setStudents(initial); }, [initial]);
  const [detail, setDetail] = useState<Student | null>(null);
  const [detailMetrics, setDetailMetrics] = useState<Metric[]>([]);
  const [detailPackages, setDetailPackages] = useState<Package[]>([]);
  const [detailRoutines, setDetailRoutines] = useState<Routine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [goalsList, setGoalsList] = useState<Goal[]>([]);
  const [editGoals, setEditGoals] = useState<string[]>([]);
  const [editComboGoal, setEditComboGoal] = useState('');
  const [editError, setEditError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  useEffect(() => {
    if (!detail) return;
    setDetailLoading(true);
    setDetailMetrics([]); setDetailPackages([]); setDetailRoutines([]);
    Promise.all([
      supabase.from('body_metrics').select('*').eq('student_id', detail.id).order('measured_at', { ascending: false }).limit(1),
      supabase.from('session_packages').select('*').eq('student_id', detail.id).order('created_at', { ascending: false }),
      supabase.from('student_routines').select('*').eq('student_id', detail.id).order('created_at', { ascending: false }),
    ]).then(([m, p, r]) => {
      setDetailMetrics(m.data ?? []);
      setDetailPackages(p.data ?? []);
      setDetailRoutines(r.data ?? []);
      setDetailLoading(false);
    });
  }, [detail, supabase]);

  useEffect(() => {
    if (!editing) return;
    setEditGoals(editing.goals ?? []);
    setEditComboGoal('');
    supabase.from('goals').select('id, label').order('sort_order').then(({ data }) => setGoalsList(data ?? []));
  }, [editing, supabase]);

  function addEditGoal() {
    if (!editComboGoal || editGoals.includes(editComboGoal)) return;
    setEditGoals(prev => [...prev, editComboGoal]);
    setEditComboGoal('');
  }

  function removeEditGoal(id: string) {
    setEditGoals(prev => prev.filter(g => g !== id));
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDetail(null); setEditing(null); setDeleting(null); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const resolveGoals = (goals: string[] | null) =>
    goals?.map(g => goalsMap[g] ?? g).join(', ') || '-';

  const levelLabel = (l: string | null) =>
    l === 'beginner' ? 'Principiante' : l === 'intermediate' ? 'Intermedio' : l === 'advanced' ? 'Avanzado' : '-';

  const equipLabel = (e: string | null) =>
    e === 'full_gym' ? 'Gym Completo' : e === 'home_basic' ? 'Gym Básico' : e === 'bodyweight' ? 'Peso Corporal' : '-';

  const levelBadge = (l: string | null) =>
    l === 'beginner' ? 'badge-mint-soft' : l === 'intermediate' ? 'badge-accent' : 'badge';

  function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    setEditError('');
    startTransition(async () => {
      const res = await updateStudentModal(editing.id, fd);
      if (res?.error) {
        setEditError(res.error);
      } else {
        const goals = fd.getAll('goals') as string[];
        const updated: Student = {
          ...editing,
          full_name: (fd.get('full_name') as string)?.trim() || editing.full_name,
          email: (fd.get('email') as string)?.trim() || null,
          phone: (fd.get('phone') as string)?.trim() || null,
          birth_date: (fd.get('birth_date') as string) || null,
          experience_level: (fd.get('experience_level') as string) || null,
          goals: goals.length > 0 ? goals : null,
          available_equipment: (fd.get('available_equipment') as string) || null,
        };
        setStudents(prev => prev.map(s => s.id === editing.id ? updated : s));
        setEditing(null);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      await deleteStudent(deleting.id);
      setStudents(p => p.filter(s => s.id !== deleting.id));
      setDeleting(null);
    });
  }

  return (
    <>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Celular / Teléfono</th>
              <th>Email</th>
              <th>Nivel</th>
              <th>Objetivos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--fg-muted)' }}>
                  No hay alumnos registrados. Agrega tu primer alumno.
                </td>
              </tr>
            ) : students.map(s => (
              <tr key={s.id}>
                <td>
                  <span style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setDetail(s)}>
                    {s.full_name}
                  </span>
                </td>
                <td className="text-muted">{s.phone || '-'}</td>
                <td className="text-muted">{s.email || '-'}</td>
                <td>
                  <span className={`badge ${levelBadge(s.experience_level)}`}>{levelLabel(s.experience_level)}</span>
                </td>
                <td className="text-muted">{resolveGoals(s.goals)}</td>
                <td>
                  <span className="status-dot active"></span>
                  <span className="status-text">Activo</span>
                </td>
                <td>
                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    <button className="btn btn-ghost btn-icon" title="Ver detalle" onClick={() => setDetail(s)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button className="btn btn-ghost btn-icon" title="Editar" onClick={() => setEditing(s)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button className="btn btn-ghost btn-icon" title="Eliminar" onClick={() => setDeleting(s)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── DETAIL POPUP ── */}
      {detail && (
        <div style={OVERLAY} onClick={() => setDetail(null)}>
          <div style={{ ...MODAL, maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
            <div style={MODAL_HEAD}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent)' }}>{detail.full_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>Perfil completo del alumno</div>
              </div>
              <button style={CLOSE_BTN} onClick={() => setDetail(null)}><CloseIcon /></button>
            </div>

            {detailLoading ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: '13px' }}>Cargando perfil...</div>
            ) : (
              <div style={MODAL_BODY}>
                {/* Información Personal */}
                <div>
                  <div style={SECTION_TITLE}>Información Personal</div>
                  {detail.email && (
                    <div style={INFO_ROW}>
                      <span style={{ color: 'var(--fg-muted)' }}>Email</span>
                      <span>{detail.email}</span>
                    </div>
                  )}
                  {detail.phone && (
                    <div style={INFO_ROW}>
                      <span style={{ color: 'var(--fg-muted)' }}>Celular / Teléfono</span>
                      <span>{detail.phone}</span>
                    </div>
                  )}
                  <div style={INFO_ROW}>
                    <span style={{ color: 'var(--fg-muted)' }}>Nivel</span>
                    <span className={`badge ${levelBadge(detail.experience_level)}`}>{levelLabel(detail.experience_level)}</span>
                  </div>
                  <div style={INFO_ROW}>
                    <span style={{ color: 'var(--fg-muted)' }}>Objetivos</span>
                    <span style={{ textAlign: 'right', maxWidth: '60%' }}>{resolveGoals(detail.goals)}</span>
                  </div>
                  <div style={INFO_ROW}>
                    <span style={{ color: 'var(--fg-muted)' }}>Equipamiento</span>
                    <span>{equipLabel(detail.available_equipment)}</span>
                  </div>
                  {detail.birth_date && (
                    <div style={INFO_ROW}>
                      <span style={{ color: 'var(--fg-muted)' }}>Fecha de nacimiento</span>
                      <span>{fmtDate(detail.birth_date)}</span>
                    </div>
                  )}
                  <div style={{ ...INFO_ROW, borderBottom: 'none' }}>
                    <span style={{ color: 'var(--fg-muted)' }}>Fecha de ingreso</span>
                    <span>{fmtDate(detail.created_at)}</span>
                  </div>
                </div>

                {/* Métricas Biométricas */}
                <div>
                  <div style={SECTION_TITLE}>Métricas Biométricas</div>
                  {detailMetrics.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>Sin métricas registradas</p>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '8px' }}>
                        {[
                          { val: detailMetrics[0].weight_kg, unit: 'kg', label: 'Peso' },
                          { val: detailMetrics[0].body_fat_pct, unit: '%', label: 'Grasa Corp.' },
                          { val: detailMetrics[0].muscle_mass_kg, unit: 'kg', label: 'Masa Musc.' },
                        ].map(({ val, unit, label }) => (
                          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)' }}>
                              {val != null ? `${val}${unit}` : '—'}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--fg-muted)', textAlign: 'right' }}>
                        Última medición: {fmtDate(detailMetrics[0].measured_at)}
                      </div>
                      {detailMetrics[0].notes && (
                        <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--fg-muted)', fontStyle: 'italic' }}>
                          {detailMetrics[0].notes}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Paquetes de Sesiones */}
                <div>
                  <div style={SECTION_TITLE}>Paquetes de Sesiones</div>
                  {detailPackages.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>Sin paquetes registrados</p>
                  ) : detailPackages.map(pkg => {
                    const pct = pkg.total_sessions > 0 ? Math.round((pkg.used_sessions / pkg.total_sessions) * 100) : 0;
                    const remaining = pkg.total_sessions - pkg.used_sessions;
                    return (
                      <div key={pkg.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '14px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px' }}>
                            {pkg.used_sessions} / {pkg.total_sessions} sesiones
                          </span>
                          <span style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>
                            {pkg.currency} {pkg.amount}
                          </span>
                        </div>
                        <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: '3px' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--fg-muted)' }}>
                          <span>{remaining} sesiones restantes</span>
                          {pkg.expires_on && <span>Vence: {fmtDate(pkg.expires_on)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Rutinas Asignadas */}
                <div>
                  <div style={SECTION_TITLE}>Rutinas Asignadas</div>
                  {detailRoutines.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>Sin rutinas asignadas</p>
                  ) : detailRoutines.map((r, i) => (
                    <div key={r.id} style={{ ...INFO_ROW, borderBottom: i < detailRoutines.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                      <span style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>
                        {r.name ? r.name : `Rutina ${i + 1}`}
                        {r.starts_on && (
                          <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.7 }}>
                            {fmtDate(r.starts_on)}{r.ends_on ? ` → ${fmtDate(r.ends_on)}` : ''}
                          </span>
                        )}
                      </span>
                      <span className={`badge ${r.active ? 'badge-mint-soft' : ''}`} style={!r.active ? { color: 'var(--fg-muted)', borderColor: 'rgba(255,255,255,0.12)' } : {}}>
                        {r.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={MODAL_FOOT}>
              <button className="btn btn-outline" onClick={() => setDetail(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT POPUP ── */}
      {editing && (
        <div style={OVERLAY} onClick={() => !isPending && setEditing(null)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <div style={MODAL_HEAD}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent)' }}>Editar Alumno</div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>{editing.full_name}</div>
              </div>
              <button style={CLOSE_BTN} onClick={() => !isPending && setEditing(null)}><CloseIcon /></button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div style={MODAL_BODY}>
                {editError && <div style={ERROR_BOX}>{editError}</div>}

                <div>
                  <div style={SECTION_TITLE}>Información Personal</div>
                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label className="label">Nombre Completo *</label>
                    <input name="full_name" type="text" className="input" required defaultValue={editing.full_name} disabled={isPending} />
                  </div>
                  <div className="form-row" style={{ marginBottom: '14px' }}>
                    <div className="form-group">
                      <label className="label">Email</label>
                      <input name="email" type="email" className="input" defaultValue={editing.email ?? ''} placeholder="correo@ejemplo.com" disabled={isPending} />
                    </div>
                    <div className="form-group">
                      <label className="label">Celular / Teléfono</label>
                      <input name="phone" type="tel" className="input" defaultValue={editing.phone ?? ''} placeholder="+51 999 999 999" disabled={isPending} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="label">Fecha de Nacimiento</label>
                      <input name="birth_date" type="date" className="input" defaultValue={editing.birth_date?.split('T')[0] ?? ''} disabled={isPending} />
                    </div>
                    <div className="form-group">
                      <label className="label">Nivel de Experiencia</label>
                      <select name="experience_level" className="select" defaultValue={editing.experience_level ?? ''} disabled={isPending}>
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
                  <div style={{ display: 'flex', gap: '8px', marginBottom: editGoals.length > 0 ? '10px' : 0 }}>
                    <select
                      className="select"
                      style={{ flex: 1 }}
                      value={editComboGoal}
                      onChange={e => setEditComboGoal(e.target.value)}
                      disabled={isPending || goalsList.length === 0}
                    >
                      <option value="">{goalsList.length === 0 ? 'Cargando...' : 'Seleccionar objetivo...'}</option>
                      {goalsList.filter(g => !editGoals.includes(g.id)).map(g => (
                        <option key={g.id} value={g.id}>{g.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addEditGoal}
                      disabled={!editComboGoal || isPending}
                      style={{
                        flexShrink: 0, width: '38px', height: '38px',
                        background: editComboGoal ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid ' + (editComboGoal ? 'var(--accent)' : 'rgba(255,255,255,0.12)'),
                        borderRadius: 'var(--radius-sm)', cursor: editComboGoal ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.2s, border-color 0.2s',
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke={editComboGoal ? '#000' : 'var(--fg-muted)'} strokeWidth="2.5" strokeLinecap="round" style={{ width: '16px', height: '16px' }}>
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </button>
                  </div>
                  {editGoals.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {editGoals.map(id => {
                        const label = goalsList.find(g => g.id === id)?.label ?? goalsMap[id] ?? id;
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
                              onClick={() => removeEditGoal(id)}
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
                    {[{ value: 'full_gym', label: 'Gym Completo' }, { value: 'home_basic', label: 'Gym Básico (Casa)' }, { value: 'bodyweight', label: 'Solo Peso Corporal' }].map(eq => (
                      <label key={eq.value} className="radio-label">
                        <input type="radio" name="available_equipment" value={eq.value} defaultChecked={editing.available_equipment === eq.value} disabled={isPending} />
                        <span>{eq.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div style={MODAL_FOOT}>
                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)} disabled={isPending}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>{isPending ? 'Guardando...' : 'Guardar Cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ── */}
      {deleting && (
        <div style={{ ...OVERLAY, zIndex: 2100 }} onClick={() => setDeleting(null)}>
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
                  <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--fg-strong)', marginBottom: '8px' }}>¿Eliminar alumno?</p>
                  <p style={{ fontSize: '13px', color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                    Estás a punto de eliminar a <strong style={{ color: 'var(--fg)' }}>{deleting.full_name}</strong>. Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button className="btn btn-outline" onClick={() => setDeleting(null)} disabled={isPending}>Cancelar</button>
              <button onClick={handleDelete} disabled={isPending} style={{ padding: '0 20px', height: '38px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                {isPending ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
