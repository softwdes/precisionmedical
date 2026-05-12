'use client';

import { useState, useTransition, useEffect } from 'react';
import { registerMasterPago } from '@/actions/master';
import type { TrainerForBilling, PlanForBilling } from '@/actions/master';

interface Props {
  trainers: TrainerForBilling[];
  planes: PlanForBilling[];
  onClose: () => void;
  onSuccess: () => void;
}

const V = '#534AB7';

const NOW = new Date();
const CURRENT_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;
const CURRENT_YEAR  = String(NOW.getFullYear());
const TODAY         = NOW.toISOString().split('T')[0]!;

function calcVence(fechaPago: string, frecuencia: 'mensual' | 'anual'): string {
  const d = new Date(fechaPago);
  if (frecuencia === 'anual') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const PLAN_LABELS: Record<string, string> = { basico: 'Básico', vip: 'VIP', premium: 'Premium' };

export default function RegistrarPagoModal({ trainers, planes, onClose, onSuccess }: Props) {
  const [visible, setVisible]             = useState(false);
  const [frecuencia, setFrecuencia]       = useState<'mensual' | 'anual'>('mensual');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [monto, setMonto]                 = useState('');
  const [periodo, setPeriodo]             = useState(CURRENT_MONTH);
  const [fechaPago, setFechaPago]         = useState(TODAY);
  const [estado, setEstado]               = useState('pagado');
  const [metodoPago, setMetodoPago]       = useState('');
  const [error, setError]                 = useState('');
  const [isPending, startTransition]      = useTransition();

  useEffect(() => { setTimeout(() => setVisible(true), 10); }, []);

  useEffect(() => {
    const plan = planes.find(p => p.id === selectedPlanId);
    if (!plan) return;
    const val = frecuencia === 'anual'
      ? (plan.precio_anual ?? plan.precio_mensual * 10)
      : plan.precio_mensual;
    setMonto(String(val));
    setPeriodo(frecuencia === 'anual' ? CURRENT_YEAR : CURRENT_MONTH);
  }, [selectedPlanId, frecuencia, planes]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    fd.set('frecuencia', frecuencia);
    startTransition(async () => {
      const result = await registerMasterPago(fd);
      if (result.error) { setError(result.error); return; }
      onSuccess();
      handleClose();
    });
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        width: '100%', maxWidth: '480px',
        padding: '28px',
        maxHeight: '90vh', overflowY: 'auto',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
        transition: 'transform 0.25s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>Registrar Pago</div>
            <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>Nuevo registro de pago manual</div>
          </div>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px', display: 'flex' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: '16px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '6px', fontSize: '13px', color: '#ef4444',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Trainer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="label">Trainer *</label>
            <select name="trainer_id" className="input" required style={{ height: '36px' }}>
              <option value="">Seleccionar trainer...</option>
              {trainers.map(t => <option key={t.id} value={t.id}>{t.business_name}</option>)}
            </select>
          </div>

          {/* Plan */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="label">Plan *</label>
            <select
              name="plan_id" className="input" required style={{ height: '36px' }}
              value={selectedPlanId}
              onChange={e => setSelectedPlanId(e.target.value)}
            >
              <option value="">Seleccionar plan...</option>
              {planes.map(p => (
                <option key={p.id} value={p.id}>
                  {PLAN_LABELS[p.nombre] ?? p.nombre} — ${p.precio_mensual}/mes
                </option>
              ))}
            </select>
          </div>

          {/* Frecuencia */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="label">Frecuencia</label>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '3px', gap: '3px' }}>
              {(['mensual', 'anual'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrecuencia(f)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: '6px', border: 'none',
                    background: frecuencia === f ? V : 'transparent',
                    color: frecuencia === f ? '#fff' : 'var(--fg-muted)',
                    fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.15s',
                  }}
                >
                  {f === 'mensual' ? 'Mensual' : 'Anual'}
                </button>
              ))}
            </div>
            {frecuencia === 'anual' && (
              <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                Pago anual — período en formato YYYY (ej: 2026)
              </div>
            )}
          </div>

          {/* Monto + Período */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="label">Monto *</label>
              <input
                name="monto" type="number" className="input" required
                placeholder="0.00" step="0.01" min="0"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                style={{ height: '36px' }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="label">Período *</label>
              <input
                name="periodo" type="text" className="input" required
                placeholder={frecuencia === 'anual' ? 'YYYY' : 'YYYY-MM'}
                value={periodo}
                onChange={e => setPeriodo(e.target.value)}
                style={{ height: '36px' }}
              />
            </div>
          </div>

          {/* Fecha pago + Estado */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="label">Fecha de pago</label>
              <input
                name="fecha_pago" type="date" className="input"
                value={fechaPago}
                onChange={e => setFechaPago(e.target.value)}
                style={{ height: '36px' }}
              />
              {fechaPago && estado === 'pagado' && (
                <div style={{ fontSize: '11px', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 11, height: 11, flexShrink: 0 }}>
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Vence: <strong style={{ color: 'var(--fg)' }}>{calcVence(fechaPago, frecuencia)}</strong>
                </div>
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="label">Estado *</label>
              <select
                name="estado" className="input" required
                value={estado}
                onChange={e => setEstado(e.target.value)}
                style={{ height: '36px' }}
              >
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
                <option value="vencido">Vencido</option>
              </select>
            </div>
          </div>

          {/* Método de pago */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="label">Método de pago</label>
            <select
              name="metodo_pago" className="input"
              value={metodoPago}
              onChange={e => setMetodoPago(e.target.value)}
              style={{ height: '36px' }}
            >
              <option value="">Sin especificar</option>
              <option value="efectivo">Efectivo</option>
              <option value="yape_plin">Yape/Plin</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="mercadopago">MercadoPago</option>
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              type="button" onClick={handleClose}
              style={{
                flex: 1, height: '38px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--fg)', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={isPending}
              style={{
                flex: 1, height: '38px', borderRadius: '8px', border: 'none',
                background: isPending ? `${V}80` : V,
                color: '#fff', fontWeight: 700, fontSize: '13px',
                cursor: isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
              }}
            >
              {isPending ? 'Guardando...' : 'Registrar Pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
