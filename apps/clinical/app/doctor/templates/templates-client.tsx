'use client';

/**
 * B.17.7 — Gestión CRUD de plantillas PERSONAL (Phase 1)
 *
 * Estados:
 *  - Doctor selector (dropdown) — Phase 1A sin auth real
 *  - Lista de plantillas del doctor seleccionado
 *  - Crear / Editar plantilla (form inline)
 *  - Eliminar con confirmación
 */

import { useCallback, useEffect, useState } from 'react';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

const VIOLET = '#8B5CF6';
const BG     = '#0a1224';

const ENCOUNTER_TYPES = [
  { value: 'FOLLOW_UP',    label: 'Follow-Up' },
  { value: 'NEW_PATIENT',  label: 'Paciente Nuevo' },
  { value: 'RE_EVAL',      label: 'Re-Evaluación' },
  { value: 'URI',          label: 'URI' },
  { value: 'PHYSICAL',     label: 'Físico Anual' },
  { value: 'NURSING_HOME', label: 'Nursing Home' },
  { value: 'CLOSING',      label: 'Cierre de Caso' },
  { value: 'OTHER',        label: 'Otro' },
] as const;

const CASE_TYPES = [
  { value: 'MVA',          label: 'MVA — Accidente de auto' },
  { value: 'GENERAL',      label: 'General' },
  { value: 'NURSING_HOME', label: 'Nursing Home' },
] as const;

const SECTION_KEYS = [
  { value: 'QUEJA_PRINCIPAL', label: 'Queja Principal' },
  { value: 'HPI',             label: 'HPI — Historia de la Enfermedad' },
  { value: 'ROS',             label: 'ROS — Revisión de Sistemas' },
  { value: 'EXAMEN_FISICO',   label: 'Examen Físico' },
  { value: 'EVALUACIONES',    label: 'Evaluaciones / Assessment' },
  { value: 'PLAN',            label: 'Plan de Tratamiento' },
  { value: 'DIAGNOSTICOS',    label: 'Diagnósticos' },
] as const;

interface Doctor { id: string; firstName: string; lastName: string; email: string }

interface Section {
  id?:              string;
  sectionKey:       string;
  content:          string;
  orderIndex:       number;
  enabledByDefault: boolean;
}

interface Template {
  id:           string;
  title:        string;
  description:  string | null;
  encounterType: string;
  caseType:     string;
  scope:        string;
  usageCount:   number;
  createdById:  string;
  sections:     Section[];
}

interface SectionDraft {
  key:     string;
  sectionKey: string;
  content: string;
}

interface FormState {
  title:         string;
  description:   string;
  encounterType: string;
  caseType:      string;
  sections:      SectionDraft[];
}

const EMPTY_FORM: FormState = {
  title: '', description: '', encounterType: 'FOLLOW_UP', caseType: 'MVA', sections: [],
};

function nextKey() { return Math.random().toString(36).slice(2); }

// ─── Helpers UI ───────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 13px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 9, color: '#fff', fontSize: 13, outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer', appearance: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.10em',
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TemplatesClient({ doctors }: { doctors: Doctor[] }) {
  const [doctorId,   setDoctorId]   = useState<string>(doctors[0]?.id ?? '');
  const [templates,  setTemplates]  = useState<Template[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [editing,    setEditing]    = useState<Template | 'new' | null>(null);
  const [form,       setForm]       = useState<FormState>(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [deleting,   setDeleting]   = useState(false);

  // ── Cargar plantillas ───────────────────────────────────────────────────────
  const loadTemplates = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/visit/templates?doctorId=${id}`);
      const data = await res.json() as { ok: boolean; templates: Template[] };
      setTemplates(data.ok ? data.templates : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTemplates(doctorId); }, [doctorId, loadTemplates]);

  // ── Form helpers ────────────────────────────────────────────────────────────
  const openNew = () => {
    setForm(EMPTY_FORM);
    setError('');
    setEditing('new');
  };

  const openEdit = (t: Template) => {
    setForm({
      title:         t.title,
      description:   t.description ?? '',
      encounterType: t.encounterType,
      caseType:      t.caseType,
      sections:      t.sections.map(s => ({ key: nextKey(), sectionKey: s.sectionKey, content: s.content })),
    });
    setError('');
    setEditing(t);
  };

  const addSection = () => {
    const used = new Set(form.sections.map(s => s.sectionKey));
    const next = SECTION_KEYS.find(k => !used.has(k.value));
    if (!next) return;
    setForm(f => ({ ...f, sections: [...f.sections, { key: nextKey(), sectionKey: next.value, content: '' }] }));
  };

  const removeSection = (key: string) =>
    setForm(f => ({ ...f, sections: f.sections.filter(s => s.key !== key) }));

  const updateSection = (key: string, field: 'sectionKey' | 'content', value: string) =>
    setForm(f => ({ ...f, sections: f.sections.map(s => s.key === key ? { ...s, [field]: value } : s) }));

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim()) { setError('El título es requerido.'); return; }
    if (!doctorId)           { setError('Selecciona un doctor.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title:         form.title.trim(),
        description:   form.description.trim() || undefined,
        encounterType: form.encounterType,
        caseType:      form.caseType,
        createdById:   doctorId,
        sections:      form.sections.map((s, i) => ({ sectionKey: s.sectionKey, content: s.content, orderIndex: i })),
      };

      const isNew = editing === 'new';
      const url   = isNew ? '/api/visit/templates' : `/api/visit/templates/${(editing as Template).id}`;

      const res  = await fetch(url, {
        method:  isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok) { setError(data.error ?? 'Error al guardar.'); return; }

      setEditing(null);
      await loadTemplates(doctorId);
    } catch {
      setError('Error de conexión.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/visit/templates/${deleteId}`, { method: 'DELETE' });
      setDeleteId(null);
      await loadTemplates(doctorId);
    } finally {
      setDeleting(false);
    }
  };

  const selectedDoctor = doctors.find(d => d.id === doctorId);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px' }}>

      {/* Doctor selector */}
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Doctor</label>
        {doctors.length === 0 ? (
          <div style={{ padding: '12px 16px', borderRadius: 9, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', fontSize: 13 }}>
            No hay usuarios con rol PROVIDER activos. Crea un usuario de tipo Provider primero.
          </div>
        ) : (
          <select value={doctorId} onChange={e => setDoctorId(e.target.value)} style={selectStyle}>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>Dr. {d.lastName}, {d.firstName}</option>
            ))}
          </select>
        )}
      </div>

      {/* Header + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: 0 }}>
            Mis Plantillas
          </h1>
          {selectedDoctor && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 3 }}>
              Dr. {selectedDoctor.lastName}, {selectedDoctor.firstName} · {templates.length} plantilla{templates.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <button type="button" onClick={openNew} disabled={!doctorId} style={{
          padding: '10px 18px', borderRadius: 10,
          background: doctorId ? `linear-gradient(135deg, ${VIOLET}, #6d28d9)` : 'rgba(139,92,246,0.15)',
          border: 'none', color: doctorId ? '#fff' : 'rgba(255,255,255,0.30)',
          fontSize: 13, fontWeight: 700, cursor: doctorId ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
        }}>
          + Nueva Plantilla
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>
          Cargando plantillas...
        </div>
      ) : templates.length === 0 ? (
        <div style={{
          padding: '40px 24px', borderRadius: 14, textAlign: 'center',
          background: 'rgba(139,92,246,0.04)', border: '1px dashed rgba(139,92,246,0.25)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Sin plantillas</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)', marginBottom: 20 }}>
            Crea tu primera plantilla para acelerar la documentación de notas.
          </div>
          <button type="button" onClick={openNew} style={{
            padding: '10px 20px', borderRadius: 10,
            background: `linear-gradient(135deg, ${VIOLET}, #6d28d9)`,
            border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>+ Crear primera plantilla</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map(t => (
            <div key={t.id} style={{
              padding: '16px 20px', borderRadius: 12,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', gap: 14, alignItems: 'flex-start',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{t.title}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                    background: 'rgba(139,92,246,0.15)', color: VIOLET, textTransform: 'uppercase',
                  }}>
                    {ENCOUNTER_TYPES.find(e => e.value === t.encounterType)?.label ?? t.encounterType}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 5,
                    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)',
                  }}>
                    {CASE_TYPES.find(c => c.value === t.caseType)?.label ?? t.caseType}
                  </span>
                </div>
                {t.description && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>{t.description}</div>
                )}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>
                  <span>{t.sections.length} sección{t.sections.length !== 1 ? 'es' : ''}</span>
                  <span>Usado {t.usageCount}×</span>
                </div>
                {t.sections.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                    {t.sections.map(s => (
                      <span key={s.id} style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.40)',
                      }}>
                        {SECTION_KEYS.find(k => k.value === s.sectionKey)?.label ?? s.sectionKey}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => openEdit(t)} style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.25)',
                  color: VIOLET, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                }}>Editar</button>
                <button type="button" onClick={() => setDeleteId(t.id)} style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.20)',
                  color: '#F87171', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                }}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal: Crear / Editar ───────────────────────────────────────────── */}
      {editing !== null && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.70)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', padding: '48px 20px', overflowY: 'auto',
        }}>
          <div style={{
            width: '100%', maxWidth: 660,
            background: '#0f1a2e', borderRadius: 18,
            border: '1px solid rgba(139,92,246,0.25)',
            padding: '28px 28px 24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>
                  {editing === 'new' ? 'Nueva Plantilla' : 'Editar Plantilla'}
                </div>
                {selectedDoctor && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>
                    Dr. {selectedDoctor.lastName}, {selectedDoctor.firstName}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setEditing(null)} style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.55)', fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
              }}>×</button>
            </div>

            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div>
                <label style={labelStyle}>Título *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: MVA Follow-Up Inicial" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Descripción</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Descripción opcional de la plantilla" style={inputStyle} />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Tipo de Encuentro *</label>
                  <select value={form.encounterType} onChange={e => setForm(f => ({ ...f, encounterType: e.target.value }))} style={selectStyle}>
                    {ENCOUNTER_TYPES.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Tipo de Caso</label>
                  <select value={form.caseType} onChange={e => setForm(f => ({ ...f, caseType: e.target.value }))} style={selectStyle}>
                    {CASE_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Sections */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Secciones</label>
                  <button type="button" onClick={addSection}
                    disabled={form.sections.length >= SECTION_KEYS.length}
                    style={{
                      padding: '4px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                      background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
                      color: VIOLET, cursor: form.sections.length >= SECTION_KEYS.length ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                    }}>
                    + Agregar sección
                  </button>
                </div>

                {form.sections.length === 0 ? (
                  <div style={{
                    padding: '16px', borderRadius: 9, textAlign: 'center', fontSize: 12,
                    color: 'rgba(255,255,255,0.30)', border: '1px dashed rgba(255,255,255,0.08)',
                  }}>
                    Sin secciones — la plantilla se cargará vacía en el editor de notas.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {form.sections.map((s) => {
                      const usedKeys = new Set(form.sections.filter(x => x.key !== s.key).map(x => x.sectionKey));
                      return (
                        <div key={s.key} style={{
                          padding: '14px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                        }}>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <select value={s.sectionKey}
                              onChange={e => updateSection(s.key, 'sectionKey', e.target.value)}
                              style={{ ...selectStyle, flex: 1, padding: '7px 11px', fontSize: 12 }}>
                              {SECTION_KEYS.map(k => (
                                <option key={k.value} value={k.value} disabled={usedKeys.has(k.value)}>
                                  {k.label}
                                </option>
                              ))}
                            </select>
                            <button type="button" onClick={() => removeSection(s.key)} style={{
                              padding: '7px 11px', borderRadius: 8, flexShrink: 0,
                              background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.20)',
                              color: '#F87171', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                            }}>× Quitar</button>
                          </div>
                          <textarea value={s.content}
                            onChange={e => updateSection(s.key, 'content', e.target.value)}
                            placeholder="Contenido de la sección — texto libre, placeholders, etc."
                            rows={3}
                            style={{ ...inputStyle, resize: 'vertical', minHeight: 72, fontSize: 12 }} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div style={{
                marginTop: 14, padding: '10px 14px', borderRadius: 8,
                background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)',
                color: '#F87171', fontSize: 13,
              }}>⚠️ {error}</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setEditing(null)} style={{
                padding: '12px 20px', borderRadius: 10, flexShrink: 0,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.55)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancelar</button>
              <button type="button" onClick={handleSave} disabled={saving} style={{
                flex: 1, padding: '12px',
                background: saving ? 'rgba(139,92,246,0.25)' : `linear-gradient(135deg, ${VIOLET}, #6d28d9)`,
                border: 'none', borderRadius: 10,
                color: saving ? 'rgba(255,255,255,0.40)' : '#fff',
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'all 0.2s',
              }}>
                {saving ? '⏳ Guardando...' : editing === 'new' ? '✓ Crear Plantilla' : '✓ Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar eliminación ────────────────────────────────────── */}
      {deleteId !== null && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.70)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            width: '100%', maxWidth: 400, background: '#0f1a2e',
            borderRadius: 16, border: '1px solid rgba(244,63,94,0.30)',
            padding: '28px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              ¿Eliminar esta plantilla?
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', marginBottom: 22 }}>
              {templates.find(t => t.id === deleteId)?.title ?? ''}
              {' '}— Esta acción no se puede deshacer.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setDeleteId(null)} style={{
                flex: 1, padding: '11px', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.60)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancelar</button>
              <button type="button" onClick={handleDelete} disabled={deleting} style={{
                flex: 1, padding: '11px', borderRadius: 10,
                background: deleting ? 'rgba(244,63,94,0.20)' : 'rgba(244,63,94,0.80)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}>
                {deleting ? '⏳ Eliminando...' : '× Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
