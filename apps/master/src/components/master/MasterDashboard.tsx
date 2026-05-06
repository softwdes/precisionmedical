'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import MasterAI from './MasterAI';
import type {
  MasterMetrics, MrrMensual, DistribucionPlan,
  TopTrainer, ActividadReciente, AlertBanners,
} from '@/types/master';

const V = '#534AB7';

interface Props {
  metrics: MasterMetrics;
  mrrHistory: MrrMensual[];
  planDistribution: DistribucionPlan[];
  topTrainers: TopTrainer[];
  recentActivity: ActividadReciente[];
  alerts: AlertBanners;
  adminId: string;
  adminEmail: string;
}

function MetricCard({ label, value, delta, deltaLabel, barPct, barColor, prefix = '' }: {
  label: string; value: number | string; delta?: number | string; deltaLabel?: string;
  barPct?: number; barColor: string; prefix?: string;
}) {
  const deltaNum = typeof delta === 'number' ? delta : parseFloat(String(delta ?? '0'));
  const positive = deltaNum >= 0;
  return (
    <div className="metric" style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="label-caps">{label}</div>
      <div className="metric-row">
        <span className="metric-value">{prefix}{typeof value === 'number' ? value.toLocaleString() : value}</span>
        {delta !== undefined && (
          <span style={{ fontSize: '12px', fontWeight: 600, color: positive ? '#3FF8C8' : '#f87171', display: 'flex', alignItems: 'center', gap: '3px' }}>
            {positive ? '▲' : '▼'} {Math.abs(deltaNum)}{deltaLabel}
          </span>
        )}
      </div>
      {barPct !== undefined && (
        <div className="metric-bar">
          <span style={{ width: `${Math.min(barPct, 100)}%`, background: barColor }} />
        </div>
      )}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

const ACTIVITY_COLORS: Record<string, string> = {
  registro: '#3FF8C8', cambio_plan: V, cancelacion: '#f87171',
  pago: '#3FF8C8', trial_vencido: '#EF9F27', suspension: '#EF9F27',
};

const PLAN_LABEL: Record<string, string> = { basico: 'Básico', vip: 'VIP', premium: 'Premium', trial: 'Trial' };

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function MasterDashboard({
  metrics, mrrHistory, planDistribution, topTrainers, recentActivity, alerts, adminId, adminEmail,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const mrrDelta = metrics.mrr_prev > 0 ? Math.round(((metrics.mrr_actual - metrics.mrr_prev) / metrics.mrr_prev) * 100) : 0;
  const mrrPct = metrics.mrr_prev > 0 ? Math.min(Math.round((metrics.mrr_actual / (metrics.mrr_prev * 1.2)) * 100), 100) : 50;
  const activosPct = metrics.trainers_activos_prev > 0
    ? Math.min(Math.round((metrics.trainers_activos / (metrics.trainers_activos_prev * 1.2)) * 100), 100) : 70;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Alert banner */}
      {alerts.show && (
        <div style={{ background: 'rgba(239,159,39,0.12)', border: '1px solid rgba(239,159,39,0.35)', borderRadius: '8px', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#EF9F27' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>
              {[
                alerts.trials_vencen > 0 && `${alerts.trials_vencen} trial${alerts.trials_vencen > 1 ? 's' : ''} vence${alerts.trials_vencen > 1 ? 'n' : ''} esta semana`,
                alerts.pagos_vencidos > 0 && `${alerts.pagos_vencidos} pago${alerts.pagos_vencidos > 1 ? 's' : ''} vencido${alerts.pagos_vencidos > 1 ? 's' : ''}`,
                alerts.sin_actividad > 0 && `${alerts.sin_actividad} trainer${alerts.sin_actividad > 1 ? 's' : ''} sin actividad`,
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
          <Link href="/master/facturacion" style={{ fontSize: '12px', fontWeight: 700, color: '#EF9F27', textDecoration: 'none', whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>
            Ver facturación →
          </Link>
        </div>
      )}

      {/* 4 Metric cards */}
      <section className="metrics-row">
        <MetricCard
          label="Trainers activos"
          value={metrics.trainers_activos}
          delta={metrics.trainers_activos - metrics.trainers_activos_prev}
          deltaLabel=" vs mes ant."
          barPct={activosPct}
          barColor={V}
        />
        <MetricCard
          label="MRR"
          value={metrics.mrr_actual}
          delta={mrrDelta}
          deltaLabel="%"
          barPct={mrrPct}
          barColor="#1D9E75"
          prefix="$"
        />
        <MetricCard
          label="Trials activos"
          value={metrics.trainers_trial}
          delta={metrics.trials_conv_rate}
          deltaLabel="% conv."
          barPct={metrics.trainers_trial > 0 ? Math.min(metrics.trainers_trial * 10, 100) : 0}
          barColor="#EF9F27"
        />
        <MetricCard
          label="Churn este mes"
          value={metrics.churn_mes}
          delta={metrics.churn_rate}
          deltaLabel="% churn"
          barPct={Math.min(metrics.churn_rate * 4, 100)}
          barColor="#E24B4A"
        />
      </section>

      {/* MasterAI */}
      <section>
        <div className="label-caps" style={{ marginBottom: '14px' }}>Agente MasterAI</div>
        <MasterAI adminId={adminId} metrics={metrics} />
      </section>

      {/* Bottom grids row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* MRR chart */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <div className="label-caps">MRR últimos 8 meses</div>
            </div>
          </div>
          {mounted ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={mrrHistory} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="mes" tick={{ fill: 'var(--fg-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--fg-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: '#0d0d0f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, 'MRR']}
                />
                <Bar dataKey="monto" fill={V} fillOpacity={0.7} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 180 }} />}
        </div>

        {/* Plan distribution */}
        <div className="card">
          <div className="label-caps" style={{ marginBottom: '16px' }}>Distribución por plan</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {planDistribution.map(d => (
              <div key={d.plan}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: `${d.color}20`, color: d.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {PLAN_LABEL[d.plan] ?? d.plan}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{d.count}</span>
                    <span style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>trainers</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fg-muted)' }}>
                    {d.ingreso > 0 ? `$${d.ingreso.toLocaleString()}/mes` : '—'}
                  </span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${d.porcentaje}%`, background: d.color, borderRadius: '99px', transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom grids row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Top trainers */}
        <div className="card">
          <div className="label-caps" style={{ marginBottom: '16px' }}>Top trainers por alumnos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {topTrainers.map((t, i) => {
              const pct = t.max_alumnos ? Math.round((t.students_count / t.max_alumnos) * 100) : 60;
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `rgba(83,74,183,${0.3 - i * 0.05})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{initials(t.business_name)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.business_name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, flexShrink: 0, marginLeft: '8px' }}>{t.students_count}</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: V, borderRadius: '99px' }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {topTrainers.length === 0 && <p style={{ color: 'var(--fg-muted)', fontSize: '13px' }}>Sin datos</p>}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card">
          <div className="label-caps" style={{ marginBottom: '16px' }}>Actividad reciente</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentActivity.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACTIVITY_COLORS[item.tipo] ?? 'var(--fg-muted)', marginTop: '5px', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.trainer_name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>{item.descripcion}</div>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--fg-subtle)', flexShrink: 0 }}>{timeAgo(item.created_at)}</span>
              </div>
            ))}
            {recentActivity.length === 0 && <p style={{ color: 'var(--fg-muted)', fontSize: '13px' }}>Sin actividad reciente</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
