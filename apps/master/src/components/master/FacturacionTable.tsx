'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BillingMetrics } from '@/types/master';
import RegistrarPagoModal from './RegistrarPagoModal';
import EditarPagoModal from './EditarPagoModal';
import { deleteMasterPago } from '@/actions/master';
import type { TrainerForBilling, PlanForBilling } from '@/actions/master';

const V = '#534AB7';

interface BillingRow {
  id: string;
  plan_id: string;
  trainer_id: string;
  trainer_name: string;
  plan_nombre: string;
  monto: number;
  fecha_pago: string;
  periodo: string;
  frecuencia: string | null;
  estado: 'pagado' | 'pendiente' | 'vencido';
  metodo_pago: string | null;
}

interface Props {
  rows: BillingRow[];
  metrics: BillingMetrics;
  periodos: string[];
  trainers: TrainerForBilling[];
  planes: PlanForBilling[];
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

function calcVence(fechaPago: string, frecuencia: string | null): string {
  const d = new Date(fechaPago);
  if (frecuencia === 'anual') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface DeleteModalProps {
  row: BillingRow;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ row, isPending, onConfirm, onCancel }: DeleteModalProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9500,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid rgba(248,113,113,0.3)',
        borderRadius: '12px',
        width: '100%', maxWidth: '400px',
        padding: '32px 28px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
      }}>
        {/* Icon */}
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%',
          background: 'rgba(248,113,113,0.12)',
          border: '1px solid rgba(248,113,113,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" width="24" height="24">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </div>

        {/* Text */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '8px' }}>
            ¿Eliminar este pago?
          </div>
          <div style={{ fontSize: '13px', color: 'var(--fg-muted)', lineHeight: 1.6 }}>
            Estás por eliminar el pago de
            <strong style={{ color: 'var(--fg)', display: 'block', marginTop: '4px', fontSize: '14px' }}>
              {row.trainer_name}
            </strong>
            <span style={{ fontSize: '12px' }}>
              {row.periodo}{row.frecuencia === 'anual' ? ' · Anual' : ''} · ${row.monto.toLocaleString()}
            </span>
          </div>
          <div style={{
            marginTop: '12px', padding: '8px 12px',
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: '6px', fontSize: '12px', color: '#f87171',
          }}>
            Esta acción no se puede deshacer.
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            disabled={isPending}
            style={{
              flex: 1, height: '40px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--fg)', fontWeight: 600, fontSize: '13px',
              cursor: isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            style={{
              flex: 1, height: '40px', borderRadius: '8px', border: 'none',
              background: isPending ? 'rgba(239,68,68,0.5)' : '#ef4444',
              color: '#fff', fontWeight: 700, fontSize: '13px',
              cursor: isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              transition: 'background 0.15s',
            }}
          >
            {isPending ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FacturacionTable({ rows, metrics, periodos, trainers, planes }: Props) {
  const router = useRouter();
  const [periodo, setPeriodo]             = useState<string>('');
  const [estadoFilter, setEstadoFilter]   = useState<string>('');
  const [search, setSearch]               = useState('');
  const [showRegistrar, setShowRegistrar] = useState(false);
  const [editRow, setEditRow]             = useState<BillingRow | null>(null);
  const [deleteRow, setDeleteRow]         = useState<BillingRow | null>(null);
  const [isPendingDelete, startDelete]    = useTransition();

  const filtered = rows.filter(r => {
    if (periodo && r.periodo !== periodo) return false;
    if (estadoFilter && r.estado !== estadoFilter) return false;
    if (search && !r.trainer_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function exportCSV() {
    const header = ['Trainer', 'Plan', 'Monto', 'Fecha', 'Período', 'Frecuencia', 'Estado', 'Método'];
    const csvRows = filtered.map(r => [
      r.trainer_name, r.plan_nombre, r.monto, r.fecha_pago, r.periodo,
      r.frecuencia ?? 'mensual', r.estado, r.metodo_pago ?? '',
    ]);
    const content = [header, ...csvRows].map(r => r.join(',')).join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `facturacion${periodo ? `-${periodo}` : ''}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function handleDeleteConfirm() {
    if (!deleteRow) return;
    startDelete(async () => {
      await deleteMasterPago(deleteRow.id);
      setDeleteRow(null);
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Metric summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        {[
          { label: 'Cobrado este mes', value: `$${metrics.cobrado_mes.toLocaleString()}`, color: '#3FF8C8' },
          { label: 'Pendiente total',  value: `$${metrics.pendiente_total.toLocaleString()}`, color: '#EF9F27' },
          { label: 'Pagos pendientes', value: metrics.pendiente_count, color: '#f87171' },
          { label: 'ARR proyectado',   value: `$${metrics.arr.toLocaleString()}`, color: V },
        ].map(m => (
          <div key={m.label} className="metric">
            <div className="label-caps">{m.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: m.color, marginTop: '6px' }}>
              {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters + actions */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input" placeholder="Buscar trainer..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 160px', minWidth: 0, height: '34px' }}
        />
        <select
          className="input" value={periodo} onChange={e => setPeriodo(e.target.value)}
          style={{ flex: '1 1 140px', minWidth: 0, height: '34px' }}
        >
          <option value="">Todos los períodos</option>
          {periodos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          className="input" value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)}
          style={{ flex: '1 1 130px', minWidth: 0, height: '34px' }}
        >
          <option value="">Todos los estados</option>
          <option value="pagado">Pagado</option>
          <option value="pendiente">Pendiente</option>
          <option value="vencido">Vencido</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexShrink: 0 }}>
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
          <button
            onClick={() => setShowRegistrar(true)}
            style={{
              height: '34px', padding: '0 14px', borderRadius: '7px',
              background: V, border: 'none',
              color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 13, height: 13 }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Registrar Pago
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Trainer', 'Plan', 'Monto', 'Fecha', 'Período', 'Estado', 'Método', 'Acciones'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: 'left',
                    fontSize: '11px', fontWeight: 600,
                    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: '13px' }}>
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
                    <td style={{ padding: '11px 16px', fontSize: '12px', color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                      {fmtDate(row.fecha_pago)}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: '12px', color: 'var(--fg-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {row.periodo}
                        {row.frecuencia === 'anual' && (
                          <span style={{
                            fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '99px',
                            background: `${V}20`, color: V,
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                          }}>
                            ANUAL
                          </span>
                        )}
                      </div>
                      {row.fecha_pago && (
                        <div style={{ fontSize: '11px', color: 'var(--fg-subtle)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                          Vence {calcVence(row.fecha_pago, row.frecuencia)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px',
                        background: est.bg, color: est.color, letterSpacing: '0.04em', whiteSpace: 'nowrap',
                      }}>
                        {est.label}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: '12px', color: 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>
                      {row.metodo_pago ?? '—'}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Edit */}
                        <button
                          onClick={() => setEditRow(row)}
                          title="Editar"
                          style={{
                            width: '34px', height: '34px', borderRadius: '7px', border: 'none',
                            background: 'rgba(83,74,183,0.15)', color: '#A39FE8',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(83,74,183,0.3)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(83,74,183,0.15)')}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => setDeleteRow(row)}
                          title="Eliminar"
                          style={{
                            width: '34px', height: '34px', borderRadius: '7px', border: 'none',
                            background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.3)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                          </svg>
                        </button>
                      </div>
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

      {showRegistrar && (
        <RegistrarPagoModal
          trainers={trainers} planes={planes}
          onClose={() => setShowRegistrar(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {editRow && (
        <EditarPagoModal
          row={editRow} planes={planes}
          onClose={() => { setEditRow(null); router.refresh(); }}
          onSuccess={() => {}}
        />
      )}

      {deleteRow && (
        <DeleteConfirmModal
          row={deleteRow}
          isPending={isPendingDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteRow(null)}
        />
      )}
    </div>
  );
}
