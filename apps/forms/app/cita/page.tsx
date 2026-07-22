'use client';

import { useState, useRef } from 'react';

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
    sub: 'Ingresa el código de tu caso para ver tu próxima cita',
    tabCase: 'Código de caso',
    tabAppt: 'N.° de cita',
    phCase: 'Ej: CASE-1127',
    phAppt: 'Ej: APT-00342',
    search: 'Buscar',
    hint: 'Encuéntralo en tu mensaje de confirmación.',
    notFound: 'Código no encontrado. Verifica e intenta de nuevo.',
    today: 'Hoy',
    apptToday: 'Tu cita es hoy',
    inDays: (n: number) => `En ${n} día${n !== 1 ? 's' : ''}`,
    doctor: 'Doctor',
    address: 'Dirección',
    visitType: 'Tipo de visita',
    duration: 'Duración est.',
    alertToday: <><strong>Llega 30 min antes</strong> para tu registro. Trae ID válido y tarjeta de seguro.</>,
    alertFuture: <><strong>Llega 30 min antes</strong> de tu cita. Trae tu ID y tarjeta de seguro médico.</>,
    daysLabel: (n: number) => n === 1 ? 'día para tu cita' : 'días para tu cita',
    hipaa: 'Solo información básica de tu cita. Ningún dato médico visible.',
    newSearch: '↩',
    status: { PENDING:'Pendiente', SCHEDULED:'Confirmada', CONFIRMED:'Confirmada', CHECKED_IN:'Check-in', IN_PROGRESS:'En consulta', COMPLETED:'Completada' } as Record<string,string>,
  },
  en: {
    title: 'Check your appointment',
    sub: 'Enter your case code to see your upcoming appointment',
    tabCase: 'Case code',
    tabAppt: 'Appt. number',
    phCase: 'E.g. CASE-1127',
    phAppt: 'E.g. APT-00342',
    search: 'Search',
    hint: "You'll find it in your confirmation message.",
    notFound: 'Code not found. Please verify and try again.',
    today: 'Today',
    apptToday: 'Your appointment is today',
    inDays: (n: number) => `In ${n} day${n !== 1 ? 's' : ''}`,
    doctor: 'Doctor',
    address: 'Address',
    visitType: 'Visit type',
    duration: 'Est. duration',
    alertToday: <><strong>Arrive 30 min early</strong> to check in. Bring a valid ID and your insurance card.</>,
    alertFuture: <><strong>Arrive 30 min early</strong>. Bring your valid ID and health insurance card.</>,
    daysLabel: (n: number) => n === 1 ? 'day until your appointment' : 'days until your appointment',
    hipaa: 'Basic appointment info only. No medical data is displayed.',
    newSearch: 'New search',
    status: { PENDING:'Pending', SCHEDULED:'Confirmed', CONFIRMED:'Confirmed', CHECKED_IN:'Checked in', IN_PROGRESS:'In consultation', COMPLETED:'Completed' } as Record<string,string>,
  },
};

export default function CitaPage() {
  const [lang, setLang]     = useState<'es'|'en'>('es');
  const [query, setQuery]   = useState('');
  const [tab, setTab]       = useState<'case'|'appt'>('case');
  const [result, setResult] = useState<ApptResult | null>(null);
  const [error, setError]   = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = T[lang];

  async function search() {
    const code = query.trim().toUpperCase();
    if (!code) return;
    setLoading(true); setError(false); setResult(null);
    try {
      const res = await fetch(`/api/cita/${encodeURIComponent(code)}`);
      if (!res.ok) { setError(true); return; }
      const data = await res.json();
      if (!data.ok) { setError(true); return; }
      setResult(data);
    } catch { setError(true); }
    finally { setLoading(false); }
  }

  function reset() { setResult(null); setQuery(''); setError(false); setTimeout(() => inputRef.current?.focus(), 100); }

  const locale = lang === 'es' ? 'es-US' : 'en-US';
  const scheduled = result ? new Date(result.scheduledFor) : null;
  const dateStr = scheduled?.toLocaleDateString(locale, { weekday:'long', day:'numeric', month:'long', timeZone:'America/Denver' });
  const timeStr = scheduled?.toLocaleTimeString(locale, { hour:'numeric', minute:'2-digit', hour12:true, timeZone:'America/Denver' });

  const statusColor = result?.isToday ? '#10B981' : '#06B6D4';
  const statusBg    = result?.isToday ? 'rgba(16,185,129,.15)' : 'rgba(6,182,212,.1)';
  const statusBorder= result?.isToday ? 'rgba(16,185,129,.3)' : 'rgba(6,182,212,.25)';

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
        .new-btn { background: none; border: 1px solid rgba(255,255,255,.1);
          border-radius: 9px; width: 44px; height: 44px; flex-shrink: 0;
          color: rgba(255,255,255,.45); font-size: 18px; cursor: pointer;
          transition: all .18s; display: flex; align-items: center; justify-content: center; }
        .new-btn:hover { border-color: rgba(255,255,255,.3); color: rgba(255,255,255,.8); background: rgba(255,255,255,.05); }

        /* footer */
        .hipaa { color: rgba(255,255,255,.15); font-size: 10px; text-align: center;
          margin-top: 18px; max-width: 500px; }

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
          <div className="mark">PM</div>
          <div>
            <div className="logo-text">Precision Medical</div>
            <div className="logo-sub">Patient Portal</div>
          </div>
        </div>

        {/* Search */}
        <div className={`search-wrap ${result ? 'collapsed' : ''}`} style={{ maxWidth: result ? 840 : 440 }}>
          <div className={`search-card ${result ? 'slim' : 'full'}`}>
            <div className="s-head">
              <div className="s-title">{t.title}</div>
              <div className="s-sub">{t.sub}</div>
            </div>
            <div className="s-body">
              {!result && (
                <div className="tabs">
                  <div className={`tab ${tab==='case'?'on':''}`} onClick={()=>setTab('case')}>{t.tabCase}</div>
                  <div className={`tab ${tab==='appt'?'on':''}`} onClick={()=>setTab('appt')}>{t.tabAppt}</div>
                </div>
              )}
              <div className="row">
                <input
                  ref={inputRef}
                  className="inp"
                  placeholder={tab==='case' ? t.phCase : t.phAppt}
                  value={query}
                  onChange={e => setQuery(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key==='Enter' && search()}
                />
                <button className="go" onClick={search} disabled={loading}>
                  {loading ? '…' : t.search}
                </button>
                {result && (
                  <button className="new-btn" onClick={reset}>{t.newSearch}</button>
                )}
              </div>
              {!result && <div className="hint">{t.hint}</div>}
              {error && <div className="err">{t.notFound}</div>}
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

        <div className="hipaa">HIPAA · {t.hipaa}</div>
      </div>
    </>
  );
}
