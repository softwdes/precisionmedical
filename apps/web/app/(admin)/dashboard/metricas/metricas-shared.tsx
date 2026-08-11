'use client';

/**
 * Átomos compartidos de los tabs de Métricas (Empleados, Doctores):
 * el KPI card local del módulo, el manejo de período en días de
 * America/Denver y los formateadores de tiempo.
 */

import { cn } from '@precision/ui';

// ─── Período ─────────────────────────────────────────────────────────────────

export type Preset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'custom';

export const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: 'today',     label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: 'last7',     label: 'Últimos 7 días' },
  { key: 'thisMonth', label: 'Este mes' },
  { key: 'custom',    label: 'Rango' },
];

/** Día actual (o desplazado) en America/Denver como YYYY-MM-DD. */
export function denverDay(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

/** from/to para un preset (hoy si es custom, que no cambia nada). */
export function presetRange(p: Preset): { from: string; to: string } | null {
  const today = denverDay();
  switch (p) {
    case 'today':     return { from: today, to: today };
    case 'yesterday': { const y = denverDay(-1); return { from: y, to: y }; }
    case 'last7':     return { from: denverDay(-6), to: today };
    case 'thisMonth': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'custom':    return null;
  }
}

// ─── Formato ─────────────────────────────────────────────────────────────────

export function fmtMinutes(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtSeconds(sec: number): string {
  if (sec <= 0) return '—';
  if (sec < 60) return `${sec}s`;
  return fmtMinutes(Math.round(sec / 60));
}

/** Hora local de la clínica para un timestamp de la DB (UTC sin sufijo). */
export function fmtClinicTime(iso: string | null): string {
  if (!iso) return '—';
  const utc = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  return new Date(utc).toLocaleTimeString('es-US', {
    timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtClinicDate(iso: string | null): string {
  if (!iso) return '—';
  const utc = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  return new Date(utc).toLocaleDateString('es-US', {
    timeZone: 'America/Denver', month: 'short', day: 'numeric',
  });
}

/** Segundos entre dos timestamps de la DB; null si falta alguno. */
export function elapsedSeconds(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const norm = (s: string) => (s.endsWith('Z') || s.includes('+') ? s : s + 'Z');
  const d = (new Date(norm(toIso)).getTime() - new Date(norm(fromIso)).getTime()) / 1000;
  return d > 0 ? Math.round(d) : null;
}

// ─── Átomos visuales ─────────────────────────────────────────────────────────

export function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{label}</span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-text-1 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-text-3 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export function Num({ value }: { value: number }) {
  return value > 0
    ? <span className="font-mono tabular-nums text-text-1">{value}</span>
    : <span className="font-mono tabular-nums text-text-3">0</span>;
}

/** Selector de período (presets + rango libre) compartido por los tabs. */
export function PeriodFilter({ preset, from, to, onPreset, onFrom, onTo }: {
  preset: Preset; from: string; to: string;
  onPreset: (p: Preset) => void; onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              preset === p.key ? 'bg-brand text-white' : 'text-text-3 hover:text-text-1',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date" value={from} max={to}
            onChange={(e) => onFrom(e.target.value)}
            className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-text-1 focus:outline-none focus:border-brand/50"
          />
          <span className="text-text-3 text-xs">→</span>
          <input
            type="date" value={to} min={from} max={denverDay()}
            onChange={(e) => onTo(e.target.value)}
            className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-text-1 focus:outline-none focus:border-brand/50"
          />
        </div>
      )}
    </>
  );
}
