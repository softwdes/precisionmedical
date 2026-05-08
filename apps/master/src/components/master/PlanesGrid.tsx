'use client';

import type { PlanSaas } from '@/types/master';

const V = '#534AB7';

interface Props {
  planes: PlanSaas[];
}

const PLAN_CONFIG: Record<string, {
  badge: string; badgeBg: string; badgeText: string;
  border: string; popular?: boolean;
}> = {
  basico: { badge: 'Básico', badgeBg: 'rgba(156,163,175,0.15)', badgeText: '#9CA3AF', border: 'rgba(255,255,255,0.08)' },
  vip: { badge: 'VIP', badgeBg: 'rgba(83,74,183,0.2)', badgeText: '#A39FE8', border: 'rgba(83,74,183,0.45)', popular: true },
  premium: { badge: 'Premium', badgeBg: 'rgba(217,119,6,0.15)', badgeText: '#F59E0B', border: 'rgba(217,119,6,0.35)' },
};

function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="#3FF8C8" strokeWidth="2.5" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2.5" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function PlanCard({ plan }: { plan: PlanSaas }) {
  const cfg = (PLAN_CONFIG[plan.nombre] ?? PLAN_CONFIG.basico)!;
  const features = [
    { label: `${plan.limite_alumnos ?? '∞'} alumnos`, ok: true },
    { label: 'Rutinas ilimitadas', ok: true },
    { label: 'Gestión de pagos', ok: true },
    { label: `${plan.limite_ia_diario ?? '∞'} consultas IA/día`, ok: (plan.limite_ia_diario ?? 0) > 0 || plan.limite_ia_diario === null },
    { label: 'Métricas avanzadas', ok: plan.incluye_metricas },
    { label: 'WhatsApp integrado', ok: plan.incluye_whatsapp },
    { label: 'Soporte prioritario', ok: plan.incluye_soporte_prioritario },
  ];

  return (
    <div style={{
      position: 'relative',
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${cfg.border}`,
      borderRadius: '14px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    }}>
      {cfg.popular && (
        <div style={{
          position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
          background: V, color: '#fff', fontSize: '10px', fontWeight: 700,
          padding: '2px 12px', borderRadius: '99px', letterSpacing: '0.08em',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          Popular
        </div>
      )}

      {/* Header */}
      <div>
        <span style={{
          fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px',
          background: cfg.badgeBg, color: cfg.badgeText,
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {cfg.badge}
        </span>
        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{ fontSize: '32px', fontWeight: 800, color: 'var(--fg-strong)' }}>
            ${plan.precio_mensual.toLocaleString()}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>/mes</span>
        </div>
      </div>

      {/* Features */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
        {features.map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Check ok={f.ok} />
            <span style={{ fontSize: '13px', color: f.ok ? 'var(--fg)' : 'var(--fg-subtle)' }}>{f.label}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>
          {plan.trainers_count ?? 0} trainer{(plan.trainers_count ?? 0) !== 1 ? 's' : ''} activos
        </span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#3FF8C8' }}>
          {(plan.ingreso_mensual ?? 0) > 0 ? `$${(plan.ingreso_mensual ?? 0).toLocaleString()}/mes` : '—'}
        </span>
      </div>
    </div>
  );
}

export default function PlanesGrid({ planes }: Props) {
  const totalMrr = planes.reduce((s, p) => s + (p.ingreso_mensual ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
        {planes.map(p => <PlanCard key={p.id} plan={p} />)}
      </div>

      {/* Revenue summary */}
      <div className="card">
        <div className="label-caps" style={{ marginBottom: '16px' }}>Resumen de ingresos</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {planes.map((p, i) => {
            const cfg = (PLAN_CONFIG[p.nombre] ?? PLAN_CONFIG.basico)!;
            return (
              <div key={p.id} style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px',
                padding: '12px 0',
                borderBottom: i < planes.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px',
                  background: cfg.badgeBg, color: cfg.badgeText,
                  textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                }}>
                  {cfg.badge}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--fg-muted)', marginLeft: 'auto' }}>
                  {p.trainers_count ?? 0} trainers
                </span>
                <span style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>
                  × ${p.precio_mensual}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, minWidth: '80px', textAlign: 'right' }}>
                  ${(p.ingreso_mensual ?? 0).toLocaleString()}
                </span>
              </div>
            );
          })}

          {/* Total row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto',
            alignItems: 'center', gap: '16px',
            padding: '16px 0 4px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            marginTop: '4px',
          }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                MRR Total
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#3FF8C8' }}>
                ${totalMrr.toLocaleString()}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>/mes</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
