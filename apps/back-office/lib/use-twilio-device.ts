'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, Device } from '@twilio/voice-sdk';
import { PRESENCE_HEARTBEAT_MS } from '@/lib/twilio-presence';

export type TwilioCallStatus = 'idle' | 'ready' | 'connecting' | 'in-call' | 'error';

// ─── Ringback tone (local, no depende de Twilio) ───────────────────────────
// El SDK dispara 'accept' cuando el NAVEGADOR conecta con Twilio (WebRTC),
// no cuando el paciente contesta — y en llamadas iniciadas desde el
// navegador (Twilio Client) el tono de ring de la operadora no siempre se
// reenvía de forma confiable. Sin nada sonando, agendar se sentía "cortado"
// aunque la llamada siguiera intentando conectar. Se genera un ringback
// estándar EEUU (440Hz + 480Hz, cadencia 2s encendido / 4s apagado — ITU-T
// E.180) con Web Audio API, sin depender de ningún archivo de audio.
function startRingback(): () => void {
  if (typeof window === 'undefined') return () => {};
  const AudioCtxCtor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxCtor) return () => {};

  const ctx  = new AudioCtxCtor();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  osc1.frequency.value = 440;
  osc1.connect(gain);
  const osc2 = ctx.createOscillator();
  osc2.frequency.value = 480;
  osc2.connect(gain);
  osc1.start();
  osc2.start();

  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const cycle = (on: boolean) => {
    if (stopped) return;
    gain.gain.setValueAtTime(on ? 0.05 : 0, ctx.currentTime);
    timer = setTimeout(() => cycle(!on), on ? 2000 : 4000);
  };
  cycle(true);

  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    try { osc1.stop(); osc2.stop(); } catch { /* ya detenidos */ }
    ctx.close().catch(() => {});
  };
}

/** Llamada entrante esperando que alguien la conteste o la rechace. */
export interface IncomingCall {
  callSid: string;
  /** Número del que llama, ya en E.164 tal como lo manda Twilio. */
  from: string;
  accept: () => void;
  reject: () => void;
}

export interface UseTwilioDeviceReturn {
  callStatus: TwilioCallStatus;
  callSid:    string | null;
  muted:      boolean;
  error:      string | null;
  connect:      (toPhone: string, agentName?: string) => Promise<void>;
  hangUp:       () => void;
  toggleMute:   () => void;
  /** El agente confirmó que el paciente contestó — corta el ringback local. */
  stopRingback: () => void;
  /** Entrante sonando ahora, o null. Solo con `receiveIncoming`. */
  incoming:   IncomingCall | null;
  /** El Device quedó registrado y este usuario puede recibir llamadas. */
  registered: boolean;
}

export interface UseTwilioDeviceOptions {
  /**
   * Registrar el Device al montar y escuchar entrantes.
   *
   * ⚠️ Cambio de comportamiento respecto de las salientes: el registro y el
   * permiso de micrófono pasan a ser PERMANENTES mientras la app esté abierta,
   * en vez de pedirse al marcar. Es la única forma de que Twilio pueda enrutar
   * una llamada a este navegador. Por eso es opt-in y no el default: las
   * pantallas que solo marcan no tienen por qué tomar el micrófono.
   */
  receiveIncoming?: boolean;
}

export function useTwilioDevice(options: UseTwilioDeviceOptions = {}): UseTwilioDeviceReturn {
  const { receiveIncoming = false } = options;
  const deviceRef  = useRef<Device | null>(null);
  const callRef    = useRef<Call | null>(null);
  const ringbackRef = useRef<(() => void) | null>(null);

  const [callStatus, setCallStatus] = useState<TwilioCallStatus>('idle');
  const [callSid,    setCallSid]    = useState<string | null>(null);
  const [muted,      setMuted]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [incoming,   setIncoming]   = useState<IncomingCall | null>(null);
  const [registered, setRegistered] = useState(false);

  const stopRingback = useCallback(() => {
    ringbackRef.current?.();
    ringbackRef.current = null;
  }, []);

  /**
   * Soltar el micrófono al terminar una llamada.
   *
   * Sin esto el navegador se queda con el punto rojo de "grabando" en la
   * pestaña después de colgar. En una clínica eso no es solo molesto: una
   * pestaña abierta captando audio ambiente puede levantar conversación de
   * OTROS pacientes, que es PHI que nadie autorizó.
   *
   * Hacen falta las dos llamadas porque cubren casos distintos:
   *   - `unsetInputDevice()` es la API pública, pero devuelve sin hacer nada
   *     si la app nunca fijó un input con `setInputDevice()` — que es
   *     justamente nuestro caso (dejamos que el SDK use el default).
   *   - `_stopDefaultInputDeviceStream()` es la que corta el stream que el SDK
   *     adquiere por su cuenta. Es interna: va con optional chaining para que
   *     una futura versión del SDK que la renombre no rompa la llamada, solo
   *     deje de liberar (y ahí se revisa).
   */
  const releaseMicrophone = useCallback(() => {
    const audio = deviceRef.current?.audio as (undefined | {
      unsetInputDevice?: () => Promise<void>;
      _stopDefaultInputDeviceStream?: () => void;
    });
    if (!audio) return;
    try { void audio.unsetInputDevice?.()?.catch(() => {}); } catch { /* no-op */ }
    try { audio._stopDefaultInputDeviceStream?.(); } catch { /* no-op */ }
  }, []);

  const getOrCreateDevice = useCallback(async (): Promise<Device> => {
    if (deviceRef.current) return deviceRef.current;

    // Dynamic import keeps the Voice SDK out of the server bundle
    const { Device: TwilioDevice } = await import('@twilio/voice-sdk');

    const res = await fetch('/api/twilio/token', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to get Twilio token');
    const { token } = await res.json() as { token: string };

    const device = new TwilioDevice(token, { logLevel: 1 });

    device.on('error', (err: Error) => {
      setError(err.message);
      setCallStatus('error');
    });

    device.on('tokenWillExpire', async () => {
      try {
        const r = await fetch('/api/twilio/token', { method: 'POST' });
        if (!r.ok) throw new Error(`token refresh failed: ${r.status}`);
        const { token: fresh } = await r.json() as { token: string };
        if (fresh) device.updateToken(fresh);
      } catch (e) {
        console.error('[twilio] token refresh error:', e);
      }
    });

    // Entrantes. Twilio dispara esto en el navegador que gane el ring group.
    // Se registra siempre (el permiso `incomingAllow` ya está en el token),
    // pero solo llega algo si este usuario está en el TwiML del webhook, que
    // depende de la presencia — o sea, de `receiveIncoming`.
    device.on('incoming', (call: Call) => {
      const params  = call.parameters as Record<string, string>;
      const callSid = params.CallSid ?? '';
      const from    = params.From ?? '';

      const cleanup = () => {
        setIncoming(null);
        callRef.current = null;
        releaseMicrophone();
      };

      call.on('cancel',     cleanup);   // colgó antes de que atendiéramos
      call.on('disconnect', () => { cleanup(); setCallStatus('ready'); setMuted(false); setCallSid(null); });
      call.on('reject',     cleanup);

      setIncoming({
        callSid,
        from,
        accept: () => {
          // Sin ringback local acá: el tono se lo genera el navegador al
          // sonar, y el audio del paciente entra apenas aceptamos.
          call.accept();
          callRef.current = call;
          setIncoming(null);
          setCallSid(callSid);
          setCallStatus('in-call');
        },
        reject: () => { call.reject(); cleanup(); },
      });
    });

    await device.register();
    deviceRef.current = device;
    setRegistered(true);
    return device;
  }, []);

  const connect = useCallback(async (toPhone: string, agentName?: string) => {
    try {
      setCallStatus('connecting');
      setError(null);
      setMuted(false);
      setCallSid(null);
      stopRingback();
      ringbackRef.current = startRingback();

      const device = await getOrCreateDevice();
      const call   = await device.connect({ params: { To: toPhone, AgentName: agentName ?? '' } });
      callRef.current = call;

      call.on('accept',     () => {
        // 'accept' = el navegador quedo conectado con Twilio (WebRTC), no que
        // el paciente contesto: el telefono real puede seguir sonando.
        // PERO desde este momento Twilio ya nos transmite el ringback REAL de
        // la operadora, asi que hay que cortar el nuestro — si no, se escuchan
        // los dos tonos superpuestos (doble ring).
        stopRingback();
        setCallStatus('in-call');
        setCallSid((call.parameters as Record<string, string>).CallSid ?? null);
      });
      call.on('disconnect', () => { stopRingback(); releaseMicrophone(); setCallStatus('ready'); setMuted(false); setCallSid(null); callRef.current = null; });
      call.on('error',      (err: Error) => { stopRingback(); releaseMicrophone(); setError(err.message); setCallStatus('ready'); callRef.current = null; });
    } catch (err) {
      stopRingback();
      setError(err instanceof Error ? err.message : 'Connection failed');
      setCallStatus('ready');
    }
  }, [getOrCreateDevice, stopRingback, releaseMicrophone]);

  const hangUp = useCallback(() => {
    stopRingback();
    callRef.current?.disconnect();
    releaseMicrophone();
    callRef.current = null;
    setCallStatus('ready');
    setMuted(false);
  }, [stopRingback, releaseMicrophone]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }, [muted]);

  // ─── Recepción: registrar al montar y latir ────────────────────────────────
  //
  // Sin esto el Device solo existe mientras dura una saliente, y Twilio no
  // tiene a quién enrutar una entrante. El heartbeat es lo que hace que el
  // webhook sepa que este navegador está vivo.
  useEffect(() => {
    if (!receiveIncoming) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const beat = () => fetch('/api/twilio/presence', { method: 'POST' }).catch(() => {});

    void (async () => {
      try {
        await getOrCreateDevice();
        if (cancelled) return;
        await beat();
        timer = setInterval(beat, PRESENCE_HEARTBEAT_MS);
      } catch (err) {
        // No se propaga a `error`: eso pinta la UI de "llamada fallida" y acá
        // no hay ninguna llamada en curso. Solo no vamos a recibir.
        console.error('[twilio] no se pudo registrar para recibir:', err);
      }
    })();

    // Al cerrar la pestaña, borrar la presencia — si no, el webhook le marca a
    // un cliente muerto y el paciente escucha timbrar contra nadie.
    const onLeave = () => {
      navigator.sendBeacon?.('/api/twilio/presence/leave');
    };
    window.addEventListener('pagehide', onLeave);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('pagehide', onLeave);
      onLeave();
    };
  }, [receiveIncoming, getOrCreateDevice]);

  useEffect(() => {
    return () => {
      stopRingback();
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    callStatus, callSid, muted, error,
    connect, hangUp, toggleMute, stopRingback,
    incoming, registered,
  };
}
