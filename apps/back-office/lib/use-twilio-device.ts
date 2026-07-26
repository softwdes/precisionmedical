'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, Device } from '@twilio/voice-sdk';

export type TwilioCallStatus = 'idle' | 'ready' | 'connecting' | 'in-call' | 'error';

export interface UseTwilioDeviceReturn {
  callStatus:  TwilioCallStatus;
  muted:       boolean;
  error:       string | null;
  isMockMode:  boolean;
  connect:     (toPhone: string) => Promise<void>;
  hangUp:      () => void;
  toggleMute:  () => void;
}

// ── Mock mode ─────────────────────────────────────────────────────────────────
// Mock mode: set NEXT_PUBLIC_TWILIO_MOCK=true in .env.local to simulate calls locally.
// In production (Vercel), leave unset → real Twilio credentials are used.
const MOCK_MODE = process.env.NEXT_PUBLIC_TWILIO_MOCK === 'true';
const MOCK_CONNECT_DELAY_MS = 3000;

export function useTwilioDevice(): UseTwilioDeviceReturn {
  const deviceRef  = useRef<Device | null>(null);
  const callRef    = useRef<Call | null>(null);
  const mockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [callStatus, setCallStatus] = useState<TwilioCallStatus>('idle');
  const [muted,      setMuted]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── Mock implementation ──────────────────────────────────────────────────
  const connectMock = useCallback(async (_toPhone: string) => {
    setCallStatus('connecting');
    setError(null);
    setMuted(false);
    mockTimerRef.current = setTimeout(() => {
      setCallStatus('in-call');
    }, MOCK_CONNECT_DELAY_MS);
  }, []);

  const hangUpMock = useCallback(() => {
    if (mockTimerRef.current) {
      clearTimeout(mockTimerRef.current);
      mockTimerRef.current = null;
    }
    setCallStatus('idle');
    setMuted(false);
  }, []);

  const toggleMuteMock = useCallback(() => {
    setMuted(prev => !prev);
  }, []);

  // ── Real Twilio implementation ────────────────────────────────────────────
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
      const r = await fetch('/api/twilio/token', { method: 'POST' });
      const { token: fresh } = await r.json() as { token: string };
      device.updateToken(fresh);
    });

    await device.register();
    deviceRef.current = device;
    return device;
  }, []);

  const connectReal = useCallback(async (toPhone: string) => {
    try {
      setCallStatus('connecting');
      setError(null);
      setMuted(false);

      const device = await getOrCreateDevice();
      const call   = await device.connect({ params: { To: toPhone } });
      callRef.current = call;

      call.on('accept',     () => setCallStatus('in-call'));
      call.on('disconnect', () => { setCallStatus('ready'); setMuted(false); callRef.current = null; });
      call.on('error',      (err: Error) => { setError(err.message); setCallStatus('ready'); callRef.current = null; });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setCallStatus('ready');
    }
  }, [getOrCreateDevice]);

  const hangUpReal = useCallback(() => {
    callRef.current?.disconnect();
    callRef.current = null;
    setCallStatus('ready');
    setMuted(false);
  }, []);

  const toggleMuteReal = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }, [muted]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (mockTimerRef.current) clearTimeout(mockTimerRef.current);
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
    };
  }, []);

  // ── Route to mock or real ─────────────────────────────────────────────────
  if (MOCK_MODE) {
    return {
      callStatus,
      muted,
      error,
      isMockMode: true,
      connect:     connectMock,
      hangUp:      hangUpMock,
      toggleMute:  toggleMuteMock,
    };
  }

  return {
    callStatus,
    muted,
    error,
    isMockMode: false,
    connect:    connectReal,
    hangUp:     hangUpReal,
    toggleMute: toggleMuteReal,
  };
}
