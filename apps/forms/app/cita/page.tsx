'use client';

import { useState, useRef } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { TEL_CLINICA } from '@/lib/clinica';

interface ApptResult {
  ok: boolean;
  firstName: string;
  doctorName: string | null;
  clinicName: string;
  clinicAddr: string | null;
  scheduledFor: string;
  status: string;
  apptType: string;
  caseCode: string | null;
  isToday: boolean;
  daysUntil: number;
}

const T = {
  es: {
    title: 'Consulta tu cita',
    sub: 'Ingresa el código de tu caso y tu fecha de nacimiento para ver tu próxima cita',
    codeLabel: 'Código de caso',
    dobLabel: 'Fecha de nacimiento',
    phCase: 'Ej: GM-1234 o MVA-1234',
    search: 'Buscar',
    hint: 'Encuéntralo en tu mensaje de confirmación.',
    notFound: 'No encontramos una cita con esos datos. Revisa el código y la fecha de nacimiento, o llámanos.',
    tooMany: 'Demasiados intentos. Espera un rato o llámanos.',
    needBoth: 'Escribe el código y tu fecha de nacimiento.',
    today: 'Hoy',
    apptToday: 'Tu cita es hoy',
    inDays: (n: number) => `En ${n} día${n !== 1 ? 's' : ''}`,
    doctor: 'Especialista',
    address: 'Dirección',
    visitType: 'Tipo de visita',
    duration: 'Duración est.',
    alertToday: <><strong>Llega 30 min antes</strong> para tu registro. Trae ID válido y tarjeta de seguro.</>,
    alertFuture: <><strong>Llega 30 min antes</strong> de tu cita. Trae tu ID y tarjeta de seguro médico.</>,
    daysLabel: (n: number) => n === 1 ? 'día para tu cita' : 'días para tu cita',
    hipaa: 'Tu información está protegida. Solo mostramos datos básicos de tu cita, nunca información médica.',
    newSearch: '↩',
    status: { PENDING:'Pendiente', SCHEDULED:'Confirmada', CONFIRMED:'Confirmada', CHECKED_IN:'Check-in', IN_PROGRESS:'En consulta', COMPLETED:'Completada' } as Record<string,string>,
    cifo: {
      idle:  ['Hola', '¡Hola! Soy CIFO. Para mostrarte tu cita necesito tu código y tu fecha de nacimiento.', 'Así protegemos tus datos.'],
      code:  ['Paso 1 de 2', 'Tu código viene en el mensaje de confirmación que te enviamos.', 'Se ve así: GM-1234 o MVA-1234.'],
      dob:   ['Paso 2 de 2', 'Ahora tu fecha de nacimiento.', 'La usamos solo para comprobar que eres tú.'],
      ready: ['¡Listo!', 'Toca “Buscar” y te muestro tu cita.', ''],
      load:  ['Un momento', 'Buscando tu cita…', ''],
      need:  ['Falta algo', 'Escribe tu código y tu fecha de nacimiento.', ''],
      err:   ['No la encontré', 'No encontré una cita con esos datos. Revisa el código y la fecha de nacimiento, o llámanos al ', ''],
      lock:  ['Demasiados intentos', 'Por seguridad pausé la búsqueda un rato. Llámanos y te ayudamos al ', ''],
      ok:    (name: string, when: string): [string, string, string] => ['Aquí está', `${name}, tu cita es el ${when}.`, 'Llega 30 minutos antes y trae tu ID y tu seguro.'],
      today: (name: string, when: string): [string, string, string] => ['¡Es hoy!', `${name}, tu cita es hoy a las ${when}.`, 'Llega 30 minutos antes. ¡Te esperamos!'],
    },
  },
  en: {
    title: 'Check your appointment',
    sub: 'Enter your case code and your date of birth to see your upcoming appointment',
    codeLabel: 'Case code',
    dobLabel: 'Date of birth',
    phCase: 'E.g. GM-1234 or MVA-1234',
    search: 'Search',
    hint: "You'll find it in your confirmation message.",
    notFound: "We couldn't find an appointment with that information. Check the code and your date of birth, or call us.",
    tooMany: 'Too many attempts. Please wait a while or call us.',
    needBoth: 'Enter the code and your date of birth.',
    today: 'Today',
    apptToday: 'Your appointment is today',
    inDays: (n: number) => `In ${n} day${n !== 1 ? 's' : ''}`,
    doctor: 'Specialist',
    address: 'Address',
    visitType: 'Visit type',
    duration: 'Est. duration',
    alertToday: <><strong>Arrive 30 min early</strong> to check in. Bring a valid ID and your insurance card.</>,
    alertFuture: <><strong>Arrive 30 min early</strong>. Bring your valid ID and health insurance card.</>,
    daysLabel: (n: number) => n === 1 ? 'day until your appointment' : 'days until your appointment',
    hipaa: 'Your information is protected. We only show basic appointment details, never medical information.',
    newSearch: 'New search',
    status: { PENDING:'Pending', SCHEDULED:'Confirmed', CONFIRMED:'Confirmed', CHECKED_IN:'Checked in', IN_PROGRESS:'In consultation', COMPLETED:'Completed' } as Record<string,string>,
    cifo: {
      idle:  ['Hello', "Hi! I'm CIFO. To show your appointment I need your code and your date of birth.", 'It keeps your data safe.'],
      code:  ['Step 1 of 2', 'Your code is in the confirmation message we sent you.', 'It looks like GM-1234 or MVA-1234.'],
      dob:   ['Step 2 of 2', 'Now your date of birth.', 'We only use it to check it is you.'],
      ready: ['All set!', 'Tap “Search” and I will show your appointment.', ''],
      load:  ['One moment', 'Looking for your appointment…', ''],
      need:  ['Something is missing', 'Please enter your code and your date of birth.', ''],
      err:   ['Not found', "I couldn't find an appointment with that information. Check the code and your date of birth, or call us at ", ''],
      lock:  ['Too many attempts', 'For your safety I paused the search for a while. Call us and we will help at ', ''],
      ok:    (name: string, when: string): [string, string, string] => ['Here it is', `${name}, your appointment is on ${when}.`, 'Arrive 30 minutes early and bring your ID and insurance.'],
      today: (name: string, when: string): [string, string, string] => ['It is today!', `${name}, your appointment is today at ${when}.`, 'Arrive 30 minutes early. See you soon!'],
    },
  },
};

/** Qué dice CIFO y cuál de sus poses usa. `tel`: el texto termina con el teléfono de la clínica. */
type CifoKind = 'idle' | 'code' | 'dob' | 'ready' | 'load' | 'need' | 'err' | 'lock' | 'ok' | 'today';
const CIFO_POSE: Record<CifoKind, { gif: string; mirror: boolean; ink: string; tel?: boolean }> = {
  idle:  { gif: '/cifo-saluda.gif', mirror: false, ink: '#6366F1' },
  code:  { gif: '/cifo-1.gif',      mirror: true,  ink: '#0E7490' },
  dob:   { gif: '/cifo-1.gif',      mirror: true,  ink: '#0E7490' },
  ready: { gif: '/cifo-1.gif',      mirror: true,  ink: '#059669' },
  load:  { gif: '/cifo-2.gif',      mirror: false, ink: '#6366F1' },
  need:  { gif: '/cifo-saluda.gif', mirror: false, ink: '#B45309' },
  err:   { gif: '/cifo-2.gif',      mirror: false, ink: '#B45309', tel: true },
  lock:  { gif: '/cifo-2.gif',      mirror: false, ink: '#B45309', tel: true },
  ok:    { gif: '/cifo-1.gif',      mirror: true,  ink: '#0E7490' },
  today: { gif: '/cifo-1.gif',      mirror: true,  ink: '#059669' },
};

export default function CitaPage() {
  const [lang, setLang]     = useState<'es'|'en'>('en');
  const [query, setQuery]   = useState('');
  const [dob, setDob]       = useState('');
  const [result, setResult] = useState<ApptResult | null>(null);
  const [error, setError]   = useState<null | 'notFound' | 'tooMany' | 'needBoth'>(null);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState<'code' | 'dob' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = T[lang];

  async function search() {
    const code = query.trim().toUpperCase();
    if (!code || !dob) { setError('needBoth'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      // POST con cuerpo: la fecha de nacimiento no debe viajar en la URL (logs,
      // historial del navegador, Referer).
      const res = await fetch('/api/cita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ code, dob }),
      });
      if (res.status === 429) { setError('tooMany'); return; }
      if (!res.ok) { setError('notFound'); return; }
      const data = await res.json();
      if (!data.ok) { setError('notFound'); return; }
      setResult(data);
    } catch { setError('notFound'); }
    finally { setLoading(false); }
  }

  function reset() { setResult(null); setQuery(''); setDob(''); setError(null); setTimeout(() => inputRef.current?.focus(), 100); }

  const locale = lang === 'es' ? 'es-US' : 'en-US';
  const scheduled = result ? new Date(result.scheduledFor) : null;
  const dateStr = scheduled?.toLocaleDateString(locale, { weekday:'long', day:'numeric', month:'long', timeZone:'America/Denver' });
  const timeStr = scheduled?.toLocaleTimeString(locale, { hour:'numeric', minute:'2-digit', hour12:true, timeZone:'America/Denver' });

  const statusColor = result?.isToday ? '#10B981' : '#06B6D4';
  const statusBg    = result?.isToday ? 'rgba(16,185,129,.15)' : 'rgba(6,182,212,.1)';
  const statusBorder= result?.isToday ? 'rgba(16,185,129,.3)' : 'rgba(6,182,212,.25)';

  /**
   * CIFO acompaña al paciente paso a paso (los pacientes entran desde el teléfono
   * y no saben qué es "el código de caso"): explica cada campo, avisa cuando todo
   * está listo, y al final señala la cita o pide disculpas con el teléfono.
   *
   * Lo que dice sale del estado real de la página, no de un guion aparte. El
   * nombre de pila aparece SOLO después de verificar (result): antes de eso la
   * pantalla no sabe quién es.
   */
  const kind: CifoKind =
    loading                      ? 'load'
    : result                     ? (result.isToday ? 'today' : 'ok')
    : error === 'tooMany'        ? 'lock'
    : error === 'notFound'       ? 'err'
    : error === 'needBoth'       ? 'need'
    : query.trim() && dob        ? 'ready'
    : focus === 'dob'            ? 'dob'
    : focus === 'code'           ? 'code'
    : 'idle';
  const whenStr = lang === 'es' ? `${dateStr ?? ''} a las ${timeStr ?? ''}` : `${dateStr ?? ''} at ${timeStr ?? ''}`;
  const say: [string, string, string] =
    kind === 'ok'    ? t.cifo.ok(result?.firstName ?? '', whenStr)
    : kind === 'today' ? t.cifo.today(result?.firstName ?? '', timeStr ?? '')
    : (t.cifo[kind] as [string, string, string]);
  const pose = CIFO_POSE[kind];
  /** Al volver a escribir se limpia el error (salvo el bloqueo, que no depende de lo que escriba). */
  const clearError = () => { if (error && error !== 'tooMany') setError(null); };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        body { background: #07101f; font-family: system-ui, -apple-system, sans-serif; }

        .shell {
          min-height: 100vh; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 24px 20px; background: #07101f; position: relative;
        }

        /* ── Lang toggle ── */
        .lang-row { position: absolute; top: 20px; right: 20px; display: flex; gap: 6px; }
        .lbtn { background: none; border: 1px solid rgba(255,255,255,.14); border-radius: 7px;
          padding: 4px 12px; font-size: 12px; font-weight: 700; cursor: pointer;
          color: rgba(255,255,255,.35); transition: all .18s; }
        .lbtn:hover { border-color: rgba(255,255,255,.35); color: rgba(255,255,255,.7); }
        .lbtn.on { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.3); color: #fff; }

        /* ── Logo ── */
        .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px;
          transition: all .35s; }
        .logo.shrink { margin-bottom: 0; transform: scale(.85); opacity: .7; }
        .mark { width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0;
          background: linear-gradient(135deg, #06B6D4, #6366F1);
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 14px; color: #fff; letter-spacing: -.4px; }
        .logo-text { color: #fff; font-size: 14px; font-weight: 600; }
        .logo-sub  { color: rgba(255,255,255,.38); font-size: 10px; margin-top: 1px; }

        /* ── Search card ── */
        .search-wrap { width: 100%; max-width: 440px; transition: all .35s; }
        .search-wrap.collapsed { max-width: 100%; }

        .search-card {
          background: #0d1b2e; border: 1px solid rgba(255,255,255,.07);
          border-radius: 18px; overflow: hidden;
          transition: all .35s;
        }
        .search-card.full .s-head { display: block; }
        .search-card.slim .s-head { display: none; }
        .search-card.slim { border-radius: 12px; }

        .s-head { padding: 24px 24px 18px; border-bottom: 1px solid rgba(255,255,255,.05); }
        .s-title { color: #fff; font-size: 19px; font-weight: 700; letter-spacing: -.02em; }
        .s-sub   { color: rgba(255,255,255,.38); font-size: 13px; margin-top: 5px; line-height: 1.4; }

        .s-body { padding: 18px 20px; }
        .search-card.full .s-body { padding: 20px 24px 22px; }

        .tabs { display: flex; gap: 7px; margin-bottom: 14px; }
        .tab  { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
          border-radius: 7px; padding: 5px 12px; color: rgba(255,255,255,.38);
          font-size: 12px; font-weight: 600; cursor: pointer; transition: all .18s; }
        .tab.on { background: rgba(6,182,212,.1); border-color: rgba(6,182,212,.3); color: #06B6D4; }
        .search-card.slim .tabs { display: none; }

        .row { display: flex; gap: 8px; }
        .fields { display: flex; flex-direction: column; gap: 6px; }
        .flbl { color: rgba(255,255,255,.45); font-size: 11px; font-weight: 700; letter-spacing: .06em;
          text-transform: uppercase; margin-top: 6px; }
        .inp-date { flex: none; width: 100%; color-scheme: dark; text-transform: none; letter-spacing: 0; }
        .go-full { width: 100%; margin-top: 12px; height: 46px; }
        .inp { flex: 1; height: 44px; background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.11); border-radius: 9px;
          padding: 0 14px; color: #fff; font-size: 14px; font-weight: 600;
          letter-spacing: .05em; text-transform: uppercase; outline: none;
          transition: border-color .18s; }
        .inp::placeholder { color: rgba(255,255,255,.22); font-weight: 400;
          letter-spacing: 0; text-transform: none; font-size: 13px; }
        .inp:focus { border-color: #06B6D4; }
        .go { height: 44px; padding: 0 18px; background: #06B6D4; border: none;
          border-radius: 9px; color: #fff; font-size: 13px; font-weight: 700;
          cursor: pointer; white-space: nowrap; transition: background .18s; flex-shrink: 0; }
        .go:hover { background: #0891B2; }
        .go:disabled { opacity: .45; cursor: not-allowed; }
        .hint { color: rgba(255,255,255,.25); font-size: 11px; margin-top: 9px; }
        .search-card.slim .hint { display: none; }
        .err  { color: #F87171; font-size: 12px; margin-top: 8px; }

        /* ── Result layout ── */
        .result-area {
          width: 100%; max-width: 840px;
          display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
          margin-top: 14px;
          animation: fadeUp .35s ease;
        }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }

        .r-left, .r-right {
          background: #0d1b2e; border: 1px solid rgba(255,255,255,.07);
          border-radius: 16px; overflow: hidden;
        }

        /* left panel */
        .r-hero {
          background: linear-gradient(150deg, rgba(6,182,212,.1), rgba(99,102,241,.08));
          padding: 22px 22px 18px; border-bottom: 1px solid rgba(255,255,255,.05);
        }
        .sbadge { display: inline-flex; align-items: center; gap: 5px;
          border-radius: 20px; padding: 3px 10px; margin-bottom: 12px; }
        .sdot { width: 6px; height: 6px; border-radius: 50%; }
        .slabel { font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
        .patient-name { color: #fff; font-size: 26px; font-weight: 900; letter-spacing: -.03em; }
        .case-line { color: rgba(255,255,255,.35); font-size: 12px; margin-top: 3px; }

        .date-block { padding: 20px 22px; text-align: center; }
        .when-lbl { color: rgba(255,255,255,.35); font-size: 10px; font-weight: 600;
          text-transform: uppercase; letter-spacing: .1em; margin-bottom: 8px; }
        .day-big { color: #fff; font-size: 22px; font-weight: 900; letter-spacing: -.02em;
          text-transform: capitalize; line-height: 1.15; }
        .time-big { color: #06B6D4; font-size: 32px; font-weight: 900; letter-spacing: -.02em;
          margin-top: 6px; }
        .clinic-lbl { color: rgba(255,255,255,.45); font-size: 13px; margin-top: 4px; font-weight: 500; }

        /* right panel */
        .r-right { display: flex; flex-direction: column; }
        .det-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 18px 18px 14px; flex: 1; }
        .dbox { background: rgba(255,255,255,.04); border-radius: 9px; padding: 12px; }
        .dlbl { color: rgba(255,255,255,.32); font-size: 9px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .09em; margin-bottom: 5px; }
        .dval { color: #fff; font-size: 13px; font-weight: 600; line-height: 1.3; }

        .alert { background: rgba(245,158,11,.07); border-top: 1px solid rgba(245,158,11,.18);
          padding: 13px 18px; display: flex; gap: 8px; align-items: flex-start; }
        .alert-txt { color: rgba(255,255,255,.65); font-size: 11px; line-height: 1.55; }
        .alert-txt strong { color: #F59E0B; }

        .days-strip {
          background: rgba(99,102,241,.08); border-top: 1px solid rgba(99,102,241,.15);
          padding: 12px 18px; display: flex; align-items: center; gap: 10px;
        }
        .days-num  { color: #818CF8; font-size: 28px; font-weight: 900; }
        .days-lbl  { color: rgba(255,255,255,.4); font-size: 11px; line-height: 1.35; }

        /* new search btn */
        .new-btn { background: none; border: none; padding: 0; margin-top: 8px;
          color: rgba(255,255,255,.35); font-size: 11px; cursor: pointer;
          transition: color .18s; text-decoration: underline; text-underline-offset: 3px; }
        .new-btn:hover { color: rgba(255,255,255,.65); }

        /* footer */
        .hipaa { color: rgba(255,255,255,.15); font-size: 10px; text-align: center;
          margin-top: 18px; max-width: 500px; }

        /* ── CIFO: en el teléfono va chico a la izquierda de su globito; en escritorio, en columna al lado de la tarjeta ── */
        .stage { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 12px; align-items: stretch; }
        .stage-main { width: 100%; display: flex; flex-direction: column; align-items: center; min-width: 0; }
        .cifo { display: flex; align-items: flex-end; gap: 10px; }
        .cifo-img { order: -1; height: 150px; width: auto; flex-shrink: 0;
          filter: drop-shadow(0 10px 16px rgba(0,0,0,.5)); animation: cifoIn .3s ease-out; }
        .cifo-bubble { position: relative; flex: 1; min-width: 0; background: #fff; color: #0b1124;
          border-radius: 18px; padding: 12px 15px; box-shadow: 0 12px 30px rgba(0,0,0,.45);
          margin-bottom: 46px; animation: bubblePop .35s ease-out; }
        .cifo-bubble::before { content: ""; position: absolute; left: -9px; bottom: 22px;
          border: 9px solid transparent; border-right: 11px solid #fff; border-left: 0; }
        .cifo-tag { font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 3px; }
        .cifo-txt { font-size: 14px; line-height: 1.35; font-weight: 600; }
        .cifo-sub { display: block; font-weight: 500; font-size: 12px; color: #4a5578; margin-top: 4px; }
        .cifo-txt a { color: #0e7490; font-weight: 800; text-decoration: none; }
        @keyframes bubblePop { from { opacity: 0; transform: translateY(6px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes cifoIn { from { opacity: 0; } to { opacity: 1; } }
        @media (min-width: 960px) {
          .stage { max-width: 860px; flex-direction: row; align-items: flex-start; gap: 36px; }
          .stage.wide { max-width: 1180px; }
          .cifo { flex-direction: column; align-items: center; width: 320px; flex-shrink: 0; }
          .cifo-img { order: 2; height: 340px; }
          .cifo-bubble { order: 1; width: 100%; flex: none; margin: 0 0 16px; }
          .cifo-bubble::before { left: 60px; bottom: -12px; border: 10px solid transparent; border-top: 13px solid #fff; border-bottom: 0; }
          .cifo-txt { font-size: 17px; }
          .cifo-sub { font-size: 13px; }
          .stage-main { flex: 1; }
        }
        @media (prefers-reduced-motion: reduce) { .cifo-img, .cifo-bubble { animation: none; } }

        /* mobile */
        @media (max-width: 600px) {
          .result-area { grid-template-columns: 1fr; max-width: 440px; }
          .time-big { font-size: 26px; }
        }
      `}</style>

      <div className="shell">
        {/* Lang */}
        <div className="lang-row">
          <button className={`lbtn ${lang==='es'?'on':''}`} onClick={()=>setLang('es')}>ES</button>
          <button className={`lbtn ${lang==='en'?'on':''}`} onClick={()=>setLang('en')}>EN</button>
        </div>

        {/* Logo */}
        <div className={`logo ${result ? 'shrink' : ''}`}>
          <BrandMark size={40} />
          <div>
            <div className="logo-text">Precision Medical</div>
            <div className="logo-sub">Patient Portal</div>
          </div>
        </div>

        <div className={`stage ${result ? 'wide' : ''}`}>
        {/* CIFO — acompaña al paciente; lo que dice sale del estado de la página */}
        <div className="cifo">
          <div className="cifo-bubble" key={kind} role="status" aria-live="polite">
            <div className="cifo-tag" style={{ color: pose.ink }}>{say[0]}</div>
            <div className="cifo-txt">
              {say[1]}
              {pose.tel && <a href={`tel:${TEL_CLINICA.replace(/\D/g, '')}`}>{TEL_CLINICA}</a>}
              {pose.tel && '.'}
              {say[2] && <span className="cifo-sub">{say[2]}</span>}
            </div>
          </div>
          {/* El GIF que señala (cifo-1) apunta a la izquierda: se espeja para apuntar a la tarjeta.
              El espejo voltea el logo del pecho; la versión final pide un GIF señalando a la derecha. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={pose.gif + String(pose.mirror)}
            className="cifo-img"
            src={pose.gif}
            alt="CIFO"
            style={pose.mirror ? { transform: 'scaleX(-1)' } : undefined}
          />
        </div>

        <div className="stage-main">
        {/* Search */}
        <div className={`search-wrap ${result ? 'collapsed' : ''}`} style={{ maxWidth: result ? 840 : 440 }}>
          <div className={`search-card ${result ? 'slim' : 'full'}`}>
            <div className="s-head">
              <div className="s-title">{t.title}</div>
              <div className="s-sub">{t.sub}</div>
            </div>
            <div className="s-body">
              {!result && (
                <form className="fields" onSubmit={e => { e.preventDefault(); void search(); }} autoComplete="off">
                  <label className="flbl" htmlFor="cita-code">{t.codeLabel}</label>
                  <input
                    id="cita-code"
                    ref={inputRef}
                    className="inp"
                    placeholder={t.phCase}
                    value={query}
                    maxLength={40}
                    onChange={e => { setQuery(e.target.value.toUpperCase()); clearError(); }}
                    onFocus={() => setFocus('code')}
                    onBlur={() => setFocus(f => (f === 'code' ? null : f))}
                  />
                  <label className="flbl" htmlFor="cita-dob">{t.dobLabel}</label>
                  <input
                    id="cita-dob"
                    className="inp inp-date"
                    type="date"
                    min="1900-01-01"
                    max={new Date().toISOString().slice(0, 10)}
                    value={dob}
                    onChange={e => { setDob(e.target.value); clearError(); }}
                    onFocus={() => setFocus('dob')}
                    onBlur={() => setFocus(f => (f === 'dob' ? null : f))}
                  />
                  <button className="go go-full" type="submit" disabled={loading}>
                    {loading ? '…' : t.search}
                  </button>
                </form>
              )}
              {result
                ? <button className="new-btn" onClick={reset}>{t.newSearch}</button>
                : <div className="hint">{t.hint}</div>
              }
              {error && <div className="err" role="alert">{t[error]} <a href={`tel:${TEL_CLINICA.replace(/\D/g, '')}`} style={{ color: 'inherit', fontWeight: 700 }}>{TEL_CLINICA}</a></div>}
            </div>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="result-area">
            {/* Left */}
            <div className="r-left">
              <div className="r-hero">
                <div className="sbadge" style={{ background: statusBg, border: `1px solid ${statusBorder}` }}>
                  <div className="sdot" style={{ background: statusColor }} />
                  <div className="slabel" style={{ color: statusColor }}>
                    {result.isToday ? t.today : (t.status[result.status] ?? t.status.CONFIRMED)}
                  </div>
                </div>
                <div className="patient-name">{result.firstName}</div>
                <div className="case-line">{result.caseCode ?? '—'} · {result.apptType}</div>
              </div>
              <div className="date-block">
                <div className="when-lbl">{result.isToday ? t.apptToday : t.inDays(result.daysUntil)}</div>
                <div className="day-big">{dateStr}</div>
                <div className="time-big">{timeStr}</div>
                <div className="clinic-lbl">{result.clinicName}</div>
              </div>
            </div>

            {/* Right */}
            <div className="r-right">
              <div className="det-grid">
                <div className="dbox">
                  <div className="dlbl">{t.doctor}</div>
                  <div className="dval">{result.doctorName ?? '—'}</div>
                </div>
                <div className="dbox">
                  <div className="dlbl">{t.address}</div>
                  <div className="dval" style={{fontSize:'11px'}}>{result.clinicAddr ?? result.clinicName}</div>
                </div>
                <div className="dbox">
                  <div className="dlbl">{t.visitType}</div>
                  <div className="dval">{result.apptType}</div>
                </div>
                <div className="dbox">
                  <div className="dlbl">{t.duration}</div>
                  <div className="dval">~15 min</div>
                </div>
              </div>

              <div className="alert">
                <div style={{fontSize:'15px', marginTop:'1px'}}>⏰</div>
                <div className="alert-txt">{result.isToday ? t.alertToday : t.alertFuture}</div>
              </div>

              {!result.isToday && result.daysUntil > 0 && (
                <div className="days-strip">
                  <div className="days-num">{result.daysUntil}</div>
                  <div className="days-lbl">{t.daysLabel(result.daysUntil)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        </div>
        </div>

        <div className="hipaa">🔒 {t.hipaa}</div>
      </div>
    </>
  );
}
