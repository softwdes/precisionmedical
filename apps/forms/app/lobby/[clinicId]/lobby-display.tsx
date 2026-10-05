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

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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

/**
 * Los dos idiomas del cartel.
 *
 * Hubo un tercer modo, `both`, que pintaba las dos lenguas juntas separadas por
 * `·` — y era el default. Erick lo sacó el 2026-09-29 mirando el cartel: con
 * todo duplicado las filas se leen a la mitad de distancia, que es justo lo que
 * un cartel de sala de espera no puede permitirse. Queda ES o EN, y se elige.
 */
type Lang = 'es' | 'en';

// ─── Clock component ──────────────────────────────────────────────────────────
/**
 * El reloj y la fecha del cartel.
 *
 * La fecha SEGUÍA EL TOGGLE y no lo hacía: estaba clavada en `es-US`, así que
 * con la pantalla en inglés el 28-sep-2026 decía "Lun, 28 De Sept" (Erick la
 * fotografió con EN seleccionado). Ahora recibe `lang` como todo lo demás del
 * cartel.
 *
 * Y el "De" con mayúscula era un segundo error, distinto: `textTransform:
 * capitalize` capitaliza CADA palabra, así que convertía la preposición del
 * castellano — "lun, 28 de sept" salía "Lun, 28 De Sept". Se capitaliza sólo
 * la primera letra, a mano.
 */
function LiveClock({ lang }: { lang: Lang }) {
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

  /* Una fecha por idioma, con el mismo criterio que `tx`. */
  const fecha = (locale: string) => {
    const s = new Date().toLocaleDateString(locale, {
      weekday: 'short',
      day:     'numeric',
      month:   'short',
      timeZone: 'America/Denver',
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const dateStr = tx(lang, fecha('es-US'), fecha('en-US'));

  return (
    <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
        {tick ?? '--:--'}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
        {dateStr}
      </div>
    </div>
  );
}

// ─── i18n helper ─────────────────────────────────────────────────────────────
function tx(lang: Lang, es: string, en: string) {
  return lang === 'es' ? es : en;
}

// ─── "Ahora llamando" banner ──────────────────────────────────────────────────
function NowCallingBanner({ data, lang }: { data: NowCalling; lang: Lang }) {
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
          {tx(lang, 'Ahora llamando', 'Now calling')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.01em' }}>
            {data.display}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 22 }}>→</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#10B981' }}>
            {isConsult
              ? (data.doctorName ? `${data.doctorName} · ${tx(lang, 'Consultorio', 'Exam Room')}` : tx(lang, 'Consultorio', 'Exam Room'))
              : tx(lang, 'Sala de Triaje', 'Triage Room')}
          </span>
        </div>
      </div>

      {/* Pulse dot */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', display: 'inline-block', animation: 'ping-dot 1.2s ease-in-out infinite' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>{tx(lang, 'pasar ahora', 'proceed now')}</span>
      </div>
    </div>
  );
}

// ─── Consultation card (large TV card) ───────────────────────────────────────
function ConsultCard({ apt, lang, spot = false }: { apt: ConsultationPatient; lang: Lang; spot?: boolean }) {
  const color = avatarColor(apt.display);
  const ini   = initials(apt.display);

  return (
    <div
      style={{
        background:   spot ? 'rgba(6,182,212,0.10)' : 'rgba(255,255,255,0.04)',
        border:       spot ? '1px solid #22D3EE' : `1px solid ${color}30`,
        boxShadow:    spot ? '0 0 0 3px rgba(34,211,238,0.22), 0 0 40px rgba(34,211,238,0.25)' : 'none',
        transition:   'all 0.4s',
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
          {apt.elapsedMin} min · {tx(lang, 'En consulta', 'In consultation')}
        </span>
      </div>
    </div>
  );
}

// ─── Triage row ───────────────────────────────────────────────────────────────
function TriageRow({ apt, lang, spot = false }: { apt: LobbyPatient; lang: Lang; spot?: boolean }) {
  const color = '#F59E0B'; // amber — triage accent
  const ini   = initials(apt.display);

  return (
    <div
      style={{
        background:    spot ? 'rgba(245,158,11,0.14)' : 'rgba(245,158,11,0.06)',
        border:        spot ? '1px solid #F59E0B' : '1px solid rgba(245,158,11,0.25)',
        boxShadow:     spot ? '0 0 36px rgba(245,158,11,0.28)' : 'none',
        transition:    'all 0.4s',
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
        📈 {tx(lang, 'En triaje', 'In triage')}
      </div>
    </div>
  );
}

// ─── Waiting row ──────────────────────────────────────────────────────────────
function WaitRow({ apt, index, lang, spot = false }: { apt: WaitingPatient; index: number; lang: Lang; spot?: boolean }) {
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
        background:    spot ? 'rgba(16,185,129,0.12)' : index % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent',
        borderBottom:  '1px solid rgba(255,255,255,0.04)',
        outline:       spot ? '2px solid #10B981' : '2px solid transparent',
        boxShadow:     spot ? '0 0 40px rgba(16,185,129,0.28)' : 'none',
        transition:    'all 0.4s',
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

      {spot && (
        <span style={{
          background: '#10B981', color: '#fff', fontWeight: 800, fontSize: 12,
          letterSpacing: '0.1em', padding: '3px 10px', borderRadius: 99,
        }}>
          {tx(lang, 'SIGUIENTE', 'NEXT')}
        </span>
      )}

      {/* Doctor */}
      {apt.doctorName && (
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>
          {apt.doctorName}
        </span>
      )}
    </div>
  );
}

// ─── CIFO ─────────────────────────────────────────────────────────────────────
/**
 * CIFO en el cartel: habla desde un globito sobre lo que REALMENTE pasa.
 *
 * No rota por reloj sobre datos inventados: arma una lista de escenas con lo que
 * hay (a quién se está llamando, quién está en consulta, quién sigue) y solo
 * alterna entre esas verdades. Sin nada que decir, saluda.
 *
 * HIPAA: el globito usa el MISMO código anónimo que el resto del cartel
 * ("S.L - 65"). Nunca un nombre, y tampoco voz.
 *
 * El GIF que señala (cifo-1) apunta hacia la izquierda: con CIFO a la izquierda
 * de la lista se lo espeja para que apunte a las filas. El espejo voltea el logo
 * del pecho; la versión definitiva necesita un GIF de CIFO señalando a la derecha.
 */
type CifoScene =
  | { kind: 'calling'; display: string; destination: 'consultation' | 'triage'; doctorName: string | null; spotId: string | null }
  | { kind: 'next';    display: string; doctorName: string | null; spotId: string }
  | { kind: 'consult'; display: string; doctorName: string | null; elapsedMin: number; spotId: string }
  | { kind: 'idle' };

const CIFO_ROTATE_MS = 8_000;

function buildScenes(d: LobbyData): CifoScene[] {
  const out: CifoScene[] = [];

  if (d.nowCalling) {
    const nc = d.nowCalling;
    const hit = [...d.consultation, ...d.triage].find(p => p.display === nc.display);
    out.push({ kind: 'calling', display: nc.display, destination: nc.destination, doctorName: nc.doctorName, spotId: hit?.id ?? null });
  }
  const first = d.waiting[0];
  if (first) out.push({ kind: 'next', display: first.display, doctorName: first.doctorName, spotId: first.id });
  for (const c of d.consultation.slice(0, 4)) {
    // El que se está llamando ya tiene su escena: no se repite.
    if (d.nowCalling && c.display === d.nowCalling.display) continue;
    out.push({ kind: 'consult', display: c.display, doctorName: c.doctorName, elapsedMin: c.elapsedMin, spotId: c.id });
  }
  return out.length > 0 ? out : [{ kind: 'idle' }];
}

function CifoPanel({ scene, lang }: { scene: CifoScene; lang: Lang }) {
  const con = (n: string | null) => (n ? tx(lang, ` con ${n}`, ` with ${n}`) : '');
  let tag = '', big = '', sub = '', accent = '#6366F1';
  let gif = '/cifo-1.gif', mirror = true;
  /* Alto máximo por GIF = poco más que su tamaño real. cifo-1/2 son de 200x356 px y
     estirados a 620 px se veían pixelados; cifo-saluda es de 300x533. */
  let maxH = 440;

  if (scene.kind === 'calling') {
    accent = '#059669';
    tag = tx(lang, 'Ahora llamando', 'Now calling');
    big = scene.display;
    sub = scene.destination === 'consultation'
      ? tx(lang, `Pasa al consultorio${con(scene.doctorName)}.`, `Please go to the exam room${con(scene.doctorName)}.`)
      : tx(lang, 'Pasa a la sala de triaje.', 'Please go to the triage room.');
  } else if (scene.kind === 'next') {
    accent = '#059669';
    tag = tx(lang, '¡Prepárate!', 'Get ready!');
    big = scene.display;
    sub = tx(lang, `Eres el siguiente${con(scene.doctorName)}. Ve acercándote al consultorio.`,
                   `You are next${con(scene.doctorName)}. Please head toward the exam room.`);
  } else if (scene.kind === 'consult') {
    accent = '#0891B2';
    gif = '/cifo-2.gif'; mirror = false;
    tag = tx(lang, 'En consulta ahora', 'In consultation now');
    big = scene.display;
    sub = tx(lang, `${scene.doctorName ? scene.doctorName + ' · ' : ''}${scene.elapsedMin} min`,
                   `${scene.doctorName ? scene.doctorName + ' · ' : ''}${scene.elapsedMin} min`);
  } else {
    mirror = false;
    gif = '/cifo-saluda.gif'; maxH = 533;
    tag = tx(lang, 'Bienvenido', 'Welcome');
    big = tx(lang, '¡Hola!', 'Hello!');
    sub = tx(lang, 'Avísanos en recepción si necesitas algo.', 'Let reception know if you need anything.');
  }

  // `key` fuerza el remontaje: el globito entra con su animación en cada escena.
  const key = scene.kind === 'idle' ? 'idle' : `${scene.kind}-${scene.display}`;

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div key={key} className="cifo-bubble" style={{
        position: 'absolute', left: 20, right: 20, top: 20, zIndex: 5,
        background: '#fff', color: '#0a1224', borderRadius: 26,
        padding: 'clamp(16px, 1.6vw, 30px) clamp(18px, 1.8vw, 34px)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 'clamp(11px, 1vw, 19px)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, marginBottom: 6 }}>{tag}</div>
        <div style={{ fontSize: 'clamp(26px, 2.8vw, 54px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{big}</div>
        <div style={{ fontSize: 'clamp(13px, 1.3vw, 26px)', color: '#3b4366', marginTop: 8, lineHeight: 1.25 }}>{sub}</div>
        <span style={{
          position: 'absolute', left: 90, bottom: -22, width: 0, height: 0,
          borderLeft: '18px solid transparent', borderRight: '18px solid transparent', borderTop: '24px solid #fff',
        }} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={gif + String(mirror)}
        src={gif}
        alt="CIFO"
        style={{
          position: 'absolute', left: '50%', bottom: 16,
          height: `min(62vh, ${maxH}px)`, width: 'auto',
          transform: `translateX(-50%)${mirror ? ' scaleX(-1)' : ''}`,
          filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.5))',
        }}
      />
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ emoji, es, en, count, color, lang }: {
  emoji: string; es: string; en: string;
  count: number; color: string; lang: Lang;
}) {
  const label = tx(lang, es, en);
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
        {label}
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
  /* Arranca en inglés: es el idioma de casi todos los pacientes —22 de 5.726
     tienen español registrado— y el que ve quien no toca el selector. */
  const [lang,    setLang]    = useState<Lang>('en');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Qué escena de CIFO toca; solo alterna entre cosas ciertas (ver buildScenes). */
  const [cifoTick, setCifoTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCifoTick(n => n + 1), CIFO_ROTATE_MS);
    return () => clearInterval(id);
  }, []);
  const scenes = useMemo(() => (data ? buildScenes(data) : [{ kind: 'idle' } as CifoScene]), [data]);
  const scene  = scenes[cifoTick % scenes.length];
  const spotId = scene.kind === 'idle' ? null : scene.spotId;

  const t = (es: string, en: string) => tx(lang, es, en);

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
        @keyframes cifo-bubble-in {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: none; }
        }
        .cifo-bubble { animation: cifo-bubble-in 0.4s ease-out; }
        /* CIFO solo cabe en pantallas anchas (la TV); en chicas queda el banner de siempre. */
        .lobby-cifo        { display: none; }
        .lobby-banner-wide { display: block; }
        @media (min-width: 1000px) {
          .lobby-cifo        { display: block; }
          .lobby-banner-wide { display: none; }
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
              {error ? t('sin conexión', 'offline') : t('en vivo', 'live')}
            </span>
          </div>

          {/* Lang switcher */}
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
            {(['es', 'en'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  padding:    '5px 10px',
                  fontSize:   11,
                  fontWeight: 700,
                  border:     'none',
                  cursor:     'pointer',
                  letterSpacing: '0.05em',
                  background: lang === l ? '#06B6D4' : 'rgba(255,255,255,0.05)',
                  color:      lang === l ? '#000' : 'rgba(255,255,255,0.45)',
                  transition: 'background 0.2s, color 0.2s',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Clock */}
          <LiveClock lang={lang} />
        </header>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          <aside className="lobby-cifo" style={{
            width: 'clamp(300px, 26vw, 520px)', flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.06)',
            background: 'radial-gradient(ellipse at 50% 85%, rgba(99,102,241,0.18), transparent 65%)',
          }}>
            {!loading && !error && <CifoPanel scene={scene} lang={lang} />}
          </aside>
          <div style={{
            flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 32px',
            display: 'flex', flexDirection: 'column', gap: 20,
          }}>

          {/* Loading state */}
          {loading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <span style={{ fontSize: 20, animation: 'spin-slow 1.2s linear infinite', display: 'inline-block' }}>⟳</span>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>{t('Cargando sala de espera…', 'Loading waiting room…')}</span>
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
                {t('No se pudo cargar la sala de espera', 'Could not load the waiting room')}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>
                {t('Reintentando en 15 segundos…', 'Retrying in 15 seconds…')}
              </div>
            </div>
          )}

          {/* Content */}
          {!loading && !error && data && (
            <>
              {/* "Ahora llamando" banner */}
              {data.nowCalling && <div className="lobby-banner-wide"><NowCallingBanner data={data.nowCalling} lang={lang} /></div>}

              {/* ── En Consulta ── */}
              {data.consultation.length > 0 && (
                <section>
                  <SectionHeader
                    emoji="🩺" es="En Consulta" en="In Consultation" lang={lang}
                    count={data.consultation.length} color="#8B5CF6"
                  />
                  <div style={{
                    display:             'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap:                 12,
                  }}>
                    {data.consultation.map((apt: ConsultationPatient) => (
                      <ConsultCard key={apt.id} apt={apt} lang={lang} spot={spotId === apt.id} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── En Triaje ── */}
              {data.triage.length > 0 && (
                <section>
                  <SectionHeader
                    emoji="📈" es="En Triaje" en="In Triage" lang={lang}
                    count={data.triage.length} color="#F59E0B"
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.triage.map((apt: LobbyPatient) => (
                      <TriageRow key={apt.id} apt={apt} lang={lang} spot={spotId === apt.id} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── Esperando ── */}
              <section>
                <SectionHeader
                  emoji="⏱" es="Esperando" en="Waiting" lang={lang}
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
                    {t('Sala de espera libre', 'Waiting room clear')}
                  </div>
                ) : (
                  <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {data.waiting.map((apt: WaitingPatient, i: number) => (
                      <WaitRow key={apt.id} apt={apt} index={i} lang={lang} spot={spotId === apt.id} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
          </div>
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
              <StatPill value={data.stats.waiting}      label={t('esperando', 'waiting')}    color="#06B6D4" />
              <Divider />
              <StatPill value={data.stats.triage}       label={t('en triaje', 'in triage')}  color="#F59E0B" />
              <Divider />
              <StatPill value={data.stats.consultation} label={t('en consulta', 'in consult')} color="#8B5CF6" />
              <Divider />
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                {t('Pacientes hoy', 'Today')}:{' '}
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
                {t('Escanea para registrarte', 'Walk-in · Scan to register')}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                {t('Walk-in', 'No appointment needed')}
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
