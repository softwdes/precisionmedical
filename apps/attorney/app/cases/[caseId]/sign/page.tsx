'use client';

/**
 * B.22 — Firma del Lien Médico (abogado)
 * Canvas SVG, confirmación y POST al API
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, RefreshCw, Check } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types                                                                  */
/* ------------------------------------------------------------------ */
interface Point { x: number; y: number }

/* ------------------------------------------------------------------ */
/* Main component                                                         */
/* ------------------------------------------------------------------ */
export default function SignLienPage() {
  const params = useParams<{ caseId: string }>();
  const router = useRouter();
  const caseId = params.caseId;

  /* Canvas state */
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const isDrawing       = useRef(false);
  const lastPoint       = useRef<Point | null>(null);
  const [hasSig, setHasSig]     = useState(false);
  const [cleared, setCleared]   = useState(false);

  /* Form state */
  const [signerName,  setSignerName]  = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [agreed,      setAgreed]      = useState(false);

  /* Submit state */
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  /* ----------------------------------------------------------------
   * Canvas drawing helpers
   * ---------------------------------------------------------------- */
  const getPos = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      if (!t) return null;
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPoint.current = getPos(e);
    setHasSig(true);
    setCleared(false);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const cur = getPos(e);
    if (!cur) return;
    const prev = lastPoint.current ?? cur;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    lastPoint.current = cur;
  };

  const stopDrawing = () => {
    isDrawing.current = false;
    lastPoint.current = null;
  };

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    setCleared(true);
  }, []);

  /* ----------------------------------------------------------------
   * Submit
   * ---------------------------------------------------------------- */
  const handleSubmit = async () => {
    if (!hasSig || !signerName.trim() || !agreed) return;
    setSaving(true);
    setError(null);

    /* Export canvas as SVG-like data URL (PNG in base64 is fine for Phase 1A) */
    const canvas = canvasRef.current!;
    const signatureSvg = canvas.toDataURL('image/png');

    try {
      const res = await fetch(`/api/cases/${caseId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName:  signerName.trim(),
          signerEmail: signerEmail.trim() || undefined,
          signatureSvg,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setDone(true);
      setTimeout(() => router.push(`/cases/${caseId}`), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  /* ----------------------------------------------------------------
   * Render
   * ---------------------------------------------------------------- */
  if (done) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0f1e',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 18,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(244,63,94,0.15)',
          border: '2px solid #f43f5e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 30px rgba(244,63,94,0.35)',
        }}>
          <Check size={34} color="#f43f5e" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>Lien firmado</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            Firma guardada y auditada · Redirigiendo…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e' }}>
      {/* Header */}
      <header style={{
        padding: '0 24px', height: 60,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(244,63,94,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href={`/cases/${caseId}`} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.60)', textDecoration: 'none', fontSize: 12,
          }}>
            <ArrowLeft size={13} /> Volver al caso
          </Link>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.10)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
            Firma del Lien Médico
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#34d399' }}>
          <ShieldCheck size={12} />
          <span>⏱ Auditada · HIPAA</span>
        </div>
      </header>

      <div style={{ padding: '24px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
            Acuerdo de Gravamen Médico
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>
            Medical Lien Agreement · Todas las firmas son legalmente vinculantes y se guardan en log de auditoría inmutable
          </div>
        </div>

        {/* Signature status cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Paciente — mock firmado */}
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.25)',
          }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 8 }}>
              Paciente
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', background: '#34d399',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0,
              }}>✓</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>Firma recibida</span>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
              Firmado electrónicamente · (Phase 1A: mock)
            </div>
          </div>

          {/* Abogado — pendiente */}
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.25)',
          }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 8 }}>
              Abogado / Bufete
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                border: '1px solid rgba(244,63,94,0.50)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#f43f5e', flexShrink: 0,
              }}>○</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fb7185' }}>Pendiente tu firma</span>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              Firma digital a continuación →
            </div>
          </div>
        </div>

        {/* Signer info */}
        <div style={{
          padding: '16px 20px', borderRadius: 12,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.40)', fontWeight: 700 }}>
            Datos del firmante
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.50)', fontWeight: 600 }}>
                Nombre completo *
              </label>
              <input
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="Ej. María González Abogado"
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.50)', fontWeight: 600 }}>
                Email (opcional)
              </label>
              <input
                value={signerEmail}
                onChange={e => setSignerEmail(e.target.value)}
                placeholder="abogado@bufete.com"
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* Canvas signature pad */}
        <div style={{
          borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${hasSig ? 'rgba(244,63,94,0.40)' : 'rgba(255,255,255,0.10)'}`,
          background: 'rgba(255,255,255,0.01)',
          transition: 'border-color 0.2s',
        }}>
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', fontWeight: 600 }}>
              ✍️ Firma aquí · dibuja con mouse o dedo
            </div>
            {hasSig && (
              <button
                onClick={clearCanvas}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6, padding: '4px 10px', color: 'rgba(255,255,255,0.55)',
                  fontSize: 10, cursor: 'pointer', fontWeight: 600,
                }}
              >
                <RefreshCw size={10} /> Limpiar
              </button>
            )}
          </div>
          <canvas
            ref={canvasRef}
            width={660}
            height={180}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            style={{
              width: '100%', height: 180,
              cursor: 'crosshair', display: 'block',
              background: 'rgba(0,0,0,0.20)',
              touchAction: 'none',
            }}
          />
          <div style={{
            padding: '6px 16px 8px',
            borderTop: '1px dashed rgba(255,255,255,0.06)',
          }}>
            <div style={{ borderTop: '1px solid rgba(244,63,94,0.20)', width: '40%', marginTop: 0 }} />
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
              Línea de firma · Abogado o representante autorizado del bufete
            </div>
          </div>
        </div>

        {/* Agreement checkbox */}
        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
          padding: '12px 16px', borderRadius: 10,
          background: agreed ? 'rgba(244,63,94,0.06)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${agreed ? 'rgba(244,63,94,0.25)' : 'rgba(255,255,255,0.08)'}`,
          transition: 'all 0.15s',
        }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ width: 14, height: 14, marginTop: 1, accentColor: '#f43f5e', flexShrink: 0 }}
          />
          <span style={{ fontSize: 11, color: agreed ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
            Confirmo que estoy autorizado para firmar este Acuerdo de Gravamen Médico en nombre del bufete y entiendo que mi firma digital es legalmente vinculante bajo la Ley ESIGN y UETA. Esta acción quedará registrada en el log de auditoría con mi nombre, email, dirección IP y timestamp UTC.
          </span>
        </label>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)',
            color: '#fca5a5', fontSize: 12,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
          <Link href={`/cases/${caseId}`} style={{
            padding: '12px 20px', borderRadius: 9, fontSize: 13, fontWeight: 600,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.60)', textDecoration: 'none',
          }}>
            Cancelar
          </Link>
          <button
            onClick={handleSubmit}
            disabled={!hasSig || !signerName.trim() || !agreed || saving}
            style={{
              padding: '12px 28px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: (!hasSig || !signerName.trim() || !agreed || saving)
                ? 'rgba(255,255,255,0.08)'
                : 'linear-gradient(135deg,#f43f5e,#ec4899)',
              color: (!hasSig || !signerName.trim() || !agreed || saving)
                ? 'rgba(255,255,255,0.30)'
                : '#fff',
              border: 'none', cursor: saving ? 'wait' : 'pointer',
              boxShadow: (!hasSig || !signerName.trim() || !agreed || saving)
                ? 'none'
                : '0 4px 14px rgba(244,63,94,0.35)',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            {saving ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                Guardando…
              </>
            ) : (
              <>
                <Check size={14} />
                Confirmar firma del Lien
              </>
            )}
          </button>
        </div>

        {/* Audit notice */}
        <div style={{
          textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.25)', paddingTop: 4,
        }}>
          🔒 Esta firma se almacenará en la tabla <code style={{ fontFamily: 'monospace', fontSize: 9 }}>lien_signatures</code> con registro de IP, user-agent y timestamp UTC · append-only · HIPAA Phase 1A
        </div>
      </div>
    </div>
  );
}
