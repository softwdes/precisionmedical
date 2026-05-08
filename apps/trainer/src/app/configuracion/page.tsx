'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';
import EjerciciosModule from '@/components/EjerciciosModule';
import TemplatesModule from '@/components/TemplatesModule';
import { EditIcon, DeleteIcon, XIcon } from '@/components/Icons';

type Tab = 'ejercicios' | 'templates' | 'objetivos' | 'gimnasios';
type FormMode = 'closed' | 'add' | 'edit';

interface Gym { id: string; name: string; address: string | null; phone: string | null; email: string | null; }
interface Goal { id: string; label: string; comentario: string | null; sort_order: number; }

type Sb = ReturnType<typeof createBrowserClient>;

const TAB_LABELS: Record<Tab, string> = { ejercicios: 'Ejercicios', templates: 'Templates', objetivos: 'Objetivos', gimnasios: 'Gimnasios' };

// ── CONFIRM DELETE MODAL ──────────────────────────────────────
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
                ¿Eliminar registro?
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

// ── MODAL ─────────────────────────────────────────────────────
function Modal({ title, onClose, onSave, saving, error, children }: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Enter' && !e.shiftKey && !(e.target instanceof HTMLTextAreaElement) && !saving) onSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onSave, saving]);

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
            {title}
          </span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><XIcon /></button>
        </div>

        <div style={{ padding: 'var(--space-6)' }}>
          {children}
          {error && (
            <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-xs)', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>
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
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GIMNASIOS TAB ─────────────────────────────────────────────
function GimnasiosTab({ sb }: { sb: Sb }) {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<FormMode>('closed');
  const [editing, setEditing] = useState<Gym | null>(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Gym | null>(null);

  useEffect(() => {
    sb.from('gyms').select('*').order('name').then(({ data }: { data: any }) => {
      setGyms(data ?? []);
      setLoading(false);
    });
  }, [sb]);

  const openAdd = () => { setForm({ name: '', address: '', phone: '', email: '' }); setEditing(null); setSaveError(null); setMode('add'); };
  const openEdit = (g: Gym) => { setForm({ name: g.name, address: g.address ?? '', phone: g.phone ?? '', email: g.email ?? '' }); setEditing(g); setSaveError(null); setMode('edit'); };
  const close = () => { setMode('closed'); setSaveError(null); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true); setSaveError(null);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
    };
    if (mode === 'edit' && editing) {
      const { data, error } = await sb.from('gyms').update(payload).eq('id', editing.id).select().single();
      if (error) { setSaveError(error.message); } else if (data) { setGyms(p => p.map(g => g.id === editing.id ? data : g).sort((a, b) => a.name.localeCompare(b.name))); close(); }
    } else {
      const { data, error } = await sb.from('gyms').insert(payload).select().single();
      if (error) { setSaveError(error.message); } else if (data) { setGyms(p => [...p, data].sort((a, b) => a.name.localeCompare(b.name))); close(); }
    }
    setSaving(false);
  };

  const remove = async (gym: Gym) => {
    await sb.from('gyms').delete().eq('id', gym.id);
    setGyms(p => p.filter(g => g.id !== gym.id));
    setConfirmDelete(null);
  };

  return (
    <div>
      {confirmDelete && (
        <ConfirmDelete
          label={confirmDelete.name}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => remove(confirmDelete)}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <button className="btn btn-primary" onClick={openAdd}>Nuevo Gimnasio</button>
      </div>

      {mode !== 'closed' && (
        <Modal title={mode === 'edit' ? 'Editar Gimnasio' : 'Nuevo Gimnasio'} onClose={close} onSave={save} saving={saving} error={saveError}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Nombre *</label>
              <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre del gimnasio" autoFocus />
            </div>
            <div className="form-group">
              <label className="label">Celular</label>
              <input className="input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+51 999 999 999" />
            </div>
            <div className="form-group">
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="contacto@gimnasio.com" />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Dirección</label>
              <input className="input" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Av. Javier Prado 123" />
            </div>
          </div>
        </Modal>
      )}

      <div className="card">
        <div className="card-head">
          <div className="card-head-left">
            <div className="card-title">Gimnasios</div>
            <div className="card-subtitle">Sedes disponibles para los bloques de horario</div>
          </div>
        </div>
        {loading ? (
          <div className="card-body card-body--padded"><p style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>Cargando...</p></div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Celular</th>
                  <th>Email</th>
                  <th>Dirección</th>
                  <th style={{ width: 90 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gyms.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 'var(--space-8)' }}>Sin gimnasios registrados.</td></tr>
                ) : gyms.map(g => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td style={{ color: 'var(--fg-muted)' }}>{g.phone ?? '—'}</td>
                    <td style={{ color: 'var(--fg-muted)' }}>{g.email ?? '—'}</td>
                    <td style={{ color: 'var(--fg-muted)' }}>{g.address ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => openEdit(g)} title="Editar"><EditIcon /></button>
                        <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(g)} title="Eliminar"><DeleteIcon /></button>
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
  );
}

// ── OBJETIVOS TAB ─────────────────────────────────────────────
function ObjetivosTab({ sb }: { sb: Sb }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<FormMode>('closed');
  const [editing, setEditing] = useState<Goal | null>(null);
  const [form, setForm] = useState({ label: '', comentario: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Goal | null>(null);

  useEffect(() => {
    sb.from('gyms').select('*').order('name').then(({ data }: { data: any }) => {
      setGoals(data ?? []);
      setLoading(false);
    });
  }, [sb]);

  const openAdd = () => { setForm({ label: '', comentario: '' }); setEditing(null); setSaveError(null); setMode('add'); };
  const openEdit = (g: Goal) => { setForm({ label: g.label, comentario: g.comentario ?? '' }); setEditing(g); setSaveError(null); setMode('edit'); };
  const close = () => { setMode('closed'); setSaveError(null); };

  const save = async () => {
    if (!form.label.trim()) return;
    setSaving(true); setSaveError(null);
    const payload = { label: form.label.trim(), comentario: form.comentario.trim() || null };
    if (mode === 'edit' && editing) {
      const { data, error } = await sb.from('goals').update(payload).eq('id', editing.id).select().single();
      if (error) { setSaveError(error.message); } else if (data) { setGoals(p => p.map(g => g.id === editing.id ? data : g)); close(); }
    } else {
      const { data, error } = await sb.from('goals').insert({ ...payload, sort_order: goals.length }).select().single();
      if (error) { setSaveError(error.message); } else if (data) { setGoals(p => [...p, data]); close(); }
    }
    setSaving(false);
  };

  const remove = async (goal: Goal) => {
    await sb.from('goals').delete().eq('id', goal.id);
    setGoals(p => p.filter(g => g.id !== goal.id));
    setConfirmDelete(null);
  };

  return (
    <div>
      {confirmDelete && (
        <ConfirmDelete
          label={confirmDelete.label}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => remove(confirmDelete)}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <button className="btn btn-primary" onClick={openAdd}>Nuevo Objetivo</button>
      </div>

      {mode !== 'closed' && (
        <Modal title={mode === 'edit' ? 'Editar Objetivo' : 'Nuevo Objetivo'} onClose={close} onSave={save} saving={saving} error={saveError}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="label">Nombre del Objetivo *</label>
              <input className="input" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="Ej: Hipertrofia" autoFocus />
            </div>
            <div className="form-group">
              <label className="label">Comentarios</label>
              <textarea
                className="textarea"
                value={form.comentario}
                onChange={e => setForm(p => ({ ...p, comentario: e.target.value }))}
                placeholder="Descripción opcional"
                maxLength={500}
                rows={4}
                style={{ resize: 'vertical' }}
              />
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-subtle)', textAlign: 'right' }}>
                {form.comentario.length} / 500
              </span>
            </div>
          </div>
        </Modal>
      )}

      <div className="card">
        <div className="card-head">
          <div className="card-head-left">
            <div className="card-title">Objetivos de Entrenamiento</div>
            <div className="card-subtitle">Objetivos disponibles para rutinas y perfiles de alumnos</div>
          </div>
        </div>
        {loading ? (
          <div className="card-body card-body--padded"><p style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>Cargando...</p></div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Objetivo</th>
                  <th>Comentarios</th>
                  <th style={{ width: 90 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {goals.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 'var(--space-8)' }}>Sin objetivos registrados.</td></tr>
                ) : goals.map(g => (
                  <tr key={g.id}>
                    <td>{g.label}</td>
                    <td style={{ color: 'var(--fg-muted)' }}>{g.comentario ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => openEdit(g)} title="Editar"><EditIcon /></button>
                        <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(g)} title="Eliminar"><DeleteIcon /></button>
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
  );
}


// ── MAIN PAGE ─────────────────────────────────────────────────
export default function Configuracion() {
  const [tab, setTab] = useState<Tab>('ejercicios');

  const sb = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  return (
    <div className="app">
      <AppSidebar active="configuracion" />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <span className="crumb-active">Configuración</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Configuración // 01</span>
            <h1>Ajustes del Sistema</h1>
          </section>

          <style>{`
            .cfg-tab-bar {
              display: flex;
              gap: 2px;
              border-bottom: 1px solid var(--border);
              margin-bottom: var(--space-6);
            }
            .cfg-tab-btn {
              padding: 10px 24px;
              font-size: var(--text-xs);
              font-family: var(--font-sans);
              font-weight: var(--weight-bold);
              letter-spacing: var(--tracking-wider);
              text-transform: uppercase;
              background: none;
              border: none;
              border-bottom: 2px solid transparent;
              color: var(--fg-muted);
              cursor: pointer;
              margin-bottom: -1px;
              transition: color 0.15s, border-color 0.15s, background 0.15s;
              white-space: nowrap;
            }
            .cfg-tab-btn.cfg-active {
              border-bottom-color: var(--accent);
              color: var(--accent);
            }
            @media (max-width: 600px) {
              .cfg-tab-bar {
                flex-direction: column;
                border-bottom: none;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                gap: 0;
                overflow: hidden;
              }
              .cfg-tab-btn {
                width: 100%;
                text-align: left;
                padding: 14px 16px;
                margin-bottom: 0;
                border-bottom: none;
                border-left: 3px solid transparent;
                border-top: 1px solid var(--border);
              }
              .cfg-tab-btn:first-child {
                border-top: none;
              }
              .cfg-tab-btn.cfg-active {
                border-bottom-color: transparent;
                border-left-color: var(--accent);
                color: var(--accent);
                background: rgba(255,255,255,0.04);
              }
            }
          `}</style>

          <div className="cfg-tab-bar">
            {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`cfg-tab-btn${tab === t ? ' cfg-active' : ''}`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {tab === 'ejercicios' && <EjerciciosModule />}
          {tab === 'templates' && <TemplatesModule />}
          {tab === 'objetivos' && <ObjetivosTab sb={sb} />}
          {tab === 'gimnasios' && <GimnasiosTab sb={sb} />}
        </div>
      </main>
    </div>
  );
}
