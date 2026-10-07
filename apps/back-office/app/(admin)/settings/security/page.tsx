'use client';

/**
 * /settings/security — MFA enrollment (TOTP).
 * Allows SUPER_ADMIN / ADMIN to enroll or remove an authenticator app.
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@precision-medical/auth/client';
import { QrCode, CheckCircle2, AlertCircle, Trash2, Loader2 } from 'lucide-react';

type Step = 'idle' | 'enrolling' | 'verifying' | 'done';

export default function SecuritySettingsPage() {
  const t  = useTranslations('phoenix.security');
  const tc = useTranslations('phoenix.common');
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

  /**
   * Borra los factores a medio inscribir de esta persona.
   *
   * GoTrue no admite dos factores con el mismo `friendlyName`, y este
   * archivo usa siempre el mismo. Quien empezaba y no terminaba de verificar
   * dejaba uno en `unverified` y el siguiente intento moría con
   * "a factor with the friendly name ... already exists" — sin forma de
   * salir desde la pantalla, porque abajo solo se cuentan los `verified` y
   * seguía diciendo "No configurado".
   *
   * Borrarlos es seguro: un factor sin verificar no protege nada, es un
   * formulario sin terminar. Los VERIFICADOS no se tocan — esos se quitan a
   * propósito con el botón de abajo, que pide confirmación.
   */
  async function limpiarColgados(): Promise<void> {
    const { data } = await supabase.auth.mfa.listFactors();
    const colgados = (data?.totp ?? []).filter((x) => x.status !== 'verified');
    for (const x of colgados) {
      await supabase.auth.mfa.unenroll({ factorId: x.id });
    }
  }

  // ── Start enrollment ─────────────────────────────────────────────────────────
  async function startEnroll() {
    setError('');
    setLoading(true);
    try {
      // Primero el barrido: si quedó uno de un intento anterior, el enroll
      // de abajo chocaría con él y la persona volvería a quedar trabada.
      await limpiarColgados();

      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' });
      if (err || !data) { setError(err?.message ?? t('errEnroll')); return; }

      setFactorId(data.id);
      setQrUri(data.totp.qr_code);
      setSecret(data.totp.secret);

      // Start a challenge so the user can verify immediately
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (chErr || !ch) { setError(t('errChallenge')); return; }
      setChallengeId(ch.id);
      setStep('verifying');
    } catch {
      setError(t('errNetwork'));
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
      if (err) { setError(t('errCode')); return; }
      setEnrolled(true);
      setStep('done');
    } catch {
      setError(t('errNetwork'));
    } finally {
      setLoading(false);
    }
  }

  /** Cancelar a mitad de camino: se deshace el factor que se acaba de crear. */
  async function cancelarEnroll(): Promise<void> {
    setLoading(true);
    try {
      if (factorId) await supabase.auth.mfa.unenroll({ factorId });
    } catch {
      // Si no se pudo borrar, el barrido del próximo intento lo agarra.
    } finally {
      setStep('idle');
      setCode('');
      setQrUri('');
      setSecret('');
      setFactorId('');
      setError('');
      setLoading(false);
    }
  }

  // ── Remove factor ────────────────────────────────────────────────────────────
  async function removeFactor() {
    if (!confirm(t('confirmRemoveMfa'))) return;
    setError('');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
      if (err) { setError(err.message); return; }
      setEnrolled(false);
      setFactorId('');
      setStep('idle');
    } catch {
      setError(t('errNetwork'));
    } finally {
      setLoading(false);
    }
  }

  if (pageLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-text-1">{t('pageTitle')}</h1>
        <div className="flex items-center gap-2 text-text-muted text-sm mt-8">
          <Loader2 className="w-4 h-4 animate-spin" /> {tc('loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-text-1">{t('pageTitle')}</h1>

      <div className="mt-6 rounded-lg border border-border bg-bg-1 p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <QrCode className="w-5 h-5 text-brand-text" />
          <div>
            <p className="text-sm font-semibold text-text-1">{t('mfaTitle')}</p>
            <p className="text-[11px] text-text-muted mt-0.5">
              {t('mfaSubtitle')}
            </p>
          </div>
          <div className="ml-auto">
            {enrolled ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald/10 border border-emerald/30 text-emerald uppercase tracking-wider">
                {t('statusActive')}
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber/10 border border-amber/30 text-amber uppercase tracking-wider">
                {t('statusNotSet')}
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
              <span>{t('mfaOk')}</span>
            </div>
            <button
              onClick={removeFactor}
              disabled={loading}
              className="flex items-center gap-2 w-fit text-[12px] text-rose border border-rose/30 rounded-md px-3 py-1.5 bg-rose/5 hover:bg-rose/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('btnRemove')}
            </button>
          </div>
        ) : step === 'verifying' ? (
          <form onSubmit={verifyCode} className="flex flex-col gap-4">
            {/* QR + secret */}
            <div className="rounded-md bg-bg-2/40 border border-border/40 p-4">
              <p className="text-[11px] text-text-muted mb-3">
                {t('step1')}
              </p>
              {qrUri && (
                <div className="flex flex-col items-center gap-3 mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUri} alt={t('qrAlt')} className="w-40 h-40 rounded-md border border-border bg-white p-1" />
                </div>
              )}
              {secret && (
                <div>
                  <p className="text-[10px] text-text-muted mb-1 uppercase tracking-wider">{t('manualKey')}</p>
                  <code className="text-xs font-mono bg-bg-2 border border-border rounded px-2 py-1 tracking-widest text-brand-text break-all">
                    {secret}
                  </code>
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] text-text-muted mb-2">
                {t('step2')}
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
                {loading ? t('btnVerifying') : t('btnActivate')}
              </button>
              {/*
                Cancelar BORRA el factor recién creado.

                Antes solo limpiaba la pantalla y dejaba el factor vivo en
                `unverified`: este botón era la forma más común de quedar
                trabado, y la persona pensaba que no había pasado nada.
              */}
              <button
                type="button"
                disabled={loading}
                onClick={() => { void cancelarEnroll(); }}
                className="px-4 py-2 rounded-md border border-border text-text-muted text-sm disabled:opacity-50"
              >
                {tc('cancel')}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-text-muted">
              {t('mfaPitch')}
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
              {t('btnSetUp')}
            </button>
          </div>
        )}
      </div>

      {/* HIPAA note */}
      <div className="mt-4 rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11px] text-cyan">
        {t('hipaaNote')}
      </div>
    </div>
  );
}
