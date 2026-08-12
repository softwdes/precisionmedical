'use client';

/**
 * Escucha llamadas entrantes y las muestra para atender (fase 3 del plan).
 *
 * ⛔ HOY NO ESTÁ MONTADO EN NINGÚN LADO. Se desmontó del shell el 2026-08-05
 * cuando se decidió que Twilio desvíe las entrantes a otro número: montado le
 * pedía el micrófono a todos al cargar la app y latía cada 60s para atender
 * llamadas que ya no llegan.
 *
 * Se conserva entero y funcionando junto con `/api/twilio/incoming` y la
 * presencia. Para volver a recibir alcanza con montarlo en `(admin)/layout.tsx`
 * y apuntar "A call comes in" del número al webhook.
 *
 * Cuando se monta, es lo que hace que este navegador quede REGISTRADO en Twilio
 * y con presencia viva — sin un montaje permanente no hay a quién enrutar.
 *
 * ⚠️ Cambio de comportamiento: el permiso de micrófono pasa a pedirse al
 * cargar la app y no al marcar. Es inevitable para poder recibir.
 *
 * Diseño según el mockup aprobado: verde con contexto clínico si reconocemos
 * el número, ámbar con el número en mono si no.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Phone, PhoneOff } from 'lucide-react';
import { useTwilioDevice } from '@/lib/use-twilio-device';
import { formatUsPhone } from '@/lib/phone';
import { PersonAvatar } from '@/components/ui-phoenix';

const CLINIC_TZ = 'America/Denver';

interface IncomingContext {
  patient: {
    id: string; patientCode: string | null;
    firstName: string; lastName: string; phone: string | null;
  } | null;
  sharedBy: number;
  activeCase: { id: string; caseCode: string; caseType: string | null; status: string } | null;
  nextAppointment: { id: string; scheduledFor: string; providerName: string | null } | null;
}

export function IncomingCallListener() {
  const t      = useTranslations('phoenix.calls');
  const locale = useLocale();

  const twilio = useTwilioDevice({ receiveIncoming: true });
  const [context, setContext] = useState<IncomingContext | null>(null);
  const ringtoneRef = useRef<(() => void) | null>(null);

  const incoming = twilio.incoming;

  // Contexto del llamante. Se pide apenas suena: si llega después de que la
  // persona atendió, no sirvió de nada.
  useEffect(() => {
    if (!incoming) { setContext(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/twilio/incoming-context?from=${encodeURIComponent(incoming.from)}`);
        if (!res.ok) return;
        const json = await res.json() as IncomingContext;
        if (!cancelled) setContext(json);
      } catch { /* sin contexto se atiende igual, solo con el número */ }
    })();
    return () => { cancelled = true; };
  }, [incoming]);

  // Timbre. El SDK no hace sonar nada por su cuenta y una entrante silenciosa
  // en una pestaña de fondo no la atiende nadie.
  useEffect(() => {
    if (!incoming) { ringtoneRef.current?.(); ringtoneRef.current = null; return; }
    ringtoneRef.current = startRingtone();
    return () => { ringtoneRef.current?.(); ringtoneRef.current = null; };
  }, [incoming]);

  if (!incoming) return null;

  const patient   = context?.patient ?? null;
  const shared    = (context?.sharedBy ?? 0) > 1;
  const recognized = !!patient;

  const handleAccept = () => {
    // Se reclama la autoría ANTES de aceptar: el que gana la carrera del
    // `accept()` es el mismo que gana la del claim, y así no queda una
    // entrante contestada sin dueño si el POST tarda.
    void fetch('/api/twilio/claim-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twilioCallSid: incoming.callSid }),
    }).catch(() => {});
    incoming.accept();
  };

  const apptLabel = context?.nextAppointment
    ? new Date(context.nextAppointment.scheduledFor).toLocaleString(locale, {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: CLINIC_TZ,
      })
    : null;

  return (
    // `fixed` a nivel del shell, no dentro de un Dialog: el `transform` de un
    // DialogContent encierra a los hijos `fixed` (ver css-fixed-inside-dialog-trap).
    <div className="fixed bottom-4 right-4 z-[100] w-[min(400px,calc(100vw-2rem))]">
      <div
        className={`rounded-xl border p-5 text-center shadow-2xl backdrop-blur ${
          recognized
            ? 'border-emerald/40 bg-gradient-to-b from-emerald/10 to-bg-1'
            : 'border-amber/40 bg-gradient-to-b from-amber/10 to-bg-1'
        }`}
        role="alertdialog"
        aria-label={t('incomingCall')}
      >
        <div className="relative mx-auto mb-3 w-16 h-16">
          <span className={`absolute inset-0 rounded-full animate-ping ${recognized ? 'bg-emerald/30' : 'bg-amber/30'}`} />
          <div className="relative">
            {recognized
              ? <PersonAvatar firstName={patient.firstName} lastName={patient.lastName} size={12} gradientClass="bg-emerald" />
              : (
                <div className="w-12 h-12 rounded-full bg-amber flex items-center justify-center text-white font-bold text-lg">
                  ?
                </div>
              )}
          </div>
        </div>

        <div className={`text-[9.5px] font-bold uppercase tracking-[0.13em] ${recognized ? 'text-emerald' : 'text-amber'}`}>
          ◉ {t('incomingCall')}
        </div>

        {recognized ? (
          <>
            <div className="mt-1 text-lg font-bold text-text-1">
              {patient.firstName} {patient.lastName}
            </div>
            <div className="text-xs text-text-muted">
              <span className="font-mono">{formatUsPhone(incoming.from)}</span>
              {patient.patientCode && <> · {patient.patientCode}</>}
            </div>
            {shared && (
              <div className="mt-1 text-[10px] text-amber">
                {t('sharedNumber', { count: context!.sharedBy })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mt-1 font-mono text-base font-bold text-text-1">
              {formatUsPhone(incoming.from)}
            </div>
            <div className="text-xs text-text-muted">{t('unregisteredCaller')}</div>
          </>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleAccept}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-emerald py-2.5 text-sm font-bold text-white hover:bg-emerald/90 transition-colors"
          >
            <Phone className="w-4 h-4" />
            {t('answer')}
          </button>
          <button
            type="button"
            onClick={incoming.reject}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-rose/40 bg-rose/15 py-2.5 text-sm font-bold text-rose hover:bg-rose/25 transition-colors"
          >
            <PhoneOff className="w-4 h-4" />
            {t('reject')}
          </button>
        </div>

        {/* Contexto clínico — el valor real de atender sabiendo quién llama. */}
        {recognized && (context?.activeCase || apptLabel) && (
          <div className="mt-3 border-t border-border pt-3 text-left text-[11.5px] text-text-2 space-y-1">
            {context?.activeCase && (
              <div>
                {t('ctxActiveCase')}: <b className="text-text-1 font-mono">{context.activeCase.caseCode}</b>
                {context.activeCase.caseType && <span className="text-text-muted"> · {context.activeCase.caseType}</span>}
              </div>
            )}
            {apptLabel && (
              <div>
                {t('ctxNextAppointment')}: <b className="text-text-1">{apptLabel}</b>
                {context?.nextAppointment?.providerName && (
                  <span className="text-text-muted"> · {context.nextAppointment.providerName}</span>
                )}
              </div>
            )}
          </div>
        )}

        {!recognized && (
          <div className="mt-3 border-t border-border pt-3 text-left text-[11px] text-text-muted">
            {t('unregisteredHint')}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Timbre de entrante — mismo enfoque que el ringback de las salientes: Web
 * Audio, sin depender de un archivo. Cadencia EEUU (2s on / 4s off) con las
 * dos frecuencias del tono de llamada (440 + 480 Hz).
 */
function startRingtone(): () => void {
  if (typeof window === 'undefined') return () => {};
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return () => {};

  const ctx  = new Ctor();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);

  const oscs = [440, 480].map((f) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(gain);
    o.start();
    return o;
  });

  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const cycle = (on: boolean) => {
    if (stopped) return;
    gain.gain.setValueAtTime(on ? 0.06 : 0, ctx.currentTime);
    timer = setTimeout(() => cycle(!on), on ? 2000 : 4000);
  };
  cycle(true);

  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    for (const o of oscs) { try { o.stop(); } catch { /* ya detenido */ } }
    ctx.close().catch(() => {});
  };
}
