'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@precision-medical/auth/client';
import { useTranslations } from 'next-intl';

/**
 * Attorney Portal · Login
 * Color de identidad: brand/indigo (#6366f1)
 * Acceso: SUPER_ADMIN · LAWYER
 */
export default function LoginPage() {
  const t            = useTranslations('attorney.login');
  const router       = useRouter();
  const searchParams = useSearchParams();
  /**
   * `replace`, no `push`: con `push` el login queda en el historial y un solo
   * «atrás» vuelve al formulario con la sesión todavía viva, así que parece un
   * logout que no ocurrió. La nota larga y el porqué de la PWA están en
   * `apps/back-office/app/login/page.tsx`.
   */
  const redirectTo   = searchParams.get('redirectTo') || '/';
  const callbackErr  = searchParams.get('error');

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState(callbackErr ? t('errCallback') : '');
  const [loading,     setLoading]     = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [mfaStep,     setMfaStep]     = useState(false);
  const [mfaCode,     setMfaCode]     = useState('');
  const [mfaFactorId, setMfaFactorId] = useState('');

  /*
   * Acá vivía `formatLockRemaining`, que contaba los minutos que faltaban.
   * Con la política de "3 intentos y hasta mañana" (2026-10-03) ese número
   * pasó a ser de hasta 960 minutos, y el cartel llegó a decir "volvé a
   * intentar en 960 minutes" — en inglés, dentro de la frase en español.
   *
   * El mensaje ahora dice "mañana", que es la política misma y no necesita
   * cuenta regresiva.
   */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLockedUntil(null);
    setLoading(true);
    await new Promise(r => setTimeout(r, 0));
    let navigating = false;
    try {
      /*
       * UNA sola llamada, y la contraseña se verifica en el SERVIDOR.
       *
       * Antes esta pantalla le hablaba directo a Supabase y después le avisaba
       * a nuestra API si había fallado. Todo el candado colgaba de esa
       * confesión: quien ataca podía no avisar —y probar contraseñas sin gastar
       * intentos— o avisar de más y trabar cuentas ajenas.
       *
       * Ahora el servidor intenta la contraseña él mismo y cuenta lo que vio.
       * La sesión queda abierta en las mismas cookies de siempre, así que el
       * segundo factor sigue resolviéndose acá abajo sin cambiar nada.
       */
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const r = await res.json().catch(() => ({})) as {
        ok?: boolean; locked?: boolean; lockedUntil?: string;
        restantes?: number; mfaRequerido?: boolean; factorId?: string;
      };

      if (res.status === 429) {
        setError('Too many attempts from this network. Try again in a few minutes.');
        return;
      }

      if (!r.ok) {
        if (r.locked && r.lockedUntil) { setLockedUntil(new Date(r.lockedUntil)); return; }
        setError(r.restantes === 1 ? t('lastAttempt') : t('errCredentials'));
        return;
      }

      if (r.mfaRequerido && r.factorId) { setMfaFactorId(r.factorId); setMfaStep(true); return; }

      navigating = true;
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError(t('errNetwork'));
    } finally {
      if (!navigating) setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    let navigating = false;
    try {
      const supabase = createClient();
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (!challenge) { setError(t('errMfaStart')); return; }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode.replace(/\s/g, ''),
      });
      if (verifyError) { setError(t('errMfaInvalid')); return; }
      navigating = true;
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError(t('errNetworkShort'));
    } finally {
      if (!navigating) setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight:       '100vh',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      background:      'linear-gradient(135deg, #08090f 0%, #0d0e1e 50%, #0a0b14 100%)',
      fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      <div style={{
        background:    '#111827',
        border:        '1px solid rgba(99,102,241,0.22)',
        borderRadius:  '20px',
        padding:       '40px 36px',
        width:         '380px',
        boxShadow:     '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.07)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <div style={{
            display:        'inline-flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:          '52px',
            height:         '52px',
            borderRadius:   '14px',
            background:     'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(99,102,241,0.08))',
            border:         '1px solid rgba(99,102,241,0.30)',
            fontSize:       '24px',
            marginBottom:   '14px',
          }}>⚖️</div>
        </div>

        <h1 style={{
          color:        '#f1f5f9',
          fontSize:     '18px',
          fontWeight:   700,
          textAlign:    'center',
          letterSpacing: '-0.3px',
          marginBottom: '4px',
        }}>
          Precision Medical
        </h1>
        <p style={{
          color:         'rgba(255,255,255,0.38)',
          fontSize:      '12px',
          textAlign:     'center',
          marginBottom:  '28px',
        }}>
          {t('subtitle')}
        </p>

        {lockedUntil && (
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:14,padding:'9px 12px',borderRadius:8,background:'rgba(239,68,68,0.10)',border:'1px solid rgba(239,68,68,0.25)',color:'#fca5a5',fontSize:12 }}>
            ⚠️ {t.rich('locked', {
              b: (chunks) => <strong style={{ marginLeft: 4 }}>{chunks}</strong>,
            })}
          </div>
        )}

        {mfaStep ? (
          <form onSubmit={handleMfa} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, textAlign:'center', margin:0 }}>
              {t('mfaPrompt')}
            </p>
            <input
              type="text" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7}
              value={mfaCode} onChange={e => setMfaCode(e.target.value)}
              placeholder="000 000" required autoFocus autoComplete="one-time-code"
              style={{ width:'100%',padding:'11px 14px',borderRadius:10,border:'1px solid rgba(99,102,241,0.30)',background:'#0d1117',color:'#f1f5f9',fontSize:20,letterSpacing:8,textAlign:'center',outline:'none',boxSizing:'border-box' }}
            />
            {error && <div style={{background:'rgba(239,68,68,0.10)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,padding:'9px 12px',color:'#fca5a5',fontSize:12}}>{error}</div>}
            <button type="submit" disabled={loading} style={{width:'100%',padding:12,borderRadius:10,background:loading?'rgba(99,102,241,0.50)':'#6366f1',color:'#fff',fontSize:13,fontWeight:800,border:'none',cursor:loading?'not-allowed':'pointer'}}>
              {loading ? t('verifying') : t('verify')}
            </button>
            <button type="button" onClick={() => { setMfaStep(false); setMfaCode(''); }} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'rgba(255,255,255,0.35)',textAlign:'center'}}>
              {t('back')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display:'block',fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.08em',color:'rgba(255,255,255,0.40)',marginBottom:'6px',fontWeight:700 }}>
                {t('email')}
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('emailPlaceholder')} required autoFocus
                style={{ width:'100%',padding:'11px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,0.10)',background:'#0d1117',color:'#f1f5f9',fontSize:14,outline:'none',boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ display:'block',fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.08em',color:'rgba(255,255,255,0.40)',marginBottom:'6px',fontWeight:700 }}>
                {t('password')}
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                style={{ width:'100%',padding:'11px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,0.10)',background:'#0d1117',color:'#f1f5f9',fontSize:14,outline:'none',boxSizing:'border-box' }} />
            </div>
            {error && <div style={{background:'rgba(239,68,68,0.10)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,padding:'9px 12px',color:'#fca5a5',fontSize:12}}>{error}</div>}
            <button type="submit" disabled={loading || !!lockedUntil}
              style={{ width:'100%',padding:12,borderRadius:10,background:(loading||!!lockedUntil)?'rgba(99,102,241,0.50)':'#6366f1',color:'#fff',fontSize:13,fontWeight:800,border:'none',cursor:(loading||!!lockedUntil)?'not-allowed':'pointer',letterSpacing:'0.02em',marginTop:4 }}>
              {loading ? t('signingIn') : t('signIn')}
            </button>
          </form>
        )}

        <div style={{
          marginTop:   '24px',
          textAlign:   'center',
          fontSize:    '11px',
          color:       'rgba(255,255,255,0.20)',
          lineHeight:  '1.6',
        }}>
          <span style={{
            display:       'inline-block',
            width:         '6px',
            height:        '6px',
            borderRadius:  '50%',
            background:    '#6366f1',
            marginRight:   '5px',
            verticalAlign: 'middle',
          }} />
          {t('footer')}
        </div>
      </div>
    </div>
  );
}
