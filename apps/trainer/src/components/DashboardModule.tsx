'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Metrics {
  alumnosActivos: number;
  cobradoMes: number;
  adherenciaGlobal: number | null;
  clasesCompletadas: number;
  clasesPendientes: number;
}

interface Alertas {
  cuotasVencidas: number;
  cuotasProximas: number;
  alumnosBajaAdherencia: string[];
}

interface ClaseHoy {
  id: string;
  titulo: string;
  hora_inicio: string;
  hora_fin: string;
  tipo: string;
  color: string;
}

interface PagoUrgente {
  id: string;
  alumnoNombre: string;
  monto: number;
  fechaVencimiento: string;
  estado: string;
}

interface ActividadItem {
  id: string;
  tipo: 'pago' | 'alumno' | 'clase';
  descripcion: string;
  tiempo: string;
}

export interface DashboardModuleProps {
  trainerId: string;
  initialMetrics: Metrics;
  alertas: Alertas;
  clasesHoy: ClaseHoy[];
  pagosUrgentes: PagoUrgente[];
  actividadReciente: ActividadItem[];
  adherenciaSemanal: number[];
  capacidadMax: number;
  metaMensual: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  green: '#22C55E',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  amber: '#F59E0B',
  coral: '#F87171',
};

const TIPO_LABEL: Record<string, string> = {
  personal: 'Personal',
  grupal: 'Grupal',
  evaluacion: 'Evaluación',
  bloque: 'Bloque',
};

function diasHasta(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardModule({
  trainerId,
  initialMetrics,
  alertas,
  clasesHoy,
  pagosUrgentes,
  actividadReciente,
  adherenciaSemanal,
  capacidadMax,
  metaMensual,
}: DashboardModuleProps) {
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [clock, setClock] = useState('');
  const [alertaDismissed, setAlertaDismissed] = useState(false);
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());

  // ── Clock ──
  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString('es-PE', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Pulse trigger ──
  const triggerPulse = useCallback((key: string) => {
    setPulsing((prev) => new Set([...prev, key]));
    setTimeout(() => {
      setPulsing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 1600);
  }, []);

  // ── Realtime subscriptions ──
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const refreshCobrado = async () => {
      const today = new Date().toISOString().split('T')[0] as string;
      const startOfMonth = `${today.slice(0, 7)}-01`;
      const { data } = await supabase
        .from('cuotas')
        .select('monto')
        .eq('trainer_id', trainerId)
        .eq('estado', 'pagado')
        .gte('fecha_pago', startOfMonth);
      const total = (data ?? []).reduce((acc, c) => acc + Number(c.monto), 0);
      setMetrics((prev) => ({ ...prev, cobradoMes: total }));
      triggerPulse('cobrado');
    };

    const refreshAdherencia = async () => {
      const today = new Date().toISOString().split('T')[0] as string;
      const ago28 = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0] as string;
      const { data } = await supabase
        .from('sesiones_entrenamiento')
        .select('alumno_id, completada')
        .gte('fecha', ago28)
        .lte('fecha', today);
      if (!data || data.length === 0) return;
      const map = new Map<string, { total: number; done: number }>();
      for (const s of data) {
        const prev = map.get(s.alumno_id) ?? { total: 0, done: 0 };
        map.set(s.alumno_id, { total: prev.total + 1, done: prev.done + (s.completada ? 1 : 0) });
      }
      const vals = Array.from(map.values());
      const avg = Math.round(vals.reduce((a, v) => a + (v.done / v.total) * 100, 0) / vals.length);
      setMetrics((prev) => ({ ...prev, adherenciaGlobal: avg }));
      triggerPulse('adherencia');
    };

    const channel = supabase
      .channel('dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cuotas' },
        refreshCobrado
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sesiones_entrenamiento' },
        refreshAdherencia
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trainerId, triggerPulse]);

  // ─── Derived values ───────────────────────────────────────────────────────
  const alumnosPct = Math.min(100, Math.round((metrics.alumnosActivos / capacidadMax) * 100));
  const cobradoPct = Math.min(100, Math.round((metrics.cobradoMes / metaMensual) * 100));
  const adherenciaPct = metrics.adherenciaGlobal ?? 0;
  const clasesTotal = metrics.clasesCompletadas + metrics.clasesPendientes;
  const clasesPct = clasesTotal > 0 ? Math.round((metrics.clasesCompletadas / clasesTotal) * 100) : 0;
  const showAlert =
    !alertaDismissed &&
    (alertas.cuotasVencidas > 0 ||
      alertas.cuotasProximas > 0 ||
      alertas.alumnosBajaAdherencia.length > 0);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>

      {/* ── Alert Banner ─────────────────────────────────── */}
      {showAlert && (
        <div style={{
          background: 'rgba(245, 193, 108, 0.10)',
          border: '1px solid rgba(245, 193, 108, 0.35)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          animation: 'fadeIn 0.3s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--warning)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase' }}>
              ⚠ Alertas
            </span>
            {alertas.cuotasVencidas > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                {alertas.cuotasVencidas} cuota{alertas.cuotasVencidas !== 1 ? 's' : ''} vencida{alertas.cuotasVencidas !== 1 ? 's' : ''}
              </span>
            )}
            {alertas.cuotasProximas > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                · {alertas.cuotasProximas} vence{alertas.cuotasProximas !== 1 ? 'n' : ''} pronto
              </span>
            )}
            {alertas.alumnosBajaAdherencia.length > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                · Baja adherencia: {alertas.alumnosBajaAdherencia.join(', ')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexShrink: 0 }}>
            <Link href="/finanzas" style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', fontWeight: 700 }}>
              Ver pagos →
            </Link>
            <button
              onClick={() => setAlertaDismissed(true)}
              style={{ color: 'var(--fg-muted)', fontSize: 16, lineHeight: 1 }}
              aria-label="Cerrar alerta"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Section Head ─────────────────────────────────── */}
      <section className="section-head">
        <span className="eyebrow">Telemetría // 01</span>
        <h1>Centro de Control</h1>
      </section>

      {/* ── 4 Metric Cards ───────────────────────────────── */}
      <section className="metrics-row">
        {/* Alumnos Activos */}
        <MetricCard
          label="Alumnos Activos"
          value={String(metrics.alumnosActivos)}
          sub={`Cap. ${alumnosPct}%`}
          pct={alumnosPct}
          color="#1D9E75"
          pulsing={pulsing.has('alumnos')}
        />
        {/* Cobrado Este Mes */}
        <MetricCard
          label="Cobrado Este Mes"
          value={`S/ ${metrics.cobradoMes >= 1000 ? (metrics.cobradoMes / 1000).toFixed(1) + 'k' : metrics.cobradoMes.toFixed(0)}`}
          sub={`${cobradoPct}% meta`}
          pct={cobradoPct}
          color="#378ADD"
          pulsing={pulsing.has('cobrado')}
        />
        {/* Adherencia Global */}
        <MetricCard
          label="Adherencia Global"
          value={metrics.adherenciaGlobal !== null ? `${metrics.adherenciaGlobal}%` : '—'}
          sub="Últimas 4 semanas"
          pct={adherenciaPct}
          color="#7F77DD"
          pulsing={pulsing.has('adherencia')}
        />
        {/* Clases Hoy */}
        <MetricCard
          label="Clases Hoy"
          value={String(clasesTotal)}
          sub={`${metrics.clasesCompletadas} completadas · ${metrics.clasesPendientes} pendientes`}
          pct={clasesPct}
          color="#EF9F27"
          pulsing={pulsing.has('clases')}
        />
      </section>

      {/* ── Bottom Grid 1: Clases hoy + Pagos urgentes + Adherencia ─── */}
      <section className="grid-asym">
        {/* Clases de hoy */}
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Clases de Hoy</div>
              <div className="card-subtitle">{clasesHoy.length} programadas</div>
            </div>
            <Link href="/horarios" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 700 }}>
              Ver calendario →
            </Link>
          </div>
          <div className="card-body">
            {clasesHoy.length === 0 ? (
              <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                Sin clases programadas para hoy
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {clasesHoy.map((clase) => {
                  const colorHex = COLOR_MAP[clase.color] ?? '#3FF8C8';
                  return (
                    <div
                      key={clase.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-3) var(--space-5)',
                        borderBottom: '1px solid var(--divider)',
                      }}
                    >
                      <div style={{ width: 3, height: 32, borderRadius: 2, background: colorHex, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--fg-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {clase.titulo}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                          {clase.hora_inicio} – {clase.hora_fin}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 'var(--text-2xs)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 'var(--tracking-wide)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--fg-muted)',
                      }}>
                        {TIPO_LABEL[clase.tipo] ?? clase.tipo}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Pagos urgentes + Adherencia semanal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Pagos urgentes */}
          <div className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Pagos Urgentes</div>
                <div className="card-subtitle">{pagosUrgentes.length} pendiente{pagosUrgentes.length !== 1 ? 's' : ''}</div>
              </div>
              <Link href="/finanzas" style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', fontWeight: 700 }}>
                Ver →
              </Link>
            </div>
            <div className="card-body">
              {pagosUrgentes.length === 0 ? (
                <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                  Sin pagos urgentes ✓
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {pagosUrgentes.slice(0, 4).map((p) => {
                    const dias = diasHasta(p.fechaVencimiento);
                    const esVencido = p.estado === 'vencido';
                    return (
                      <div key={p.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 'var(--space-2) var(--space-4)',
                        borderBottom: '1px solid var(--divider)',
                        gap: 'var(--space-2)',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.alumnoNombre}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: esVencido ? 'var(--danger)' : 'var(--warning)' }}>
                            {esVencido ? `Vencida hace ${Math.abs(dias)}d` : `Vence en ${dias}d`}
                          </div>
                        </div>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--fg-strong)', flexShrink: 0 }}>
                          S/ {p.monto}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Adherencia semanal mini chart */}
          <div className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Adherencia Semanal</div>
                <div className="card-subtitle">Últimas 4 semanas</div>
              </div>
            </div>
            <div className="card-body card-body--padded">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', height: 80, padding: '0 var(--space-2)' }}>
                {adherenciaSemanal.map((pct, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-muted)' }}>{pct}%</div>
                    <div style={{ width: '100%', height: `${Math.max(4, pct * 0.6)}px`, background: '#7F77DD', borderRadius: 'var(--radius-xs)', opacity: 0.7 + (i / adherenciaSemanal.length) * 0.3 }} />
                    <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-subtle)' }}>S{i + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom Grid 2: Actividad reciente ─────────────── */}
      <section className="grid-asym">
        {/* Alumnos últimas actividades — mostrar desde actividadReciente tipo alumno o pago */}
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Actividad de Alumnos</div>
              <div className="card-subtitle">Últimas 24 horas</div>
            </div>
            <Link href="/alumnos" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 700 }}>
              Ver alumnos →
            </Link>
          </div>
          <div className="card-body">
            {actividadReciente.length === 0 ? (
              <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                Sin actividad reciente
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {actividadReciente.slice(0, 6).map((item) => (
                  <div key={item.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-5)',
                    borderBottom: '1px solid var(--divider)',
                  }}>
                    <div style={{
                      width: 8, height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: item.tipo === 'pago' ? '#1D9E75' : item.tipo === 'alumno' ? '#378ADD' : '#7F77DD',
                    }} />
                    <div style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                      {item.descripcion}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', flexShrink: 0 }}>
                      {item.tiempo}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Feed actividad reciente */}
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Feed Reciente</div>
              <div className="card-subtitle">Eventos del sistema</div>
            </div>
          </div>
          <div className="card-body">
            {actividadReciente.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                Sin eventos recientes
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
                {actividadReciente.map((item) => (
                  <div key={item.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                    <div style={{
                      width: 20, height: 20,
                      borderRadius: 'var(--radius-xs)',
                      background: item.tipo === 'pago' ? 'rgba(29,158,117,0.15)' : item.tipo === 'alumno' ? 'rgba(55,138,221,0.15)' : 'rgba(127,119,221,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, flexShrink: 0, marginTop: 1,
                    }}>
                      {item.tipo === 'pago' ? '💳' : item.tipo === 'alumno' ? '👤' : '📅'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)', lineHeight: 1.4 }}>
                        {item.descripcion}
                      </div>
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-muted)', marginTop: 2 }}>
                        {item.tiempo}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  pct,
  color,
  pulsing,
}: {
  label: string;
  value: string;
  sub: string;
  pct: number;
  color: string;
  pulsing: boolean;
}) {
  return (
    <div
      className="metric"
      style={{
        transition: 'background 0.3s ease',
        background: pulsing ? `${color}08` : undefined,
      }}
    >
      <div className="label-caps">{label}</div>
      <div className="metric-row">
        <span className="metric-value">{value}</span>
        <span
          className="metric-delta"
          style={{ color }}
        >
          {sub}
        </span>
      </div>
      <div className="metric-bar">
        <span style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}55` }} />
      </div>
    </div>
  );
}

