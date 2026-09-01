'use client';

/**
 * F2 — "QR de cita": el código que el paciente escanea para confirmar y firmar.
 *
 * Reemplaza el modal homónimo del v2. Sigue el patrón de
 * `intake-form-link-dialog.tsx` (genera el token al abrir, QR + copiar +
 * descargar), con tres diferencias que vienen de qué es este link:
 *
 *  · **El vencimiento se muestra como HORA, no como "dura 4 horas".** El staff
 *    no tiene que hacer la cuenta mientras el paciente espera enfrente. Y no es
 *    un cartel decorativo como el "expira en 24h" del intake: este token vence
 *    de verdad y la página lo valida.
 *  · **Se avisa que el link es de ESTA cita**, para que nadie reutilice una
 *    captura de pantalla del QR de ayer.
 *  · **No ofrece enviarlo por SMS/email.** Este QR se escanea en el mostrador,
 *    con el paciente parado ahí; y el envío real sigue bloqueado por el BAA.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import QRCode from 'qrcode';
import { Check, Copy, Download, QrCode, RefreshCw, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@precision/ui';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appointmentId: string | null;
  /** Para el nombre del archivo del PNG y para que el staff confirme de quién es. */
  patientName: string;
  /** Fecha/hora de la cita ya formateada por el panel, que sabe su zona. */
  apptLabel: string;
}

export function AppointmentSignQrDialog({
  open, onOpenChange, appointmentId, patientName, apptLabel,
}: Props) {
  const t = useTranslations('phoenix.calendar');
  const locale = useLocale();

  const [signUrl,   setSignUrl]   = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading,   setLoading]   = useState(false);
  /**
   * El error se guarda como CÓDIGO y se traduce al pintar, no al ocurrir.
   *
   * Cuando `generar` traducía adentro, dependía de `t` — y `useTranslations`
   * devuelve una función nueva en cada render. Eso volvía inestable a `generar`,
   * el efecto se re-disparaba en cada render, reseteaba el estado y volvía a
   * pedir el token: el modal se quedaba clavado en "Generando" para siempre y
   * cada render era un POST al server. No dependas de `t` dentro de un
   * `useCallback` que alimenta un `useEffect`.
   */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generar = useCallback(async () => {
    if (!appointmentId) return;
    setLoading(true);
    setErrorCode(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/sign-token`, { method: 'POST' });
      const data = await res.json() as { ok?: boolean; signUrl?: string; expiresAt?: string; error?: string };
      if (!res.ok || !data.ok || !data.signUrl) {
        setErrorCode(data.error ?? 'GENERIC');
        return;
      }
      setSignUrl(data.signUrl);
      setExpiresAt(data.expiresAt ?? null);
    } catch {
      setErrorCode('GENERIC');
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    if (!open || !appointmentId) return;
    setSignUrl(null);
    setQrDataUrl('');
    setExpiresAt(null);
    setErrorCode(null);
    void generar();
  }, [open, appointmentId, generar]);

  // Los dos casos que el staff necesita entender, no un código de error.
  const error = errorCode === null ? null
    : errorCode === 'ALREADY_SIGNED'           ? t('qrAlreadySigned')
    : errorCode === 'APPOINTMENT_NOT_SIGNABLE' ? t('qrNotSignable')
    : t('qrGenericError');

  useEffect(() => {
    if (!signUrl) return;
    QRCode.toDataURL(signUrl, {
      width:  240,
      margin: 2,
      // Claro sobre oscuro, igual que el QR del intake: los lectores toleran el
      // contraste invertido y así el modal no tiene un parche blanco.
      color: { dark: '#e2e8f0', light: '#12141f' },
    }).then(setQrDataUrl).catch(() => {});
  }, [signUrl]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  async function copiar() {
    if (!signUrl) return;
    try {
      await navigator.clipboard.writeText(signUrl);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch { /* sin permiso de clipboard: el link se ve igual y se copia a mano */ }
  }

  function descargar() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-cita-${patientName.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }

  const horaVence = expiresAt
    ? new Date(expiresAt).toLocaleTimeString(locale === 'es' ? 'es-US' : 'en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
      })
    : null;

  /**
   * Cuánto falta, además de la hora exacta.
   *
   * La hora sola se vuelve ambigua cuando el token cruza la medianoche: a las
   * 8:40 PM el cartel decía "vence a las 12:39 AM" y no se sabe si eso ya pasó.
   * Y se calcula del `expiresAt` real, NO de la ventana de 4 h: un token que se
   * reusa fue emitido antes, así que decir "en 4 horas" seria falso.
   */
  const restante = (() => {
    if (!expiresAt) return null;
    const min = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000);
    if (min <= 0)  return null;
    if (min < 90)  return t('qrRemainingMinutes', { n: min });
    return t('qrRemainingHours', { n: Math.floor(min / 60) });
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        <div className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <QrCode className="w-4 h-4 text-cyan" /> {t('qrTitle')}
          </DialogTitle>
          <p className="text-text-muted text-xs mt-2 leading-relaxed">{t('qrSubtitle')}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* De quién y de cuándo es. Sin esto, dos QR abiertos en el mostrador
              son indistinguibles. */}
          <div className="rounded-md bg-bg-2/40 px-3 py-2.5">
            <div className="text-text-1 text-sm font-semibold">{patientName}</div>
            <div className="text-text-muted text-xs mt-0.5">{apptLabel}</div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-rose text-xs leading-relaxed">{error}</p>
                <button type="button" onClick={() => void generar()}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-text-2 hover:text-text-1 transition-colors">
                  <RefreshCw className="w-3 h-3" /> {t('qrRetry')}
                </button>
              </div>
            </div>
          )}

          {loading && !error && (
            <div className="flex items-center justify-center py-10 text-text-muted text-xs gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t('qrGenerating')}
            </div>
          )}

          {signUrl && !error && (
            <>
              {/* El link a la vista, en un input de solo lectura: el staff a
                  veces necesita leerlo por teléfono o pegarlo en otra pantalla. */}
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={signUrl}
                  onFocus={e => e.currentTarget.select()}
                  className="flex-1 min-w-0 px-3 py-2 rounded-md border border-border bg-bg-2/40 text-text-2 text-[11px] font-mono"
                />
                <button type="button" onClick={() => void copiar()} title={t('qrCopy')}
                  className="shrink-0 p-2 rounded-md border border-border text-text-2 hover:bg-white/5 transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex flex-col items-center gap-3 rounded-md bg-bg-2/40 py-4 px-3">
                {/* `max-w-full` porque 240px fijos se salen del modal en 320px. */}
                {qrDataUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={qrDataUrl} alt={t('qrTitle')} width={240} height={240} className="rounded max-w-full h-auto" />
                  : <div className="w-[240px] max-w-full aspect-square rounded bg-bg-2 animate-pulse" />}
                <button type="button" onClick={descargar} disabled={!qrDataUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 transition-colors disabled:opacity-40">
                  <Download className="w-3.5 h-3.5" /> {t('qrDownload')}
                </button>
              </div>

              {horaVence && (
                <p className="text-text-muted text-[11px] text-center leading-relaxed">
                  {restante
                    ? t('qrExpiresAtIn', { time: horaVence, rest: restante })
                    : t('qrExpiresAt', { time: horaVence })}
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
