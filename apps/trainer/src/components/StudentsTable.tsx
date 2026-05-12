'use client';

import { useState, useEffect, useTransition, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { deleteStudent, updateStudentModal } from '@/actions/students';
import { generateStudentAccess } from '@/actions/access';
import AlumnoPerfilClient from '@/app/alumnos/[id]/components/AlumnoPerfilClient';
import PhoneField from '@/components/PhoneField';
import WAComposerModal from '@/app/alumnos/[id]/components/WAComposerModal';
import SendAccessModal from '@/app/alumnos/[id]/editar/SendAccessModal';

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

const TOAST: React.CSSProperties = {
  position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
  background: 'rgba(63,248,200,0.12)', border: '1px solid rgba(63,248,200,0.35)',
  borderRadius: '8px', padding: '10px 22px', color: 'var(--accent)',
  fontSize: '13px', fontWeight: 600, zIndex: 9999,
  boxShadow: '0 4px 24px rgba(0,0,0,0.6)', whiteSpace: 'nowrap',
};

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
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
  padding: '16px 24px',
  paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
  borderTop: '1px solid rgba(255,255,255,0.08)',
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

interface ProfileData {
  loading: boolean;
  rutinaActiva: any;
  rutinasHistorial: any[];
  cuotas: any[];
  waMensajes: any[];
  exercises: { id: string; name: string; muscle_group: string | null }[];
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pagado:   { color: 'var(--status-paid)',    label: 'Al día' },
  pendiente: { color: 'var(--status-pending)', label: 'Pendiente' },
  vencido:  { color: 'var(--status-overdue)', label: 'Vencido' },
};

function StudentStatusBadge({ estado }: { estado?: string }) {
  const cfg = estado ? STATUS_CONFIG[estado] : undefined;
  const color = cfg?.color ?? '#4A5250';
  const label = cfg?.label ?? 'Sin cuota';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color, fontWeight: 600 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
      {label}
    </span>
  );
}

export default function StudentsTable({ students: initial, goalsMap, goalsList, cuotaStatusMap = {} }: {
  students: Student[];
  goalsMap: Record<string, string>;
  goalsList: Goal[];
  cuotaStatusMap?: Record<string, string>;
}) {
  const [students, setStudents] = useState(initial);
  useEffect(() => { setStudents(initial); }, [initial]);

  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);

  const profileRequestRef = useRef(0);
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);
  const [profileData, setProfileData] = useState<ProfileData>({
    loading: false, rutinaActiva: null, rutinasHistorial: [], cuotas: [], waMensajes: [], exercises: [],
  });
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [waStudent, setWaStudent] = useState<Student | null>(null);
  const [waCuota, setWaCuota] = useState<{ monto: number; fecha_vencimiento: string } | null>(null);

  interface AccessData { studentName: string; phone: string | null; email: string; link: string; hasAccount: boolean; }
  const [accessData, setAccessData] = useState<AccessData | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [editGoals, setEditGoals] = useState<string[]>([]);
  const [editComboGoal, setEditComboGoal] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filteredStudents = useMemo(() => {
    let result = students;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.full_name.toLowerCase().includes(q) ||
        (s.email?.toLowerCase().includes(q) ?? false) ||
        (s.phone?.includes(q) ?? false)
      );
    }
    if (levelFilter) {
      result = result.filter(s => s.experience_level === levelFilter);
    }
    return result;
  }, [students, search, levelFilter]);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  async function openProfile(s: Student) {
    const reqId = ++profileRequestRef.current;
    setProfileStudent(s);
    setProfileData({ loading: true, rutinaActiva: null, rutinasHistorial: [], cuotas: [], waMensajes: [], exercises: [] });

    const [rutinaRes, historialRes, cuotasRes, waRes, exercisesRes] = await Promise.all([
      supabase
        .from('rutinas_alumno')
        .select(`id, nombre, fecha_inicio, activo,
          rutina_dias(id, orden, nombre,
            rutina_ejercicios(id, orden, sets, reps, descanso_seg, notas, ejercicio_id,
              exercises(name)))`)
        .eq('alumno_id', s.id)
        .eq('activo', true)
        .maybeSingle(),
      supabase
        .from('rutinas_alumno')
        .select('id, nombre, fecha_inicio, activo, created_at')
        .eq('alumno_id', s.id)
        .eq('activo', false)
        .order('fecha_inicio', { ascending: false })
        .limit(5),
      supabase
        .from('cuotas')
        .select('id, monto, fecha_pago, fecha_vencimiento, periodo, metodo_pago, estado, notas')
        .eq('alumno_id', s.id)
        .order('fecha_vencimiento', { ascending: false })
        .limit(6),
      supabase
        .from('whatsapp_mensajes')
        .select('id, tipo_mensaje, contenido, fecha_envio, estado')
        .eq('alumno_id', s.id)
        .order('fecha_envio', { ascending: false })
        .limit(5),
      supabase
        .from('exercises')
        .select('id, name, muscle_group')
        .order('name'),
    ]);

    if (reqId !== profileRequestRef.current) return;

    setProfileData({
      loading: false,
      rutinaActiva: rutinaRes.data ?? null,
      rutinasHistorial: historialRes.data ?? [],
      cuotas: cuotasRes.data ?? [],
      waMensajes: waRes.data ?? [],
      exercises: (exercisesRes.data ?? []) as { id: string; name: string; muscle_group: string | null }[],
    });
  }

  useEffect(() => {
    if (!editing) return;
    setEditGoals(editing.goals ?? []);
    setEditComboGoal('');
    setEditPhone(editing.phone ?? '');
  }, [editing]);

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
      if (e.key === 'Escape') { setProfileStudent(null); setEditing(null); setDeleting(null); setWaStudent(null); setWaCuota(null); }
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

  const initials = (name: string) =>
    name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  async function handleSendAccess(student: Student) {
    setAccessError('');
    setAccessLoading(true);
    const result = await generateStudentAccess(student.id);
    setAccessLoading(false);
    if (result.error) { setAccessError(result.error); return; }
    if (result.link && result.student) {
      setEditing(null);
      setAccessData({ studentName: result.student.name, phone: result.student.phone, email: result.student.email, link: result.link, hasAccount: result.student.hasAccount });
    }
  }

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
        setEditSuccess(true);
        setTimeout(() => setEditSuccess(false), 3000);
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
      setDeleteSuccess(true);
      setTimeout(() => setDeleteSuccess(false), 3000);
    });
  }

  async function openWA(s: Student) {
    setWaStudent(s);
    setWaCuota(null);
    const { data } = await supabase
      .from('cuotas')
      .select('monto, fecha_vencimiento')
      .eq('alumno_id', s.id)
      .order('fecha_vencimiento', { ascending: false })
      .limit(1)
      .maybeSingle();
    setWaCuota(data ?? null);
  }

  return (
    <>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '10px', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        <input
          type="text"
          className="input"
          placeholder="Buscar por nombre, email o teléfono..."
          style={{ flex: 1, minWidth: '180px', maxWidth: '320px' }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="select"
          style={{ width: '180px' }}
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
        >
          <option value="">Todos los niveles</option>
          <option value="beginner">Principiante</option>
          <option value="intermediate">Intermedio</option>
          <option value="advanced">Avanzado</option>
        </select>
        {(search || levelFilter) && (
          <button
            className="btn btn-ghost"
            onClick={() => { setSearch(''); setLevelFilter(''); }}
            style={{ fontSize: '12px', color: 'var(--fg-muted)' }}
          >
            Limpiar filtros
          </button>
        )}
        {(search || levelFilter) && (
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: 'var(--fg-muted)', marginLeft: 'auto' }}>
            {filteredStudents.length} resultado{filteredStudents.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="students-table-view">
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Celular</th>
              <th className="col-hide-sm">Email</th>
              <th>Nivel</th>
              <th className="col-hide-sm">Objetivos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--fg-muted)' }}>
                  {students.length === 0 ? 'No hay alumnos registrados. Agrega tu primer alumno.' : 'Sin resultados para los filtros aplicados.'}
                </td>
              </tr>
            ) : filteredStudents.map(s => (
              <tr key={s.id}>
                <td>
                  <button
                    onClick={() => openProfile(s)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, padding: 0, fontSize: 'inherit', fontFamily: 'inherit', textAlign: 'left' }}
                  >
                    {s.full_name}
                  </button>
                </td>
                <td className="text-muted">{s.phone || '-'}</td>
                <td className="text-muted col-hide-sm">{s.email || '-'}</td>
                <td>
                  <span className={`badge ${levelBadge(s.experience_level)}`}>{levelLabel(s.experience_level)}</span>
                </td>
                <td className="text-muted col-hide-sm">{resolveGoals(s.goals)}</td>
                <td>
                  <StudentStatusBadge estado={cuotaStatusMap[s.id]} />
                </td>
                <td>
                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    <button className="btn btn-ghost btn-icon" title="Ver perfil" onClick={() => openProfile(s)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button className="btn btn-ghost btn-icon" title="WhatsApp" onClick={() => void openWA(s)} style={{ color: '#25D366' }}>
                      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '14px', height: '14px' }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
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
      </div>

      <div className="students-cards">
        {filteredStudents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--fg-muted)', fontSize: '13px' }}>
            {students.length === 0 ? 'No hay alumnos registrados.' : 'Sin resultados para los filtros aplicados.'}
          </div>
        ) : filteredStudents.map(s => (
          <div key={s.id} className="student-card">
            <div className="student-card-top">
              <div className="student-card-avatar">
                <span>{initials(s.full_name)}</span>
              </div>
              <div className="student-card-info">
                <button className="student-card-name" onClick={() => openProfile(s)}>
                  {s.full_name}
                </button>
                <div className="student-card-phone">{s.phone || '—'}</div>
              </div>
              <div className="student-card-badges">
                <StudentStatusBadge estado={cuotaStatusMap[s.id]} />
                <span className={`badge ${levelBadge(s.experience_level)}`}>{levelLabel(s.experience_level)}</span>
              </div>
            </div>
            <div className="student-card-actions">
              <button className="btn btn-outline student-card-flex-btn" onClick={() => openProfile(s)}>
                Ver perfil
              </button>
              <button className="student-card-wa-btn" onClick={() => void openWA(s)}>
                WhatsApp
              </button>
              <button className="btn btn-ghost btn-icon" title="Editar" onClick={() => setEditing(s)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button className="btn btn-ghost btn-icon" title="Eliminar" onClick={() => setDeleting(s)} style={{ color: '#ef4444' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── PROFILE POPUP ── */}
      {profileStudent && (
        <div style={{ ...OVERLAY, zIndex: 2200 }} onClick={() => setProfileStudent(null)}>
          <div
            style={{
              width: '95vw', height: '92dvh', background: '#0d0d0f',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
              background: '#0d0d0f', flexShrink: 0,
            }}>
              <div style={{ fontSize: '12px', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                Perfil del Alumno
              </div>
              <button style={CLOSE_BTN} onClick={() => setProfileStudent(null)}><CloseIcon /></button>
            </div>

            {/* Body */}
            {profileData.loading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)', fontSize: '13px' }}>
                Cargando perfil...
              </div>
            ) : (
              <div className="profile-modal-body">
                <AlumnoPerfilClient
                  student={profileStudent as any}
                  goalsMap={goalsMap}
                  rutinaActiva={profileData.rutinaActiva}
                  rutinasHistorial={profileData.rutinasHistorial}
                  cuotas={profileData.cuotas}
                  waMensajes={profileData.waMensajes}
                  exercises={profileData.exercises}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EDIT POPUP ── */}
      {editing && (
        <div style={{ ...OVERLAY, zIndex: 2300 }} onClick={() => !isPending && setEditing(null)}>
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
                      <label className="label">Celular</label>
                      <PhoneField value={editPhone} onChange={setEditPhone} disabled={isPending} />
                      <input type="hidden" name="phone" value={editPhone} />
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
              <div style={{ ...MODAL_FOOT, flexWrap: 'wrap', gap: '8px' }}>
                {accessError && (
                  <div style={{ width: '100%', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '12px', color: '#ef4444' }}>
                    {accessError}
                  </div>
                )}
                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)} disabled={isPending}>Cancelar</button>
                <button
                  type="button"
                  disabled={isPending || accessLoading || !editing?.email}
                  title={!editing?.email ? 'Agregá el email del alumno para enviar acceso' : ''}
                  onClick={() => editing && void handleSendAccess(editing)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '0 14px', height: '38px', borderRadius: 'var(--radius-sm)', border: 'none',
                    background: !editing?.email || isPending || accessLoading ? 'rgba(37,211,102,0.12)' : '#25D366',
                    color: !editing?.email || isPending || accessLoading ? 'rgba(37,211,102,0.45)' : '#00120E',
                    fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '12px',
                    cursor: !editing?.email || isPending || accessLoading ? 'not-allowed' : 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  {accessLoading ? 'Generando...' : 'Enviar acceso'}
                </button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>{isPending ? 'Guardando...' : 'Guardar Cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── WHATSAPP ── */}
      {waStudent && (
        <WAComposerModal
          alumnoId={waStudent.id}
          alumnoNombre={waStudent.full_name}
          alumnoPhone={waStudent.phone}
          cuota={waCuota}
          defaultTipo="bienvenida"
          onClose={() => { setWaStudent(null); setWaCuota(null); }}
        />
      )}

      {/* ── DELETE CONFIRM ── */}
      {deleting && (
        <div style={{ ...OVERLAY, zIndex: 2400 }} onClick={() => setDeleting(null)}>
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

      {accessData && (
        <SendAccessModal
          studentName={accessData.studentName}
          phone={accessData.phone}
          email={accessData.email}
          link={accessData.link}
          hasAccount={accessData.hasAccount}
          onClose={() => { setAccessData(null); setAccessError(''); }}
        />
      )}

      {editSuccess && (
        <div style={TOAST}>Cambios guardados correctamente</div>
      )}
      {deleteSuccess && (
        <div style={{ ...TOAST, background: 'rgba(255,80,80,0.12)', border: '1px solid rgba(255,80,80,0.35)', color: '#ff6b6b' }}>
          Alumno eliminado correctamente
        </div>
      )}
    </>
  );
}
