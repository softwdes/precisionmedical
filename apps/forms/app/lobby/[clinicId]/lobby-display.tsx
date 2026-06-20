'use client';

/**
 * B.37 — Lobby HIPAA Display (client)
 *
 * Pantalla de TV fullscreen para sala de espera.
 * Polling cada 15s + auto-reload cada 30min.
 * HIPAA: solo iniciales + 2 dígitos ("E.S - 62"). Sin PHI.
 * Bilingüe: etiquetas en ES · EN simultáneos.
 *
 * Color: cyan/violet gradient (Regla #5 — mockup aprobado)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
// ─── Shared types (mirrored from API route — cannot import across [param] routes) ─

interface LobbyPatient {
  id:           string;
  display:      string;
  doctorName:   string | null;
  checkedInAt:  string | null;
  updatedAt:    string;
  scheduledFor: string;
}

interface WaitingPatient extends LobbyPatient {
  position:         number;
  estimatedWaitMin: number;
}

interface ConsultationPatient extends LobbyPatient {
  elapsedMin: number;
}

interface NowCalling {
  display:     string;
  destination: 'consultation' | 'triage';
  doctorName:  string | null;
}

interface LobbyData {
  ok:           true;
  clinic:       { id: string; name: string };
  nowCalling:   NowCalling | null;
  consultation: ConsultationPatient[];
  triage:       LobbyPatient[];
  waiting:      WaitingPatient[];
  stats: {
    waiting:      number;
    triage:       number;
    consultation: number;
    completed:    number;
    totalToday:   number;
  };
}

// ─── Component props ──────────────────────────────────────────────────────────

interface Props {
  clinicId:   string;
  clinicName: string;
}

// ─── Avatar color pool (10 colors, deterministic by display string hash) ─────
const AVATAR_COLORS = [
  '#06B6D4', // cyan
  '#8B5CF6', // violet
  '#10B981', // emerald
  '#F59E0B', // amber
  '#6366F1', // brand
  '#EC4899', // pink
  '#14B8A6', // teal
  '#A855F7', // purple
];

function avatarColor(display: string): string {
  let h = 0;
  for (let i = 0; i < display.length; i++) {
    h = (h * 31 + display.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(display: string): string {
  // "E.S - 62" → "ES"
  return display.replace(/[^A-Z]/g, '').slice(0, 2);
}

// ─── Clock component ──────────────────────────────────────────────────────────
function LiveClock() {
  const [tick, setTick] = useState<string | null>(null);

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString('en-US', {
        hour:     'numeric',
        minute:   '2-digit',
        timeZone: 'America/Denver',
      });

    setTick(fmt());
    const id = setInterval(() => setTick(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateStr = new Date().toLocaleDateString('es-US', {
    weekday: 'short',
    day:     'numeric',
    month:   'short',
    timeZone: 'America/Denver',
  });

  return (
    <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
        {tick ?? '--:--'}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textTransform: 'capitalize' }}>
        {dateStr}
      </div>
    </div>
  );
}

// ─── "Ahora llamando" banner ──────────────────────────────────────────────────
function NowCallingBanner({ data }: { data: NowCalling }) {
  const isConsult = data.destination === 'consultation';

  return (
    <div
      style={{
        margin:        '0 0 16px 0',
        padding:       '16px 24px',
        borderRadius:  14,
        background:    'rgba(16,185,129,0.10)',
        border:        '1px solid rgba(16,185,129,0.35)',
        display:       'flex',
        alignItems:    'center',
        gap:           20,
        animation:     'pulse-green 2s ease-in-out infinite',
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: 28 }}>⚡</span>

      {/* Label */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
          Ahora llamando · Now calling
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.01em' }}>
            {data.display}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 22 }}>→</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#10B981' }}>
            {isConsult
              ? (data.doctorName ? `${data.doctorName} · Doctor's Office` : 'Consultorio · Doctor\'s Office')
              : 'Sala de Triaje · Triage Room'}
          </span>
        </div>
      </div>

      {/* Pulse dot */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', display: 'inline-block', animation: 'ping-dot 1.2s ease-in-out infinite' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>pasar ahora</span>
      </div>
    </div>
  );
}

// ─── Consultation card (large TV card) ───────────────────────────────────────
function ConsultCard({ apt }: { apt: ConsultationPatient }) {
  const color = avatarColor(apt.display);
  const ini   = initials(apt.display);

  return (
    <div
      style={{
        background:   'rgba(255,255,255,0.04)',
        border:       `1px solid ${color}30`,
        borderRadius: 16,
        padding:      '20px 22px',
        display:      'flex',
        flexDirection: 'column',
        gap:          10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Avatar */}
        <div style={{
          width:           52, height:      52,
          borderRadius:    '50%',
          background:      `${color}20`,
          border:          `2px solid ${color}60`,
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          fontSize:        18,
          fontWeight:      900,
          color,
          letterSpacing:   '-0.02em',
          flexShrink:      0,
        }}>
          {ini}
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
            {apt.display}
          </div>
          {apt.doctorName && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', marginTop: 2 }}>
              {apt.doctorName}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color }}>⏱</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
          {apt.elapsedMin} min · En consulta · In consultation
        </span>
      </div>
    </div>
  );
}

// ─── Triage row ───────────────────────────────────────────────────────────────
function TriageRow({ apt }: { apt: LobbyPatient }) {
  const color = '#F59E0B'; // amber — triage accent
  const ini   = initials(apt.display);

  return (
    <div
      style={{
        background:    'rgba(245,158,11,0.06)',
        border:        '1px solid rgba(245,158,11,0.25)',
        borderRadius:  12,
        padding:       '14px 20px',
        display:       'flex',
        alignItems:    'center',
        gap:           16,
      }}
    >
      <div style={{
        width:          40, height:         40,
        borderRadius:   '50%',
        background:     'rgba(245,158,11,0.15)',
        border:         '2px solid rgba(245,158,11,0.40)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       14,
        fontWeight:     900,
        color,
        flexShrink:     0,
      }}>
        {ini}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{apt.display}</div>
        {apt.doctorName && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            {apt.doctorName}
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color, fontWeight: 600, letterSpacing: '0.04em' }}>
        📈 En triaje · In triage
      </div>
    </div>
  );
}

// ─── Waiting row ──────────────────────────────────────────────────────────────
function WaitRow({ apt, index }: { apt: WaitingPatient; index: number }) {
  const fmtWait = (min: number) =>
    min < 60 ? `~${min} min` : `~${Math.round(min / 60)}h`;

  return (
    <div
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:           16,
        padding:       '12px 16px',
        borderRadius:  10,
        background:    index % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent',
        borderBottom:  '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Position */}
      <span style={{
        width:          28, height:        28,
        borderRadius:   '50%',
        background:     'rgba(99,102,241,0.15)',
        border:         '1px solid rgba(99,102,241,0.30)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       12,
        fontWeight:     800,
        color:          '#a5b4fc',
        flexShrink:     0,
      }}>
        {apt.position}
      </span>

      {/* ID */}
      <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', minWidth: 90 }}>
        {apt.display}
      </span>

      {/* Wait estimate */}
      <span style={{
        fontSize:     12,
        color:        'rgba(255,255,255,0.40)',
        background:   'rgba(255,255,255,0.05)',
        borderRadius: 6,
        padding:      '3px 8px',
      }}>
        {fmtWait(apt.estimatedWaitMin)}
      </span>

      {/* Doctor */}
      {apt.doctorName && (
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>
          {apt.doctorName}
        </span>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ emoji, es, en, count, color }: {
  emoji: string; es: string; en: string;
  count: number; color: string;
}) {
  return (
    <div style={{
      display:       'flex',
      alignItems:    'center',
      gap:           10,
      marginBottom:  12,
      paddingBottom: 8,
      borderBottom:  `1px solid ${color}25`,
    }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {es}
      </span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', marginLeft: 2 }}>
        · {en}
      </span>
      <span style={{
        marginLeft:    'auto',
        background:    `${color}20`,
        border:        `1px solid ${color}35`,
        borderRadius:  20,
        padding:       '2px 10px',
        fontSize:      12,
        fontWeight:    700,
        color,
      }}>
        {count}
      </span>
    </div>
  );
}

// ─── Main display ─────────────────────────────────────────────────────────────
export function LobbyDisplay({ clinicId, clinicName }: Props) {
  const [data,    setData]    = useState<LobbyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/lobby/${clinicId}`, { cache: 'no-store' });
      if (!res.ok) { setError(true); return; }
      const json = await res.json() as LobbyData;
      if (json.ok) { setData(json); setError(false); }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    void poll();
    intervalRef.current = setInterval(() => void poll(), 15_000);

    // Hard reload every 30 minutes to flush any browser memory leaks (TV display)
    const reloadTimer = setTimeout(() => window.location.reload(), 30 * 60 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearTimeout(reloadTimer);
    };
  }, [poll]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Keyframe animations */}
      <style>{`
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
          50%       { box-shadow: 0 0 18px 4px rgba(16,185,129,0.18); }
        }
        @keyframes ping-dot {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%       { transform: scale(1.5); opacity: 0.6; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{
        minHeight:   '100vh',
        background:  '#0a1224',
        display:     'flex',
        flexDirection: 'column',
        fontFamily:  "'Plus Jakarta Sans', system-ui, sans-serif",
        color:       '#fff',
        overflow:    'hidden',
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header style={{
          background:    'linear-gradient(135deg, #0a0e14 0%, #0f1620 100%)',
          borderBottom:  '1px solid rgba(255,255,255,0.06)',
          padding:       '16px 32px',
          display:       'flex',
          alignItems:    'center',
          gap:           20,
          flexShrink:    0,
        }}>
          {/* Logo + clinic */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
            {/* PM badge */}
            <div style={{
              width:           48, height:         48,
              borderRadius:    12,
              background:      'linear-gradient(135deg, #06B6D4, #8B5CF6)',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              fontWeight:      900,
              fontSize:        16,
              color:           '#fff',
              letterSpacing:   '0.05em',
              flexShrink:      0,
              boxShadow:       '0 0 20px rgba(99,102,241,0.35)',
            }}>
              PM
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>
                Precision Medical
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                {clinicName}
              </div>
            </div>
          </div>

          {/* Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.5 : 1, transition: 'opacity 0.3s' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: error ? '#F43F5E' : '#10B981',
              display: 'inline-block',
              animation: !loading ? 'ping-dot 3s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              {error ? 'sin conexión' : 'en vivo · live'}
            </span>
          </div>

          {/* Clock */}
          <LiveClock />
        </header>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main style={{
          flex:     1,
          overflowY: 'auto',
          padding:   '20px 32px',
          display:  'flex',
          flexDirection: 'column',
          gap:      20,
        }}>

          {/* Loading state */}
          {loading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <span style={{ fontSize: 20, animation: 'spin-slow 1.2s linear infinite', display: 'inline-block' }}>⟳</span>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>Cargando sala de espera…</span>
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div style={{
              margin:       'auto',
              textAlign:    'center',
              padding:      '40px 20px',
              borderRadius: 16,
              background:   'rgba(244,63,94,0.06)',
              border:       '1px solid rgba(244,63,94,0.20)',
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.60)', marginBottom: 6 }}>
                No se pudo cargar la sala de espera
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>
                Reintentando en 15 segundos…
              </div>
            </div>
          )}

          {/* Content */}
          {!loading && !error && data && (
            <>
              {/* "Ahora llamando" banner */}
              {data.nowCalling && <NowCallingBanner data={data.nowCalling} />}

              {/* ── En Consulta ── */}
              {data.consultation.length > 0 && (
                <section>
                  <SectionHeader
                    emoji="🩺" es="En Consulta" en="In Consultation"
                    count={data.consultation.length} color="#8B5CF6"
                  />
                  <div style={{
                    display:             'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap:                 12,
                  }}>
                    {data.consultation.map((apt: ConsultationPatient) => (
                      <ConsultCard key={apt.id} apt={apt} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── En Triaje ── */}
              {data.triage.length > 0 && (
                <section>
                  <SectionHeader
                    emoji="📈" es="En Triaje" en="In Triage"
                    count={data.triage.length} color="#F59E0B"
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.triage.map((apt: LobbyPatient) => (
                      <TriageRow key={apt.id} apt={apt} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── Esperando ── */}
              <section>
                <SectionHeader
                  emoji="⏱" es="Esperando" en="Waiting"
                  count={data.waiting.length} color="#06B6D4"
                />
                {data.waiting.length === 0 ? (
                  <div style={{
                    padding:      '24px 20px',
                    borderRadius: 12,
                    background:   'rgba(6,182,212,0.04)',
                    border:       '1px dashed rgba(6,182,212,0.15)',
                    textAlign:    'center',
                    color:        'rgba(255,255,255,0.30)',
                    fontSize:     14,
                  }}>
                    Sala de espera libre · Waiting room clear
                  </div>
                ) : (
                  <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {data.waiting.map((apt: WaitingPatient, i: number) => (
                      <WaitRow key={apt.id} apt={apt} index={i} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <footer style={{
          background:   'linear-gradient(135deg, #0a0e14 0%, #0f1620 100%)',
          borderTop:    '1px solid rgba(255,255,255,0.06)',
          padding:      '12px 32px',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          gap:          20,
          flexShrink:   0,
          flexWrap:     'wrap',
        }}>
          {/* Stats */}
          {data && (
            <div style={{
              display:  'flex',
              alignItems: 'center',
              gap:      20,
              fontSize: 13,
              flexWrap: 'wrap',
            }}>
              <StatPill value={data.stats.waiting}      label="esperando · waiting"    color="#06B6D4" />
              <Divider />
              <StatPill value={data.stats.triage}       label="en triaje · in triage"  color="#F59E0B" />
              <Divider />
              <StatPill value={data.stats.consultation} label="en consulta · in consult" color="#8B5CF6" />
              <Divider />
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                Pacientes hoy · Today:{' '}
                <span style={{ color: '#fff', fontWeight: 700 }}>{data.stats.totalToday}</span>
              </span>
            </div>
          )}

          {/* QR walk-in kiosk */}
          <a
            href={`/walkin/${clinicId}`}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}
          >
            {/* QR SVG simple — apunta a /walkin/[clinicId] */}
            <div style={{
              width: 52, height: 52, borderRadius: 8,
              background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 4,
            }}>
              <svg viewBox="0 0 21 21" width={44} height={44} xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
                {/* Top-left finder */}
                <rect x={0} y={0} width={7} height={7} fill="#000" /><rect x={1} y={1} width={5} height={5} fill="#fff" /><rect x={2} y={2} width={3} height={3} fill="#000" />
                {/* Top-right finder */}
                <rect x={14} y={0} width={7} height={7} fill="#000" /><rect x={15} y={1} width={5} height={5} fill="#fff" /><rect x={16} y={2} width={3} height={3} fill="#000" />
                {/* Bottom-left finder */}
                <rect x={0} y={14} width={7} height={7} fill="#000" /><rect x={1} y={15} width={5} height={5} fill="#fff" /><rect x={2} y={16} width={3} height={3} fill="#000" />
                {/* Data modules — decorative pattern */}
                <rect x={8} y={0} width={1} height={1} fill="#000" /><rect x={9} y={1} width={1} height={1} fill="#000" /><rect x={11} y={0} width={1} height={1} fill="#000" />
                <rect x={8} y={2} width={2} height={1} fill="#000" /><rect x={11} y={2} width={2} height={1} fill="#000" />
                <rect x={9} y={4} width={1} height={1} fill="#000" /><rect x={11} y={4} width={1} height={1} fill="#000" />
                <rect x={8} y={6} width={1} height={1} fill="#000" /><rect x={10} y={6} width={2} height={1} fill="#000" />
                <rect x={7} y={8} width={1} height={1} fill="#000" /><rect x={9} y={8} width={1} height={1} fill="#000" /><rect x={11} y={8} width={1} height={1} fill="#000" />
                <rect x={8} y={9} width={2} height={1} fill="#000" /><rect x={12} y={9} width={1} height={1} fill="#000" />
                <rect x={7} y={10} width={1} height={1} fill="#000" /><rect x={10} y={10} width={1} height={1} fill="#000" /><rect x={13} y={10} width={1} height={1} fill="#000" />
                <rect x={8} y={11} width={1} height={1} fill="#000" /><rect x={11} y={11} width={2} height={1} fill="#000" />
                <rect x={7} y={12} width={2} height={1} fill="#000" /><rect x={10} y={12} width={1} height={1} fill="#000" />
                <rect x={9} y={13} width={1} height={1} fill="#000" /><rect x={12} y={13} width={2} height={1} fill="#000" />
                <rect x={8} y={14} width={1} height={1} fill="#000" /><rect x={10} y={14} width={1} height={1} fill="#000" /><rect x={13} y={14} width={1} height={1} fill="#000" />
                <rect x={9} y={15} width={2} height={1} fill="#000" /><rect x={12} y={15} width={1} height={1} fill="#000" />
                <rect x={8} y={16} width={1} height={1} fill="#000" /><rect x={11} y={16} width={1} height={1} fill="#000" />
                <rect x={9} y={17} width={1} height={1} fill="#000" /><rect x={12} y={17} width={2} height={1} fill="#000" />
                <rect x={8} y={18} width={2} height={1} fill="#000" /><rect x={11} y={18} width={1} height={1} fill="#000" />
                <rect x={9} y={19} width={1} height={1} fill="#000" /><rect x={12} y={19} width={1} height={1} fill="#000" />
                <rect x={8} y={20} width={1} height={1} fill="#000" /><rect x={10} y={20} width={2} height={1} fill="#000" />
              </svg>
            </div>
            <div style={{ lineHeight: 1.4 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.70)', fontWeight: 700 }}>
                Walk-in · Escanea
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                Scan to register
              </div>
            </div>
          </a>
        </footer>
      </div>
    </>
  );
}

// ─── Tiny helper components ───────────────────────────────────────────────────

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <span>
      <span style={{ fontWeight: 800, color, fontSize: 16, marginRight: 5 }}>{value}</span>
      <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: 12 }}>{label}</span>
    </span>
  );
}

function Divider() {
  return (
    <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)', display: 'inline-block', verticalAlign: 'middle' }} />
  );
}
