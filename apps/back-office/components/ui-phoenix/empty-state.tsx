/**
 * EmptyState — Cuando una tabla/lista está vacía.
 *
 * Dos variantes:
 *   - inline: una sola línea, para usar dentro de <tbody><tr><td>
 *   - rich:   bloque con icono grande + título + sub, para vistas tipo card
 *
 * Uso (inline en tabla):
 *   {filtered.length === 0 ? (
 *     <tr><td colSpan={6}><EmptyState.Inline message={search ? `Sin resultados para "${search}"` : 'Sin registros aún'} /></td></tr>
 *   ) : ...}
 *
 * Uso (rich, fuera de tabla):
 *   {filtered.length === 0 ? (
 *     <EmptyState.Rich icon={FileText} title="No hay casos en esta cola" subtitle="Buen trabajo. Cuando entre una llamada, click Nueva." />
 *   ) : ...}
 */

import * as React from 'react';

function Inline({ message }: { message: React.ReactNode }) {
  return (
    <div className="text-center py-12 text-text-muted text-sm">
      {message}
    </div>
  );
}

function Rich({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-bg-1/50 p-12 text-center">
      <Icon className="w-12 h-12 text-text-muted mx-auto mb-3" />
      <div className="text-text-1 font-semibold">{title}</div>
      {subtitle && (
        <div className="text-text-2 text-sm mt-1">{subtitle}</div>
      )}
    </div>
  );
}

export const EmptyState = { Inline, Rich };
