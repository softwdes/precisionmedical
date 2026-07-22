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

const STATUS_LABELS: Record<string, string> = {
  PENDING:    'Pendiente · Pending',
  SCHEDULED:  'Confirmada · Confirmed',
  CONFIRMED:  'Confirmada · Confirmed',
  CHECKED_IN: 'Check-in · Checked in',
  IN_PROGRESS:'En consulta · In consultation',
  COMPLETED:  'Completada · Completed',
};

export default function CitaPage() {
  const [query, setQuery]   = useState('');
  const [tab, setTab]       = useState<'case'|'appt'>('case');
  const [result, setResult] = useState<ApptResult | null>(null);
  const [error, setError]   = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function search() {
    const code = query.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    setError(false);
    setResult(null);
    try {
      const res = await fetch(`/api/cita/${encodeURIComponent(code)}`);
      if (!res.ok) { setError(true); return; }
      const data = await res.json();
      if (!data.ok) { setError(true); return; }
      setResult(data);
    } catch { setError(true); }
    finally { setLoading(false); }
  }

  const scheduled = result ? new Date(result.scheduledFor) : null;
  const dateStrEs = scheduled?.toLocaleDateString('es-US', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Denver',
  });
  const dateStrEn = scheduled?.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver',
  });
  const timeStr = scheduled?.toLocaleTimeString('es-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Denver',
  });

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#07101f;min-height:100vh}
        .page{min-height:100vh;background:#07101f;display:flex;flex-direction:column;align-items:center;padding:40px 20px 60px;font-family:system-ui,sans-serif}
        .logo{display:flex;align-items:center;gap:10px;margin-bottom:36px}
        .logo-mark{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#06B6D4,#6366F1);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:#fff;letter-spacing:-.5px;flex-shrink:0}
        .logo-text{color:#fff;font-size:15px;font-weight:600}
        .logo-sub{color:rgba(255,255,255,.4);font-size:11px;margin-top:1px}
        .card{background:#0d1b2e;border:1px solid rgba(255,255,255,.08);border-radius:20px;width:100%;max-width:460px}
        .card-header{padding:28px 28px 20px;border-bottom:1px solid rgba(255,255,255,.06)}
        .card-title{color:#fff;font-size:20px;font-weight:700;letter-spacing:-.02em}
        .card-sub{color:rgba(255,255,255,.4);font-size:13px;margin-top:6px}
        .card-body{padding:24px 28px}
        .tabs{display:flex;gap:8px;margin-bottom:16px}
        .tab{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:6px 14px;color:rgba(255,255,255,.4);font-size:12px;font-weight:600;cursor:pointer;transition:all .2s}
        .tab.active{background:rgba(6,182,212,.1);border-color:rgba(6,182,212,.3);color:#06B6D4}
        .input-group{display:flex;gap:10px}
        .input-code{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:0 16px;height:46px;color:#fff;font-size:15px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;outline:none;transition:border-color .2s}
        .input-code::placeholder{color:rgba(255,255,255,.25);font-weight:400;letter-spacing:0;text-transform:none;font-size:14px}
        .input-code:focus{border-color:#06B6D4}
        .btn-search{background:#06B6D4;border:none;border-radius:10px;padding:0 20px;height:46px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .2s;flex-shrink:0}
        .btn-search:hover{background:#0891B2}
        .btn-search:disabled{opacity:.5;cursor:not-allowed}
        .hint{color:rgba(255,255,255,.28);font-size:12px;margin-top:10px}
        .error-msg{color:#F87171;font-size:13px;margin-top:10px}

        .result-card{background:#0d1b2e;border:1px solid rgba(255,255,255,.08);border-radius:20px;width:100%;max-width:460px;overflow:hidden;margin-top:16px}
        .appt-header{background:linear-gradient(135deg,rgba(6,182,212,.12),rgba(99,102,241,.12));padding:24px 28px;border-bottom:1px solid rgba(255,255,255,.06)}
        .status-badge{display:inline-flex;align-items:center;gap:6px;border-radius:20px;padding:4px 12px;margin-bottom:14px}
        .status-dot{width:7px;height:7px;border-radius:50%}
        .status-text{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
        .appt-patient{color:#fff;font-size:22px;font-weight:800;letter-spacing:-.02em}
        .appt-case{color:rgba(255,255,255,.4);font-size:13px;margin-top:4px}
        .appt-body{padding:24px 28px}
        .big-date{text-align:center;padding:20px 0 24px;border-bottom:1px solid rgba(255,255,255,.06)}
        .when-label{color:rgba(255,255,255,.4);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}
        .day-text{color:#fff;font-size:28px;font-weight:900;letter-spacing:-.02em;text-transform:capitalize}
        .time-row{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:8px}
        .time-text{color:#06B6D4;font-size:22px;font-weight:700}
        .sep{color:rgba(255,255,255,.2);font-size:18px}
        .clinic-name{color:rgba(255,255,255,.6);font-size:14px}
        .details-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:20px 0}
        .detail-box{background:rgba(255,255,255,.04);border-radius:10px;padding:14px}
        .detail-label{color:rgba(255,255,255,.35);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
        .detail-value{color:#fff;font-size:14px;font-weight:600}
        .alert-box{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:12px;padding:14px 16px;display:flex;gap:10px;align-items:flex-start}
        .alert-text{color:rgba(255,255,255,.7);font-size:12px;line-height:1.6}
        .alert-text strong{color:#F59E0B}
        .footer-box{padding:0 28px 24px}
        .days-badge{background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.25);border-radius:12px;padding:14px 20px;text-align:center}
        .days-num{color:#818CF8;font-size:32px;font-weight:900}
        .days-label{color:rgba(255,255,255,.4);font-size:12px;margin-top:4px}
        .hipaa-note{color:rgba(255,255,255,.18);font-size:11px;text-align:center;margin-top:24px;max-width:400px}
      `}</style>

      <div className="page">
        <div className="logo">
          <div className="logo-mark">PM</div>
          <div>
            <div className="logo-text">Precision Medical</div>
            <div className="logo-sub">Patient Portal</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Consulta tu cita · Check your appointment</div>
            <div className="card-sub">Ingresa el código de tu caso o número de cita · Enter your case code or appointment number</div>
          </div>
          <div className="card-body">
            <div className="tabs">
              <div className={`tab ${tab === 'case' ? 'active' : ''}`} onClick={() => setTab('case')}>Código de caso</div>
              <div className={`tab ${tab === 'appt' ? 'active' : ''}`} onClick={() => setTab('appt')}>N.° de cita</div>
            </div>
            <div className="input-group">
              <input
                ref={inputRef}
                className="input-code"
                placeholder={tab === 'case' ? 'Ej: CASE-1127 · MVA-2865' : 'Ej: APT-00342'}
                value={query}
                onChange={e => setQuery(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && search()}
              />
              <button className="btn-search" onClick={search} disabled={loading}>
                {loading ? '...' : 'Buscar →'}
              </button>
            </div>
            <div className="hint">El código lo encontrarás en tu mensaje de confirmación · You'll find it in your confirmation message.</div>
            {error && <div className="error-msg">Código no encontrado · Code not found. Verifica e intenta de nuevo · Please verify and try again.</div>}
          </div>
        </div>

        {result && (
          <div className="result-card">
            <div className="appt-header">
              <div
                className="status-badge"
                style={{
                  background: result.isToday ? 'rgba(16,185,129,.15)' : 'rgba(6,182,212,.1)',
                  border: `1px solid ${result.isToday ? 'rgba(16,185,129,.3)' : 'rgba(6,182,212,.25)'}`,
                }}
              >
                <div className="status-dot" style={{ background: result.isToday ? '#10B981' : '#06B6D4' }} />
                <div className="status-text" style={{ color: result.isToday ? '#10B981' : '#06B6D4' }}>
                  {result.isToday ? 'Hoy · Today' : STATUS_LABELS[result.status] ?? 'Confirmada'}
                </div>
              </div>
              <div className="appt-patient">{result.firstName}</div>
              <div className="appt-case">{result.caseCode ?? 'Cita confirmada'} · {result.apptType}</div>
            </div>

            <div className="appt-body">
              <div className="big-date">
                <div className="when-label">
                  {result.isToday ? 'Tu cita es hoy · Your appointment is today' : `En ${result.daysUntil} día${result.daysUntil !== 1 ? 's' : ''} · In ${result.daysUntil} day${result.daysUntil !== 1 ? 's' : ''}`}
                </div>
                <div className="day-text">{dateStrEs}</div>
                <div style={{ color: 'rgba(255,255,255,.3)', fontSize: '13px', marginTop: '2px', fontWeight: 500 }}>{dateStrEn}</div>
                <div className="time-row">
                  <div className="time-text">{timeStr}</div>
                  <div className="sep">·</div>
                  <div className="clinic-name">{result.clinicName}</div>
                </div>
              </div>

              <div className="details-grid">
                <div className="detail-box">
                  <div className="detail-label">Doctor</div>
                  <div className="detail-value">{result.doctorName ?? '—'}</div>
                </div>
                <div className="detail-box">
                  <div className="detail-label">Dirección · Address</div>
                  <div className="detail-value" style={{ fontSize: '12px' }}>{result.clinicAddr ?? result.clinicName}</div>
                </div>
                <div className="detail-box">
                  <div className="detail-label">Tipo de visita · Visit type</div>
                  <div className="detail-value">{result.apptType}</div>
                </div>
                <div className="detail-box">
                  <div className="detail-label">Duración est. · Est. duration</div>
                  <div className="detail-value">~15 min</div>
                </div>
              </div>

              <div className="alert-box">
                <div style={{ fontSize: '16px', marginTop: '1px' }}>⏰</div>
                <div className="alert-text">
                  {result.isToday
                    ? <><strong>Llega 30 minutos antes</strong> para completar tu registro. Trae un ID válido y tu tarjeta de seguro.</>
                    : <><strong>Recuerda llegar 30 minutos antes</strong> de tu cita. Trae tu ID válido y tarjeta de seguro médico.</>
                  }
                </div>
              </div>
            </div>

            {!result.isToday && result.daysUntil > 0 && (
              <div className="footer-box">
                <div className="days-badge">
                  <div className="days-num">{result.daysUntil}</div>
                  <div className="days-label">
                    {result.daysUntil === 1 ? 'día para tu cita · day until your appointment' : 'días para tu cita · days until your appointment'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="hipaa-note">
          HIPAA · Esta página solo muestra información básica de tu cita · This page only shows basic appointment info. Ningún dato médico es visible · No medical data is displayed.
        </div>
      </div>
    </>
  );
}
