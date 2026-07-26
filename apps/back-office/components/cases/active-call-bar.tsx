'use client';

import { Mic, MicOff, PhoneOff, Loader2 } from 'lucide-react';
import { cn } from '@precision/ui';

interface ActiveCallBarProps {
  status:      'connecting' | 'in-call';
  patientName: string;
  phone:       string;
  elapsed:     number;
  muted:       boolean;
  onMuteToggle: () => void;
  onHangUp:     () => void;
}

function fmtElapsed(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function ActiveCallBar({
  status, patientName, phone, elapsed, muted, onMuteToggle, onHangUp,
}: ActiveCallBarProps) {
  const connecting = status === 'connecting';

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm',
      connecting
        ? 'bg-amber/10 border-amber/30'
        : 'bg-emerald/10 border-emerald/30',
    )}>
      {connecting ? (
        <Loader2 className="w-3.5 h-3.5 text-amber animate-spin flex-shrink-0" />
      ) : (
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald opacity-60" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald" />
        </span>
      )}

      <div className="flex-1 min-w-0">
        <span className="font-semibold text-text-1 truncate">{patientName}</span>
        <span className="text-text-muted ml-2 font-mono text-[11px]">{phone}</span>
      </div>

      {connecting ? (
        <span className="text-[11px] text-amber flex-shrink-0">Conectando…</span>
      ) : (
        <span className="font-mono text-[13px] font-semibold tabular-nums text-emerald flex-shrink-0">
          {fmtElapsed(elapsed)}
        </span>
      )}

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={onMuteToggle}
          disabled={connecting}
          title={muted ? 'Quitar silencio' : 'Silenciar'}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-md transition-colors',
            muted
              ? 'bg-amber/20 text-amber hover:bg-amber/30'
              : 'bg-white/5 text-text-2 hover:bg-white/10',
            connecting && 'opacity-40 cursor-not-allowed',
          )}
        >
          {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={onHangUp}
          title="Colgar"
          className="flex items-center justify-center w-7 h-7 rounded-md bg-rose/15 text-rose hover:bg-rose/25 transition-colors"
        >
          <PhoneOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
