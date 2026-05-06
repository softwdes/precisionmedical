'use client';

import { useState, useMemo, useRef, type ReactNode } from 'react';
import { changeTrainerPlan, toggleTrainerStatus, createTrainer, deleteTrainer, updateTrainer, updateTrainerEmail, updateTrainerPassword, updateTrainerTrial, resendTrainerAccess } from '@/actions/master';
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

function ActionBtn({ title, hoverColor, onClick, children }: { title: string; hoverColor: string; onClick: () => void; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? `${hoverColor}12` : 'none', border: `1px solid ${hovered ? hoverColor : 'rgba(255,255,255,0.1)'}`, borderRadius: '6px', cursor: 'pointer', color: hovered ? hoverColor : 'var(--fg-muted)', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.15s, color 0.15s, background 0.15s' }}>
      {children}
    </button>
  );
}

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const base = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 4; i < 16; i++) base.push(all[arr[i] % all.length]);
  return base.sort(() => Math.random() - 0.5).join('');
}

function EditTrainerModal({ trainer, onUpdate, onClose }: { trainer: TrainerRow; onUpdate: (updated: Partial<TrainerRow>) => void; onClose: () => void }) {
  const orig = useRef({
    name: trainer.business_name,
    email: trainer.email ?? '',
    trialDate: trainer.suscripcion?.fecha_fin_trial ?? '',
  });

  const [loading, setLoading] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [name, setName]           = useState(trainer.business_name);
  const [email, setEmail]         = useState(trainer.email ?? '');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [trialDate, setTrialDate] = useState(trainer.suscripcion?.fecha_fin_trial ?? '');
  const [accessLink, setAccessLink] = useState('');
  const [copied, setCopied]       = useState(false);

  const daysFromToday = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]!;
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const tasks: Array<() => Promise<{ error?: string }>> = [];
    const updates: Partial<TrainerRow> = {};

    if (name.trim() && name.trim() !== orig.current.name) {
      tasks.push(() => updateTrainer(trainer.id, { business_name: name.trim() }));
      updates.business_name = name.trim();
    }
    if (email.trim() && email.trim() !== orig.current.email) {
      tasks.push(() => updateTrainerEmail(trainer.user_id, email.trim()));
      updates.email = email.trim();
    }
    if (password.length >= 8) {
      tasks.push(() => updateTrainerPassword(trainer.user_id, password));
    }
    if (trialDate && trialDate !== orig.current.trialDate) {
      tasks.push(() => updateTrainerTrial(trainer.id, trialDate));
      if (trainer.suscripcion) {
        updates.suscripcion = { ...trainer.suscripcion, fecha_fin_trial: trialDate, fecha_proximo_pago: trialDate };
      }
    }

    if (tasks.length === 0) { setMsg({ type: 'ok', text: 'Sin cambios para guardar' }); return; }

    setLoading(true);
    const results = await Promise.all(tasks.map(t => t()));
    setLoading(false);

    const errors = results.flatMap(r => r.error ? [r.error] : []);
    if (errors.length) { setMsg({ type: 'err', text: errors.join(' · ') }); return; }

    if (updates.business_name) orig.current.name = updates.business_name;
    if (updates.email)         orig.current.email = updates.email;
    if (updates.suscripcion?.fecha_fin_trial) orig.current.trialDate = trialDate;
    setPassword('');
    setMsg({ type: 'ok', text: 'Cambios guardados correctamente' });
    onUpdate(updates);
  }

  async function handleGenerateLink() {
    const targetEmail = trainer.email ?? email;
    if (!targetEmail) { setMsg({ type: 'err', text: 'No hay email registrado para este trainer' }); return; }
    setLinkLoading(true); setAccessLink('');
    const res = await resendTrainerAccess(targetEmail);
    setLinkLoading(false);
    if (res.error) { setMsg({ type: 'err', text: res.error }); return; }
    setAccessLink(res.link ?? '');
  }

  const D = <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />;
  const SL = ({ text }: { text: string }) => (
    <div className="label-caps" style={{ marginBottom: '14px' }}>{text}</div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div style={{ width: '100%', maxWidth: '480px', background: '#0d0d0f', border: `1px solid ${V}40`, borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 32px)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: V }}>Editar trainer</div>
            <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>{trainer.business_name}</div>
          </div>
          <button onClick={onClose} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', padding: '4px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable form */}
        <form onSubmit={handleSave} style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {msg && (
              <div style={{ padding: '10px 14px', borderRadius: '6px', fontSize: '13px', lineHeight: 1.5, background: msg.type === 'ok' ? 'rgba(63,248,200,0.08)' : 'rgba(255,80,80,0.1)', border: `1px solid ${msg.type === 'ok' ? 'rgba(63,248,200,0.25)' : 'rgba(255,80,80,0.3)'}`, color: msg.type === 'ok' ? '#3FF8C8' : '#ff6b6b' }}>
                {msg.text}
              </div>
            )}

            {/* Información */}
            <div>
              <SL text="Información general" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="label">Nombre del negocio</label>
                  <input className="input" type="text" value={name} onChange={e => setName(e.target.value)} disabled={loading} placeholder="Ej: Coach Carlos Mendoza" />
                </div>
                <div className="form-group">
                  <label className="label">Email</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} placeholder="trainer@ejemplo.com" autoComplete="off" />
                  <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '5px' }}>Al cambiar el email se enviará una confirmación a la nueva dirección.</div>
                </div>
              </div>
            </div>

            {D}

            {/* Seguridad */}
            <div>
              <SL text="Seguridad" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">
                    Nueva contraseña&nbsp;
                    <span style={{ color: 'var(--fg-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>(vacío = sin cambios)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input className="input" type={showPass ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)} disabled={loading} placeholder="Mínimo 8 caracteres"
                      style={{ paddingRight: '38px', fontFamily: showPass && password ? 'monospace' : 'inherit' }} />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', padding: 0 }}>
                      {showPass
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                    </button>
                  </div>
                </div>
                <button type="button" onClick={() => { setPassword(generateSecurePassword()); setShowPass(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'rgba(63,248,200,0.05)', border: '1px solid rgba(63,248,200,0.18)', borderRadius: '8px', cursor: 'pointer', color: 'var(--fg)', fontSize: '13px', fontFamily: 'inherit' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3FF8C8" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span style={{ flex: 1 }}>Sugerir contraseña segura</span>
                  <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>16 chars · Alta entropía</span>
                </button>
                {password && showPass && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1, padding: '9px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px', letterSpacing: '0.05em', wordBreak: 'break-all', userSelect: 'all' }}>
                      {password}
                    </div>
                    <button type="button" onClick={() => navigator.clipboard.writeText(password)}
                      style={{ flexShrink: 0, padding: '8px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {D}

            {/* Trial */}
            <div>
              <SL text="Período de prueba" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">Fecha de fin del trial</label>
                  <input className="input" type="date" value={trialDate} onChange={e => setTrialDate(e.target.value)} disabled={loading} />
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[7, 14, 30, 60, 90].map(days => {
                    const val = daysFromToday(days);
                    return (
                      <button key={days} type="button" onClick={() => setTrialDate(val)}
                        style={{ padding: '5px 13px', borderRadius: '99px', border: `1px solid ${trialDate === val ? V : 'rgba(255,255,255,0.1)'}`, background: trialDate === val ? `${V}22` : 'none', color: trialDate === val ? V : 'var(--fg-muted)', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s' }}>
                        +{days} días
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {D}

            {/* Enlace de acceso */}
            <div>
              <SL text="Enlace de acceso" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '13px', color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                  Genera un magic link para que el trainer inicie sesión sin contraseña. Válido por <strong style={{ color: 'var(--fg)' }}>1 hora</strong>.
                </div>
                <button type="button" onClick={handleGenerateLink} disabled={linkLoading}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', background: `${V}12`, border: `1px solid ${V}35`, borderRadius: '8px', cursor: linkLoading ? 'wait' : 'pointer', color: V, fontSize: '13px', fontFamily: 'inherit', fontWeight: 600 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
                  {linkLoading ? 'Generando...' : 'Generar enlace de acceso'}
                </button>
                {accessLink && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '6px', fontSize: '11px', color: 'var(--fg-muted)', wordBreak: 'break-all', lineHeight: 1.5 }}>
                      {accessLink}
                    </div>
                    <button type="button" onClick={async () => { await navigator.clipboard.writeText(accessLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      style={{ flexShrink: 0, padding: '0 12px', background: copied ? 'rgba(63,248,200,0.1)' : 'rgba(255,255,255,0.06)', border: `1px solid ${copied ? 'rgba(63,248,200,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '6px', cursor: 'pointer', color: copied ? '#3FF8C8' : 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'rgba(0,0,0,0.3)', flexShrink: 0 }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" disabled={loading}
              style={{ padding: '0 22px', height: '38px', background: V, color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontWeight: 700, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

function DeleteConfirmModal({ trainer, onClose, onConfirm }: { trainer: TrainerRow; onClose: () => void; onConfirm: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setLoading(true);
    const res = await deleteTrainer(trainer.id, trainer.user_id ?? '');
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    onConfirm();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div style={{ width: '100%', maxWidth: '420px', background: '#0d0d0f', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '14px', padding: '28px' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(248,113,113,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </div>
        <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>Eliminar trainer</div>
        <div style={{ fontSize: '13px', color: 'var(--fg-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
          ¿Seguro que quieres eliminar <strong style={{ color: 'var(--fg)' }}>{trainer.business_name}</strong>? Se eliminarán su cuenta de acceso y todos sus datos. Esta acción no se puede deshacer.
        </div>
        {error && <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: '6px', fontSize: '13px', color: '#ff6b6b', marginBottom: '16px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
          <button onClick={confirm} disabled={loading}
            style={{ padding: '0 20px', height: '38px', background: '#f87171', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontWeight: 700, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
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

// ── New Trainer Modal ────────────────────────────────────────────────────
interface NewTrainerModalProps {
  planes: PlanSaas[];
  onClose: () => void;
  onSuccess: (trainer: TrainerRow) => void;
}

function NewTrainerModal({ planes, onClose, onSuccess }: NewTrainerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [showPass, setShowPass] = useState(false);
  const [seedDemo, setSeedDemo] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(planes[0]?.id ?? '');

  const PLAN_LABELS: Record<string, string> = { basico: 'Básico', vip: 'VIP', premium: 'Premium' };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    fd.set('plan_id', selectedPlan);
    fd.set('seed_demo', String(seedDemo));
    const res = await createTrainer(fd);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    onSuccess(res.trainer!);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div style={{ width: '100%', maxWidth: '520px', background: '#0d0d0f', border: `1px solid ${V}40`, borderRadius: '14px', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: V }}>Nuevo Trainer</div>
            <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>Crea una cuenta y asigna plan</div>
          </div>
          <button onClick={onClose} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: '6px', fontSize: '13px', color: '#ff6b6b' }}>
                {error}
              </div>
            )}

            {/* Nombre del negocio */}
            <div className="form-group">
              <label className="label" htmlFor="nt-name">Nombre del negocio *</label>
              <input id="nt-name" name="business_name" type="text" className="input"
                placeholder="Ej: Coach Carlos Mendoza" required disabled={loading} />
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="label" htmlFor="nt-email">Email *</label>
              <input id="nt-email" name="email" type="email" className="input"
                placeholder="trainer@ejemplo.com" required disabled={loading} autoComplete="off" />
            </div>

            {/* Contraseñas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="label" htmlFor="nt-pass">Contraseña *</label>
                <div style={{ position: 'relative' }}>
                  <input id="nt-pass" name="password" type={showPass ? 'text' : 'password'} className="input"
                    placeholder="Mínimo 8 caracteres" required minLength={8} disabled={loading} autoComplete="new-password"
                    style={{ paddingRight: '38px' }} />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', padding: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      {showPass
                        ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                    </svg>
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="nt-confirm">Confirmar *</label>
                <input id="nt-confirm" name="confirm" type={showPass ? 'text' : 'password'} className="input"
                  placeholder="Repite la contraseña" required minLength={8} disabled={loading} autoComplete="new-password" />
              </div>
            </div>

            {/* Plan */}
            <div className="form-group">
              <label className="label">Plan *</label>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${planes.length}, 1fr)`, gap: '10px' }}>
                {planes.map(p => {
                  const color = PLAN_COLORS[p.nombre] ?? '#6B7472';
                  const sel = p.id === selectedPlan;
                  return (
                    <div key={p.id} onClick={() => !loading && setSelectedPlan(p.id)}
                      style={{ padding: '12px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${sel ? color : 'rgba(255,255,255,0.08)'}`, background: sel ? `${color}12` : 'rgba(255,255,255,0.02)', transition: 'border-color 0.15s, background 0.15s', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {PLAN_LABELS[p.nombre] ?? p.nombre}
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color, marginTop: '4px' }}>
                        ${p.precio_mensual}<span style={{ fontSize: '10px', color: 'var(--fg-muted)', fontWeight: 400 }}>/mes</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '4px' }}>
                        {p.limite_alumnos ? `${p.limite_alumnos} alumnos` : '∞ alumnos'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Días de trial */}
            <div className="form-group">
              <label className="label" htmlFor="nt-trial">Período de prueba</label>
              <select id="nt-trial" name="trial_days" className="input" defaultValue="30" disabled={loading}>
                <option value="14">14 días</option>
                <option value="30">30 días</option>
                <option value="60">60 días</option>
              </select>
            </div>

            {/* Demo data toggle */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', padding: '14px', borderRadius: '8px', border: `1px solid ${seedDemo ? `${V}40` : 'rgba(255,255,255,0.07)'}`, background: seedDemo ? `${V}08` : 'transparent', transition: 'all 0.15s' }}>
              <div onClick={() => setSeedDemo(v => !v)} style={{
                width: 20, height: 20, borderRadius: '5px', flexShrink: 0, marginTop: '1px',
                border: `2px solid ${seedDemo ? V : 'rgba(255,255,255,0.2)'}`,
                background: seedDemo ? V : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {seedDemo && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <div onClick={() => setSeedDemo(v => !v)}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>Incluir datos de ejemplo</div>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '3px', lineHeight: 1.5 }}>
                  Agrega 3 alumnos demo (María García, Carlos López, Ana Martínez) con una cuota pendiente cada uno para que el trainer vea su app lista desde el primer día.
                </div>
              </div>
            </label>

          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'rgba(0,0,0,0.25)' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" disabled={loading || !selectedPlan}
              style={{ padding: '0 22px', height: '38px', background: V, color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontWeight: 700, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Creando cuenta...' : 'Crear trainer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main table ────────────────────────────────────────────────────────────
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
  const [changePlan, setChangePlan] = useState<TrainerRow | null>(null);
  const [editTarget, setEditTarget] = useState<TrainerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainerRow | null>(null);
  const [newTrainer, setNewTrainer] = useState(false);
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
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
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
        <button onClick={() => setNewTrainer(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '0 16px', height: '40px', background: V, color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontWeight: 700, fontSize: '12px', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nuevo Trainer
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '780px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Trainer', 'Plan', 'Estado', 'Alumnos', 'Próximo pago', 'Acciones'].map(h => (
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ActionBtn title="Editar trainer" hoverColor={V} onClick={() => setEditTarget(t)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </ActionBtn>
                      <ActionBtn title="Cambiar plan" hoverColor="#60A5FA" onClick={() => setChangePlan(t)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
                        </svg>
                      </ActionBtn>
                      <ActionBtn
                        title={estado === 'activo' ? 'Suspender' : 'Reactivar'}
                        hoverColor={estado === 'activo' ? '#EF9F27' : '#3FF8C8'}
                        onClick={() => handleToggleStatus(t)}>
                        {estado === 'activo'
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                      </ActionBtn>
                      <ActionBtn title="Eliminar trainer" hoverColor="#f87171" onClick={() => setDeleteTarget(t)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageTrainers.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--fg-muted)' }}>Sin resultados</td></tr>
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

      {/* New trainer modal */}
      {newTrainer && (
        <NewTrainerModal
          planes={planes}
          onClose={() => setNewTrainer(false)}
          onSuccess={(trainer) => {
            setTrainers(prev => [trainer, ...prev]);
            setNewTrainer(false);
            showToast(`✓ Cuenta creada para ${trainer.business_name}`);
          }}
        />
      )}

      {/* Edit trainer modal */}
      {editTarget && (
        <EditTrainerModal
          trainer={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdate={(updated) => {
            setTrainers(prev => prev.map(t => t.id === editTarget.id ? { ...t, ...updated } : t));
            setEditTarget(prev => prev ? { ...prev, ...updated } : prev);
          }}
        />
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          trainer={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            setTrainers(prev => prev.filter(t => t.id !== deleteTarget.id));
            showToast(`${deleteTarget.business_name} eliminado`);
            setDeleteTarget(null);
          }}
        />
      )}

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
