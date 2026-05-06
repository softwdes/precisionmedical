'use client';

import Link from 'next/link';

const G = '#1D9E75';
const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface RutinaEjercicio {
  id: string; orden: number; sets: number; reps: string; descanso_seg: number;
  notas: string | null; ejercicio_id: string | null;
  exercises: { name: string } | null;
}
interface RutinaDia {
  id: string; orden: number; nombre: string;
  rutina_ejercicios: RutinaEjercicio[];
}
interface RutinaActiva {
  id: string; nombre: string; fecha_inicio: string; activo: boolean;
  rutina_dias: RutinaDia[];
}
interface RutinaHistorial {
  id: string; nombre: string; fecha_inicio: string; activo: boolean; created_at: string;
}

interface Props {
  alumnoId: string;
  rutinaActiva: RutinaActiva | null;
  rutinasHistorial: RutinaHistorial[];
}

export default function AlumnoRutina({ alumnoId, rutinaActiva, rutinasHistorial }: Props) {
  const CARD: React.CSSProperties = { background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px' };
  const SEC_LABEL: React.CSSProperties = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: G, marginBottom: '14px' };

  if (!rutinaActiva) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Aviso sin rutina */}
        <div style={{ background: '#1a1200', border: '1px solid #EF9F27', borderRadius: '8px', padding: '20px' }}>
          <div style={{ fontSize: '13px', color: '#EF9F27', marginBottom: '12px' }}>
            No tiene rutina activa asignada.
          </div>
          <Link
            href={`/asignar?alumnoId=${alumnoId}`}
            style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, padding: '8px 16px', borderRadius: '4px', background: G, color: '#000', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            ASIGNAR RUTINA →
          </Link>
        </div>

        {/* Rutinas anteriores */}
        {rutinasHistorial.length > 0 && (
          <div style={CARD}>
            <div style={SEC_LABEL}>Rutinas anteriores</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {rutinasHistorial.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < rutinasHistorial.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#ccc', fontWeight: 500 }}>{r.nombre}</div>
                    <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>Desde {fmtDate(r.fecha_inicio)}</div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#1a2a1a', color: '#555' }}>
                    Inactiva
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const dias = [...(rutinaActiva.rutina_dias ?? [])].sort((a, b) => a.orden - b.orden);

  const semanaActual = Math.floor((Date.now() - new Date(rutinaActiva.fecha_inicio).getTime()) / (7 * 86400000)) + 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Resumen */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div style={SEC_LABEL}>Rutina activa</div>
          <Link
            href={`/asignar?alumnoId=${alumnoId}`}
            style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '4px', border: '1px solid #333', color: '#888', textDecoration: 'none' }}
          >
            Asignar nueva rutina
          </Link>
        </div>

        <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>
          {rutinaActiva.nombre}
        </div>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Semana actual</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: G }}>{semanaActual}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Días de rutina</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#ccc' }}>{dias.length}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Inicio</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#ccc', marginTop: '2px' }}>{fmtDate(rutinaActiva.fecha_inicio)}</div>
          </div>
        </div>
      </div>

      {/* Días */}
      {dias.map(dia => {
        const ejercicios = [...(dia.rutina_ejercicios ?? [])].sort((a, b) => a.orden - b.orden);
        return (
          <div key={dia.id} style={{ background: '#0d0d0d', border: '1px solid #222', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #1a1a1a' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: G, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Día {dia.orden} — {dia.nombre}
              </span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {ejercicios.length === 0 ? (
                <div style={{ padding: '12px 16px', fontSize: '13px', color: '#555' }}>Sin ejercicios</div>
              ) : ejercicios.map((ej, i) => (
                <div key={ej.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: i < ejercicios.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#ccc', fontWeight: 500 }}>
                      {ej.exercises?.name ?? `Ejercicio ${ej.orden}`}
                    </div>
                    {ej.notas && (
                      <div style={{ fontSize: '11px', color: '#555', marginTop: '2px', fontStyle: 'italic' }}>{ej.notas}</div>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#555', textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                    {ej.sets} × {ej.reps}
                    {ej.descanso_seg > 0 && <span> · {ej.descanso_seg}s</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Botones pie */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link
          href={`/asignar?alumnoId=${alumnoId}`}
          style={{ fontSize: '11px', fontWeight: 700, padding: '8px 16px', borderRadius: '4px', background: G, color: '#000', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          ASIGNAR NUEVA RUTINA
        </Link>
      </div>
    </div>
  );
}
