'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, Device } from '@twilio/voice-sdk';

export type TwilioDeviceStatus = 'idle' | 'ready' | 'connecting' | 'in-call' | 'error';

export interface UseTwilioDeviceReturn {
  status: TwilioDeviceStatus;
  muted: boolean;
  connect: (toPhone: string) => Promise<void>;
  hangUp: () => void;
  toggleMute: () => void;
  error: string | null;
}

export function useTwilioDevice(): UseTwilioDeviceReturn {
  const deviceRef = useRef<Device | null>(null);
  const callRef   = useRef<Call | null>(null);

  const [status, setStatus] = useState<TwilioDeviceStatus>('idle');
  const [muted,  setMuted]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Initialize device on first use
  const ensureDevice = useCallback(async (): Promise<Device> => {
    if (deviceRef.current) return deviceRef.current;

    const { Device: TwilioDevice } = await import('@twilio/voice-sdk');

    const res   = await fetch('/api/twilio/token', { method: 'POST' });
    const { token } = await res.json() as { token: string };

    const device = new TwilioDevice(token, { logLevel: 1 });

    device.on('error', (err: Error) => {
      console.error('[TwilioDevice] error', err);
      setError(err.message);
      setStatus('error');
    });

    device.on('tokenWillExpire', async () => {
      const r = await fetch('/api/twilio/token', { method: 'POST' });
      const { token: fresh } = await r.json() as { token: string };
      device.updateToken(fresh);
    });

    await device.register();
    deviceRef.current = device;
    setStatus('ready');
    return device;
  }, []);

  const connect = useCallback(async (toPhone: string) => {
    try {
      setStatus('connecting');
      setError(null);
      const device = await ensureDevice();

      const call = await device.connect({ params: { To: toPhone } });
      callRef.current = call;

      call.on('accept',     () => setStatus('in-call'));
      call.on('disconnect', () => { setStatus('ready'); setMuted(false); callRef.current = null; });
      call.on('error',      (err: Error) => { setError(err.message); setStatus('ready'); callRef.current = null; });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
      setStatus('ready');
    }
  }, [ensureDevice]);

  const hangUp = useCallback(() => {
    callRef.current?.disconnect();
    callRef.current = null;
    setStatus('ready');
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }, [muted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
    };
  }, []);

  return { status, muted, connect, hangUp, toggleMute, error };
}
