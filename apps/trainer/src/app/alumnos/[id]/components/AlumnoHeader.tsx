'use client';

import { useState } from 'react';
import WAComposerModal from './WAComposerModal';

const G = '#1D9E75';
const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface Student {
  id: string; full_name: string; email: string | null; phone: string | null;
  experience_level: string | null; goals: string[] | null; created_at: string;
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado',
};

function initials(name: string) {
  return name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

interface Props {
  student: Student;
  ultimaCuotaEstado?: string;
  cuota?: { monto: number; fecha_vencimiento: string } | null;
}

export default function AlumnoHeader({ student, ultimaCuotaEstado, cuota }: Props) {
  const [showWA, setShowWA] = useState(false);
  const nivel = LEVEL_LABEL[student.experience_level ?? ''] ?? '—';
  const pagoOk = ultimaCuotaEstado === 'pagado';
  const pagoPendiente = ultimaCuotaEstado === 'pendiente' || ultimaCuotaEstado === 'vencido';

  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
      {/* Avatar */}
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: G, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#000' }}>{initials(student.full_name)}</span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '16px', fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {student.full_name}
        </div>
        <div style={{ fontSize: '12px', color: '#888', marginTop: '3px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {student.email && <span>{student.email}</span>}
          {student.phone && <span>· {student.phone}</span>}
          <span>· desde {fmtDate(student.created_at)}</span>
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
        {/* Nivel */}
        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '4px', background: G, color: '#000', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {nivel}
        </span>

        {/* Estado activo */}
        <span style={{ fontSize: '12px', color: G, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: G, display: 'inline-block' }} />
          Activo
        </span>

        {/* Estado pago */}
        {ultimaCuotaEstado && (
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '4px', border: `1px solid ${pagoOk ? G : '#EF9F27'}`, color: pagoOk ? G : '#EF9F27' }}>
            {pagoOk ? 'Al día' : 'Pago pendiente'}
          </span>
        )}

        {/* WA */}
        {student.phone && (
          <button
            onClick={() => setShowWA(true)}
            style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '4px', border: `1px solid ${G}`, color: G, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </button>
        )}

        {showWA && (
          <WAComposerModal
            alumnoId={student.id}
            alumnoNombre={student.full_name}
            alumnoPhone={student.phone}
            cuota={cuota}
            defaultTipo="bienvenida"
            onClose={() => setShowWA(false)}
          />
        )}

      </div>
    </div>
  );
}
