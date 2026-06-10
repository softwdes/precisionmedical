/**
 * KpiCard — Tarjeta de métrica con label, número grande y sub-texto.
 *
 * Patrón canónico para grid de 2x2 (mobile) / 4-col (desktop) en cada pantalla.
 *
 * Uso:
 *   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 *     <KpiCard label="Total"    value={42} sub="Catálogo"     color="text-text-1" />
 *     <KpiCard label="Activos"  value={38} sub="ACTIVE state" color="text-emerald" />
 *   </div>
 */

import * as React from 'react';

export interface KpiCardProps {
  label: string;
  value: number | string;
  sub?: React.ReactNode;
  /** Clase Tailwind para color del número grande. Ej: "text-emerald", "text-rose", "text-brand". */
  color?: string;
  /** Número más pequeño + menos padding — para vistas con muchos KPIs. */
  compact?: boolean;
}

export function KpiCard({ label, value, sub, color = 'text-text-1', compact = false }: KpiCardProps) {
  return (
    <div className={`rounded-lg border border-border bg-bg-1 ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
        {label}
      </div>
      <div className={`font-bold mt-0.5 ${color} ${compact ? 'text-2xl' : 'text-3xl'}`}>{value}</div>
      {sub && (
        <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>
      )}
    </div>
  );
}
