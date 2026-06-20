'use client';

/**
 * /settings/security — MFA enrollment (TOTP).
 * Allows SUPER_ADMIN / ADMIN to enroll or remove an authenticator app.
 */

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@precision-medical/auth/client';
import { QrCode, CheckCircle2, AlertCircle, Trash2, Loader2 } from 'lucide-react';

type Step = 'idle' | 'enrolling' | 'verifying' | 'done';

export default function SecuritySettingsPage() {
  const supabase = createClient();

  const [enrolled,    setEnrolled]    = useState(false);
  const [factorId,    setFactorId]    = useState('');
  const [step,        setStep]        = useState<Step>('idle');
  const [qrUri,       setQrUri]       = useState('');
  const [secret,      setSecret]      = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code,        setCode]        = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Check current MFA status ─────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.find(f => f.status === 'verified');
      if (totp) { setEnrolled(true); setFactorId(totp.id); }
      setPageLoading(false);
    })();
  }, []);

  // ── Render QR code on canvas using totp URI ──────────────────────────────────
  useEffect(() => {
    if (!qrUri || !canvasRef.current) return;
    // Simple fallback: link opens in Google Charts (no external fetch needed for canvas)
    // We show the secret for manual entry instead of rendering a QR directly.
  }, [qrUri]);

  // ── Start enrollment ─────────────────────────────────────────────────────────
  async function startEnroll() {
    setError('');
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' });
      if (err || !data) { setError(err?.message ?? 'Error al iniciar enrollment.'); return; }

      setFactorId(data.id);
      setQrUri(data.totp.qr_code);
      setSecret(data.totp.secret);

      // Start a challenge so the user can verify immediately
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (chErr || !ch) { setError('Error al iniciar desafío.'); return; }
      setChallengeId(ch.id);
      setStep('verifying');
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  // ── Verify code ──────────────────────────────────────────────────────────────
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.replace(/\s/g, ''),
      });
      if (err) { setError('Código inválido. Verificá tu app y volvé a intentar.'); return; }
      setEnrolled(true);
      setStep('done');
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  // ── Remove factor ────────────────────────────────────────────────────────────
  async function removeFactor() {
    if (!confirm('¿Eliminar la autenticación de dos factores? Tu cuenta quedará menos protegida.')) return;
    setError('');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
      if (err) { setError(err.message); return; }
      setEnrolled(false);
      setFactorId('');
      setStep('idle');
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  if (pageLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-text-1">Seguridad</h1>
        <div className="flex items-center gap-2 text-text-muted text-sm mt-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-text-1">Seguridad</h1>

      <div className="mt-6 rounded-lg border border-border bg-bg-1 p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <QrCode className="w-5 h-5 text-brand" />
          <div>
            <p className="text-sm font-semibold text-text-1">Autenticación de dos factores (TOTP)</p>
            <p className="text-[11px] text-text-muted mt-0.5">
              Protege tu cuenta con Google Authenticator, Authy, o cualquier app TOTP compatible.
            </p>
          </div>
          <div className="ml-auto">
            {enrolled ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald/10 border border-emerald/30 text-emerald uppercase tracking-wider">
                Activo
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber/10 border border-amber/30 text-amber uppercase tracking-wider">
                No configurado
              </span>
            )}
          </div>
        </div>

        <div className="h-px bg-border mb-4" />

        {/* States */}
        {step === 'done' || (enrolled && step === 'idle') ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-emerald text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>MFA configurado correctamente. Tu cuenta está protegida.</span>
            </div>
            <button
              onClick={removeFactor}
              disabled={loading}
              className="flex items-center gap-2 w-fit text-[12px] text-rose border border-rose/30 rounded-md px-3 py-1.5 bg-rose/5 hover:bg-rose/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar autenticador
            </button>
          </div>
        ) : step === 'verifying' ? (
          <form onSubmit={verifyCode} className="flex flex-col gap-4">
            {/* QR + secret */}
            <div className="rounded-md bg-bg-2/40 border border-border/40 p-4">
              <p className="text-[11px] text-text-muted mb-3">
                1. Abrí tu app autenticadora y escaneá el código QR, o ingresá la clave manualmente.
              </p>
              {qrUri && (
                <div className="flex flex-col items-center gap-3 mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUri} alt="QR MFA" className="w-40 h-40 rounded-md border border-border bg-white p-1" />
                </div>
              )}
              {secret && (
                <div>
                  <p className="text-[10px] text-text-muted mb-1 uppercase tracking-wider">Clave manual</p>
                  <code className="text-xs font-mono bg-bg-2 border border-border rounded px-2 py-1 tracking-widest text-brand break-all">
                    {secret}
                  </code>
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] text-text-muted mb-2">
                2. Ingresá el código de 6 dígitos que muestra tu app para confirmar.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="000 000"
                required
                autoFocus
                autoComplete="one-time-code"
                className="w-full max-w-[180px] rounded-md border border-border bg-bg-2 px-3 py-2 text-center text-xl font-mono tracking-[0.4em] text-text-1 outline-none focus:border-brand/50"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose text-[12px]">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading || code.replace(/\s/g,'').length < 6}
                className="px-4 py-2 rounded-md bg-brand text-white text-sm font-semibold disabled:opacity-50"
              >
                {loading ? 'Verificando…' : 'Activar MFA'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('idle'); setCode(''); setQrUri(''); setSecret(''); }}
                className="px-4 py-2 rounded-md border border-border text-text-muted text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-text-muted">
              Agregá una capa extra de seguridad. Necesitarás tu app autenticadora cada vez que inicies sesión.
            </p>
            {error && (
              <div className="flex items-center gap-2 text-rose text-[12px]">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </div>
            )}
            <button
              onClick={startEnroll}
              disabled={loading}
              className="flex items-center gap-2 w-fit px-4 py-2 rounded-md bg-brand text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              Configurar autenticador
            </button>
          </div>
        )}
      </div>

      {/* HIPAA note */}
      <div className="mt-4 rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11px] text-cyan">
        HIPAA · MFA es requerido para acceso a registros PHI bajo 45 CFR § 164.312(d).
      </div>
    </div>
  );
}
