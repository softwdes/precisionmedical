'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createBrowserClient } from '@precision-medical/auth/client';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, AlertCircle, Key } from 'lucide-react';

// ─── Red neuronal ──────────────────────────────────────────────────────────────
interface NNode { x: number; y: number; vx: number; vy: number; r: number }

function NeuralBackground(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const ctx = el.getContext('2d'); if (!ctx) return;
    const cvs = el; const c = ctx;
    const resize = (): void => { cvs.width = window.innerWidth; cvs.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const nodes: NNode[] = Array.from({ length: 55 }, () => ({
      x: Math.random()*window.innerWidth, y: Math.random()*window.innerHeight,
      vx: (Math.random()-0.5)*0.32, vy: (Math.random()-0.5)*0.32, r: Math.random()*1.8+0.8,
    }));
    let animId = 0;
    function frame(): void {
      c.clearRect(0,0,cvs.width,cvs.height);
      for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
        const ni=nodes[i]; const nj=nodes[j]; if (!ni||!nj) continue;
        const dist=Math.sqrt((ni.x-nj.x)**2+(ni.y-nj.y)**2);
        if (dist<160) {
          const isCyan=(i+j)%4===0; const alpha=(1-dist/160)*(isCyan?0.14:0.16);
          c.beginPath(); c.moveTo(ni.x,ni.y); c.lineTo(nj.x,nj.y);
          c.strokeStyle=isCyan?`rgba(6,182,212,${alpha})`:`rgba(99,102,241,${alpha})`;
          c.lineWidth=0.6; c.stroke();
        }
      }
      for (const n of nodes) {
        const g=c.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*5);
        g.addColorStop(0,'rgba(139,92,246,0.13)'); g.addColorStop(1,'rgba(99,102,241,0)');
        c.beginPath(); c.arc(n.x,n.y,n.r*5,0,Math.PI*2); c.fillStyle=g; c.fill();
        c.beginPath(); c.arc(n.x,n.y,n.r,0,Math.PI*2); c.fillStyle='rgba(139,92,246,0.60)'; c.fill();
        n.x+=n.vx; n.y+=n.vy;
        if (n.x<0||n.x>cvs.width) n.vx*=-1; if (n.y<0||n.y>cvs.height) n.vy*=-1;
      }
      animId=requestAnimationFrame(frame);
    }
    frame();
    return ()=>{ cancelAnimationFrame(animId); window.removeEventListener('resize',resize); };
  }, []);
  return <canvas ref={canvasRef} aria-hidden="true" style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:0}} />;
}

// ─── LM Super Admin ────────────────────────────────────────────────────────────

export default function LoginPage(): React.ReactElement {
  const router = useRouter();
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);
  const [error, setError] = useState(() => {
    if (typeof window==='undefined') return '';
    return new URLSearchParams(window.location.search).get('expired')==='true'
      ? 'Tu sesión expiró por seguridad. Inicia sesión de nuevo.' : '';
  });
  const [tokenHandling] = useState<boolean>(() => {
    if (typeof window==='undefined') return false;
    const p=new URLSearchParams(window.location.hash.slice(1));
    return !!(p.get('access_token')&&(p.get('type')==='invite'||p.get('type')==='recovery'));
  });

  useEffect(() => {
    if (!tokenHandling) return;
    const p=new URLSearchParams(window.location.hash.slice(1));
    createBrowserClient().auth
      .setSession({access_token:p.get('access_token')!,refresh_token:p.get('refresh_token')??''})
      .then(({data,error})=>{ if (!error&&data.session) router.replace('/reset-password'); })
      .catch(()=>{});
  }, [tokenHandling,router]);

  const handleSubmit=async(e:React.FormEvent):Promise<void>=>{
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const {error:ae}=await createBrowserClient().auth.signInWithPassword({email,password});
      if (ae){setError('Invalid credentials. Please try again.');return;}
      rememberMe?localStorage.setItem('pm_remember_me','true'):localStorage.removeItem('pm_remember_me');
      router.push('/dashboard'); router.refresh();
    } catch {setError('Invalid credentials. Please try again.');}
    finally {setLoading(false);}
  };

  if (tokenHandling) return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',backgroundColor:'#060810',fontFamily:'"Plus Jakarta Sans",-apple-system,system-ui,sans-serif',gap:'1rem'}}>
      <style>{`@keyframes lmSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div style={{position:'relative',width:52,height:52}}>
        <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'2px solid rgba(99,102,241,0.15)'}}/>
        <svg className="lm-spin" width="52" height="52" viewBox="0 0 52 52" fill="none" style={{position:'absolute',inset:0}}>
          <circle cx="26" cy="26" r="23" stroke="url(#g)" strokeWidth="2" strokeLinecap="round" strokeDasharray="36 108"/>
          <defs><linearGradient id="g" x1="0" y1="0" x2="52" y2="52" gradientUnits="userSpaceOnUse"><stop stopColor="#6366F1"/><stop offset="1" stopColor="#06B6D4"/></linearGradient></defs>
        </svg>
      </div>
      <p style={{color:'#4A5474',fontSize:13,letterSpacing:'0.04em'}}>Activando cuenta...</p>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes lmFadeUp        { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes lmSpin          { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes lmParticlePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.85)} }
        @keyframes lmSystemPulse   { 0%,100%{opacity:1;box-shadow:0 0 6px #10B981,0 0 12px rgba(16,185,129,0.4)} 50%{opacity:0.5;box-shadow:0 0 3px #10B981,0 0 6px rgba(16,185,129,0.2)} }
        @keyframes lmButtonShimmer { 0%{left:-100%} 30%,100%{left:150%} }
        @keyframes lmRadarPing     { 0%{transform:scale(0.9);opacity:0.55} 80%{opacity:0.05} 100%{transform:scale(2.4);opacity:0} }
        @keyframes lmHudPulse      { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes lmScanLine      { 0%{transform:translateY(0);opacity:0} 5%{opacity:0.4} 95%{opacity:0.4} 100%{transform:translateY(100vh);opacity:0} }

        .lm-scan     { animation: lmScanLine      8s   linear      infinite; }
        .lm-radar-1  { animation: lmRadarPing     2.8s ease-out    infinite; }
        .lm-radar-2  { animation: lmRadarPing     2.8s ease-out    infinite 1.4s; }
        .lm-hud-0    { animation: lmHudPulse      4s   ease-in-out infinite; }
        .lm-hud-1    { animation: lmHudPulse      4s   ease-in-out infinite 1s; }
        .lm-hud-2    { animation: lmHudPulse      4s   ease-in-out infinite 2s; }
        .lm-hud-3    { animation: lmHudPulse      4s   ease-in-out infinite 3s; }
        .lm-fade-0   { animation: lmFadeUp        600ms cubic-bezier(0.16,1,0.3,1) both; }
        .lm-fade-150 { animation: lmFadeUp        600ms 150ms cubic-bezier(0.16,1,0.3,1) both; }
        .lm-fade-280 { animation: lmFadeUp        500ms 280ms cubic-bezier(0.16,1,0.3,1) both; }
        .lm-fade-380 { animation: lmFadeUp        400ms 380ms cubic-bezier(0.16,1,0.3,1) both; }
        .lm-sys      { animation: lmSystemPulse   2s   ease-in-out infinite; }
        .lm-shimmer  { animation: lmButtonShimmer 3s   ease-in-out infinite; }
        .lm-p0  { animation: lmParticlePulse 3.0s ease-in-out infinite 0ms;    }
        .lm-p1  { animation: lmParticlePulse 2.5s ease-in-out infinite 400ms;  }
        .lm-p2  { animation: lmParticlePulse 3.5s ease-in-out infinite 800ms;  }
        .lm-p3  { animation: lmParticlePulse 4.0s ease-in-out infinite 1200ms; }
        .lm-p4  { animation: lmParticlePulse 2.8s ease-in-out infinite 1600ms; }
        .lm-p5  { animation: lmParticlePulse 3.2s ease-in-out infinite 2000ms; }
        .lm-p6  { animation: lmParticlePulse 3.8s ease-in-out infinite 2400ms; }
        .lm-p7  { animation: lmParticlePulse 2.6s ease-in-out infinite 2800ms; }

        .pm-field { transition: border-color 150ms, border-width 150ms; }
        .pm-field:focus-within { border-bottom: 2px solid rgba(99,102,241,0.6) !important; }
        .pm-input { background:transparent;border:none;outline:none;color:#F5F7FB;font-size:14px;flex:1;min-width:0;font-family:inherit; }
        .pm-input::placeholder { color: #6B7592; }
        .pm-btn { transition: transform 150ms ease, box-shadow 150ms ease; }
        .pm-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 12px 36px rgba(99,102,241,0.65) !important; }
        @media (max-width:640px) {
          .pm-logo-box { width:52px !important; height:52px !important; border-radius:16px !important; }
          .pm-title    { font-size:18px !important; }
          .pm-glow-1   { width:300px !important; height:300px !important; }
          .pm-glow-2   { width:260px !important; height:260px !important; }
        }
      `}</style>

      <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',backgroundColor:'#060810',position:'relative',overflow:'hidden',padding:'2rem 1rem',fontFamily:'"Plus Jakarta Sans",-apple-system,system-ui,sans-serif'}}>

        <NeuralBackground />

        {/* HUD corners */}
        <div aria-hidden className="lm-hud-0" style={{position:'absolute',top:18,left:18,width:30,height:30,borderTop:'1.5px solid rgba(99,102,241,0.75)',borderLeft:'1.5px solid rgba(99,102,241,0.75)',pointerEvents:'none',zIndex:1}} />
        <div aria-hidden className="lm-hud-1" style={{position:'absolute',top:18,right:18,width:30,height:30,borderTop:'1.5px solid rgba(99,102,241,0.75)',borderRight:'1.5px solid rgba(99,102,241,0.75)',pointerEvents:'none',zIndex:1}} />
        <div aria-hidden className="lm-hud-2" style={{position:'absolute',bottom:18,left:18,width:30,height:30,borderBottom:'1.5px solid rgba(99,102,241,0.75)',borderLeft:'1.5px solid rgba(99,102,241,0.75)',pointerEvents:'none',zIndex:1}} />
        <div aria-hidden className="lm-hud-3" style={{position:'absolute',bottom:18,right:18,width:30,height:30,borderBottom:'1.5px solid rgba(99,102,241,0.75)',borderRight:'1.5px solid rgba(99,102,241,0.75)',pointerEvents:'none',zIndex:1}} />

        {/* Scan line */}
        <div aria-hidden className="lm-scan" style={{position:'absolute',top:0,left:0,right:0,height:1,background:'linear-gradient(90deg,transparent 0%,rgba(99,102,241,0.35) 30%,rgba(139,92,246,0.6) 50%,rgba(99,102,241,0.35) 70%,transparent 100%)',pointerEvents:'none',zIndex:2}} />

        {/* Dot grid */}
        <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:0,backgroundImage:'linear-gradient(rgba(99,102,241,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.06) 1px,transparent 1px)',backgroundSize:'32px 32px'}} />

        {/* Horizontal light line */}
        <div style={{position:'absolute',top:'48%',left:0,right:0,height:1,pointerEvents:'none',zIndex:0,background:'linear-gradient(90deg,transparent 0%,rgba(99,102,241,0.08) 35%,rgba(6,182,212,0.08) 65%,transparent 100%)'}} />

        {/* Floating particles */}
        <div className="lm-p0" style={{position:'absolute',top:'15%',left:'10%', width:3,height:3,borderRadius:'50%',background:'rgba(99,102,241,0.42)',pointerEvents:'none',zIndex:0}} />
        <div className="lm-p1" style={{position:'absolute',top:'22%',right:'14%',width:2,height:2,borderRadius:'50%',background:'rgba(6,182,212,0.35)',  pointerEvents:'none',zIndex:0}} />
        <div className="lm-p2" style={{position:'absolute',top:'72%',left:'7%',  width:2,height:2,borderRadius:'50%',background:'rgba(139,92,246,0.35)', pointerEvents:'none',zIndex:0}} />
        <div className="lm-p3" style={{position:'absolute',top:'65%',right:'9%', width:3,height:3,borderRadius:'50%',background:'rgba(99,102,241,0.32)', pointerEvents:'none',zIndex:0}} />
        <div className="lm-p4" style={{position:'absolute',top:'38%',left:'4%',  width:2,height:2,borderRadius:'50%',background:'rgba(6,182,212,0.28)',  pointerEvents:'none',zIndex:0}} />
        <div className="lm-p5" style={{position:'absolute',top:'85%',right:'18%',width:2,height:2,borderRadius:'50%',background:'rgba(99,102,241,0.25)', pointerEvents:'none',zIndex:0}} />
        <div className="lm-p6" style={{position:'absolute',top:'18%',left:'30%', width:2,height:2,borderRadius:'50%',background:'rgba(16,185,129,0.25)', pointerEvents:'none',zIndex:0}} />
        <div className="lm-p7" style={{position:'absolute',top:'78%',right:'35%',width:3,height:3,borderRadius:'50%',background:'rgba(6,182,212,0.25)',  pointerEvents:'none',zIndex:0}} />

        {/* Content */}
        <div style={{position:'relative',zIndex:1,display:'flex',flexDirection:'column',alignItems:'center',width:'100%',maxWidth:480,overflow:'visible'}}>

          {/* Ambient glows */}
          <div className="pm-glow-1" style={{position:'absolute',top:-160,right:-100,width:380,height:380,borderRadius:'50%',background:'radial-gradient(circle,rgba(99,102,241,0.20) 0%,rgba(139,92,246,0.08) 45%,transparent 65%)',pointerEvents:'none',zIndex:0}} />
          <div className="pm-glow-2" style={{position:'absolute',bottom:-120,left:-140,width:320,height:320,borderRadius:'50%',background:'radial-gradient(circle,rgba(6,182,212,0.16) 0%,transparent 60%)',pointerEvents:'none',zIndex:0}} />
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(99,102,241,0.05) 0%,transparent 65%)',pointerEvents:'none',zIndex:0}} />

          {/* Logo */}
          <div className="lm-fade-0" style={{position:'relative',zIndex:1,textAlign:'center',marginBottom:'2.25rem'}}>
            <div style={{position:'relative',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:'0.75rem'}}>
              <div style={{position:'absolute',top:-24,left:-24,right:-24,bottom:-24,borderRadius:40,border:'1px solid rgba(99,102,241,0.05)'}} />
              <div style={{position:'absolute',top:-16,left:-16,right:-16,bottom:-16,borderRadius:32,border:'1px solid rgba(99,102,241,0.10)'}} />
              <div style={{position:'absolute',top:-8, left:-8, right:-8, bottom:-8, borderRadius:24,border:'1px solid rgba(99,102,241,0.22)'}} />
              <div aria-hidden className="lm-radar-1" style={{position:'absolute',top:-4,left:-4,right:-4,bottom:-4,borderRadius:'50%',border:'1.5px solid rgba(107,78,255,0.55)',pointerEvents:'none'}} />
              <div aria-hidden className="lm-radar-2" style={{position:'absolute',top:-4,left:-4,right:-4,bottom:-4,borderRadius:'50%',border:'1.5px solid rgba(107,78,255,0.45)',pointerEvents:'none'}} />
              <div className="pm-logo-box" style={{width:68,height:68,borderRadius:20,background:'linear-gradient(135deg,#6366F1 0%,#8B5CF6 50%,#06B6D4 100%)',boxShadow:'0 0 40px rgba(99,102,241,0.65),0 0 80px rgba(99,102,241,0.25)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{color:'white',fontWeight:800,fontSize:20}}>LM</span>
              </div>
            </div>
            <p className="pm-title" style={{color:'#F5F7FB',fontWeight:800,fontSize:26,letterSpacing:'-0.5px',margin:'0 0 5px',textShadow:'0 1px 2px rgba(0,0,0,0.45)'}}>LM Super Admin</p>
            <p style={{color:'#4A5474',fontSize:12,textTransform:'uppercase',letterSpacing:'0.08em',margin:0}}>Precision Medical · Utah, USA</p>
          </div>

          {/* Card */}
          <div style={{position:'relative',zIndex:1,width:420,maxWidth:'90vw'}}>
            <div style={{position:'absolute',top:-1,left:-1,right:-1,bottom:-1,borderRadius:21,background:'linear-gradient(135deg,rgba(99,102,241,0.40),rgba(139,92,246,0.16) 50%,rgba(6,182,212,0.28) 100%)',pointerEvents:'none',zIndex:0}} />
            <div className="lm-fade-150" style={{position:'relative',zIndex:1,background:'rgba(10,14,26,0.93)',borderRadius:20,padding:'2.25rem 2.5rem',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)'}}>
              <form onSubmit={handleSubmit}>
                <div className="pm-field" style={{display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid rgba(255,255,255,0.07)',padding:'14px 0',marginBottom:4}}>
                  <Mail size={17} color="#4A5474" style={{flexShrink:0}} />
                  <input className="pm-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@yourcompany.com" required autoComplete="email" />
                </div>
                <div style={{height:1,background:'rgba(255,255,255,0.025)',margin:'2px 0'}} />
                <div className="pm-field" style={{position:'relative',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid rgba(255,255,255,0.07)',padding:'14px 0',marginBottom:4}}>
                  <Lock size={17} color="#6366F1" style={{flexShrink:0}} />
                  <input className="pm-input" type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
                  <button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide':'Show'} style={{background:'none',border:'none',cursor:'pointer',padding:0,lineHeight:1,flexShrink:0}}>
                    {showPassword?<EyeOff size={14} color="#4A5474"/>:<Eye size={14} color="#4A5474"/>}
                  </button>
                  <div style={{position:'absolute',bottom:-4,left:0,right:0,height:8,background:'linear-gradient(180deg,rgba(99,102,241,0.12),transparent)',borderRadius:'0 0 4px 4px',pointerEvents:'none'}} />
                </div>
                {error&&<div style={{display:'flex',alignItems:'center',gap:6,marginTop:10,color:'#F43F5E',fontSize:12}}><AlertCircle size={13} color="#F43F5E" style={{flexShrink:0}}/><span>{error}</span></div>}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'10px 0 1.5rem'}}>
                  <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    <div role="checkbox" aria-checked={rememberMe} tabIndex={0} onClick={()=>setRememberMe(!rememberMe)} onKeyDown={e=>e.key===' '&&setRememberMe(v=>!v)} style={{width:14,height:14,borderRadius:4,background:'rgba(99,102,241,0.2)',border:'1px solid rgba(99,102,241,0.4)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
                      {rememberMe&&<svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span style={{color:'#4A5474',fontSize:11}}>Remember me</span>
                  </label>
                  <button type="button" onClick={()=>router.push('/forgot-password')} style={{background:'none',border:'none',cursor:'pointer',color:'#6366F1',fontSize:11,padding:0,fontFamily:'inherit'}}>Forgot your password?</button>
                </div>
                <button type="submit" disabled={loading} className="pm-btn" style={{position:'relative',overflow:'hidden',width:'100%',background:'linear-gradient(135deg,#6366F1 0%,#8B5CF6 50%,#06B6D4 100%)',borderRadius:12,padding:16,textAlign:'center',boxShadow:'0 10px 36px rgba(99,102,241,0.55),0 4px 14px rgba(99,102,241,0.28)',color:'white',fontWeight:700,fontSize:15,letterSpacing:'0.03em',border:'none',cursor:loading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,opacity:loading?0.85:1,fontFamily:'inherit'}}>
                  <div className="lm-shimmer" style={{position:'absolute',top:0,left:'-100%',width:'50%',height:'100%',background:'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.13) 50%,transparent 100%)',transform:'skewX(-20deg)',pointerEvents:'none'}} />
                  {loading?(<><svg className="lm-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Signing in...</>):'Sign in'}
                </button>
              </form>
            </div>
          </div>

          {/* Status */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginTop:16,marginBottom:10}}>
            <div className="lm-sys" style={{width:6,height:6,borderRadius:'50%',background:'#10B981',boxShadow:'0 0 6px #10B981,0 0 12px rgba(16,185,129,0.4)'}} />
            <span style={{fontSize:11,color:'#4A5474',fontWeight:600,letterSpacing:'0.04em'}}>All systems operational</span>
          </div>

          {/* Security pills */}
          <div className="lm-fade-280" style={{display:'flex',gap:14,marginTop:'1.75rem',justifyContent:'center',flexWrap:'wrap'}}>
            {([{Icon:ShieldCheck,label:'HIPAA'},{Icon:Lock,label:'SSL'},{Icon:Key,label:'2FA'}] as const).map(({Icon,label})=>(
              <div key={label} style={{display:'flex',alignItems:'center',gap:6,background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.18)',borderRadius:20,padding:'7px 16px'}}>
                <Icon size={14} color="#10B981"/><span style={{color:'#6B7592',fontWeight:600,fontSize:12}}>{label}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="lm-fade-380" style={{color:'#2C3248',fontSize:11,textTransform:'uppercase',letterSpacing:'0.1em',marginTop:'2rem'}}>
            Precision Medical · LM Super Admin · v2.6
          </p>
        </div>
      </div>
    </>
  );
}
