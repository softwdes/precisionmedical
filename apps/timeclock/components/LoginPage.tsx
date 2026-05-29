'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Clock, Mail, Lock, Eye, EyeOff, ShieldCheck, AlertCircle, Smartphone } from 'lucide-react';
import { useT } from '@/lib/i18n';

export default function LoginPage({ expired }: { expired?: boolean }) {
  const router = useRouter();
  const { t } = useT();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Sync the "session expired" message with the active locale.
  // Without this, the error stays in the initial (Spanish) text if
  // the browser is English and the locale flips after mount.
  useEffect(() => {
    if (expired) setError(t.sessionExpired);
  }, [expired, t.sessionExpired]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(t.invalidCredentials);
      setLoading(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes particlePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes systemPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px #6366F1, 0 0 12px rgba(99,102,241,0.4); }
          50%       { opacity: 0.5; box-shadow: 0 0 3px #6366F1, 0 0 6px rgba(99,102,241,0.2); }
        }
        @keyframes buttonShimmer {
          0%        { left: -100%; }
          30%, 100% { left: 150%; }
        }
        .tc-field { transition: border-color 150ms, border-width 150ms; }
        .tc-field:focus-within {
          border-bottom: 2px solid rgba(99,102,241,0.6) !important;
        }
        .tc-input {
          background: transparent;
          border: none;
          outline: none;
          color: #F5F7FB;
          font-size: 14px;
          flex: 1;
          min-width: 0;
          font-family: inherit;
        }
        .tc-input::placeholder { color: #6B7592; }
        .tc-btn { transition: transform 150ms ease, box-shadow 150ms ease; }
        .tc-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 36px rgba(99,102,241,0.65) !important;
        }
        @media (max-width: 640px) {
          .tc-logo-box { width: 52px !important; height: 52px !important; border-radius: 16px !important; }
          .tc-title   { font-size: 18px !important; }
          .tc-glow-1  { width: 300px !important; height: 300px !important; }
          .tc-glow-2  { width: 260px !important; height: 260px !important; }
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#060810',
        position: 'relative',
        overflow: 'hidden',
        padding: '2rem 1rem',
        fontFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
      }}>

        {/* Scanlines */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'repeating-linear-gradient(180deg, transparent, transparent 39px, rgba(99,102,241,0.022) 40px)' }} />

        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.032) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.032) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />

        {/* Horizontal light line */}
        <div style={{
          position: 'absolute', top: '48%', left: 0, right: 0, height: 1,
          pointerEvents: 'none', zIndex: 0,
          background: 'linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.08) 35%, rgba(6,182,212,0.08) 65%, transparent 100%)',
        }} />

        {/* Floating particles */}
        <div style={{ position:'absolute', top:'15%',  left:'10%',  width:3, height:3, borderRadius:'50%', background:'rgba(99,102,241,0.42)',  pointerEvents:'none', zIndex:0, animation:'particlePulse 3.0s ease-in-out infinite 0ms' }} />
        <div style={{ position:'absolute', top:'22%',  right:'14%', width:2, height:2, borderRadius:'50%', background:'rgba(6,182,212,0.35)',    pointerEvents:'none', zIndex:0, animation:'particlePulse 2.5s ease-in-out infinite 400ms' }} />
        <div style={{ position:'absolute', top:'72%',  left:'7%',   width:2, height:2, borderRadius:'50%', background:'rgba(139,92,246,0.35)',   pointerEvents:'none', zIndex:0, animation:'particlePulse 3.5s ease-in-out infinite 800ms' }} />
        <div style={{ position:'absolute', top:'65%',  right:'9%',  width:3, height:3, borderRadius:'50%', background:'rgba(99,102,241,0.32)',   pointerEvents:'none', zIndex:0, animation:'particlePulse 4.0s ease-in-out infinite 1200ms' }} />
        <div style={{ position:'absolute', top:'38%',  left:'4%',   width:2, height:2, borderRadius:'50%', background:'rgba(6,182,212,0.28)',    pointerEvents:'none', zIndex:0, animation:'particlePulse 2.8s ease-in-out infinite 1600ms' }} />
        <div style={{ position:'absolute', top:'85%',  right:'18%', width:2, height:2, borderRadius:'50%', background:'rgba(99,102,241,0.25)',   pointerEvents:'none', zIndex:0, animation:'particlePulse 3.2s ease-in-out infinite 2000ms' }} />
        <div style={{ position:'absolute', top:'18%',  left:'30%',  width:2, height:2, borderRadius:'50%', background:'rgba(16,185,129,0.25)',   pointerEvents:'none', zIndex:0, animation:'particlePulse 3.8s ease-in-out infinite 2400ms' }} />
        <div style={{ position:'absolute', top:'78%',  right:'35%', width:3, height:3, borderRadius:'50%', background:'rgba(6,182,212,0.25)',    pointerEvents:'none', zIndex:0, animation:'particlePulse 2.6s ease-in-out infinite 2800ms' }} />

        {/* Content wrapper */}
        <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', width:'100%', maxWidth:480, overflow:'visible' }}>

          {/* Ambient glows */}
          <div className="tc-glow-1" style={{ position:'absolute', top:-160, right:-100, width:380, height:380, borderRadius:'50%', background:'radial-gradient(circle, rgba(99,102,241,0.20) 0%, rgba(139,92,246,0.08) 45%, transparent 65%)', pointerEvents:'none', zIndex:0 }} />
          <div className="tc-glow-2" style={{ position:'absolute', bottom:-120, left:-140, width:320, height:320, borderRadius:'50%', background:'radial-gradient(circle, rgba(6,182,212,0.16) 0%, transparent 60%)', pointerEvents:'none', zIndex:0 }} />
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 65%)', pointerEvents:'none', zIndex:0 }} />

          {/* Logo */}
          <div style={{ position:'relative', zIndex:1, textAlign:'center', marginBottom:'2.25rem', animation:'fadeUp 600ms cubic-bezier(0.16,1,0.3,1) both' }}>
            <div style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:'0.75rem' }}>
              {/* Rings */}
              <div style={{ position:'absolute', top:-24, left:-24, right:-24, bottom:-24, borderRadius:40, border:'1px solid rgba(99,102,241,0.05)' }} />
              <div style={{ position:'absolute', top:-16, left:-16, right:-16, bottom:-16, borderRadius:32, border:'1px solid rgba(99,102,241,0.10)' }} />
              <div style={{ position:'absolute', top:-8,  left:-8,  right:-8,  bottom:-8,  borderRadius:24, border:'1px solid rgba(99,102,241,0.22)' }} />
              {/* Logo box */}
              <div
                className="tc-logo-box"
                style={{
                  width: 68, height: 68, borderRadius: 20,
                  background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #06B6D4 100%)',
                  boxShadow: '0 0 40px rgba(99,102,241,0.65), 0 0 80px rgba(99,102,241,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Clock size={28} color="white" strokeWidth={2} />
              </div>
            </div>
            <p className="tc-title" style={{ color:'#F5F7FB', fontWeight:800, fontSize:26, letterSpacing:'-0.5px', margin:'0 0 5px' }}>
              PM Time Clock
            </p>
            <p style={{ color:'#4A5474', fontSize:12, textTransform:'uppercase', letterSpacing:'0.08em', margin:0 }}>
              Precision Medical · Utah, USA
            </p>
          </div>

          {/* Form card */}
          <div style={{ position:'relative', zIndex:1, width:420, maxWidth:'90vw' }}>
            {/* Gradient border */}
            <div style={{
              position:'absolute', top:-1, left:-1, right:-1, bottom:-1,
              borderRadius:21,
              background:'linear-gradient(135deg, rgba(99,102,241,0.40), rgba(139,92,246,0.16) 50%, rgba(6,182,212,0.28) 100%)',
              pointerEvents:'none', zIndex:0,
            }} />
            {/* Card */}
            <div style={{
              position:'relative', zIndex:1,
              background:'rgba(10,14,26,0.93)',
              borderRadius:20,
              padding:'2.25rem 2.5rem',
              backdropFilter:'blur(12px)',
              WebkitBackdropFilter:'blur(12px)',
              animation:'fadeUp 600ms 150ms cubic-bezier(0.16,1,0.3,1) both',
            }}>
              <form onSubmit={handleSubmit}>
                {/* Email */}
                <div className="tc-field" style={{ display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid rgba(255,255,255,0.07)', padding:'14px 0', marginBottom:4 }}>
                  <Mail size={17} color="#4A5474" style={{ flexShrink:0 }} />
                  <input
                    className="tc-input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="empleado@precisionmedical.com"
                    required
                    autoComplete="email"
                  />
                </div>

                <div style={{ height:1, background:'rgba(255,255,255,0.025)', margin:'2px 0' }} />

                {/* Password */}
                <div className="tc-field" style={{ position:'relative', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid rgba(255,255,255,0.07)', padding:'14px 0', marginBottom:4 }}>
                  <Lock size={17} color="#6366F1" style={{ flexShrink:0 }} />
                  <input
                    className="tc-input"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, lineHeight:1, flexShrink:0 }}>
                    {showPw ? <EyeOff size={14} color="#4A5474" /> : <Eye size={14} color="#4A5474" />}
                  </button>
                  <div style={{ position:'absolute', bottom:-4, left:0, right:0, height:8, background:'linear-gradient(180deg, rgba(99,102,241,0.12), transparent)', borderRadius:'0 0 4px 4px', pointerEvents:'none' }} />
                </div>

                {/* Error */}
                {error && (
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:10, color:'#F43F5E', fontSize:12 }}>
                    <AlertCircle size={13} color="#F43F5E" style={{ flexShrink:0 }} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="tc-btn"
                  style={{
                    position:'relative', overflow:'hidden',
                    width:'100%',
                    background:'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #06B6D4 100%)',
                    borderRadius:12,
                    padding:16,
                    textAlign:'center',
                    boxShadow:'0 10px 36px rgba(99,102,241,0.55), 0 4px 14px rgba(99,102,241,0.28)',
                    color:'white',
                    fontWeight:700,
                    fontSize:15,
                    letterSpacing:'0.03em',
                    border:'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    opacity: loading ? 0.85 : 1,
                    fontFamily:'inherit',
                    marginTop:'1.5rem',
                  }}
                >
                  <div style={{ position:'absolute', top:0, left:'-100%', width:'50%', height:'100%', background:'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.13) 50%, transparent 100%)', transform:'skewX(-20deg)', pointerEvents:'none', animation:'buttonShimmer 3s ease-in-out infinite' }} />
                  {loading ? (
                    <>
                      <svg style={{ animation:'spin 1s linear infinite' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      {t.signingIn}
                    </>
                  ) : t.signIn}
                </button>
              </form>
            </div>
          </div>

          {/* System status */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:16, marginBottom:10 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#6366F1', boxShadow:'0 0 6px #6366F1, 0 0 12px rgba(99,102,241,0.4)', animation:'systemPulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize:11, color:'#4A5474', fontWeight:600, letterSpacing:'0.04em' }}>{t.systemOnline}</span>
          </div>

          {/* Security pills */}
          <div style={{ display:'flex', gap:14, marginTop:'1.75rem', justifyContent:'center', flexWrap:'wrap', animation:'fadeUp 500ms 280ms cubic-bezier(0.16,1,0.3,1) both' }}>
            {([
              { Icon: ShieldCheck, label: 'HIPAA' },
              { Icon: Lock,        label: 'SSL / TLS' },
              { Icon: Smartphone,  label: 'PWA' },
            ] as const).map(({ Icon, label }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.18)', borderRadius:20, padding:'7px 16px' }}>
                <Icon size={14} color="#6366F1" />
                <span style={{ color:'#6B7592', fontWeight:600, fontSize:12 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p style={{ color:'#2C3248', fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em', marginTop:'2rem', animation:'fadeUp 400ms 380ms cubic-bezier(0.16,1,0.3,1) both' }}>
            {t.footer}
          </p>
        </div>
      </div>
    </>
  );
}
