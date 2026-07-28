'use client';

import { createClient } from '@precision-medical/auth/client';
import { useRouter, useSearchParams } from 'next/navigation';

export default function NoAccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  // ?portal=doctor → el usuario intentó entrar al Portal Médico sin permiso
  const isDoctorPortal = params.get('portal') === 'doctor';

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div style={{
      minHeight:       '100vh',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      background:      'linear-gradient(135deg, #08090f, #0f1020)',
      fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        background:    '#111827',
        border:        '1px solid rgba(239,68,68,0.20)',
        borderRadius:  '20px',
        padding:       '40px 36px',
        width:         '380px',
        textAlign:     'center',
        boxShadow:     '0 32px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🚫</div>
        <h1 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
          {isDoctorPortal ? 'Portal Médico — sin acceso' : 'Sin acceso'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.40)', fontSize: '13px', lineHeight: '1.6', marginBottom: '24px' }}>
          {isDoctorPortal
            ? 'Esta cuenta no es de un doctor. El Portal Médico es exclusivo del personal clínico — si necesitás acceso, pedilo al administrador.'
            : 'Tu cuenta no tiene permisos para acceder a este módulo. Contactá al administrador del sistema.'}
        </p>
        <button
          onClick={handleLogout}
          style={{
            padding:      '10px 24px',
            borderRadius: '10px',
            background:   'rgba(239,68,68,0.15)',
            border:       '1px solid rgba(239,68,68,0.30)',
            color:        '#fca5a5',
            fontSize:     '13px',
            fontWeight:   700,
            cursor:       'pointer',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
