'use client';

import * as React from 'react';
import { useState } from 'react';
import { createClient } from '@precision-medical/auth/client';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

/**
 * Forgot Password — Back-Office
 * Envía un email de reset de contraseña via Supabase Auth.
 * El link redirige a /reset-password donde el usuario setea la nueva.
 */
export default function ForgotPasswordPage(): React.ReactElement {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) { setError(resetError.message); return; }
      setSent(true);
    } catch {
      setError('Error al enviar. Verificá tu conexión e intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight:'100vh',background:'#060912',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem',fontFamily:'system-ui,-apple-system,sans-serif'}}>
      <div style={{width:'100%',maxWidth:400}}>
        {/* Card */}
        <div style={{background:'rgba(15,18,32,0.95)',border:'1px solid rgba(245,158,11,0.15)',borderRadius:20,padding:'2rem',backdropFilter:'blur(12px)',boxShadow:'0 24px 64px rgba(0,0,0,0.6),0 0 0 1px rgba(245,158,11,0.05)'}}>

          {/* Logo */}
          <div style={{textAlign:'center',marginBottom:'1.5rem'}}>
            <div style={{width:52,height:52,borderRadius:14,background:'linear-gradient(135deg,#F59E0B,#D97706)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:12,boxShadow:'0 8px 24px rgba(245,158,11,0.35)'}}>
              <span style={{color:'#0a0a0a',fontWeight:900,fontSize:20,letterSpacing:'-0.02em'}}>PM</span>
            </div>
            <h1 style={{color:'#F1F5FF',fontSize:18,fontWeight:700,margin:'0 0 4px',letterSpacing:'-0.02em'}}>
              {sent ? 'Email enviado' : 'Restablecer contraseña'}
            </h1>
            <p style={{color:'#4A5474',fontSize:12,margin:0}}>
              {sent ? `Revisá tu bandeja de entrada` : 'Te enviaremos un link de acceso'}
            </p>
          </div>

          {sent ? (
            /* Success state */
            <div style={{textAlign:'center'}}>
              <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:56,height:56,borderRadius:'50%',background:'rgba(16,185,129,0.12)',border:'1px solid rgba(16,185,129,0.25)',marginBottom:16}}>
                <CheckCircle size={28} color="#10B981" />
              </div>
              <p style={{color:'#8B9CC8',fontSize:13,lineHeight:1.6,marginBottom:20}}>
                Si <strong style={{color:'#F1F5FF'}}>{email}</strong> tiene una cuenta activa, recibirás un email con el link para crear tu nueva contraseña.
              </p>
              <p style={{color:'#4A5474',fontSize:11,marginBottom:24}}>
                Revisá también tu carpeta de spam.
              </p>
              <a href="/login" style={{display:'inline-flex',alignItems:'center',gap:6,color:'#F59E0B',fontSize:13,fontWeight:600,textDecoration:'none'}}>
                <ArrowLeft size={14}/> Volver al login
              </a>
            </div>
          ) : (
            /* Form */
            <form onSubmit={handleSubmit}>
              {/* Email */}
              <div style={{marginBottom:'1rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(245,158,11,0.18)',borderRadius:10,padding:'10px 14px'}}>
                  <Mail size={15} color="#F59E0B" style={{flexShrink:0}}/>
                  <input
                    type="email" required autoFocus
                    placeholder="tu@email.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    style={{flex:1,background:'none',border:'none',outline:'none',color:'#F1F5FF',fontSize:14,fontFamily:'inherit'}}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:8,background:'rgba(244,63,94,0.1)',border:'1px solid rgba(244,63,94,0.2)',marginBottom:'1rem'}}>
                  <span style={{color:'#F87171',fontSize:13}}>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading} style={{width:'100%',background:'linear-gradient(135deg,#F59E0B 0%,#D97706 100%)',borderRadius:10,padding:'12px 16px',color:'#0a0a0a',fontWeight:700,fontSize:14,border:'none',cursor:loading?'not-allowed':'pointer',opacity:loading?0.8:1,fontFamily:'inherit',marginBottom:16}}>
                {loading ? 'Enviando...' : 'Enviar link de acceso →'}
              </button>

              {/* Back */}
              <div style={{textAlign:'center'}}>
                <a href="/login" style={{display:'inline-flex',alignItems:'center',gap:6,color:'#4A5474',fontSize:12,fontWeight:500,textDecoration:'none'}}>
                  <ArrowLeft size={12}/> Volver al login
                </a>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <p style={{textAlign:'center',color:'#2A3050',fontSize:10,marginTop:16,letterSpacing:'0.04em'}}>
          PRECISION MEDICAL · CLINIC SYSTEM
        </p>
      </div>
    </div>
  );
}
