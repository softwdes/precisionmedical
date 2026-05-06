'use client';

import { useState, useMemo } from 'react';
import { changeTrainerPlan, toggleTrainerStatus } from '@/actions/master';
import type { TrainerRow, PlanSaas } from '@/types/master';

const V = '#534AB7';
const PER_PAGE = 8;

const PLAN_COLORS: Record<string, string> = { basico: '#6B7472', vip: V, premium: '#D4A017' };
const PLAN_LABELS: Record<string, string> = { basico: 'Básico', vip: 'VIP', premium: 'Premium' };
const ESTADO_COLORS: Record<string, string> = { activo: '#3FF8C8', trial: '#EF9F27', suspendido: '#f87171', cancelado: '#6B7472' };

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: `${color}20`, color, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function IABar({ used, limit }: { used: number; limit: number | null }) {
  if (!limit) return <span style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>∞</span>;
  const pct = Math.round((used / limit) * 100);
  const color = pct > 80 ? '#f87171' : pct > 50 ? '#EF9F27' : '#3FF8C8';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: 48, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: '99px' }} />
      </div>
      <span style={{ fontSize: '11px', color }}>{used}</span>
    </div>
  );
}

interface ChangePlanModalProps {
  trainer: TrainerRow;
  planes: PlanSaas[];
  onClose: () => void;
  onConfirm: (planId: string) => void;
}

function ChangePlanModal({ trainer, planes, onClose, onConfirm }: ChangePlanModalProps) {
  const currentPlanId = trainer.suscripcion?.plan_id;
  const [selected, setSelected] = useState(currentPlanId ?? '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  async function confirm() {
    if (!selected || selected === currentPlanId) { onClose(); return; }
    setSaving(true);
    const res = await changeTrainerPlan(trainer.id, selected);
    setSaving(false);
    if (res.error) { setToast(res.error); return; }
    onConfirm(selected);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: '560px', background: '#0d0d0f', border: `1px solid ${V}40`, borderRadius: '14px', padding: '24px' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>Cambiar plan</div>
        <div style={{ fontSize: '13px', color: 'var(--fg-muted)', marginBottom: '20px' }}>{trainer.business_name}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {planes.map(p => {
            const color = PLAN_COLORS[p.nombre] ?? '#6B7472';
            const isCurrent = p.id === currentPlanId;
            const isSelected = p.id === selected;
            return (
              <div key={p.id} onClick={() => setSelected(p.id)}
                style={{ padding: '14px', borderRadius: '10px', cursor: 'pointer', border: `2px solid ${isSelected ? color : 'rgba(255,255,255,0.08)'}`, background: isSelected ? `${color}10` : 'rgba(255,255,255,0.03)', transition: 'border-color 0.15s, background 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <Badge text={PLAN_LABELS[p.nombre] ?? p.nombre} color={color} />
                  {isCurrent && <span style={{ fontSize: '10px', color: 'var(--fg-muted)' }}>actual</span>}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color }}>${p.precio_mensual}<span style={{ fontSize: '11px', color: 'var(--fg-muted)', fontWeight: 400 }}>/mes</span></div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '4px' }}>
                  {p.limite_alumnos ? `${p.limite_alumnos} alumnos` : 'Ilimitado'} · {p.limite_ia_diario ? `${p.limite_ia_diario} IA/día` : 'IA ilimitada'}
                </div>
              </div>
            );
          })}
        </div>

        {toast && <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: '6px', fontSize: '13px', color: '#ff6b6b', marginBottom: '16px' }}>{toast}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button onClick={confirm} disabled={saving || !selected}
            style={{ padding: '0 20px', height: '38px', background: V, color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontWeight: 700, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Guardando...' : 'Confirmar cambio'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  initialTrainers: TrainerRow[];
  planes: PlanSaas[];
}

export default function TrainersTable({ initialTrainers, planes }: Props) {
  const [trainers, setTrainers] = useState(initialTrainers);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [sortBy, setSortBy] = useState('nombre');
  const [page, setPage] = useState(1);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [changePlan, setChangePlan] = useState<TrainerRow | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  const filtered = useMemo(() => {
    let list = [...trainers];
    const q = search.toLowerCase();
    if (q) list = list.filter(t => t.business_name.toLowerCase().includes(q) || (t.email ?? '').toLowerCase().includes(q));
    if (filterPlan) list = list.filter(t => t.suscripcion?.planes_saas?.nombre === filterPlan);
    if (filterEstado) list = list.filter(t => t.suscripcion?.estado === filterEstado);
    if (sortBy === 'nombre') list.sort((a, b) => a.business_name.localeCompare(b.business_name));
    else if (sortBy === 'alumnos') list.sort((a, b) => b.students_count - a.students_count);
    else if (sortBy === 'pago') list.sort((a, b) => {
      const ad = a.suscripcion?.fecha_proximo_pago ?? '';
      const bd = b.suscripcion?.fecha_proximo_pago ?? '';
      return ad.localeCompare(bd);
    });
    return list;
  }, [trainers, search, filterPlan, filterEstado, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageTrainers = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function showToast(msg: string) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2500); }

  async function handleToggleStatus(t: TrainerRow) {
    const newStatus = t.suscripcion?.estado === 'activo' ? 'suspendido' : 'activo';
    const res = await toggleTrainerStatus(t.id, newStatus);
    if (res.error) { showToast(res.error); return; }
    setTrainers(prev => prev.map(x => x.id === t.id
      ? { ...x, suscripcion: x.suscripcion ? { ...x.suscripcion, estado: newStatus } : null }
      : x));
    showToast(`${t.business_name} ${newStatus === 'activo' ? 'reactivado' : 'suspendido'}`);
    setOpenMenu(null);
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="2" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="input" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar trainer..." style={{ paddingLeft: '36px' }} />
        </div>
        <select className="select" value={filterPlan} onChange={e => { setFilterPlan(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: '140px' }}>
          <option value="">Todos los planes</option>
          <option value="basico">Básico</option>
          <option value="vip">VIP</option>
          <option value="premium">Premium</option>
        </select>
        <select className="select" value={filterEstado} onChange={e => { setFilterEstado(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: '140px' }}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="trial">Trial</option>
          <option value="suspendido">Suspendido</option>
        </select>
        <select className="select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 'auto', minWidth: '140px' }}>
          <option value="nombre">Ordenar: Nombre</option>
          <option value="alumnos">Ordenar: Alumnos</option>
          <option value="pago">Ordenar: Próximo pago</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Trainer', 'Plan', 'Estado', 'Alumnos', 'Próximo pago', 'IA hoy', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageTrainers.map(t => {
              const plan = t.suscripcion?.planes_saas;
              const estado = t.suscripcion?.estado ?? 'sin suscripción';
              return (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: `${V}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: V }}>{initials(t.business_name)}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{t.business_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                          desde {new Date(t.created_at).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {plan ? <Badge text={PLAN_LABELS[plan.nombre] ?? plan.nombre} color={PLAN_COLORS[plan.nombre] ?? '#6B7472'} /> : <span style={{ color: 'var(--fg-muted)', fontSize: '12px' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <Badge text={estado} color={ESTADO_COLORS[estado] ?? '#6B7472'} />
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>{t.students_count}</span>
                    <span style={{ fontSize: '11px', color: 'var(--fg-muted)', marginLeft: '4px' }}>alumnos</span>
                  </td>
                  <td style={{ padding: '12px', fontSize: '13px', color: 'var(--fg-muted)' }}>
                    {fmtDate(t.suscripcion?.fecha_proximo_pago)}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <IABar used={t.ia_hoy} limit={plan?.limite_ia_diario ?? null} />
                  </td>
                  <td style={{ padding: '12px', position: 'relative' }}>
                    <button onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)}
                      style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px 10px', fontSize: '16px', letterSpacing: '2px', fontFamily: 'inherit' }}>
                      ···
                    </button>
                    {openMenu === t.id && (
                      <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 100, background: '#0d0d0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '6px', minWidth: '190px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
                        onMouseLeave={() => setOpenMenu(null)}>
                        {[
                          { label: 'Ver perfil completo', action: () => { setOpenMenu(null); } },
                          { label: 'Ver pagos del trainer', action: () => { setOpenMenu(null); } },
                          { label: 'Cambiar plan', action: () => { setChangePlan(t); setOpenMenu(null); } },
                          { label: 'Reenviar email de acceso', action: () => { setOpenMenu(null); } },
                        ].map(item => (
                          <button key={item.label} onClick={item.action}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontSize: '13px', borderRadius: '6px', fontFamily: 'inherit' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            {item.label}
                          </button>
                        ))}
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                        <button onClick={() => handleToggleStatus(t)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', color: t.suscripcion?.estado === 'activo' ? '#f87171' : '#3FF8C8', fontSize: '13px', borderRadius: '6px', fontFamily: 'inherit', fontWeight: 600 }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          {t.suscripcion?.estado === 'activo' ? 'Suspender' : 'Reactivar'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {pageTrainers.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--fg-muted)' }}>Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>
          Mostrando {Math.min((page - 1) * PER_PAGE + 1, filtered.length)}–{Math.min(page * PER_PAGE, filtered.length)} de {filtered.length} trainers
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0 12px', height: '32px', fontSize: '13px' }}>‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              style={{ width: '32px', height: '32px', borderRadius: '6px', border: p === page ? `1px solid ${V}` : '1px solid rgba(255,255,255,0.12)', background: p === page ? `${V}20` : 'none', color: p === page ? V : 'var(--fg-muted)', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>
              {p}
            </button>
          ))}
          <button className="btn btn-outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '0 12px', height: '32px', fontSize: '13px' }}>›</button>
        </div>
      </div>

      {/* Change plan modal */}
      {changePlan && (
        <ChangePlanModal
          trainer={changePlan}
          planes={planes}
          onClose={() => setChangePlan(null)}
          onConfirm={(planId) => {
            const newPlan = planes.find(p => p.id === planId);
            setTrainers(prev => prev.map(t => t.id === changePlan.id
              ? { ...t, suscripcion: t.suscripcion ? { ...t.suscripcion, plan_id: planId, planes_saas: newPlan! } : null }
              : t));
            setChangePlan(null);
            showToast('Plan actualizado correctamente');
          }}
        />
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, background: '#0d0d0f', border: `1px solid ${V}50`, borderRadius: '10px', padding: '12px 20px', fontSize: '13px', color: 'var(--fg)', boxShadow: `0 8px 32px rgba(83,74,183,0.25)` }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
