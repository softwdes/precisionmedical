'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, Device } from '@twilio/voice-sdk';

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
}

export function useTwilioDevice(): UseTwilioDeviceReturn {
  const deviceRef  = useRef<Device | null>(null);
  const callRef    = useRef<Call | null>(null);
  const ringbackRef = useRef<(() => void) | null>(null);

  const [callStatus, setCallStatus] = useState<TwilioCallStatus>('idle');
  const [callSid,    setCallSid]    = useState<string | null>(null);
  const [muted,      setMuted]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const stopRingback = useCallback(() => {
    ringbackRef.current?.();
    ringbackRef.current = null;
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

    await device.register();
    deviceRef.current = device;
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
      call.on('disconnect', () => { stopRingback(); setCallStatus('ready'); setMuted(false); setCallSid(null); callRef.current = null; });
      call.on('error',      (err: Error) => { stopRingback(); setError(err.message); setCallStatus('ready'); callRef.current = null; });
    } catch (err) {
      stopRingback();
      setError(err instanceof Error ? err.message : 'Connection failed');
      setCallStatus('ready');
    }
  }, [getOrCreateDevice, stopRingback]);

  const hangUp = useCallback(() => {
    stopRingback();
    callRef.current?.disconnect();
    callRef.current = null;
    setCallStatus('ready');
    setMuted(false);
  }, [stopRingback]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }, [muted]);

  useEffect(() => {
    return () => {
      stopRingback();
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { callStatus, callSid, muted, error, connect, hangUp, toggleMute, stopRingback };
}
