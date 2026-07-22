/**
 * StatusPill — Pill chiquito con dot + label.
 *
 * 6 estados predefinidos. Si necesitás colores custom, usá <TagPill> en su lugar.
 *
 * Estados:
 *   - active / success → emerald
 *   - inactive         → muted
 *   - warning          → amber
 *   - info             → cyan
 *   - danger           → rose
 *   - neutral          → muted (sin dot)
 *
 * Uso:
 *   <StatusPill state="active" label="Activa" />
 *   <StatusPill state="warning" label="Pago lento" />
 */

import * as React from 'react';

export type StatusState = 'active' | 'inactive' | 'warning' | 'info' | 'danger' | 'success' | 'neutral';

export interface StatusPillProps {
  state: StatusState;
  label: React.ReactNode;
  /** Mostrar dot a la izquierda (default true para todos menos neutral) */
  showDot?: boolean;
  /** Icono lucide opcional a la izquierda (reemplaza el dot) */
  icon?: React.ReactNode;
}

const STATE_STYLES: Record<StatusState, { bg: string; dot: string }> = {
  active:   { bg: 'bg-emerald/15 text-emerald border-emerald/30',  dot: 'bg-emerald' },
  success:  { bg: 'bg-emerald/15 text-emerald border-emerald/30',  dot: 'bg-emerald' },
  inactive: { bg: 'bg-white/5 text-text-muted border-border',      dot: 'bg-text-muted' },
  warning:  { bg: 'bg-amber/15 text-amber border-amber/30',        dot: 'bg-amber' },
  info:     { bg: 'bg-cyan/15 text-cyan border-cyan/30',           dot: 'bg-cyan' },
  danger:   { bg: 'bg-rose/15 text-rose border-rose/30',           dot: 'bg-rose' },
  neutral:  { bg: 'bg-white/5 text-text-2 border-border',          dot: 'bg-text-muted' },
};

export function StatusPill({ state, label, showDot, icon }: StatusPillProps) {
  const styles = STATE_STYLES[state];
  const wantsDot = showDot ?? (state !== 'neutral' && !icon);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${styles.bg}`}>
      {icon
        ? icon
        : wantsDot
          ? <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
          : null}
      {label}
    </span>
  );
}

/**
 * TagPill — versión libre con colores custom por dominio.
 * Usar cuando el set de estados no encaja en los 6 predefinidos
 * (ej: workflow types MVA/GM/SELFPAY, insurance types PIP/MED_PAY, ICD chapters).
 */
export interface TagPillProps {
  label: React.ReactNode;
  /** Clases tailwind para bg+text+border, ej: "bg-rose/15 text-rose border-rose/30" */
  colorClass: string;
  /** Si querés `font-mono` (códigos, types) */
  mono?: boolean;
  /** Padding compact (px-1.5 py-0.5) para tags en celdas chiquitas */
  compact?: boolean;
  icon?: React.ReactNode;
}

export function TagPill({ label, colorClass, mono, compact, icon }: TagPillProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${compact ? 'px-1.5 py-0.5 rounded' : 'px-2 py-0.5 rounded-md'} text-[10px] font-semibold ${mono ? 'font-mono' : ''} border ${colorClass}`}>
      {icon}
      {label}
    </span>
  );
}
