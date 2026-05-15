'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@precision-medical/auth/client';

export default function InvitePage(): React.ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const supabase = createClient();

    // @supabase/ssr stores sessions in cookies — it does NOT auto-process hash tokens.
    // We must parse the hash manually and call setSession() explicitly.
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      // No tokens in hash — check if there's already a valid session (e.g. second visit)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace('/reset-password');
        } else {
          setErrorMsg('No se encontraron credenciales de activación. El enlace puede haber expirado.');
          setStatus('error');
        }
      });
      return;
    }

    // Exchange the hash tokens for a real cookie-based session
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (error || !data.session) {
          setErrorMsg('El enlace de activación ha expirado o no es válido. Pide al administrador que cree el usuario nuevamente.');
          setStatus('error');
          return;
        }
        // Session established — redirect to set-password page
        router.replace('/reset-password');
      })
      .catch(() => {
        setErrorMsg('Ocurrió un error al procesar la invitación.');
        setStatus('error');
      });
  }, [router]);

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
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#07090F',
          backgroundImage: [
            'linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)',
          ].join(','),
          backgroundSize: '40px 40px',
          position: 'relative',
          overflow: 'hidden',
          padding: '2rem 1rem',
          fontFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
        }}
      >
        <div style={{ position: 'absolute', width: 380, height: 380, top: -100, right: -80, background: 'radial-gradient(circle, rgba(99,102,241,0.20) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 300, height: 300, bottom: -80, left: -100, background: 'radial-gradient(circle, rgba(6,182,212,0.14) 0%, transparent 60%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '1.75rem', animation: 'fadeUp 600ms cubic-bezier(0.16, 1, 0.3, 1) both' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <div style={{ position: 'absolute', top: -12, left: -12, right: -12, bottom: -12, borderRadius: 30, border: '1px solid rgba(99,102,241,0.08)' }} />
              <div style={{ position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: 24, border: '1px solid rgba(99,102,241,0.20)' }} />
              <div style={{ width: 60, height: 60, borderRadius: 18, background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #06B6D4 100%)', boxShadow: '0 0 40px rgba(99,102,241,0.50), 0 0 80px rgba(99,102,241,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'white', fontWeight: 800, fontSize: 17 }}>LM</span>
              </div>
            </div>
            <p style={{ color: '#F5F7FB', fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px', margin: '0 0 3px' }}>
              {status === 'error' ? 'Enlace inválido' : 'Activando cuenta'}
            </p>
            <p style={{ color: '#4A5474', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Precision Medical · Utah, USA
            </p>
          </div>

          {/* Card */}
          <div
            style={{
              width: 340, maxWidth: '90vw',
              background: 'rgba(15,21,36,0.75)',
              border: `1px solid ${status === 'error' ? 'rgba(244,63,94,0.20)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 20, padding: '2rem',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              animation: 'fadeUp 600ms 150ms cubic-bezier(0.16, 1, 0.3, 1) both',
              textAlign: 'center',
            }}
          >
            {status === 'loading' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ position: 'relative', width: 52, height: 52 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.15)' }} />
                    <svg style={{ animation: 'spin 1s linear infinite', position: 'absolute', inset: 0 }} width="52" height="52" viewBox="0 0 52 52" fill="none">
                      <circle cx="26" cy="26" r="23" stroke="url(#g)" strokeWidth="2" strokeLinecap="round" strokeDasharray="36 108" />
                      <defs>
                        <linearGradient id="g" x1="0" y1="0" x2="52" y2="52" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#6366F1" /><stop offset="1" stopColor="#06B6D4" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                </div>
                <p style={{ color: '#F5F7FB', fontWeight: 600, fontSize: 14, margin: '0 0 6px' }}>
                  Verificando tu invitación...
                </p>
                <p style={{ color: '#4A5474', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                  En un momento serás redirigido para crear tu contraseña.
                </p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                </div>
                <p style={{ color: '#F43F5E', fontWeight: 600, fontSize: 14, margin: '0 0 8px' }}>Enlace expirado</p>
                <p style={{ color: '#4A5474', fontSize: 12, lineHeight: 1.6, margin: '0 0 1.25rem' }}>{errorMsg}</p>
                <a href="/login" style={{ display: 'inline-block', background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', color: 'white', fontWeight: 700, fontSize: 13, padding: '10px 24px', borderRadius: 10, textDecoration: 'none' }}>
                  Ir al login
                </a>
              </>
            )}
          </div>

          <p style={{ color: '#2C3248', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '1.25rem', animation: 'fadeUp 400ms 280ms cubic-bezier(0.16, 1, 0.3, 1) both' }}>
            Precision Medical · LM Super Admin · v2.6
          </p>
        </div>
      </div>
    </>
  );
}
