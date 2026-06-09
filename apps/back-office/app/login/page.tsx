'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@precision-medical/auth/client';

/**
 * Back-Office · Login
 * Color de identidad: amber (#f59e0b) — módulo Billing
 * Acceso: SUPER_ADMIN · ADMIN · CONTADOR
 */
export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirectTo   = searchParams.get('redirectTo') || '/';
  const callbackErr  = searchParams.get('error');

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(callbackErr ? 'Error de autenticación. Intentá de nuevo.' : '');
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError('Email o contraseña incorrectos.');
        return;
      }

      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <div style={{
      minHeight:       '100vh',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      background:      'linear-gradient(135deg, #08090f 0%, #0f1020 50%, #0a0c14 100%)',
      fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      <div style={{
        background:    '#111827',
        border:        '1px solid rgba(245,158,11,0.20)',
        borderRadius:  '20px',
        padding:       '40px 36px',
        width:         '380px',
        boxShadow:     '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(245,158,11,0.06)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <div style={{
            display:        'inline-flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:          '52px',
            height:         '52px',
            borderRadius:   '14px',
            background:     'linear-gradient(135deg, rgba(245,158,11,0.20), rgba(245,158,11,0.08))',
            border:         '1px solid rgba(245,158,11,0.30)',
            fontSize:       '24px',
            marginBottom:   '14px',
          }}>⚕️</div>
        </div>

        <h1 style={{
          color:       '#f1f5f9',
          fontSize:    '18px',
          fontWeight:  700,
          textAlign:   'center',
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
          Back Office · Facturación
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Email */}
          <div>
            <label style={{
              display:       'block',
              fontSize:      '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         'rgba(255,255,255,0.40)',
              marginBottom:  '6px',
              fontWeight:    700,
            }}>
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@precisionmedicalcare.com"
              required
              autoFocus
              style={{
                width:         '100%',
                padding:       '11px 14px',
                borderRadius:  '10px',
                border:        '1px solid rgba(255,255,255,0.10)',
                background:    '#0d1117',
                color:         '#f1f5f9',
                fontSize:      '14px',
                outline:       'none',
                boxSizing:     'border-box',
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{
              display:       'block',
              fontSize:      '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         'rgba(255,255,255,0.40)',
              marginBottom:  '6px',
              fontWeight:    700,
            }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width:         '100%',
                padding:       '11px 14px',
                borderRadius:  '10px',
                border:        '1px solid rgba(255,255,255,0.10)',
                background:    '#0d1117',
                color:         '#f1f5f9',
                fontSize:      '14px',
                outline:       'none',
                boxSizing:     'border-box',
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background:   'rgba(239,68,68,0.10)',
              border:       '1px solid rgba(239,68,68,0.25)',
              borderRadius: '8px',
              padding:      '9px 12px',
              color:        '#fca5a5',
              fontSize:     '12px',
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            style={{
              width:         '100%',
              padding:       '12px',
              borderRadius:  '10px',
              background:    isPending ? 'rgba(245,158,11,0.50)' : '#f59e0b',
              color:         '#000',
              fontSize:      '13px',
              fontWeight:    800,
              border:        'none',
              cursor:        isPending ? 'not-allowed' : 'pointer',
              letterSpacing: '0.02em',
              marginTop:     '4px',
            }}
          >
            {isPending ? 'Ingresando…' : 'Ingresar →'}
          </button>
        </form>

        {/* Footer */}
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
            background:    '#f59e0b',
            marginRight:   '5px',
            verticalAlign: 'middle',
          }} />
          Solo personal autorizado · Roles: Admin · Contador
        </div>
      </div>
    </div>
  );
}
