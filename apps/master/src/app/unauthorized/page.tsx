'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

export default function UnauthorizedPage() {
  const router = useRouter();

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#020c10',
      padding: '40px 16px',
      boxSizing: 'border-box',
      fontFamily: "'Rajdhani', sans-serif",
      gap: '24px',
      textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '14px', background: 'rgba(255,60,60,0.15)',
        border: '1px solid rgba(255,60,60,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" style={{ width: 28, height: 28 }}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </div>

      <div>
        <div style={{ fontSize: '22px', fontWeight: 900, color: '#ffffff', fontFamily: "'Orbitron', sans-serif", letterSpacing: '0.06em' }}>
          ACCESO DENEGADO
        </div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
          Tu cuenta no tiene permisos de administrador.
        </div>
      </div>

      <button
        onClick={handleSignOut}
        style={{
          background: '#534AB7', color: '#ffffff', border: 'none',
          borderRadius: '4px', padding: '12px 28px',
          fontFamily: "'Orbitron', sans-serif", fontWeight: 900,
          fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        CERRAR SESIÓN
      </button>
    </div>
  );
}
