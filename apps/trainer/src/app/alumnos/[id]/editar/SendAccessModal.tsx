'use client';

import { useState } from 'react';

const WA_GREEN = '#25D366';

const WA_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

interface Props {
  studentName: string;
  phone: string | null;
  email: string;
  link: string;
  hasAccount: boolean;
  onClose: () => void;
}

export default function SendAccessModal({ studentName, phone, email, link, hasAccount, onClose }: Props) {
  const defaultMsg = hasAccount
    ? `Hola ${studentName} 👋\n\nTu entrenador te ha enviado un link para restablecer tu acceso al portal de entrenamiento.\n\n🔗 Ingresa aquí:\n${link}\n\n⚠️ Este link es válido por 24 horas.`
    : `Hola ${studentName} 👋\n\nTu entrenador te ha dado acceso a tu portal personal de entrenamiento.\n\n🔗 Activa tu cuenta aquí:\n${link}\n\n⚠️ Este link es válido por 24 horas. Desde tu portal podrás ver tu rutina, horario, métricas y plan de nutrición.`;

  const [msg, setMsg] = useState(defaultMsg);
  const [copied, setCopied] = useState(false);
  const hasPhone = !!phone;

  function handleSend() {
    if (!phone) return;
    const tel = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
    onClose();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', width: '100%', maxWidth: '540px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 20px', borderBottom: '1px solid #1e1e1e' }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: WA_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {WA_ICON}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Enviar acceso — {studentName}
            </div>
            <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
              {phone ?? 'Sin teléfono registrado'} · {email}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '4px', display: 'flex' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px', padding: '20px' }}>

          {/* Info badge */}
          <div style={{
            padding: '10px 14px', borderRadius: '8px',
            background: hasAccount ? 'rgba(96,165,250,0.08)' : 'rgba(63,248,200,0.08)',
            border: `1px solid ${hasAccount ? 'rgba(96,165,250,0.2)' : 'rgba(63,248,200,0.2)'}`,
            fontSize: '13px',
            color: hasAccount ? '#60A5FA' : '#3FF8C8',
            display: 'flex', alignItems: 'flex-start', gap: '10px',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {hasAccount
              ? 'Este alumno ya tiene cuenta. Se generó un link de recuperación de contraseña (válido 24h).'
              : 'Cuenta nueva. Se generó un link de invitación para que el alumno active su acceso (válido 24h).'}
          </div>

          {/* Preview */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: '10px' }}>
              Vista previa del mensaje
            </div>
            <div style={{ background: '#e5ddd5', borderRadius: '10px', padding: '16px', minHeight: '80px' }}>
              <div style={{
                background: '#dcf8c6', borderRadius: '8px 8px 0 8px',
                padding: '10px 14px', maxWidth: '92%', marginLeft: 'auto',
                color: '#111', fontSize: '13px', lineHeight: '1.6',
                boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {msg}
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
              rows={6}
              value={msg}
              onChange={e => setMsg(e.target.value)}
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
              Este alumno no tiene teléfono registrado. Agregá el número de celular para poder enviar por WhatsApp.
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
            onClick={() => { void navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #333', background: 'none', color: copied ? WA_GREEN : '#888', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
          >
            {copied ? '¡Copiado!' : 'Copiar texto'}
          </button>
          <button
            disabled={!hasPhone || !msg}
            onClick={handleSend}
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
            Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
