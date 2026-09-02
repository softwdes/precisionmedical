'use client';

import { useState, useEffect } from 'react';

export function CloseWindowButton({
  firstName,
  caseCode,
  lang = 'en',
}: {
  firstName: string;
  caseCode: string;
  lang?: 'es' | 'en';
}) {
  const [handoff, setHandoff]     = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [dimmed, setDimmed]       = useState(false);

  const es = lang === 'es';

  useEffect(() => {
    if (!handoff) return;
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { setDimmed(true); clearInterval(id); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [handoff]);

  /* ── Normal button ──────────────────────────────────────────────────────── */
  if (!handoff) {
    return (
      <button
        onClick={() => setHandoff(true)}
        style={{
          width: '100%', padding: '15px',
          background: 'linear-gradient(135deg, #10B981, #06B6D4)',
          border: 'none', borderRadius: 12, color: '#fff',
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(16,185,129,0.30)',
        }}
      >
        {es ? '✓ Cerrar esta ventana' : '✓ Close this window'}
      </button>
    );
  }

  /* ── Handoff overlay ────────────────────────────────────────────────────── */
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: dimmed ? '#000' : '#0a1224',
      transition: 'background 2.5s ease',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes pmSpin    { to   { transform: rotate(360deg); } }
        @keyframes pmPulse   { 0%,100% { transform: scale(1); opacity:.7; } 50% { transform: scale(1.25); opacity:1; } }
        @keyframes pmFadeIn  { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pmGlow    { 0%,100% { box-shadow: 0 0 32px rgba(16,185,129,.35); } 50% { box-shadow: 0 0 64px rgba(6,182,212,.55); } }
      `}</style>

      {!dimmed && (
        <div style={{
          maxWidth: 400, width: '100%', textAlign: 'center',
          animation: 'pmFadeIn .5s ease both',
        }}>

          {/* ── Icono con anillo giratorio ─────────────────────────────── */}
          <div style={{ position: 'relative', width: 128, height: 128, margin: '0 auto 28px' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'conic-gradient(from 0deg, #10B981 0%, #06B6D4 50%, #10B981 100%)',
              animation: 'pmSpin 3s linear infinite',
              opacity: .5,
            }} />
            <div style={{
              position: 'absolute', inset: 4, borderRadius: '50%', background: '#0a1224',
            }} />
            <div style={{
              position: 'absolute', inset: 8, borderRadius: '50%',
              background: 'linear-gradient(135deg, #10B981, #06B6D4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 48, animation: 'pmGlow 2.5s ease-in-out infinite',
            }}>
              👨‍⚕️
            </div>
          </div>

          {/* ── Número de caso ────────────────────────────────────────── */}
          <div style={{
            display: 'inline-block',
            background: 'rgba(165,180,252,0.06)',
            border: '1px solid rgba(165,180,252,0.18)',
            borderRadius: 10, padding: '10px 20px', marginBottom: 24,
          }}>
            <div style={{
              fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.30)', marginBottom: 4,
            }}>
              {es ? 'Número de caso' : 'Case number'}
            </div>
            <div style={{
              fontSize: 20, fontWeight: 900, fontFamily: 'monospace',
              color: '#A5B4FC', letterSpacing: '0.08em',
            }}>
              {caseCode}
            </div>
          </div>

          {/* ── Saludo ────────────────────────────────────────────────── */}
          <h1 style={{
            fontSize: 30, fontWeight: 900, color: '#fff',
            marginBottom: 24, lineHeight: 1.2,
          }}>
            {es ? `¡Gracias, ${firstName}!` : `Thank you, ${firstName}!`}
          </h1>

          {/* ── Instrucción principal ─────────────────────────────────── */}
          <div style={{
            background: 'rgba(16,185,129,0.07)',
            border: '1px solid rgba(16,185,129,0.22)',
            borderRadius: 16, padding: '22px 24px', marginBottom: 22,
          }}>
            {/**
              * Acá decía "Puedes entregar la tablet al personal de la clínica".
              *
              * Se cambió (reporte de Erick, 2026-09-02) porque no era cierto en
              * la mayoría de los casos: el formulario se llena mucho más desde
              * el teléfono del paciente —el link llega por SMS— que desde la
              * tablet del mostrador, y a alguien en su casa esa instrucción no
              * le dice nada.
              *
              * No se intentó adivinar el dispositivo. El candidato era
              * `intakeFormSentVia`, pero no alcanza: cuando el link se genera
              * sin enviarlo (el QR) el paciente igual lo escanea con SU
              * teléfono, así que "no se envió" no significa "es la tablet". Una
              * instrucción equivocada es peor que ninguna, y lo que el paciente
              * necesita saber acá es solo que su formulario llegó.
              */}
            <div style={{ fontSize: 22, marginBottom: 12 }}>✅</div>
            <p style={{
              fontSize: 17, fontWeight: 700, color: '#fff',
              lineHeight: 1.45, margin: 0,
            }}>
              {es
                ? <>Tu formulario se envió<br />correctamente.</>
                : <>Your form was submitted<br />successfully.</>}
            </p>
            <p style={{
              fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.5, margin: '10px 0 0',
            }}>
              {es
                ? 'El equipo de Precision Medical lo revisará antes de tu cita.'
                : 'The Precision Medical team will review it before your appointment.'}
            </p>
          </div>

          {/* ── Dots animados ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
            {(['#10B981', '#06B6D4', '#6366F1'] as const).map((color, i) => (
              <div key={i} style={{
                width: 9, height: 9, borderRadius: '50%', background: color,
                animation: `pmPulse ${1.1 + i * 0.28}s ease-in-out infinite`,
              }} />
            ))}
          </div>

          {/* "El equipo te atenderá en unos momentos" daba por sentado que el
              paciente está en la clínica. Desde el teléfono, en su casa, no
              significa nada — es la misma suposición que la de la tablet. */}
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', marginBottom: 20, lineHeight: 1.6 }}>
            {es ? 'Ya puedes cerrar esta ventana.' : 'You can close this window now.'}
          </p>

          {/* ── Countdown ─────────────────────────────────────────────── */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 20, padding: '5px 14px',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: '#10B981',
              animation: 'pmPulse 1s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
              {es ? `Pantalla se oscurece en ${countdown}s` : `Screen dims in ${countdown}s`}
            </span>
          </div>

        </div>
      )}
    </div>
  );
}
