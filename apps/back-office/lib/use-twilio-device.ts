'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, Device } from '@twilio/voice-sdk';

export type TwilioCallStatus = 'idle' | 'ready' | 'connecting' | 'in-call' | 'error';

export interface UseTwilioDeviceReturn {
  callStatus: TwilioCallStatus;
  callSid:    string | null;
  muted:      boolean;
  error:      string | null;
  connect:      (toPhone: string, agentName?: string) => Promise<void>;
  hangUp:       () => void;
  toggleMute:   () => void;
}

export function useTwilioDevice(): UseTwilioDeviceReturn {
  const deviceRef = useRef<Device | null>(null);
  const callRef   = useRef<Call | null>(null);

  const [callStatus, setCallStatus] = useState<TwilioCallStatus>('idle');
  const [callSid,    setCallSid]    = useState<string | null>(null);
  const [muted,      setMuted]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);

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

      const device = await getOrCreateDevice();
      const call   = await device.connect({ params: { To: toPhone, AgentName: agentName ?? '' } });
      callRef.current = call;

      call.on('accept',     () => {
        setCallStatus('in-call');
        setCallSid((call.parameters as Record<string, string>).CallSid ?? null);
      });
      call.on('disconnect', () => { setCallStatus('ready'); setMuted(false); setCallSid(null); callRef.current = null; });
      call.on('error',      (err: Error) => { setError(err.message); setCallStatus('ready'); callRef.current = null; });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setCallStatus('ready');
    }
  }, [getOrCreateDevice]);

  const hangUp = useCallback(() => {
    callRef.current?.disconnect();
    callRef.current = null;
    setCallStatus('ready');
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }, [muted]);

  useEffect(() => {
    return () => {
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
    };
  }, []);

  return { callStatus, callSid, muted, error, connect, hangUp, toggleMute };
}
