'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@precision-medical/auth/client';

/**
 * Attorney Portal · Login
 * Color de identidad: brand/indigo (#6366f1)
 * Acceso: SUPER_ADMIN · LAWYER
 */
export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirectTo   = searchParams.get('redirectTo') || '/';
  const callbackErr  = searchParams.get('error');

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState(callbackErr ? 'Error de autenticación. Intentá de nuevo.' : '');
  const [loading,     setLoading]     = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [mfaStep,     setMfaStep]     = useState(false);
  const [mfaCode,     setMfaCode]     = useState('');
  const [mfaFactorId, setMfaFactorId] = useState('');

  function formatLockRemaining(until: Date): string {
    const min = Math.ceil((until.getTime() - Date.now()) / 60_000);
    return min <= 1 ? 'menos de un minuto' : `${min} minutos`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLockedUntil(null);
    setLoading(true);
    try {
      const lockRes  = await fetch(`/api/auth/lockout?email=${encodeURIComponent(email)}`);
      const lockData = await lockRes.json() as { locked: boolean; lockedUntil?: string };
      if (lockData.locked && lockData.lockedUntil) { setLockedUntil(new Date(lockData.lockedUntil)); return; }

      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      void fetch('/api/auth/lockout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, success: !authError }),
      });

      if (authError) { setError('Email o contraseña incorrectos.'); return; }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        if (totp) { setMfaFactorId(totp.id); setMfaStep(true); return; }
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('Error de conexión. Verificá tu red.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (!challenge) { setError('Error al generar desafío MFA.'); return; }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode.replace(/\s/g, ''),
      });
      if (verifyError) { setError('Código inválido. Intentá de nuevo.'); return; }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
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
          Portal de Abogados
        </p>

        {lockedUntil && (
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:14,padding:'9px 12px',borderRadius:8,background:'rgba(239,68,68,0.10)',border:'1px solid rgba(239,68,68,0.25)',color:'#fca5a5',fontSize:12 }}>
            ⚠️ Cuenta bloqueada. Intentá en <strong style={{marginLeft:4}}>{formatLockRemaining(lockedUntil)}</strong>.
          </div>
        )}

        {mfaStep ? (
          <form onSubmit={handleMfa} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, textAlign:'center', margin:0 }}>
              Ingresá el código de tu app autenticadora.
            </p>
            <input
              type="text" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7}
              value={mfaCode} onChange={e => setMfaCode(e.target.value)}
              placeholder="000 000" required autoFocus autoComplete="one-time-code"
              style={{ width:'100%',padding:'11px 14px',borderRadius:10,border:'1px solid rgba(99,102,241,0.30)',background:'#0d1117',color:'#f1f5f9',fontSize:20,letterSpacing:8,textAlign:'center',outline:'none',boxSizing:'border-box' }}
            />
            {error && <div style={{background:'rgba(239,68,68,0.10)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,padding:'9px 12px',color:'#fca5a5',fontSize:12}}>{error}</div>}
            <button type="submit" disabled={loading} style={{width:'100%',padding:12,borderRadius:10,background:loading?'rgba(99,102,241,0.50)':'#6366f1',color:'#fff',fontSize:13,fontWeight:800,border:'none',cursor:loading?'not-allowed':'pointer'}}>
              {loading ? 'Verificando…' : 'Verificar →'}
            </button>
            <button type="button" onClick={() => { setMfaStep(false); setMfaCode(''); }} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'rgba(255,255,255,0.35)',textAlign:'center'}}>
              ← Volver
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display:'block',fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.08em',color:'rgba(255,255,255,0.40)',marginBottom:'6px',fontWeight:700 }}>
                Correo electrónico
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="abogado@bufete.com" required autoFocus
                style={{ width:'100%',padding:'11px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,0.10)',background:'#0d1117',color:'#f1f5f9',fontSize:14,outline:'none',boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ display:'block',fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.08em',color:'rgba(255,255,255,0.40)',marginBottom:'6px',fontWeight:700 }}>
                Contraseña
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                style={{ width:'100%',padding:'11px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,0.10)',background:'#0d1117',color:'#f1f5f9',fontSize:14,outline:'none',boxSizing:'border-box' }} />
            </div>
            {error && <div style={{background:'rgba(239,68,68,0.10)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,padding:'9px 12px',color:'#fca5a5',fontSize:12}}>{error}</div>}
            <button type="submit" disabled={loading || !!lockedUntil}
              style={{ width:'100%',padding:12,borderRadius:10,background:(loading||!!lockedUntil)?'rgba(99,102,241,0.50)':'#6366f1',color:'#fff',fontSize:13,fontWeight:800,border:'none',cursor:(loading||!!lockedUntil)?'not-allowed':'pointer',letterSpacing:'0.02em',marginTop:4 }}>
              {loading ? 'Ingresando…' : 'Ingresar →'}
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
          Solo abogados y bufetes registrados
        </div>
      </div>
    </div>
  );
}
