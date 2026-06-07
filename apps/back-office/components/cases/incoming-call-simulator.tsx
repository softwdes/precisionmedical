'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneIncoming, X, Phone, User, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@precision/ui';
import { TagPill, PersonAvatar } from '@/components/ui-phoenix';

/**
 * IncomingCallSimulator — DEV-only · simula el pop-up de Weave Phase 2.
 *
 * Phase 1A: el encargado hace click en "Simular llamada entrante" y aparece
 * un toast fixed top-right como si Weave hubiera detectado la llamada.
 * 60% chance: caller ID match con paciente existente (de samplePatients)
 * 40% chance: número desconocido (paciente nuevo)
 *
 * Phase 2: se reemplaza por WebSocket/SSE escuchando el webhook real de Weave.
 * El componente del Toast queda igual · cambia solo el origen del evento.
 *
 * Comportamiento del toast:
 *  - Aparece arriba-derecha con animate-slide-in-right
 *  - Ringing visual con dot pulse + tono de llamada (Web Audio API)
 *  - Auto-dismiss después de 12s (simula llamada perdida)
 *  - Click "Contestar" → invoca onAnswer(callData) que abre B.2 prellenado
 *  - Click X → dismiss inmediato
 *  - Botón 🔇 → mute del tono sin dismissar
 */

export interface IncomingCallData {
  /** Número del que llama (real o random simulado) */
  phone: string;
  /** Si caller ID matchea un paciente del DB */
  patient: {
    id: string;
    patientCode: string;
    firstName: string;
    lastName: string;
    email: string | null;
    casesCount: number;
  } | null;
  /** Momento en que arrancó la llamada (para timer) */
  ringingSince: number;
}

interface SamplePatient {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  casesCount: number;
}

const RANDOM_AREA_CODES = ['801', '385', '435'];

// ─── Ringtone Hook ───────────────────────────────────────────────────────────

/**
 * useRingtone — tono de llamada entrante via Web Audio API.
 *
 * Genera 440Hz + 480Hz mezclados (señal estándar de teléfono US).
 * Patrón: 1.5s ring / 2s silencio · se repite hasta que isRinging = false.
 *
 * Maneja autoplay policy del browser: llama ctx.resume() en el primer ring.
 * Silencioso si Web Audio no está disponible (server-side / browsers viejos).
 */
function useRingtone(isRinging: boolean) {
  useEffect(() => {
    if (!isRinging) return;
    if (typeof window === 'undefined') return;

    // Guard: algunos browsers no tienen AudioContext
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let ctx: AudioContext;

    try {
      ctx = new AudioCtx();
    } catch {
      return; // AudioContext bloqueado por política del browser
    }

    // Resume en caso de autoplay policy (Chrome suspende hasta gesto)
    ctx.resume().catch(() => {});

    function ringOnce() {
      if (stopped || ctx.state === 'closed') return;

      // Gain: fade-in rápido → sostenido → fade-out
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.04); // volumen moderado
      gain.gain.setValueAtTime(0.07, ctx.currentTime + 1.38);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);

      // Dos osciladores mezclados = timbre de teléfono clásico
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 440; // LA4 — componente bajo del ring US
      osc2.frequency.value = 480; // RE5 — componente alto del ring US
      osc1.connect(gain);
      osc2.connect(gain);
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 1.5);
      osc2.stop(ctx.currentTime + 1.5);

      // 1.5s ring + 2s silencio = ciclo de 3.5s
      timeoutId = setTimeout(ringOnce, 3500);
    }

    ringOnce();

    return () => {
      stopped = true;
      clearTimeout(timeoutId);
      ctx.close().catch(() => {});
    };
  }, [isRinging]);
}

// ─── Simulator button (DEV) ──────────────────────────────────────────────────

export function IncomingCallSimulator({
  samplePatients,
  onAnswer,
}: {
  samplePatients: SamplePatient[];
  onAnswer: (call: IncomingCallData) => void;
}) {
  const triggerSimulation = () => {
    // 60% paciente existente · 40% número desconocido
    const useExisting = Math.random() < 0.6 && samplePatients.length > 0;

    let call: IncomingCallData;
    if (useExisting) {
      const p = samplePatients[Math.floor(Math.random() * samplePatients.length)];
      call = {
        phone: p.phone ?? generateRandomPhone(),
        patient: {
          id: p.id,
          patientCode: p.patientCode,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          casesCount: p.casesCount,
        },
        ringingSince: Date.now(),
      };
    } else {
      call = {
        phone: generateRandomPhone(),
        patient: null,
        ringingSince: Date.now(),
      };
    }

    window.dispatchEvent(new CustomEvent('incoming-call-simulator', { detail: call }));
  };

  return (
    <Button
      variant="outline"
      onClick={triggerSimulation}
      title="DEV · simula el pop-up de Weave Phase 2"
      className="shrink-0"
    >
      <Sparkles className="w-3.5 h-3.5 mr-1 text-amber" />
      <span className="hidden sm:inline">Simular llamada entrante</span>
      <span className="sm:hidden">Simular</span>
    </Button>
  );
}

// ─── Toast de llamada entrante ────────────────────────────────────────────────

/**
 * IncomingCallToast — banner fixed top-right cuando entra una llamada.
 *
 * Escucha CustomEvent 'incoming-call-simulator' (Phase 1A) o WebSocket de
 * Weave (Phase 2 · TODO). Incluye:
 *   - Tono de llamada (Web Audio · 440Hz + 480Hz)
 *   - Botón 🔇 para silenciar sin dismissar
 *   - Auto-dismiss a los 12s
 */
export function IncomingCallToast({ onAnswer }: { onAnswer: (call: IncomingCallData) => void }) {
  const [activeCall, setActiveCall] = useState<IncomingCallData | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🔔 Tono · suena mientras hay llamada activa Y no está muteada
  useRingtone(!!activeCall && !isMuted);

  // Escucha eventos del simulator (Phase 1A) · Phase 2 será WebSocket
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<IncomingCallData>).detail;
      setActiveCall(detail);
      setElapsedSec(0);
      setIsMuted(false); // reset mute para cada llamada nueva

      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => setActiveCall(null), 12000);
    };
    window.addEventListener('incoming-call-simulator', handler);
    return () => window.removeEventListener('incoming-call-simulator', handler);
  }, []);

  // Contador de segundos visible en el header
  useEffect(() => {
    if (!activeCall) return;
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - activeCall.ringingSince) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall]);

  const handleAnswer = useCallback(() => {
    if (!activeCall) return;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    onAnswer(activeCall);
    setActiveCall(null);
  }, [activeCall, onAnswer]);

  const handleDismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setActiveCall(null);
  }, []);

  if (!activeCall) return null;

  const displayName = activeCall.patient
    ? `${activeCall.patient.firstName} ${activeCall.patient.lastName}`
    : 'Número desconocido';

  return (
    <div
      key={activeCall.ringingSince}
      className="fixed top-16 right-4 z-50 w-[calc(100vw-2rem)] sm:w-[360px] animate-slide-in-right"
      role="alert"
      aria-live="assertive"
    >
      <div className="rounded-lg border border-emerald/40 bg-bg-1 shadow-xl overflow-hidden">

        {/* Header — ringing pulse + timer + controles */}
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald/10 border-b border-emerald/30">
          <PhoneIncoming className="w-4 h-4 text-emerald animate-pulse shrink-0" />
          <span className="text-emerald text-[10px] uppercase tracking-wider font-bold flex-1">
            Llamada entrante · {elapsedSec}s
          </span>
          <TagPill label="DEV · simulado" colorClass="bg-amber/15 text-amber border-amber/30" compact />

          {/* Mute toggle */}
          <button
            type="button"
            onClick={() => setIsMuted(m => !m)}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
              isMuted
                ? 'text-rose hover:text-rose/80'
                : 'text-text-muted hover:text-text-1'
            }`}
            aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
            title={isMuted ? 'Activar sonido' : 'Silenciar tono'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Dismiss */}
          <button
            type="button"
            onClick={handleDismiss}
            className="text-text-muted hover:text-rose w-6 h-6 flex items-center justify-center rounded transition-colors"
            aria-label="Ignorar llamada"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body — caller ID */}
        <div className="px-4 py-3 flex items-center gap-3">
          {activeCall.patient ? (
            <PersonAvatar
              firstName={activeCall.patient.firstName}
              lastName={activeCall.patient.lastName}
              size={10}
              gradientClass="bg-gradient-brand"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-bg-2 border border-border flex items-center justify-center text-text-muted shrink-0">
              <User className="w-5 h-5" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="text-text-1 font-semibold text-sm truncate">{displayName}</div>
            <div className="text-text-muted text-[11px] font-mono mt-0.5 flex items-center gap-1">
              <Phone className="w-3 h-3" /> {activeCall.phone}
            </div>
            {activeCall.patient && activeCall.patient.casesCount > 0 && (
              <div className="text-text-muted text-[10px] mt-1">
                <code className="font-mono">{activeCall.patient.patientCode}</code>
                {' · '}
                {activeCall.patient.casesCount} caso{activeCall.patient.casesCount > 1 ? 's' : ''} previo{activeCall.patient.casesCount > 1 ? 's' : ''}
              </div>
            )}
            {!activeCall.patient && (
              <div className="text-text-muted text-[10px] italic mt-1">
                Sin match en pacientes · número nuevo
              </div>
            )}
          </div>
        </div>

        {/* Barra de progreso de auto-dismiss — se agota en 12s */}
        <div className="h-0.5 bg-bg-2 mx-4 mb-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald/50 rounded-full"
            style={{ animation: 'phone-dismiss 12s linear forwards' }}
          />
        </div>

        {/* Actions */}
        <div className="px-4 pb-3 flex gap-2">
          <Button variant="outline" onClick={handleDismiss} className="flex-1" size="sm">
            Ignorar
          </Button>
          <Button onClick={handleAnswer} className="flex-1" size="sm">
            <PhoneIncoming className="w-3.5 h-3.5 mr-1" />
            Contestar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRandomPhone(): string {
  const area = RANDOM_AREA_CODES[Math.floor(Math.random() * RANDOM_AREA_CODES.length)];
  const prefix = String(100 + Math.floor(Math.random() * 900));
  const line = String(1000 + Math.floor(Math.random() * 9000));
  return `+1-${area}-${prefix}-${line.slice(0, 4)}`;
}
