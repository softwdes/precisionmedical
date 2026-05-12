'use client';

import { useEffect, useState } from 'react';
import { type Plan } from './PlanAlert';

const WA_NUMBER = '51993859385';
const WA_MSG = encodeURIComponent('Hola, quiero mejorar mi plan de Neural Trainer Gym.');
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${WA_MSG}`;

const PLAN_META: Record<string, { label: string }> = {
  basico:  { label: 'Básico' },
  vip:     { label: 'VIP' },
  premium: { label: 'Premium' },
};

const CheckIcon = ({ ok }: { ok: boolean }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" style={{ flexShrink: 0 }}>
    {ok
      ? <><circle cx="8" cy="8" r="7" fill="rgba(63,248,200,0.12)"/><polyline points="5,8 7,10.5 11,6" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></>
      : <><circle cx="8" cy="8" r="7" fill="rgba(255,255,255,0.04)"/><line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="#4A5250" strokeWidth="1.6" strokeLinecap="round"/><line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="#4A5250" strokeWidth="1.6" strokeLinecap="round"/></>
    }
  </svg>
);

interface Props {
  plans: Plan[];
  planActualNombre: string;
  onClose: () => void;
}

export default function PlansModal({ plans, planActualNombre, onClose }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(5px)',
        zIndex: 8500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease',
      }}
      onClick={close}
    >
      <div
        style={{
          width: '100%', maxWidth: '520px',
          background: '#0c0f0e',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '14px', overflow: 'hidden',
          boxShadow: '0 28px 72px rgba(0,0,0,0.9)',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          transition: 'transform 0.32s cubic-bezier(0.34,1.4,0.64,1)',
          maxHeight: '90dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '20px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#E6EDEC' }}>Planes disponibles</div>
              <div style={{ fontSize: '12px', color: '#6B7472', marginTop: '2px' }}>Elige el plan que mejor se adapta a tu negocio</div>
            </div>
            <button
              onClick={close}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7472', padding: '4px', display: 'flex' }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Plan cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            {plans.map(plan => {
              const meta       = PLAN_META[plan.nombre] ?? { label: plan.nombre };
              const isCurrent  = plan.nombre === planActualNombre;
              const isPopular  = plan.nombre === 'vip';
              const isUpgrade  = !isCurrent && (
                (planActualNombre === 'basico') ||
                (planActualNombre === 'vip' && plan.nombre === 'premium')
              );
              const cardBorder = isCurrent  ? 'var(--accent)'
                               : isUpgrade  ? 'rgba(63,248,200,0.25)'
                               : 'rgba(255,255,255,0.08)';
              const cardBg     = isCurrent  ? 'rgba(63,248,200,0.05)' : 'rgba(255,255,255,0.02)';

              const features = [
                { label: `${plan.limite_alumnos    ?? '∞'} alumnos`,           ok: true },
                { label: `${plan.limite_ia_diario  ?? '∞'} consultas IA/día`,  ok: true },
                { label: 'Métricas avanzadas',   ok: plan.incluye_metricas },
                { label: 'WhatsApp integrado',    ok: plan.incluye_whatsapp },
                { label: 'Soporte prioritario',   ok: plan.incluye_soporte_prioritario },
              ];

              return (
                <div key={plan.id} style={{ border: `1px solid ${cardBorder}`, borderRadius: '10px', background: cardBg, overflow: 'hidden' }}>
                  {/* Card header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#E6EDEC', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {meta.label}
                      </span>
                      {isCurrent && (
                        <span style={{
                          fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                          color: 'var(--accent)', background: 'rgba(63,248,200,0.12)',
                          border: '1px solid rgba(63,248,200,0.25)', borderRadius: '3px', padding: '2px 6px',
                        }}>Tu plan</span>
                      )}
                      {isPopular && !isCurrent && (
                        <span style={{
                          fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                          color: '#EF9F27', background: 'rgba(239,159,39,0.1)',
                          border: '1px solid rgba(239,159,39,0.25)', borderRadius: '3px', padding: '2px 6px',
                        }}>★ Popular</span>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '15px', color: isCurrent ? 'var(--accent)' : '#E6EDEC' }}>
                      ${plan.precio_mensual}
                      <span style={{ fontWeight: 400, fontSize: '11px', color: '#6B7472' }}>/mes</span>
                    </span>
                  </div>

                  {/* Features */}
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {features.map(f => (
                      <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckIcon ok={f.ok} />
                        <span style={{ fontSize: '12px', color: f.ok ? '#C8D5D3' : '#4A5250' }}>{f.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div style={{ padding: '0 16px 14px' }}>
                    {isCurrent ? (
                      <div style={{
                        height: '36px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(63,248,200,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.04em',
                      }}>Plan actual</div>
                    ) : (
                      <a
                        href={WA_URL} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          height: '36px', borderRadius: 'var(--radius-sm)',
                          background: isUpgrade ? 'rgba(63,248,200,0.1)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${isUpgrade ? 'rgba(63,248,200,0.3)' : 'rgba(255,255,255,0.1)'}`,
                          color: isUpgrade ? 'var(--accent)' : '#C8D5D3',
                          fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em',
                          textDecoration: 'none', cursor: 'pointer',
                        }}
                      >Contactar</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom WhatsApp CTA */}
          <a
            href={WA_URL} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              height: '44px', borderRadius: 'var(--radius-sm)',
              background: '#25D366', color: '#00120E', textDecoration: 'none',
              fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '13px',
              letterSpacing: '0.04em', width: '100%',
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Contactar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
