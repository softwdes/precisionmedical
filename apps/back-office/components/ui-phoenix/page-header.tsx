/**
 * PageHeader — h1 + subtitle + optional action button.
 *
 * Patrón canónico para todas las pantallas de catálogo y listas del back-office.
 * Match exacto con el estilo de B.36 Specialties (referencia).
 *
 * Uso:
 *   <PageHeader
 *     title="Aseguradoras"
 *     subtitle="3 PIP · 2 Med Pay · 5 activas"
 *     action={<Button onClick={onNew}><Plus className="w-4 h-4 mr-1" />Nueva</Button>}
 *   />
 */

import * as React from 'react';

export interface PageHeaderProps {
  /** Texto simple o JSX (avatar + nombre, etc) */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Botón principal (típicamente "Nuevo X" con icono Plus) */
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold text-text-1">{title}</h1>
        {subtitle && (
          <p className="text-text-2 text-sm mt-1">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
