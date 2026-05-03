'use client';

import { useState } from 'react';
import type { Clase } from '@/types/clases';
import { eliminarClase } from '@/lib/clases';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  personal: 'Personal',
  grupal: 'Grupal',
  evaluacion: 'Evaluación física',
  bloque: 'Bloque personal',
};

const COLOR_HEX: Record<string, string> = {
  green: '#1D9E75',
  blue: '#378ADD',
  purple: '#7F77DD',
  amber: '#EF9F27',
  coral: '#D85A30',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateES(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function capitalizeFirst(str: string): string {
  return str.length === 0 ? str : (str.at(0)?.toUpperCase() ?? '') + str.slice(1);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  clase: Clase;
  fechaOcurrencia: string;
  onEditar: () => void;
  onEliminar: () => void;
  onCerrar: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DetalleClase({ clase, fechaOcurrencia, onEditar, onEliminar, onCerrar }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const colorHex = COLOR_HEX[clase.color] ?? '#1D9E75';
  const tipoLabel = TIPO_LABELS[clase.tipo] ?? clase.tipo;

  const alumnosStr = clase.clase_alumnos && clase.clase_alumnos.length > 0
    ? clase.clase_alumnos.map(a => a.students?.full_name ?? '—').join(', ')
    : '—';

  async function handleEliminar() {
    setDeleting(true);
    setError('');
    try {
      await eliminarClase(clase.id);
      onEliminar();
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  }

  function recurrenciaLabel(): string | null {
    if (clase.recurrencia === 'ninguna') return null;
    if (clase.recurrencia === 'rango') {
      return `Rango hasta ${clase.fecha_hasta ? formatDateES(clase.fecha_hasta) : '—'}`;
    }
    if (clase.recurrencia === 'frecuencia') {
      const freqLabel = clase.frecuencia_tipo === 'diario' ? 'Diario' : 'Interdiario';
      return `${freqLabel} hasta ${clase.fecha_hasta ? formatDateES(clase.fecha_hasta) : '—'}`;
    }
    return null;
  }

  const recLabel = recurrenciaLabel();

  return (
    <>
      <div className="modal-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: colorHex,
            flexShrink: 0,
            display: 'inline-block',
          }} />
          <div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', color: 'var(--fg)' }}>
              {clase.titulo}
            </h2>
            <span style={{
              display: 'inline-block',
              marginTop: '4px',
              padding: '2px 8px',
              background: `${colorHex}22`,
              color: colorHex,
              borderRadius: '4px',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
            }}>
              {tipoLabel}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onCerrar}
          disabled={deleting}
        >
          ✕
        </button>
      </div>

      <div className="modal-body">
        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(255,80,80,0.1)',
            border: '1px solid rgba(255,80,80,0.3)',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#ff6b6b',
            marginBottom: '12px',
          }}>
            {error}
          </div>
        )}

        <div className="info-list">
          <div className="info-row">
            <span className="info-label">Fecha</span>
            <span className="info-value">{capitalizeFirst(formatDateES(fechaOcurrencia))}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Horario</span>
            <span className="info-value">
              {clase.hora_inicio.slice(0, 5)} – {clase.hora_fin.slice(0, 5)}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Tipo</span>
            <span className="info-value">{tipoLabel}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Alumnos</span>
            <span className="info-value">{alumnosStr}</span>
          </div>
          {recLabel && (
            <div className="info-row">
              <span className="info-label">Recurrencia</span>
              <span className="info-value">{recLabel}</span>
            </div>
          )}
          {clase.notas && (
            <div className="info-row">
              <span className="info-label">Notas</span>
              <span className="info-value" style={{ whiteSpace: 'pre-wrap' }}>{clase.notas}</span>
            </div>
          )}
        </div>
      </div>

      <div className="modal-actions" style={{ padding: '12px 24px' }}>
        <button
          type="button"
          className="btn btn-outline"
          style={{ color: '#ff6b6b', borderColor: 'rgba(255,80,80,0.4)' }}
          onClick={handleEliminar}
          disabled={deleting}
        >
          {deleting ? 'Eliminando...' : 'Eliminar'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={onEditar}
          disabled={deleting}
        >
          Editar
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={onCerrar}
          disabled={deleting}
        >
          Cerrar
        </button>
      </div>
    </>
  );
}
