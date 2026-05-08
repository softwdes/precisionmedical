'use client';

import { useState } from 'react';
import type { BillingMetrics } from '@/types/master';

const V = '#534AB7';

interface BillingRow {
  id: string;
  trainer_name: string;
  plan_nombre: string;
  monto: number;
  fecha_pago: string;
  periodo: string;
  estado: 'pagado' | 'pendiente' | 'vencido';
  metodo_pago: string | null;
}

interface Props {
  rows: BillingRow[];
  metrics: BillingMetrics;
  periodos: string[];
}

const ESTADO_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pagado:    { bg: 'rgba(63,248,200,0.12)', color: '#3FF8C8', label: 'Pagado' },
  pendiente: { bg: 'rgba(239,159,39,0.12)', color: '#EF9F27', label: 'Pendiente' },
  vencido:   { bg: 'rgba(248,113,113,0.12)', color: '#f87171', label: 'Vencido' },
};

const PLAN_COLOR: Record<string, string> = {
  basico: '#9CA3AF', vip: '#A39FE8', premium: '#F59E0B',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function FacturacionTable({ rows, metrics, periodos }: Props) {
  const [periodo, setPeriodo] = useState<string>('');
  const [estadoFilter, setEstadoFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const filtered = rows.filter(r => {
    if (periodo && r.periodo !== periodo) return false;
    if (estadoFilter && r.estado !== estadoFilter) return false;
    if (search && !r.trainer_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function exportCSV() {
    const header = ['Trainer', 'Plan', 'Monto', 'Fecha', 'Período', 'Estado', 'Método'];
    const csvRows = filtered.map(r => [
      r.trainer_name, r.plan_nombre, r.monto, r.fecha_pago, r.periodo, r.estado, r.metodo_pago ?? '',
    ]);
    const content = [header, ...csvRows].map(r => r.join(',')).join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturacion${periodo ? `-${periodo}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Metric summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        {[
          { label: 'Cobrado este mes', value: `$${metrics.cobrado_mes.toLocaleString()}`, color: '#3FF8C8' },
          { label: 'Pendiente total', value: `$${metrics.pendiente_total.toLocaleString()}`, color: '#EF9F27' },
          { label: 'Pagos pendientes', value: metrics.pendiente_count, color: '#f87171' },
          { label: 'ARR proyectado', value: `$${metrics.arr.toLocaleString()}`, color: V },
        ].map(m => (
          <div key={m.label} className="metric">
            <div className="label-caps">{m.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: m.color, marginTop: '6px' }}>
              {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          placeholder="Buscar trainer..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 160px', minWidth: 0, height: '34px' }}
        />
        <select
          className="input"
          value={periodo}
          onChange={e => setPeriodo(e.target.value)}
          style={{ flex: '1 1 140px', minWidth: 0, height: '34px' }}
        >
          <option value="">Todos los períodos</option>
          {periodos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          className="input"
          value={estadoFilter}
          onChange={e => setEstadoFilter(e.target.value)}
          style={{ flex: '1 1 130px', minWidth: 0, height: '34px' }}
        >
          <option value="">Todos los estados</option>
          <option value="pagado">Pagado</option>
          <option value="pendiente">Pendiente</option>
          <option value="vencido">Vencido</option>
        </select>
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <button
            onClick={exportCSV}
            style={{
              height: '34px', padding: '0 14px', borderRadius: '7px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--fg)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['Trainer', 'Plan', 'Monto', 'Fecha', 'Período', 'Estado', 'Método'].map(h => (
                <th key={h} style={{
                  padding: '12px 16px', textAlign: 'left',
                  fontSize: '11px', fontWeight: 600,
                  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: '13px' }}>
                  Sin registros para los filtros seleccionados
                </td>
              </tr>
            ) : filtered.map((row, i) => {
              const est = (ESTADO_STYLE[row.estado] ?? ESTADO_STYLE.pendiente)!;
              return (
                <tr key={row.id} style={{
                  borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  transition: 'background 0.1s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 600 }}>
                    {row.trainer_name}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px',
                      background: `${PLAN_COLOR[row.plan_nombre] ?? '#9CA3AF'}18`,
                      color: PLAN_COLOR[row.plan_nombre] ?? '#9CA3AF',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {row.plan_nombre}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700 }}>
                    ${row.monto.toLocaleString()}
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '12px', color: 'var(--fg-muted)' }}>
                    {fmtDate(row.fecha_pago)}
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '12px', color: 'var(--fg-muted)' }}>
                    {row.periodo}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px',
                      background: est.bg, color: est.color, letterSpacing: '0.04em',
                    }}>
                      {est.label}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '12px', color: 'var(--fg-subtle)' }}>
                    {row.metodo_pago ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {filtered.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--fg-muted)', textAlign: 'right' }}>
          {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          {' · '}Total: <strong style={{ color: 'var(--fg)' }}>
            ${filtered.reduce((s, r) => s + r.monto, 0).toLocaleString()}
          </strong>
        </div>
      )}
    </div>
  );
}
