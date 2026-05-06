'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import WAComposerModal from './WAComposerModal';
import { createBrowserClient } from '@supabase/ssr';
import { useCurrencySymbol } from '@/lib/useCurrencySymbol';

const G = '#1D9E75';
const CARD: React.CSSProperties = { background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px', marginBottom: '16px' };
const SEC_LABEL: React.CSSProperties = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: G, marginBottom: '14px' };

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtPeriodo(inicio: string, fin?: string) {
  const d = new Date(inicio);
  const s = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (!fin) return s;
  const d2 = new Date(fin);
  return `${MONTHS[d.getMonth()]} – ${MONTHS[d2.getMonth()]} ${d2.getFullYear()}`;
}
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function fmtCuotaPeriodo(ym: string) {
  const [y, m] = ym.split('-');
  return `${MESES_FULL[parseInt(m, 10) - 1] ?? ym} ${y}`;
}

interface RutinaHistorial {
  id: string; nombre: string; fecha_inicio: string; activo: boolean; created_at: string;
}
interface RutinaActiva {
  id: string; nombre: string; fecha_inicio: string;
}
interface Cuota {
  id: string; monto: number; fecha_pago: string | null; fecha_vencimiento: string;
  periodo: string; metodo_pago: string | null; estado: string; notas: string | null;
}
interface WaMensaje {
  id: string; tipo_mensaje: string; contenido: string; fecha_envio: string; estado: string;
}

interface Props {
  alumnoId: string;
  alumnoNombre: string;
  alumnoPhone: string | null;
  rutinasHistorial: RutinaHistorial[];
  rutinaActiva?: RutinaActiva | null;
}

const CUOTA_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  pagado:    { bg: 'rgba(29,158,117,0.12)', color: G, label: 'Pagado' },
  pendiente: { bg: 'rgba(239,159,39,0.12)', color: '#EF9F27', label: 'Pendiente' },
  vencido:   { bg: 'rgba(226,75,74,0.12)', color: '#E24B4A', label: 'Vencido' },
};

const WA_STATUS: Record<string, { color: string; label: string }> = {
  enviado:   { color: G, label: 'Enviado' },
  pendiente: { color: '#EF9F27', label: 'Pendiente' },
  error:     { color: '#E24B4A', label: 'Error' },
};

export default function AlumnoHistorial({ alumnoId, alumnoNombre, alumnoPhone, rutinasHistorial, rutinaActiva }: Props) {
  const { symbol } = useCurrencySymbol();
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [waMensajes, setWaMensajes] = useState<WaMensaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWAComposer, setShowWAComposer] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [cuotasRes, waRes] = await Promise.all([
        supabase
          .from('cuotas')
          .select('id, monto, fecha_pago, fecha_vencimiento, periodo, metodo_pago, estado, notas')
          .eq('alumno_id', alumnoId)
          .order('fecha_vencimiento', { ascending: false })
          .limit(10),
        supabase
          .from('whatsapp_mensajes')
          .select('id, tipo_mensaje, contenido, fecha_envio, estado')
          .eq('alumno_id', alumnoId)
          .order('fecha_envio', { ascending: false })
          .limit(5),
      ]);
      setCuotas(cuotasRes.data ?? []);
      setWaMensajes(waRes.data ?? []);
      setLoading(false);
    }
    fetchData();
  }, [alumnoId, supabase]);

  return (
    <div>
      {/* Rutinas */}
      <div style={CARD}>
        <div style={SEC_LABEL}>Rutinas</div>
        {!rutinaActiva && rutinasHistorial.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#555' }}>Sin rutinas registradas.</p>
        ) : (
          <div>
            {rutinaActiva && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: rutinasHistorial.length > 0 ? '1px solid #1a1a1a' : 'none' }}>
                <div>
                  <div style={{ fontSize: '13px', color: '#ccc', fontWeight: 500 }}>{rutinaActiva.nombre}</div>
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>Desde {fmtDate(rutinaActiva.fecha_inicio)}</div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(29,158,117,0.12)', color: G }}>
                  Activa
                </span>
              </div>
            )}
            {rutinasHistorial.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < rutinasHistorial.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
                <div>
                  <div style={{ fontSize: '13px', color: '#ccc', fontWeight: 500 }}>{r.nombre}</div>
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{fmtDate(r.fecha_inicio)}</div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#1a2a1a', color: '#555' }}>
                  Inactiva
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial de pagos */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={SEC_LABEL}>Historial de pagos</div>
          <Link href="/finanzas" style={{ fontSize: '11px', color: '#555', textDecoration: 'none' }}>
            Ver todos →
          </Link>
        </div>
        {loading ? (
          <p style={{ fontSize: '13px', color: '#555' }}>Cargando...</p>
        ) : cuotas.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#555' }}>Sin pagos registrados.</p>
        ) : (
          cuotas.map((c, i) => {
            const st = (CUOTA_STATUS[c.estado] ?? CUOTA_STATUS.pendiente)!;
            return (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < cuotas.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
                <div>
                  <div style={{ fontSize: '13px', color: '#ccc', fontWeight: 500 }}>{fmtCuotaPeriodo(c.periodo)}</div>
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
                    Vence {fmtDate(c.fecha_vencimiento)}
                    {c.metodo_pago && ` · ${c.metodo_pago}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#ccc' }}>{symbol}{c.monto}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Mensajes WhatsApp */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={SEC_LABEL}>Mensajes WhatsApp</div>
          {alumnoPhone && (
            <button
              onClick={() => setShowWAComposer(true)}
              style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '4px', border: `1px solid ${G}`, color: G, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Enviar mensaje
            </button>
          )}
        </div>
        {loading ? (
          <p style={{ fontSize: '13px', color: '#555' }}>Cargando...</p>
        ) : waMensajes.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#555' }}>Sin mensajes registrados.</p>
        ) : (
          waMensajes.map((m, i) => {
            const st = (WA_STATUS[m.estado] ?? WA_STATUS.pendiente)!;
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < waMensajes.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.tipo_mensaje}</div>
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.contenido}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', marginLeft: '12px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: st.color, fontWeight: 600 }}>{st.label}</span>
                  <span style={{ fontSize: '11px', color: '#555' }}>{fmtDate(m.fecha_envio)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
      {showWAComposer && (
        <WAComposerModal
          alumnoId={alumnoId}
          alumnoNombre={alumnoNombre}
          alumnoPhone={alumnoPhone}
          cuota={cuotas[0] ? { monto: cuotas[0].monto, fecha_vencimiento: cuotas[0].fecha_vencimiento } : null}
          defaultTipo="vencimiento"
          onClose={() => setShowWAComposer(false)}
          onSent={(tipo, contenido) => {
            setWaMensajes(prev => [{
              id: crypto.randomUUID(),
              tipo_mensaje: tipo,
              contenido,
              fecha_envio: new Date().toISOString(),
              estado: 'enviado',
            }, ...prev]);
          }}
        />
      )}
    </div>
  );
}
