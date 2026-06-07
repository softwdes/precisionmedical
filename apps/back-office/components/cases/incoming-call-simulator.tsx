'use client';

import { useState, useEffect, useRef } from 'react';
import { PhoneIncoming, X, Phone, User, Sparkles } from 'lucide-react';
import { Button } from '@precision/ui';
import { TagPill, PersonAvatar } from '@/components/ui-phoenix';

/**
 * IncomingCallSimulator — DEV-only · simula el pop-up de Weave Phase 2.
 *
 * Phase 1A: el encargado hace click en "Simular llamada entrante" y aparece
 * un toast fixed top-right como si Weave hubiera detectado la llamada.
 * 50% chance: caller ID match con paciente existente (de samplePatients)
 * 50% chance: número desconocido (paciente nuevo)
 *
 * Phase 2: se reemplaza por WebSocket/SSE escuchando el webhook real de Weave.
 * El componente del Toast queda igual · cambia solo el origen del evento.
 *
 * Comportamiento del toast:
 *  - Aparece arriba-derecha con animate-slide-in-right (del preset)
 *  - Ringing visual con dot pulse
 *  - Auto-dismiss después de 12s (simula llamada perdida)
 *  - Click "Contestar" → invoca onAnswer(callData) que abre B.2 prellenado
 *  - Click X → dismiss inmediato
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
const FIRST_NAMES_UNKNOWN = ['Robert', 'Patricia', 'James', 'Jennifer', 'Michael'];
const LAST_NAMES_UNKNOWN = ['Walker', 'Hall', 'Allen', 'Wright', 'King'];

export function IncomingCallSimulator({
  samplePatients,
  onAnswer,
}: {
  samplePatients: SamplePatient[];
  onAnswer: (call: IncomingCallData) => void;
}) {
  const triggerSimulation = () => {
    // 60% paciente existente · 40% número desconocido (más visible el caso common)
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
    // Dispara la notificación global
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

/**
 * IncomingCallToast — la notificación tipo pop-up que se monta en el shell.
 *
 * Escucha el CustomEvent 'incoming-call-simulator' (en Phase 1A) o el
 * WebSocket de Weave (en Phase 2 · TODO). Cuando llega un evento, renderiza
 * el banner arriba-derecha por 12s o hasta acción del usuario.
 */
export function IncomingCallToast({ onAnswer }: { onAnswer: (call: IncomingCallData) => void }) {
  const [activeCall, setActiveCall] = useState<IncomingCallData | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for simulator events (Phase 1A) · Phase 2 será WebSocket
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<IncomingCallData>).detail;
      setActiveCall(detail);
      setElapsedSec(0);
      // Auto-dismiss después de 12s (simula llamada perdida)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => setActiveCall(null), 12000);
    };
    window.addEventListener('incoming-call-simulator', handler);
    return () => window.removeEventListener('incoming-call-simulator', handler);
  }, []);

  // Ringing timer · cuenta los segundos visibles
  useEffect(() => {
    if (!activeCall) return;
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - activeCall.ringingSince) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall]);

  const handleAnswer = () => {
    if (!activeCall) return;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    onAnswer(activeCall);
    setActiveCall(null);
  };

  const handleDismiss = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setActiveCall(null);
  };

  if (!activeCall) return null;

  const displayName = activeCall.patient
    ? `${activeCall.patient.firstName} ${activeCall.patient.lastName}`
    : 'Número desconocido';

  return (
    <div
      className="fixed top-16 right-4 z-50 w-[calc(100vw-2rem)] sm:w-[360px] animate-slide-in-right"
      role="alert"
      aria-live="assertive"
    >
      <div className="rounded-lg border border-emerald/40 bg-bg-1 shadow-xl overflow-hidden">
        {/* Header con ringing pulse */}
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald/10 border-b border-emerald/30">
          <PhoneIncoming className="w-4 h-4 text-emerald animate-pulse" />
          <span className="text-emerald text-[10px] uppercase tracking-wider font-bold">
            Llamada entrante · {elapsedSec}s
          </span>
          <TagPill label="DEV · simulado" colorClass="bg-amber/15 text-amber border-amber/30" compact />
          <button
            type="button"
            onClick={handleDismiss}
            className="ml-auto text-text-muted hover:text-rose w-6 h-6 flex items-center justify-center rounded transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body · caller ID */}
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
              <div className="text-text-muted text-[10px] italic mt-1">Sin match en pacientes · número nuevo</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-2.5 border-t border-border flex gap-2">
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

// ─── Helpers ────────────────────────────────────────────────────────────

function generateRandomPhone(): string {
  const area = RANDOM_AREA_CODES[Math.floor(Math.random() * RANDOM_AREA_CODES.length)];
  const prefix = String(100 + Math.floor(Math.random() * 900));
  const line = String(1000 + Math.floor(Math.random() * 9000));
  return `+1-${area}-555-${line.slice(0, 4)}`;
}
