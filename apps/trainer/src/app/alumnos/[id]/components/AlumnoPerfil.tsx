'use client';

import { useState, useTransition } from 'react';
import { createCuota } from '@/actions/finanzas';
import { useCurrencySymbol } from '@/lib/useCurrencySymbol';

const G = '#1D9E75';
const CARD: React.CSSProperties = { background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px' };
const SEC_LABEL: React.CSSProperties = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: G, marginBottom: '14px' };
const FIELD_LABEL: React.CSSProperties = { fontSize: '13px', color: '#555' };
const FIELD_VAL: React.CSSProperties = { fontSize: '13px', color: '#ccc', fontWeight: 500 };
const ROW: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #1a1a1a' };

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function fmtPeriodo(ym: string) {
  const [y, m] = ym.split('-');
  return `${MESES[parseInt(m, 10) - 1] ?? ym} ${y}`;
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado',
};
const EQUIP_LABEL: Record<string, string> = {
  full_gym: 'Gym Completo', home_basic: 'Gym Básico', bodyweight: 'Solo Peso Corporal',
};

interface Student {
  id: string; full_name: string; email: string | null; phone: string | null;
  experience_level: string | null; goals: string[] | null;
  available_equipment: string | null; birth_date: string | null; created_at: string;
}

interface Cuota {
  id: string; monto: number; fecha_pago: string | null; fecha_vencimiento: string;
  periodo: string; metodo_pago: string | null; estado: string; notas: string | null;
}

interface Props {
  student: Student;
  goalsMap: Record<string, string>;
  cuotas: Cuota[];
}

function calcVencStatus(fv: string): 'al_dia' | 'por_vencer' | 'vencido' {
  const dias = Math.ceil((new Date(fv).getTime() - Date.now()) / 86400000);
  if (dias < 0) return 'vencido';
  if (dias <= 7) return 'por_vencer';
  return 'al_dia';
}

export default function AlumnoPerfil({ student, goalsMap, cuotas }: Props) {
  const { symbol } = useCurrencySymbol();
  const [showPago, setShowPago] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pagoErr, setPagoErr] = useState('');
  const [pagoOk, setPagoOk] = useState(false);

  const ultimaCuota = cuotas[0] ?? null;
  const proxVenc = cuotas.find(c => c.estado !== 'pagado');
  const vencStatus = proxVenc ? calcVencStatus(proxVenc.fecha_vencimiento) : null;

  const vencColor = vencStatus === 'vencido' ? '#E24B4A' : vencStatus === 'por_vencer' ? '#EF9F27' : G;

  const resolveGoals = (ids: string[] | null) =>
    ids?.map(g => goalsMap[g] ?? g).join(', ') || '—';

  function handleRegistrarPago(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPagoErr('');
    const mesIdx = MESES.indexOf(fd.get('periodo_mes') as string) + 1;
    const periodo = `${fd.get('periodo_anio')}-${String(mesIdx).padStart(2, '0')}`;
    startTransition(async () => {
      const res = await createCuota({
        alumno_id: student.id,
        monto: parseFloat(fd.get('monto') as string),
        fecha_vencimiento: fd.get('fecha_vencimiento') as string,
        periodo,
        ...(fd.get('metodo_pago') ? { metodo_pago: fd.get('metodo_pago') as string } : {}),
        ...(fd.get('fecha_pago') ? { fecha_pago: fd.get('fecha_pago') as string } : {}),
      });
      if (res.error) { setPagoErr(res.error); return; }
      setPagoOk(true);
      setShowPago(false);
      setTimeout(() => setPagoOk(false), 3000);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {/* Datos personales */}
        <div style={CARD}>
          <div style={SEC_LABEL}>Datos personales</div>
          {[
            ['Nombre', student.full_name],
            ['Email', student.email ?? '—'],
            ['Celular', student.phone ?? '—'],
            ['Nivel', LEVEL_LABEL[student.experience_level ?? ''] ?? '—'],
            ['Equipamiento', EQUIP_LABEL[student.available_equipment ?? ''] ?? '—'],
            ['Estado', 'Activo'],
            ['Alumno desde', fmtDate(student.created_at)],
            ...(student.birth_date ? [['Nacimiento', fmtDate(student.birth_date)]] : []),
          ].map(([label, val], i, arr) => (
            <div key={label} style={{ ...ROW, borderBottom: i < arr.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
              <span style={FIELD_LABEL}>{label}</span>
              <span style={{ ...FIELD_VAL, textAlign: 'right', maxWidth: '60%' }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Objetivos */}
        <div style={CARD}>
          <div style={SEC_LABEL}>Objetivos</div>
          {student.goals && student.goals.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {student.goals.map(g => (
                <span key={g} style={{ fontSize: '13px', color: '#ccc', padding: '6px 10px', background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)', borderRadius: '4px' }}>
                  {goalsMap[g] ?? g}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: '#555', marginBottom: '16px' }}>Sin objetivos registrados</p>
          )}
        </div>
      </div>

      {/* Estado de pago */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={SEC_LABEL}>Estado de pago</div>
          <button
            onClick={() => setShowPago(v => !v)}
            style={{ fontSize: '11px', fontWeight: 700, padding: '5px 12px', borderRadius: '4px', background: G, color: '#000', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            + Registrar pago
          </button>
        </div>

        {pagoOk && (
          <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.3)', borderRadius: '4px', fontSize: '12px', color: G }}>
            Pago registrado correctamente
          </div>
        )}

        {showPago && (
          <form onSubmit={handleRegistrarPago} style={{ background: '#0d0d0d', border: '1px solid #222', borderRadius: '6px', padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pagoErr && <div style={{ fontSize: '12px', color: '#E24B4A' }}>{pagoErr}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px' }}>Monto *</label>
                <input name="monto" type="number" step="0.01" required className="input" style={{ height: '34px' }} placeholder="0.00" />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px' }}>Período *</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select name="periodo_mes" required className="select" style={{ height: '34px', flex: 1 }} defaultValue={MESES[new Date().getMonth()]}>
                    {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select name="periodo_anio" required className="select" style={{ height: '34px', width: '80px' }} defaultValue={String(new Date().getFullYear())}>
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px' }}>Vencimiento *</label>
                <input name="fecha_vencimiento" type="date" required className="input" style={{ height: '34px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px' }}>Fecha de pago</label>
                <input name="fecha_pago" type="date" className="input" style={{ height: '34px' }} defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px' }}>Método de pago</label>
                <select name="metodo_pago" className="select" style={{ height: '34px' }}>
                  <option value="">— Seleccionar —</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="yape_plin">Yape/Plin</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" disabled={isPending} style={{ fontSize: '11px', fontWeight: 700, padding: '6px 16px', borderRadius: '4px', background: G, color: '#000', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>
                {isPending ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={() => setShowPago(false)} style={{ fontSize: '11px', fontWeight: 600, padding: '6px 14px', borderRadius: '4px', background: 'none', border: '1px solid #333', color: '#888', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        {ultimaCuota ? (
          <div>
            <div style={{ ...ROW }}>
              <span style={FIELD_LABEL}>Última cuota</span>
              <span style={FIELD_VAL}>{fmtPeriodo(ultimaCuota.periodo)} · {symbol}{ultimaCuota.monto}</span>
            </div>
            {ultimaCuota.fecha_pago && (
              <div style={{ ...ROW }}>
                <span style={FIELD_LABEL}>Fecha de pago</span>
                <span style={FIELD_VAL}>{fmtDate(ultimaCuota.fecha_pago)}</span>
              </div>
            )}
            {ultimaCuota.metodo_pago && (
              <div style={{ ...ROW }}>
                <span style={FIELD_LABEL}>Método</span>
                <span style={FIELD_VAL}>{ultimaCuota.metodo_pago}</span>
              </div>
            )}
            {proxVenc && (
              <div style={{ ...ROW, borderBottom: 'none' }}>
                <span style={FIELD_LABEL}>Próximo vencimiento</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: vencColor }}>
                  {fmtDate(proxVenc.fecha_vencimiento)}
                  {vencStatus === 'vencido' && ' · VENCIDO'}
                  {vencStatus === 'por_vencer' && ' · VENCE PRONTO'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: '13px', color: '#555' }}>Sin cuotas registradas</p>
        )}
      </div>
    </div>
  );
}
