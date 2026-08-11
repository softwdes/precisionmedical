/**
 * KpiCard — Tarjeta de métrica con label, número grande y sub-texto.
 * Soporta ícono decorativo opcional (flotante a la derecha).
 *
 * Uso básico:
 *   <KpiCard label="Total" value={42} sub="En catálogo" color="text-text-1" />
 *
 * Con ícono:
 *   <KpiCard label="Activos" value={38} color="text-emerald"
 *     icon={CheckCircle} iconBg="bg-emerald/10" iconColor="text-emerald" />
 */

import * as React from 'react';

export interface KpiCardProps {
  label: string;
  value: number | string;
  sub?: React.ReactNode;
  /** Clase Tailwind para color del número grande. Ej: "text-emerald", "text-rose", "text-brand-text". */
  color?: string;
  /** Número más pequeño + menos padding — para vistas con muchos KPIs. */
  compact?: boolean;
  /** Ícono decorativo (componente Lucide). */
  icon?: React.ElementType;
  /** Bg del bubble del ícono. Ej: "bg-emerald/10" */
  iconBg?: string;
  /** Color del ícono. Ej: "text-emerald" */
  iconColor?: string;
}

export function KpiCard({
  label,
  value,
  sub,
  color = 'text-text-1',
  compact = false,
  icon: Icon,
  iconBg = 'bg-bg-2',
  iconColor = 'text-text-muted',
}: KpiCardProps) {
  return (
    <div className={`rounded-lg border border-border bg-bg-1 flex items-center justify-between ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
          {label}
        </div>
        <div className={`font-bold mt-0.5 ${color} ${compact ? 'text-2xl' : 'text-3xl'}`}>{value}</div>
        {sub && (
          <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>
        )}
      </div>
      {Icon && (
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ml-3 ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      )}
    </div>
  );
}
