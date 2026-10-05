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

import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BrandMark } from '@/components/brand-mark';
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
  /** Las clínicas entre las que se puede cambiar desde el encabezado. Con una sola, no hay selector. */
  clinics?:   Array<{ id: string; name: string }>;
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

// ─── Estados del cartel ───────────────────────────────────────────────────────
/**
 * Una sola lista, ordenada por el recorrido del paciente: cada fila lleva su
 * estado con COLOR + TEXTO + ÍCONO (el color solo no alcanza: verde y ámbar se
 * confunden con algunos tipos de daltonismo).
 *
 *   por llegar (gris) → en espera (azul) → ¡prepárate! (cian)
 *                     → en triaje (ámbar) → en consulta (verde)
 *
 * "Por llegar" es el que tiene cita y todavía no hizo check-in: la API lo mezcla
 * con "en espera" en `waiting`, y acá se separa por `checkedInAt`.
 *
 * Movimiento: SOLO lo que importa y lento (≥1,6 s). El texto nunca parpadea.
 *
 * OJO — "en consulta" sale de `IN_PROGRESS`, que hoy significa "en el cuarto", no
 * "con el doctor" (la clínica lleva al paciente al cuarto en el check-in). Queda
 * pendiente decidir qué momento cuenta; ver el paso 2 del plan del lobby.
 */
type RowState = 'consult' | 'triage' | 'next' | 'arrived' | 'expected';

interface LobbyRow {
  id:         string;
  display:    string;
  doctorName: string | null;
  state:      RowState;
  /** consulta: minutos en consulta · espera: minutos desde el check-in. */
  minutes:    number;
  /** Solo "por llegar": la hora de la cita, ya en hora de la clínica. */
  apptTime:   string | null;
}

const STATE_ORDER: RowState[] = ['consult', 'triage', 'next', 'arrived', 'expected'];

const STATE_STYLE: Record<RowState, { color: string; ink: string; es: string; en: string }> = {
  consult:  { color: '#34D399', ink: '#059669', es: 'EN CONSULTA',  en: 'IN CONSULTATION' },
  triage:   { color: '#FBBF24', ink: '#B45309', es: 'EN TRIAJE',    en: 'IN TRIAGE' },
  next:     { color: '#22D3EE', ink: '#0E7490', es: '¡PREPÁRATE!',  en: 'GET READY' },
  arrived:  { color: '#6B8CFF', ink: '#3B5BDB', es: 'EN ESPERA',    en: 'WAITING' },
  expected: { color: '#94A3B8', ink: '#475569', es: 'POR LLEGAR',   en: 'EXPECTED' },
};

/** `#RRGGBB` + alfa → `rgba(...)`. Sin `color-mix`: las TV viejas no lo tienen. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function buildRows(d: LobbyData, now: number): LobbyRow[] {
  const mins = (iso: string | null): number =>
    iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : 0;
  const apptTime = (iso: string): string =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });

  const rows: LobbyRow[] = [];
  for (const c of d.consultation) {
    rows.push({ id: c.id, display: c.display, doctorName: c.doctorName, state: 'consult', minutes: c.elapsedMin, apptTime: null });
  }
  for (const p of d.triage) {
    rows.push({ id: p.id, display: p.display, doctorName: p.doctorName, state: 'triage', minutes: mins(p.checkedInAt), apptTime: null });
  }
  const arrived  = d.waiting.filter(w => !!w.checkedInAt);
  const expected = d.waiting.filter(w => !w.checkedInAt);
  arrived.forEach((w, i) => {
    rows.push({ id: w.id, display: w.display, doctorName: w.doctorName, state: i === 0 ? 'next' : 'arrived', minutes: mins(w.checkedInAt), apptTime: null });
  });
  for (const w of expected) {
    rows.push({ id: w.id, display: w.display, doctorName: w.doctorName, state: 'expected', minutes: 0, apptTime: apptTime(w.scheduledFor) });
  }
  return rows;
}

function rowDetail(r: LobbyRow, lang: Lang): string {
  switch (r.state) {
    case 'consult':  return `${r.minutes} min`;
    case 'triage':   return tx(lang, 'signos vitales', 'vitals');
    case 'expected': return tx(lang, `cita ${r.apptTime ?? ''}`, `appt ${r.apptTime ?? ''}`);
    default:         return tx(lang, `esperando ${r.minutes} min`, `waiting ${r.minutes} min`);
  }
}

function StateIcon({ state, color, size }: { state: RowState; color: string; size: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (state) {
    case 'consult':  return <svg {...common}><path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-1" /><circle cx="20" cy="12" r="2" /></svg>;
    case 'triage':   return <svg {...common}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>;
    case 'next':     return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case 'arrived':  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    default:         return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
  }
}

// ─── El recorrido de CIFO ─────────────────────────────────────────────────────
/**
 * CIFO baja por las primeras 5 líneas, una cada 5 s: se desliza a la altura de
 * la fila y la señala con un rayo punteado desde su mano (es más alto que una
 * fila, así que sin el rayo no apuntaría bien a las primeras). Al terminar hace
 * una pausa de saludo y vuelve a empezar.
 *
 * TIEMPOS (Erick, 2026-10-05: "5 s es muy corto"): 7 s por fila, 10 s para "¡prepárate!"
 * —la que le dice a alguien que se levante—, 6 s de saludo y 8 s en la fila que acaba
 * de cambiar de estado. Ciclo completo ≈ 40 s. La gente mira la TV de reojo: 4 s
 * de lectura útiles (5 s menos el movimiento) se les escapan; 10 s por fila hace
 * esperar casi un minuto a quien está en la quinta. Y el saludo largo es tiempo
 * muerto: no resalta a nadie. Cómo se ve depende de la TV y la distancia, así que
 * se ajustan SIN tocar código: `?step=7&next=10&idle=6&event=8` (segundos).
 *
 * Si "¡prepárate!" quedó fuera de las 5, entra igual: es la fila más importante.
 * Si alguien CAMBIA de estado, CIFO salta a esa fila en el acto y la fila hace un
 * destello — el cartel reacciona a lo que pasa, no solo a un reloj.
 *
 * La geometría se MIDE del DOM (no se calcula a mano): sirve en cualquier TV.
 */
const WALK_ROWS = 5;

interface WalkTimes { step: number; next: number; idle: number; event: number }
const WALK_DEFAULTS: WalkTimes = { step: 7_000, next: 10_000, idle: 6_000, event: 8_000 };

/** Los tiempos por defecto, pisados por `?step=&next=&idle=&event=` (segundos, entre 2 y 60). */
function readWalkTimes(): WalkTimes {
  const q = new URLSearchParams(window.location.search);
  const get = (k: keyof WalkTimes): number => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && v >= 2 && v <= 60 ? v * 1000 : WALK_DEFAULTS[k];
  };
  return { step: get('step'), next: get('next'), idle: get('idle'), event: get('event') };
}

function buildWalk(rows: LobbyRow[]): LobbyRow[] {
  const w  = rows.slice(0, WALK_ROWS);
  const nx = rows.find(r => r.state === 'next');
  if (nx && !w.includes(nx)) w[w.length - 1] = nx;
  return w;
}

interface Geo {
  mode:      'idle' | 'point';
  h:         number;
  top:       number;
  bubbleTop: number;
  hx:        number;
  hy:        number;
  rx:        number;
  ry:        number;
}

function LobbyBoard({ rows, lang, status, banner }: {
  rows:   LobbyRow[];
  lang:   Lang;
  status: 'loading' | 'error' | 'ok';
  banner: ReactNode;
}) {
  const t = (es: string, en: string) => tx(lang, es, en);

  const mainRef   = useRef<HTMLElement | null>(null);
  const colRef    = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const rowEls    = useRef(new Map<string, HTMLDivElement>());

  const [focusId,  setFocusId]  = useState<string | null>(null);
  const [shownId,  setShownId]  = useState<string | null>(null);
  const [fade,     setFade]     = useState(false);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [geo,      setGeo]      = useState<Geo | null>(null);
  const [size,     setSize]     = useState(0);

  const rowsRef  = useRef(rows);
  const idxRef   = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpRef  = useRef<((id: string) => void) | null>(null);
  /** La fila que acaba de cambiar de estado se queda más tiempo en foco. */
  const holdRef  = useRef<number | null>(null);
  const prevRef  = useRef<Map<string, RowState> | null>(null);

  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // El recorrido. Lee las filas de `rowsRef`, así los datos nuevos del polling no lo reinician.
  useEffect(() => {
    const times = readWalkTimes();
    const run = (): void => {
      const w = buildWalk(rowsRef.current);
      if (w.length === 0) {
        setFocusId(null); idxRef.current = 0;
        timerRef.current = setTimeout(run, times.step);
        return;
      }
      if (idxRef.current >= w.length) {
        setFocusId(null); idxRef.current = 0;
        timerRef.current = setTimeout(run, times.idle);
        return;
      }
      const row = w[idxRef.current];
      setFocusId(row.id);
      idxRef.current += 1;
      const dwell = holdRef.current ?? (row.state === 'next' ? times.next : times.step);
      holdRef.current = null;
      timerRef.current = setTimeout(run, dwell);
    };
    jumpRef.current = (id: string): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const w = buildWalk(rowsRef.current);
      const k = w.findIndex(r => r.id === id);
      idxRef.current = k < 0 ? 0 : k;
      holdRef.current = times.event;
      run();
    };
    run();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Evento real: alguien cambió de estado → CIFO salta a esa fila y la fila destella.
  useEffect(() => {
    const cur = new Map(rows.map(r => [r.id, r.state] as const));
    const prev = prevRef.current;
    if (prev) {
      const changed = rows.filter(r => { const p = prev.get(r.id); return p !== undefined && p !== r.state; });
      if (changed.length > 0) {
        setFlashIds(changed.map(r => r.id));
        jumpRef.current?.(changed[0].id);
        const id = setTimeout(() => setFlashIds([]), 3_300);
        prevRef.current = cur;
        return () => clearTimeout(id);
      }
    }
    prevRef.current = cur;
    return undefined;
  }, [rows]);

  // El texto del globito se cambia con un fundido, mientras CIFO ya se está moviendo.
  useEffect(() => {
    setFade(true);
    const id = setTimeout(() => { setShownId(focusId); setFade(false); }, 260);
    return () => clearTimeout(id);
  }, [focusId]);

  useEffect(() => {
    const onResize = (): void => setSize(n => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Geometría: se mide, no se calcula.
  useLayoutEffect(() => {
    const main = mainRef.current;
    const col  = colRef.current;
    if (!main || !col || col.clientHeight === 0) { setGeo(null); return; }
    const colH = col.clientHeight;
    const colW = col.clientWidth;
    const bubbleH = bubbleRef.current?.offsetHeight ?? 150;

    const el = focusId ? rowEls.current.get(focusId) : undefined;
    if (!focusId || !el) {
      const h = Math.round(Math.min(520, colH * 0.5));
      setGeo({ mode: 'idle', h, top: colH - h - 16, bubbleTop: 20, hx: 0, hy: 0, rx: 0, ry: 0 });
      return;
    }
    const CH   = Math.round(Math.min(380, Math.max(220, colH * 0.37)));
    const mr   = main.getBoundingClientRect();
    const rr   = el.getBoundingClientRect();
    const rowY = rr.top - mr.top + rr.height / 2;
    const handY = CH * 0.56;
    const top  = Math.max(0, Math.min(colH - CH, rowY - handY));
    const bubbleTop = top > colH / 2
      ? Math.max(8, top - bubbleH - 12)
      : Math.min(colH - bubbleH - 8, top + CH + 12);
    setGeo({
      mode: 'point', h: CH, top, bubbleTop,
      hx: colW / 2 + (CH * 200 / 356) / 2 - 6, hy: top + handY,
      rx: rr.left - mr.left - 4, ry: rowY,
    });
  }, [focusId, rows, lang, size]);

  const shown = shownId ? rows.find(r => r.id === shownId) ?? null : null;
  const con = (n: string | null): string => (n ? tx(lang, ` con ${n}`, ` with ${n}`) : '');

  let bTag: string, bBig: string, bSub: string, bColor: string;
  if (shown) {
    const st = STATE_STYLE[shown.state];
    bTag = tx(lang, st.es, st.en);
    bColor = st.ink;
    bBig = shown.display;
    const who = shown.doctorName ? `${shown.doctorName} · ` : '';
    bSub = shown.state === 'next'
      ? tx(lang, `Eres el siguiente${con(shown.doctorName)}.`, `You are next${con(shown.doctorName)}.`)
      : `${who}${rowDetail(shown, lang)}`;
  } else {
    bTag = t('Bienvenido', 'Welcome');
    bColor = '#6366F1';
    bBig = t('¡Hola!', 'Hello!');
    bSub = rows.length === 0
      ? t('Hoy no hay pacientes esperando.', 'Nobody is waiting right now.')
      : t('Avísanos en recepción si necesitas algo.', 'Let reception know if you need anything.');
  }

  const dim = focusId !== null;
  const pointing = geo?.mode === 'point';
  const beamLen = geo && pointing ? Math.hypot(geo.rx - geo.hx, geo.ry - geo.hy) : 0;
  const beamAng = geo && pointing ? Math.atan2(geo.ry - geo.hy, geo.rx - geo.hx) : 0;

  return (
    <main ref={mainRef} style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      <aside ref={colRef} className="lobby-cifo" style={{
        width: 'clamp(300px, 26vw, 520px)', flexShrink: 0, position: 'relative',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: 'radial-gradient(ellipse at 50% 85%, rgba(99,102,241,0.18), transparent 65%)',
      }}>
        {status === 'ok' && geo && (
          <>
            <div ref={bubbleRef} style={{
              position: 'absolute', left: 20, right: 20, top: geo.bubbleTop, zIndex: 6,
              background: '#fff', color: '#0a1224', borderRadius: 26,
              padding: 'clamp(12px, 1.1vw, 22px) clamp(16px, 1.5vw, 28px)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              opacity: fade ? 0 : 1,
              transition: 'top 0.8s cubic-bezier(.45,.05,.25,1), opacity 0.26s',
            }}>
              <div style={{ fontSize: 'clamp(10px, 0.95vw, 18px)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: bColor, marginBottom: 4 }}>{bTag}</div>
              <div style={{ fontSize: 'clamp(24px, 2.4vw, 46px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{bBig}</div>
              <div style={{ fontSize: 'clamp(12px, 1.25vw, 24px)', color: '#3b4366', marginTop: 6, lineHeight: 1.2 }}>{bSub}</div>
            </div>
            {/* El GIF que señala (cifo-1) apunta a la izquierda: se espeja para apuntar a la lista.
                El espejo voltea el logo del pecho; la versión final pide un GIF señalando a la derecha. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pointing ? '/cifo-1.gif' : '/cifo-saluda.gif'}
              alt="CIFO"
              style={{
                position: 'absolute', left: '50%', top: geo.top, height: geo.h, width: 'auto', zIndex: 4,
                transform: `translateX(-50%)${pointing ? ' scaleX(-1)' : ''}`,
                filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.5))',
                transition: 'top 0.8s cubic-bezier(.45,.05,.25,1)',
              }}
            />
          </>
        )}
      </aside>

      {/* El rayo de la mano de CIFO a la fila */}
      {status === 'ok' && geo && (
        <div aria-hidden style={{
          position: 'absolute', left: geo.hx, top: geo.hy, width: beamLen, height: 0, zIndex: 5,
          borderTop: '4px dotted #fff', transformOrigin: '0 50%', transform: `rotate(${beamAng}rad)`,
          filter: 'drop-shadow(0 0 6px #fff)', pointerEvents: 'none',
          opacity: pointing ? 1 : 0,
          transition: 'width 0.8s cubic-bezier(.45,.05,.25,1), transform 0.8s cubic-bezier(.45,.05,.25,1), left 0.8s, top 0.8s, opacity 0.3s',
        }}>
          <span style={{ position: 'absolute', right: -9, top: -11, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 0 12px #fff' }} />
        </div>
      )}

      <div style={{
        flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 32px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {status === 'loading' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, animation: 'spin-slow 1.2s linear infinite', display: 'inline-block' }}>⟳</span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>{t('Cargando sala de espera…', 'Loading waiting room…')}</span>
          </div>
        )}

        {status === 'error' && (
          <div style={{
            margin: 'auto', textAlign: 'center', padding: '40px 20px', borderRadius: 16,
            background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.20)',
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

        {status === 'ok' && (
          <>
            {banner}

            {rows.length === 0 ? (
              <div style={{
                padding: '24px 20px', borderRadius: 12, background: 'rgba(6,182,212,0.04)',
                border: '1px dashed rgba(6,182,212,0.15)', textAlign: 'center',
                color: 'rgba(255,255,255,0.30)', fontSize: 14,
              }}>
                {t('Sala de espera libre', 'Waiting room clear')}
              </div>
            ) : (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(12px, 1.35vw, 26px)',
                  fontSize: 'clamp(10px, 1vw, 20px)', fontWeight: 800, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: 'rgba(255,255,255,0.40)',
                }}>
                  <span style={{ width: 'clamp(110px, 13vw, 250px)' }}>{t('Paciente', 'Patient')}</span>
                  <span style={{ flex: 1 }}>Provider</span>
                  <span style={{ width: 'clamp(200px, 26vw, 500px)' }}>{t('Estado', 'Status')}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {rows.map(r => {
                    const st = STATE_STYLE[r.state];
                    const focus = r.id === focusId;
                    const flash = flashIds.includes(r.id);
                    return (
                      <div
                        key={r.id}
                        ref={el => { if (el) rowEls.current.set(r.id, el); else rowEls.current.delete(r.id); }}
                        className={`lb-row lb-${r.state}${flash ? ' lb-flash' : ''}`}
                        style={{
                          ['--lb-c' as string]: st.color,
                          ['--lb-flash' as string]: hexA(st.color, 0.5),
                          position: 'relative', overflow: 'hidden',
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: 'clamp(8px, 0.85vw, 16px) clamp(12px, 1.35vw, 26px)',
                          borderRadius: 16,
                          background: focus ? hexA(st.color, 0.12) : '#101935',
                          border: `2px solid ${focus ? st.color : 'transparent'}`,
                          boxShadow: focus ? `0 0 44px ${hexA(st.color, 0.35)}` : 'none',
                          opacity: dim && !focus ? 0.55 : 1,
                          transform: focus ? 'scale(1.012)' : 'none',
                          transition: 'opacity 0.5s, background 0.5s, border-color 0.5s, box-shadow 0.5s, transform 0.5s',
                        }}
                      >
                        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: st.color }} />
                        <div style={{ width: 'clamp(110px, 13vw, 250px)', fontSize: 'clamp(18px, 2.2vw, 42px)', fontWeight: 900, letterSpacing: '-0.01em' }}>{r.display}</div>
                        <div style={{ flex: 1, fontSize: 'clamp(12px, 1.25vw, 24px)', color: 'rgba(255,255,255,0.45)' }}>{r.doctorName ?? ''}</div>
                        <div style={{ width: 'clamp(200px, 26vw, 500px)', display: 'flex', alignItems: 'center', gap: 14 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 10,
                            padding: 'clamp(3px, 0.4vw, 8px) clamp(8px, 1vw, 20px)', borderRadius: 99,
                            fontWeight: 800, letterSpacing: '0.07em', fontSize: 'clamp(10px, 1.2vw, 23px)',
                            color: st.color, background: hexA(st.color, 0.15), border: `1.5px solid ${hexA(st.color, 0.45)}`,
                          }}>
                            <span className="lb-ic" style={{ display: 'inline-flex' }}><StateIcon state={r.state} color={st.color} size="1.3em" /></span>
                            {tx(lang, st.es, st.en)}
                          </span>
                          <span style={{ fontSize: 'clamp(11px, 1.25vw, 24px)', color: r.state === 'consult' ? '#fff' : 'rgba(255,255,255,0.45)', fontWeight: r.state === 'consult' ? 700 : 400, whiteSpace: 'nowrap' }}>
                            {rowDetail(r, lang)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// ─── Main display ─────────────────────────────────────────────────────────────
/**
 * El nombre de la clínica del encabezado, convertido en selector.
 *
 * Cambia a la pantalla de otra clínica conservando los parámetros de la dirección
 * (`?step=7&next=10…`, los tiempos de CIFO), para que quien ajusta la TV no los
 * pierda al cambiar. Con una sola clínica no hay nada que elegir y se pinta el
 * nombre a secas.
 *
 * No es PHI: son el id y el nombre de las clínicas, los mismos que ya lista
 * `/lobby`. La pantalla de cada clínica sigue mostrando solo iniciales.
 */
function ClinicSwitcher({ clinicId, clinicName, clinics, lang }: {
  clinicId: string; clinicName: string; clinics: Array<{ id: string; name: string }>; lang: Lang;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const nameStyle = { fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' } as const;
  if (clinics.length < 2) return <div style={nameStyle}>{clinicName}</div>;

  const ir = (id: string) => {
    setOpen(false);
    if (id !== clinicId) router.push(`/lobby/${id}${window.location.search}`);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={tx(lang, 'Elegir clínica', 'Choose clinic')}
        style={{
          ...nameStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          background: 'transparent', border: '1px solid transparent', borderRadius: 10,
          padding: '2px 8px 2px 0', fontFamily: 'inherit',
        }}
      >
        {clinicName}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 50, minWidth: 240, maxHeight: '60vh', overflowY: 'auto',
          background: '#0f1620', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14,
          padding: 6, boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}>
          {clinics.map(c => {
            const actual = c.id === clinicId;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={actual}
                onClick={() => ir(c.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: actual ? 800 : 600,
                  color: actual ? '#22D3EE' : 'rgba(255,255,255,0.8)',
                  background: actual ? 'rgba(34,211,238,0.10)' : 'transparent',
                  border: 'none', borderRadius: 9, padding: '10px 12px',
                }}
              >
                {c.name}
                {actual && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LobbyDisplay({ clinicId, clinicName, clinics = [] }: Props) {
  const [data,    setData]    = useState<LobbyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  /* Arranca en inglés: es el idioma de casi todos los pacientes —22 de 5.726
     tienen español registrado— y el que ve quien no toca el selector. */
  const [lang,    setLang]    = useState<Lang>('en');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Reloj de los "esperando N min": se recalcula cada 30 s, sin esperar al polling. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const nowMin = Math.floor(nowMs / 60_000);
  const rows = useMemo(() => (data ? buildRows(data, nowMin * 60_000) : []), [data, nowMin]);
  const counts = useMemo(() => ({
    waiting:  rows.filter(r => r.state === 'arrived' || r.state === 'next').length,
    triage:   rows.filter(r => r.state === 'triage').length,
    consult:  rows.filter(r => r.state === 'consult').length,
    expected: rows.filter(r => r.state === 'expected').length,
  }), [rows]);

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
        /* Movimiento del tablero: solo lo que importa y lento; el texto nunca parpadea. */
        @keyframes lb-blink   { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes lb-breathe { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.25); opacity: 0.6; } }
        @keyframes lb-glow    { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,0); } 50% { box-shadow: 0 0 40px rgba(34,211,238,0.32); } }
        @keyframes lb-flash   { 0% { background: var(--lb-flash); } 100% { background-color: transparent; } }
        .lb-consult .lb-ic { animation: lb-blink 1.8s ease-in-out infinite; }
        .lb-triage  .lb-ic { animation: lb-breathe 2.4s ease-in-out infinite; }
        .lb-next { animation: lb-glow 2s ease-in-out infinite; }
        .lb-flash { animation: lb-flash 3.2s ease-out; }
        /* CIFO solo cabe en pantallas anchas (la TV); en chicas queda el banner de siempre. */
        .lobby-cifo        { display: none; }
        .lobby-banner-wide { display: block; }
        @media (min-width: 1000px) {
          .lobby-cifo        { display: block; }
          .lobby-banner-wide { display: none; }
        }
      `}</style>

      <div style={{
        /* Alto FIJO, no mínimo: en una TV la página no scrollea; si sobran filas las absorbe la lista. */
        height:      '100vh',
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
            {/* El logo de la marca (cruz con electro), el mismo del back-office y los portales. */}
            <BrandMark size={48} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>
                Precision Medical
              </div>
              <ClinicSwitcher clinicId={clinicId} clinicName={clinicName} clinics={clinics} lang={lang} />
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
        <LobbyBoard
          rows={rows}
          lang={lang}
          status={loading ? 'loading' : error ? 'error' : 'ok'}
          banner={data?.nowCalling
            ? <div className="lobby-banner-wide"><NowCallingBanner data={data.nowCalling} lang={lang} /></div>
            : null}
        />

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
              <StatPill value={counts.waiting}  label={t('esperando', 'waiting')}    color="#6B8CFF" />
              <Divider />
              <StatPill value={counts.triage}   label={t('en triaje', 'in triage')}  color="#FBBF24" />
              <Divider />
              <StatPill value={counts.consult}  label={t('en consulta', 'in consult')} color="#34D399" />
              <Divider />
              <StatPill value={counts.expected} label={t('por llegar', 'expected')}   color="#94A3B8" />
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
