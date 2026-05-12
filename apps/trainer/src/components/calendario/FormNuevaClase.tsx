'use client';

import { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import type { Clase, NuevaClaseForm, TipoClase, ColorClase, TipoRecurrencia, FrecuenciaTipo } from '@/types/clases';
import { crearClase, actualizarClase, fechasDeClase } from '@/lib/clases';

// ── Constants ─────────────────────────────────────────────────────────────────

const COLOR_HEX: Record<ColorClase, string> = {
  green: '#1D9E75',
  blue: '#378ADD',
  purple: '#7F77DD',
  amber: '#EF9F27',
  coral: '#D85A30',
};

const TIPO_OPTIONS: { value: TipoClase; label: string }[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'grupal', label: 'Grupal' },
  { value: 'evaluacion', label: 'Evaluación física' },
  { value: 'bloque', label: 'Bloque personal' },
];

const COLORS: ColorClase[] = ['green', 'blue', 'purple', 'amber', 'coral'];

function buildTimeOptions(startHour: number, endHour: number, stepMin: number): string[] {
  const opts: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      if (h === endHour && m > 0) break;
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return opts;
}

const HORA_INICIO_OPTS = buildTimeOptions(7, 21, 30);
const HORA_FIN_OPTS = buildTimeOptions(7, 21, 30).slice(1); // 07:30 to 21:30

function computeDuracion(inicio: string, fin: string): string {
  const [sh = '0', sm = '0'] = inicio.split(':');
  const [eh = '0', em = '0'] = fin.split(':');
  const startMin = parseInt(sh, 10) * 60 + parseInt(sm, 10);
  const endMin = parseInt(eh, 10) * 60 + parseInt(em, 10);
  const diff = endMin - startMin;
  if (diff <= 0) return '—';
  if (diff < 60) return `${diff} min`;
  const hrs = Math.floor(diff / 60);
  const mins = diff % 60;
  return mins === 0 ? `${hrs} h` : `${hrs} h ${mins} min`;
}

function formatDateES(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  fecha?: string | undefined;
  hora?: string | undefined;
  clase?: Clase | undefined;
  onGuardar: (info: { recurrencia: TipoRecurrencia; fecha: string }) => void;
  onCancelar: () => void;
}

interface Student {
  id: string;
  full_name: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FormNuevaClase({ fecha, hora, clase, onGuardar, onCancelar }: Props) {
  const isEdit = clase !== undefined;
  const [isPending, startTransition] = useTransition();

  // Form fields
  const [titulo, setTitulo] = useState(clase?.titulo ?? '');
  const [fechaVal, setFechaVal] = useState(clase?.fecha ?? fecha ?? '');
  const [tipo, setTipo] = useState<TipoClase>(clase?.tipo ?? 'personal');
  const [horaInicio, setHoraInicio] = useState(
    clase?.hora_inicio?.slice(0, 5) ?? hora ?? HORA_INICIO_OPTS.at(0) ?? '07:00'
  );
  const [horaFin, setHoraFin] = useState(
    clase?.hora_fin?.slice(0, 5) ?? HORA_FIN_OPTS.at(0) ?? '07:30'
  );
  const [color, setColor] = useState<ColorClase>(clase?.color ?? 'green');
  const [recurrencia, setRecurrencia] = useState<TipoRecurrencia>(clase?.recurrencia ?? 'ninguna');
  const [fechaHasta, setFechaHasta] = useState(clase?.fecha_hasta ?? '');
  const [frecuenciaTipo, setFrecuenciaTipo] = useState<FrecuenciaTipo>(clase?.frecuencia_tipo ?? 'diario');
  const [notas, setNotas] = useState(clase?.notas ?? '');

  // Validation
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');

  // Students
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    clase?.clase_alumnos?.map(a => a.alumno_id) ?? []
  );
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const studentContainerRef = useRef<HTMLDivElement>(null);

  // Fetch students once
  useEffect(() => {
    fetch('/api/students')
      .then(r => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setAllStudents(d as Student[]); })
      .catch(() => { });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (studentContainerRef.current && !studentContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Recurrence summary
  const recurrenceSummary = useCallback((): string => {
    if (recurrencia === 'ninguna' || !fechaVal || !fechaHasta) return '';
    const tempClase: Clase = {
      id: '',
      trainer_id: '',
      titulo: '',
      fecha: fechaVal,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      tipo,
      color,
      recurrencia,
      fecha_hasta: fechaHasta || null,
      frecuencia_tipo: recurrencia === 'frecuencia' ? frecuenciaTipo : null,
      notas: null,
      created_at: '',
    };
    const fechas = fechasDeClase(tempClase);
    const n = fechas.length - 1;
    const fechaStr = formatDateES(fechaHasta);

    if (recurrencia === 'rango') {
      return `Clase cada día del ${formatDateES(fechaVal)} al ${fechaStr}. Total: ${fechas.length} clases.`;
    }
    if (recurrencia === 'frecuencia') {
      const label = frecuenciaTipo === 'diario' ? 'Diario'
                  : frecuenciaTipo === 'interdiario' ? 'Interdiario'
                  : 'Semanal';
      return `${label}: 1 clase base + ${n} repetición${n !== 1 ? 'es' : ''} hasta ${fechaStr}. Total: ${fechas.length} clases.`;
    }
    return '';
  }, [recurrencia, fechaVal, fechaHasta, horaInicio, horaFin, tipo, color, frecuenciaTipo]);

  // Filtered students for dropdown
  const filteredStudents = allStudents
    .filter(s => !selectedIds.includes(s.id))
    .filter(s => search === '' || s.full_name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8);

  function addStudent(s: Student) {
    setSelectedIds(prev => [...prev, s.id]);
    setSearch('');
    setDropdownOpen(false);
  }

  function removeStudent(id: string) {
    setSelectedIds(prev => prev.filter(x => x !== id));
  }

  function getStudentName(id: string): string {
    const s = allStudents.find(st => st.id === id);
    return s?.full_name ?? id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!titulo.trim() || !fechaVal) return;

    setError('');
    startTransition(async () => {
      try {
        const formData: NuevaClaseForm = {
          titulo: titulo.trim(),
          fecha: fechaVal,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          tipo,
          color,
          recurrencia,
          ...(recurrencia !== 'ninguna' && fechaHasta ? { fecha_hasta: fechaHasta } : {}),
          ...(recurrencia === 'frecuencia' ? { frecuencia_tipo: frecuenciaTipo } : {}),
          ...(notas.trim() ? { notas: notas.trim() } : {}),
          alumno_ids: selectedIds,
        };

        if (isEdit && clase) {
          await actualizarClase(clase.id, formData);
        } else {
          await crearClase(formData);
        }
        onGuardar({ recurrencia, fecha: fechaVal });
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  const summary = recurrenceSummary();

  return (
    <>
      <div className="modal-header">
        <div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', color: 'var(--accent)' }}>
            {isEdit ? 'Editar Clase' : 'Nueva Clase'}
          </h2>
          {fechaVal && (
            <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>
              {formatDateES(fechaVal)}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onCancelar}
          disabled={isPending}
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="modal-body">
        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(255,80,80,0.1)',
            border: '1px solid rgba(255,80,80,0.3)',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#ff6b6b',
          }}>
            {error}
          </div>
        )}

        {/* Title */}
        <div className="form-group">
          <label className="label">Título *</label>
          <input
            type="text"
            className="input"
            placeholder="Ej: Personal training, Grupo funcional..."
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            style={touched && !titulo.trim() ? { borderColor: '#ff6b6b' } : undefined}
            required
          />
          {touched && !titulo.trim() && (
            <div style={{ fontSize: '12px', color: '#ff6b6b', marginTop: '4px' }}>El título es requerido.</div>
          )}
        </div>

        {/* Date and Tipo */}
        <div className="form-row">
          <div className="form-group">
            <label className="label">Fecha *</label>
            <input
              type="date"
              className="input"
              value={fechaVal}
              onChange={e => setFechaVal(e.target.value)}
              style={touched && !fechaVal ? { borderColor: '#ff6b6b' } : undefined}
              required
            />
            {touched && !fechaVal && (
              <div style={{ fontSize: '12px', color: '#ff6b6b', marginTop: '4px' }}>La fecha es requerida.</div>
            )}
          </div>
          <div className="form-group">
            <label className="label">Tipo</label>
            <select
              className="select"
              value={tipo}
              onChange={e => setTipo(e.target.value as TipoClase)}
            >
              {TIPO_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Time row */}
        <div className="form-row">
          <div className="form-group">
            <label className="label">Hora inicio</label>
            <select
              className="select"
              value={horaInicio}
              onChange={e => setHoraInicio(e.target.value)}
            >
              {HORA_INICIO_OPTS.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Hora fin</label>
            <select
              className="select"
              value={horaFin}
              onChange={e => setHoraFin(e.target.value)}
            >
              {HORA_FIN_OPTS.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Duración</label>
            <input
              type="text"
              className="input"
              value={computeDuracion(horaInicio, horaFin)}
              readOnly
              style={{ color: 'var(--fg-muted)', cursor: 'default' }}
            />
          </div>
        </div>

        {/* Students chip selector */}
        <div className="form-group">
          <label className="label">Alumnos</label>
          <div ref={studentContainerRef} style={{ position: 'relative' }}>
            {/* Chips */}
            {selectedIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {selectedIds.map(id => (
                  <span
                    key={id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: '20px',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--fg)',
                    }}
                  >
                    {getStudentName(id)}
                    <button
                      type="button"
                      onClick={() => removeStudent(id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--fg-muted)',
                        padding: '0',
                        lineHeight: 1,
                        fontSize: '14px',
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* Search input */}
            <input
              type="text"
              className="input"
              placeholder="Buscar alumno..."
              value={search}
              onChange={e => { setSearch(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
            />
            {/* Dropdown */}
            {dropdownOpen && filteredStudents.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 100,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                marginTop: '4px',
                maxHeight: '200px',
                overflowY: 'auto',
              }}>
                {filteredStudents.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addStudent(s)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px 12px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--fg)',
                      fontSize: 'var(--text-sm)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    {s.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recurrence */}
        <div className="form-group">
          <label className="label">Recurrencia</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(
              [
                { value: 'ninguna' as TipoRecurrencia, icon: '—', label: 'Sin repetición' },
                { value: 'rango' as TipoRecurrencia, icon: '↔', label: 'Rango de fecha' },
                { value: 'frecuencia' as TipoRecurrencia, icon: '↻', label: 'Diario / Interdiario' },
              ] as const
            ).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRecurrencia(opt.value)}
                style={{
                  flex: 1,
                  minWidth: '120px',
                  padding: '10px 12px',
                  border: recurrencia === opt.value
                    ? '2px solid var(--accent)'
                    : '1px solid var(--border)',
                  borderRadius: '8px',
                  background: recurrencia === opt.value ? 'rgba(61,248,200,0.06)' : 'var(--bg-card)',
                  color: recurrencia === opt.value ? 'var(--accent)' : 'var(--fg)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  textAlign: 'center',
                  lineHeight: 1.4,
                }}
              >
                <div style={{ fontSize: '18px', marginBottom: '2px' }}>{opt.icon}</div>
                <div>{opt.label}</div>
              </button>
            ))}
          </div>

          {recurrencia !== 'ninguna' && (
            <div style={{ marginTop: '12px' }}>
              {recurrencia === 'frecuencia' && (
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <label className="label">Frecuencia</label>
                  <select
                    className="select"
                    value={frecuenciaTipo}
                    onChange={e => setFrecuenciaTipo(e.target.value as FrecuenciaTipo)}
                  >
                    <option value="diario">Diario</option>
                    <option value="interdiario">Interdiario</option>
                    <option value="semanal">Semanal</option>
                  </select>
                </div>
              )}
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="label">Fecha hasta</label>
                <input
                  type="date"
                  className="input"
                  value={fechaHasta}
                  onChange={e => setFechaHasta(e.target.value)}
                  min={fechaVal}
                />
              </div>
              {summary && (
                <div style={{
                  padding: '8px 12px',
                  background: 'rgba(61,248,200,0.05)',
                  border: '1px solid rgba(61,248,200,0.2)',
                  borderRadius: '6px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--fg-muted)',
                }}>
                  {summary}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Color picker */}
        <div className="form-group">
          <label className="label">Color</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {COLORS.map(c => {
              const hex = COLOR_HEX[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  style={{
                    width: 'clamp(36px, 8vw, 44px)',
                    height: 'clamp(36px, 8vw, 44px)',
                    borderRadius: '50%',
                    background: hex,
                    border: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                    boxShadow: color === c
                      ? `0 0 0 2px var(--bg), 0 0 0 4px ${hex}`
                      : 'none',
                    transition: 'box-shadow 0.15s',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div className="form-group">
          <label className="label">Notas</label>
          <textarea
            className="input"
            style={{ resize: 'vertical', minHeight: '72px' }}
            placeholder="Notas adicionales..."
            value={notas}
            onChange={e => setNotas(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={onCancelar}
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending}
          >
            {isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear clase'}
          </button>
        </div>
      </form>
    </>
  );
}
