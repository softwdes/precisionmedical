'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import PlansModal from './PlansModal';
import { type Plan } from './PlanAlert';

const COPY: Record<string, { title: string; highlight: string; desc: string }> = {
  basico: {
    title: '¿Listo para crecer?',
    highlight: 'Plan VIP',
    desc: 'Desbloquea WhatsApp integrado, más consultas de IA diarias y mayor capacidad de alumnos.',
  },
  vip: {
    title: 'Lleva tu negocio al máximo',
    highlight: 'Plan Premium',
    desc: 'Alumnos y consultas IA sin límite, métricas avanzadas y soporte prioritario.',
  },
};

interface Props {
  planNombreRaw: string;
}

export default function UpgradeBanner({ planNombreRaw }: Props) {
  const [dismissed, setDismissed] = useState(true);
  const [visible, setVisible]     = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [planes, setPlanes]       = useState<Plan[]>([]);

  const copy   = COPY[planNombreRaw];
  const lsKey  = `precision_upgrade_banner_${planNombreRaw}`;

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), []);

  useEffect(() => {
    if (!copy) return;
    const stored = localStorage.getItem(lsKey);
    if (stored && Date.now() - parseInt(stored) < 7 * 24 * 60 * 60 * 1000) return;
    setDismissed(false);
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, [copy, lsKey]);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(lsKey, String(Date.now()));
    setTimeout(() => setDismissed(true), 350);
  }

  async function openPlans() {
    if (planes.length === 0) {
      const { data } = await supabase
        .from('planes_saas')
        .select('id, nombre, precio_mensual, limite_alumnos, limite_ia_diario, incluye_metricas, incluye_whatsapp, incluye_soporte_prioritario')
        .eq('activo', true)
        .order('precio_mensual', { ascending: true });
      if (data) setPlanes(data as Plan[]);
    }
    setShowModal(true);
  }

  if (!copy || dismissed) return null;

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
        padding: '14px 16px',
        background: 'linear-gradient(135deg, rgba(63,248,200,0.06) 0%, rgba(63,248,200,0.02) 100%)',
        border: '1px solid rgba(63,248,200,0.2)',
        borderRadius: '10px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'opacity 0.35s ease, transform 0.35s ease',
      }}>
        {/* Icon */}
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
          background: 'rgba(63,248,200,0.1)', border: '1px solid rgba(63,248,200,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: '160px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: '#E6EDEC', lineHeight: 1.3 }}>
            {copy.title}{' '}
            <span style={{ color: 'var(--accent)' }}>→ {copy.highlight}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6B7472', marginTop: '3px', lineHeight: 1.5 }}>
            {copy.desc}
          </div>
        </div>

        {/* Ver planes CTA */}
        <button
          onClick={openPlans}
          style={{
            height: '34px', padding: '0 16px', flexShrink: 0,
            background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--fg-on-accent)', fontFamily: 'var(--font-sans)',
            fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Ver planes
        </button>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#4A5250', padding: '6px', display: 'flex', flexShrink: 0,
          }}
          aria-label="Cerrar"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {showModal && planes.length > 0 && (
        <PlansModal
          plans={planes}
          planActualNombre={planNombreRaw}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
