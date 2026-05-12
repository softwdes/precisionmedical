'use client';

import { useState, useRef, useEffect } from 'react';
import { buildMensaje, generarEnlaceWA, DEFAULT_TEMPLATES } from '@/lib/payments';
import { logWhatsappMensaje } from '@/actions/finanzas';
import { useCurrencySymbol } from '@/lib/useCurrencySymbol';

const WA_GREEN = '#25D366';
const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function fmtDate(iso: string) {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const COMPOSER_TYPES = [
  { tipo: 'vencimiento',   label: 'Recordatorio' },
  { tipo: 'vencido',       label: 'Cuota Vencida' },
  { tipo: 'cobro',         label: 'Cobro Confirmado' },
  { tipo: 'bienvenida',    label: 'Bienvenida' },
  { tipo: 'rutina',        label: 'Nueva Rutina' },
  { tipo: 'personalizado', label: 'Personalizado' },
];

function ChipIcon({ tipo }: { tipo: string }) {
  const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const;
  if (tipo === 'vencimiento') return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
  if (tipo === 'vencido')     return <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  if (tipo === 'cobro')       return <svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
  if (tipo === 'bienvenida')  return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (tipo === 'rutina')      return <svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
  return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}

const WA_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export interface WAComposerModalProps {
  alumnoId: string;
  alumnoNombre: string;
  alumnoPhone: string | null;
  cuota?: { monto: number; fecha_vencimiento: string } | null;
  defaultTipo?: string;
  onClose: () => void;
  onSent?: (tipo: string, contenido: string) => void;
}

export default function WAComposerModal({
  alumnoId, alumnoNombre, alumnoPhone, cuota, defaultTipo = 'vencimiento', onClose, onSent,
}: WAComposerModalProps) {
  const { format: formatMonto, symbol } = useCurrencySymbol();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const userEditedRef = useRef(false);

  function buildMsg(tipo: string): string {
    if (tipo === 'personalizado') return '';
    const tpl = DEFAULT_TEMPLATES[tipo] ?? '';
    const proxima_fecha = (() => {
      if (!cuota) return '{proxima_fecha}';
      const d = new Date(cuota.fecha_vencimiento.slice(0, 10) + 'T00:00:00');
      d.setMonth(d.getMonth() + 1);
      return fmtDate(d.toISOString().slice(0, 10));
    })();
    return buildMensaje(tpl, {
      nombre: alumnoNombre,
      monto: cuota ? formatMonto(cuota.monto) : '{monto}',
      fecha_vencimiento: cuota ? fmtDate(cuota.fecha_vencimiento) : '{fecha_vencimiento}',
      proxima_fecha,
    });
  }

  const [tipo, setTipo] = useState(defaultTipo);
  const [msg, setMsg] = useState(() => buildMsg(defaultTipo));
  const [copied, setCopied] = useState(false);

  // Rebuild when locale detects or cuota data arrives (both happen asynchronously)
  useEffect(() => {
    if (!userEditedRef.current) {
      setMsg(buildMsg(tipo));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, cuota?.monto, cuota?.fecha_vencimiento]);

  function handleTipo(t: string) {
    userEditedRef.current = false;
    setTipo(t);
    setMsg(buildMsg(t));
  }

  function insertVar(variable: string) {
    const ta = taRef.current;
    if (!ta) { setMsg(prev => prev + variable); return; }
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = msg.slice(0, s) + variable + msg.slice(e);
    setMsg(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + variable.length, s + variable.length); });
  }

  async function handleSend() {
    if (!alumnoPhone) return;
    const tel = alumnoPhone.replace(/\D/g, '');
    window.open(generarEnlaceWA(tel, msg), '_blank');
    void logWhatsappMensaje({ alumno_id: alumnoId, tipo_mensaje: tipo, contenido: msg });
    onSent?.(tipo, msg);
    onClose();
  }

  const hasPhone = !!alumnoPhone;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 20px', borderBottom: '1px solid #1e1e1e' }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: WA_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {WA_ICON}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alumnoNombre}
            </div>
            <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
              {alumnoPhone ?? 'Sin teléfono registrado'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px', padding: '20px' }}>

          {/* Template chips */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: '10px' }}>
              Tipo de mensaje
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {COMPOSER_TYPES.map(t => {
                const active = tipo === t.tipo;
                return (
                  <button
                    key={t.tipo}
                    onClick={() => handleTipo(t.tipo)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 13px', borderRadius: '20px', cursor: 'pointer',
                      border: `1px solid ${active ? WA_GREEN : '#2a2a2a'}`,
                      background: active ? 'rgba(37,211,102,0.1)' : '#161616',
                      color: active ? WA_GREEN : '#666',
                      fontSize: '12px', fontWeight: 600, transition: 'all 0.15s',
                    }}
                  >
                    <ChipIcon tipo={t.tipo} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* WA Preview */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: '10px' }}>
              Vista previa
            </div>
            <div style={{ background: '#e5ddd5', borderRadius: '10px', padding: '16px', minHeight: '72px' }}>
              <div style={{
                background: '#dcf8c6', borderRadius: '8px 8px 0 8px',
                padding: '10px 14px', maxWidth: '88%', marginLeft: 'auto',
                color: '#111', fontSize: '13.5px', lineHeight: '1.55',
                boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {msg || <span style={{ color: '#aaa', fontStyle: 'italic' }}>El mensaje aparecerá aquí…</span>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px', marginTop: '5px' }}>
                  <span style={{ fontSize: '11px', color: '#667781' }}>
                    {new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <svg viewBox="0 0 18 11" width="18" height="11" fill="#53bdeb">
                    <path d="M17.394.614a.5.5 0 0 0-.707 0l-8.04 8.04-2.04-2.04a.5.5 0 1 0-.707.707l2.394 2.393a.5.5 0 0 0 .707 0L17.394 1.32a.5.5 0 0 0 0-.707zM13.394.614a.5.5 0 0 0-.707 0L5.354 8.348l-.354-.353a.5.5 0 1 0-.707.707l.708.707a.5.5 0 0 0 .707 0l7.686-7.688a.5.5 0 0 0 0-.707z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Editor */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: '8px' }}>
              Editar mensaje
            </div>
            <textarea
              ref={taRef}
              rows={5}
              value={msg}
              onChange={e => { userEditedRef.current = true; setMsg(e.target.value); }}
              placeholder="Escribí tu mensaje aquí…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '6px',
                color: '#ccc', fontSize: '13px', lineHeight: '1.55',
                padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>

          {!hasPhone && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '13px', color: '#ef4444' }}>
              Este alumno no tiene teléfono registrado.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: '1px solid #1e1e1e', flexWrap: 'wrap' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #333', background: 'none', color: '#888', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            disabled={!msg}
            onClick={() => {
              void navigator.clipboard.writeText(msg);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #333', background: 'none', color: copied ? WA_GREEN : '#888', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
          >
            {copied ? '¡Copiado!' : 'Copiar texto'}
          </button>
          <button
            disabled={!hasPhone || !msg}
            onClick={() => void handleSend()}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '8px 18px', borderRadius: '6px', border: 'none',
              background: hasPhone && msg ? WA_GREEN : '#1e1e1e',
              color: hasPhone && msg ? '#00120E' : '#444',
              fontWeight: 700, fontSize: '13px',
              cursor: hasPhone && msg ? 'pointer' : 'not-allowed',
            }}
          >
            {WA_ICON}
            Enviar a WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
