'use client';

/**
 * B.11 + B.14.1 — CheckinClient
 *
 * Paso 1: Recepción verifica identidad y confirma llegada (B.11)
 * Paso 2: Paciente firma en tablet (B.14.1) — aparece tras confirmar llegada
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const EMERALD = '#10B981';
const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';

interface Props {
  appointmentId:    string;
  patientName:      string;
  alreadyCheckedIn: boolean;
  alreadySigned:    boolean;
}

type UIStep = 'checkin' | 'signature' | 'done';

export function CheckinClient({ appointmentId, patientName, alreadyCheckedIn, alreadySigned }: Props) {
  const router = useRouter();

  const initialStep: UIStep = alreadySigned ? 'done' : alreadyCheckedIn ? 'signature' : 'checkin';
  const [uiStep,    setUiStep]   = useState<UIStep>(initialStep);
  const [loading,   setLoading]  = useState(false);
  const [error,     setError]    = useState('');
  const [verified,  setVerified] = useState(false);
  const [staffNote, setStaffNote] = useState('');

  // ── Signature canvas ────────────────────────────────────────────────────────
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const isDrawing   = useRef(false);
  const [hasSig,  setHasSig]  = useState(false);
  const [sigName, setSigName] = useState(patientName);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const prevData = canvas.toDataURL();
      canvas.width  = parent.clientWidth;
      canvas.height = 160;
      // Restore previous drawing after resize
      const img = new Image();
      img.onload = () => canvas.getContext('2d')?.drawImage(img, 0, 0);
      img.src = prevData;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [uiStep]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawing.current = true;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = EMERALD;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    setHasSig(true);
  }, []);

  const endDraw = useCallback(() => { isDrawing.current = false; }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  // ── Step 1: confirm arrival ─────────────────────────────────────────────────
  const handleCheckin = async () => {
    if (!verified) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/checkin/${appointmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffNote: staffNote.trim() || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(
          data.error === 'INVALID_STATUS'
            ? 'Esta cita no puede hacer check-in en su estado actual.'
            : 'Error al registrar llegada. Intenta de nuevo.',
        );
        return;
      }
      setUiStep('signature');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: save signature ──────────────────────────────────────────────────
  const handleSign = async () => {
    if (!hasSig || !sigName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const canvas = canvasRef.current;
      const svgData = canvas ? canvas.toDataURL('image/png') : '';
      const res = await fetch(`/api/checkin/${appointmentId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureSvg: svgData, signerName: sigName.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Error al guardar la firma. Intenta de nuevo.');
        return;
      }
      setUiStep('done');
      setTimeout(() => router.push('/'), 1800);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipSignature = () => {
    setUiStep('done');
    setTimeout(() => router.push('/'), 1200);
  };

  // ── DONE state ──────────────────────────────────────────────────────────────
  if (uiStep === 'done') {
    return (
      <div style={{
        padding: '24px', borderRadius: 14, textAlign: 'center',
        background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.35)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: EMERALD, marginBottom: 6 }}>
          {alreadySigned ? `${patientName} ya firmó` : '¡Registro completo!'}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 16 }}>
          {patientName} está en sala de espera. Redirigiendo...
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <a href={`/triage/${appointmentId}`} style={{
            padding: '12px 20px', borderRadius: 10, textAlign: 'center',
            background: 'linear-gradient(135deg, #10B981, #059669)',
            color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none',
          }}>Ir a triaje →</a>
          <a href="/" style={{
            padding: '12px 20px', borderRadius: 10,
            background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
            color: 'rgba(255,255,255,0.60)', fontSize: 14, textDecoration: 'none',
          }}>← Cola</a>
          <a href={`/checkin/${appointmentId}/print`} target="_blank" rel="noreferrer" style={{
            padding: '12px 20px', borderRadius: 10,
            background: CARD_BG, border: `1px solid ${CARD_BORDER}`,
            color: 'rgba(255,255,255,0.60)', fontSize: 14, textDecoration: 'none',
          }}>🖨 Imprimir firma</a>
        </div>
      </div>
    );
  }

  // ── STEP 1: Checkin (identity + arrival confirmation) ───────────────────────
  if (uiStep === 'checkin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        <label style={{
          display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
          padding: '14px 16px', borderRadius: 10,
          background: verified ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
          border: verified ? '1px solid rgba(16,185,129,0.40)' : '1px solid rgba(255,255,255,0.10)',
          transition: 'all 0.2s',
        }}>
          <input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, accentColor: EMERALD, cursor: 'pointer', flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: verified ? '#fff' : 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
            Verifiqué la identidad de <strong>{patientName}</strong> verbalmente (nombre + fecha de nacimiento)
          </span>
        </label>

        <div>
          <label style={{
            display: 'block', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)', marginBottom: 6,
          }}>
            Nota de recepción (opcional)
          </label>
          <textarea value={staffNote} onChange={e => setStaffNote(e.target.value)}
            placeholder="Ej: Paciente llega con acompañante, traerá documentos..."
            style={{
              width: '100%', padding: '10px 14px',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 10, color: '#fff', fontSize: 13,
              resize: 'none', fontFamily: 'inherit', minHeight: 72,
              outline: 'none', boxSizing: 'border-box',
            }} />
        </div>

        {error && <ErrorBox error={error} />}

        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/" style={{
            padding: '14px 20px', borderRadius: 12,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: 600, textDecoration: 'none', flexShrink: 0,
          }}>← Cancelar</a>
          <button type="button" onClick={handleCheckin} disabled={!verified || loading} style={{
            flex: 1, padding: '14px',
            background: verified && !loading ? 'linear-gradient(135deg, #10B981, #059669)' : 'rgba(16,185,129,0.20)',
            border: 'none', borderRadius: 12,
            color: verified ? '#fff' : 'rgba(255,255,255,0.35)',
            fontSize: 16, fontWeight: 700, cursor: verified && !loading ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', transition: 'all 0.2s',
          }}>
            {loading ? '⏳ Registrando...' : '✓ Confirmar llegada →'}
          </button>
        </div>

        {!verified && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 0 }}>
            Confirma la identidad del paciente para habilitar el botón
          </p>
        )}
      </div>
    );
  }

  // ── STEP 2: Patient signature (B.14.1) ──────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{
        padding: '12px 16px', borderRadius: 10,
        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: EMERALD, marginBottom: 4 }}>
          ✓ Llegada confirmada · Paso 2 de 2
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
          {patientName} — por favor firma para completar el registro de asistencia
        </div>
      </div>

      {/* Signer name */}
      <div>
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.10em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)', marginBottom: 6,
        }}>Nombre completo del firmante</label>
        <input type="text" value={sigName} onChange={e => setSigName(e.target.value)}
          style={{
            width: '100%', padding: '12px 14px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 10, color: '#fff', fontSize: 15, outline: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }} />
      </div>

      {/* Canvas pad */}
      <div>
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.10em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)', marginBottom: 6,
        }}>Firma del paciente</label>
        <div style={{
          position: 'relative',
          border: '1px solid rgba(16,185,129,0.35)', borderRadius: 10,
          background: 'rgba(16,185,129,0.04)', overflow: 'hidden', touchAction: 'none',
        }}>
          <canvas ref={canvasRef} style={{ display: 'block', cursor: 'crosshair' }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
          />
          {!hasSig && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', fontSize: 13, color: 'rgba(255,255,255,0.20)',
            }}>✍️ Dibuja tu firma aquí</div>
          )}
        </div>
        {hasSig && (
          <button type="button" onClick={clearCanvas} style={{
            marginTop: 6, padding: '4px 12px', borderRadius: 6,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.45)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}>× Borrar y volver a firmar</button>
        )}
      </div>

      {/* Legal note */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', lineHeight: 1.5 }}>
        🔒 Esta firma registra tu asistencia a Precision Medical Care y queda vinculada a tu expediente de forma segura.
      </div>

      {error && <ErrorBox error={error} />}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={handleSkipSignature} style={{
          padding: '14px 16px', borderRadius: 12, flexShrink: 0,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.40)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        }}>Omitir →</button>
        <button type="button" onClick={handleSign} disabled={!hasSig || !sigName.trim() || submitting} style={{
          flex: 1, padding: '14px',
          background: hasSig && sigName.trim() && !submitting
            ? 'linear-gradient(135deg, #10B981, #059669)'
            : 'rgba(16,185,129,0.20)',
          border: 'none', borderRadius: 12,
          color: hasSig && sigName.trim() ? '#fff' : 'rgba(255,255,255,0.35)',
          fontSize: 16, fontWeight: 700,
          cursor: hasSig && sigName.trim() && !submitting ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit', transition: 'all 0.2s',
        }}>
          {submitting ? '⏳ Guardando...' : '✓ Firmar registro de asistencia'}
        </button>
      </div>
    </div>
  );
}

function ErrorBox({ error }: { error: string }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8,
      background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)',
      color: '#F87171', fontSize: 13,
    }}>⚠️ {error}</div>
  );
}
