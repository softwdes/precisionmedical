'use client';

/**
 * B.11 — CheckinClient
 * Botón de confirmación de llegada + feedback de éxito.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  appointmentId: string;
  patientName:   string;
  alreadyCheckedIn: boolean;
}

export function CheckinClient({ appointmentId, patientName, alreadyCheckedIn }: Props) {
  const router  = useRouter();
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState('');
  const [verified, setVerified] = useState(false);
  const [staffNote, setStaffNote] = useState('');

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
      const data = await res.json() as { ok?: boolean; error?: string; alreadyCheckedIn?: boolean };

      if (!res.ok) {
        setError(
          data.error === 'INVALID_STATUS'
            ? 'Esta cita no puede hacer check-in en su estado actual.'
            : 'Error al registrar llegada. Intenta de nuevo.',
        );
        return;
      }
      setSuccess(true);
      // Redirect after 1.5 s
      setTimeout(() => router.push('/'), 1500);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (alreadyCheckedIn) {
    return (
      <div style={{ display: 'flex', gap: 10 }}>
        <a
          href="/triage"
          style={{
            flex: 1, padding: '14px', borderRadius: 12, textAlign: 'center',
            background: 'linear-gradient(135deg, #10B981, #059669)',
            border: 'none', color: '#fff', fontSize: 15, fontWeight: 700,
            textDecoration: 'none', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
            boxShadow: '0 4px 16px rgba(16,185,129,0.30)',
          }}
        >
          Ir a triaje →
        </a>
        <a
          href="/"
          style={{
            padding: '14px 20px', borderRadius: 12, textAlign: 'center',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.60)', fontSize: 14, fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ← Cola
        </a>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{
        padding: '24px', borderRadius: 14, textAlign: 'center',
        background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.35)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#10B981', marginBottom: 6 }}>
          ¡Llegada confirmada!
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
          {patientName} está en sala de espera. Redirigiendo...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Identity confirmation checkbox */}
      <label style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
        padding: '14px 16px', borderRadius: 10,
        background: verified ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
        border: verified
          ? '1px solid rgba(16,185,129,0.40)'
          : '1px solid rgba(255,255,255,0.10)',
        transition: 'all 0.2s',
      }}>
        <input
          type="checkbox"
          checked={verified}
          onChange={e => setVerified(e.target.checked)}
          style={{ width: 18, height: 18, marginTop: 2, accentColor: '#10B981', cursor: 'pointer', flexShrink: 0 }}
        />
        <span style={{ fontSize: 14, color: verified ? '#fff' : 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          Verifiqué la identidad de <strong>{patientName}</strong> verbalmente (nombre + fecha de nacimiento)
        </span>
      </label>

      {/* Optional staff note */}
      <div>
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.10em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)', marginBottom: 6,
        }}>
          Nota de recepción (opcional)
        </label>
        <textarea
          value={staffNote}
          onChange={e => setStaffNote(e.target.value)}
          placeholder="Ej: Paciente llega con acompañante, traerá documentos..."
          style={{
            width: '100%', padding: '10px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 10, color: '#fff', fontSize: 13,
            resize: 'none', fontFamily: 'inherit', minHeight: 72,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)',
          color: '#F87171', fontSize: 13,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <a
          href="/"
          style={{
            padding: '14px 20px', borderRadius: 12,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: 600,
            textDecoration: 'none', flexShrink: 0,
          }}
        >
          ← Cancelar
        </a>
        <button
          type="button"
          onClick={handleCheckin}
          disabled={!verified || loading}
          style={{
            flex: 1, padding: '14px',
            background: verified && !loading
              ? 'linear-gradient(135deg, #10B981, #059669)'
              : 'rgba(16,185,129,0.20)',
            border: 'none', borderRadius: 12,
            color: verified ? '#fff' : 'rgba(255,255,255,0.35)',
            fontSize: 16, fontWeight: 700, cursor: verified && !loading ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            boxShadow: verified && !loading ? '0 4px 16px rgba(16,185,129,0.30)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          {loading ? '⏳ Registrando...' : '✓ Confirmar llegada'}
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
