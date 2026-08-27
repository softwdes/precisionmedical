'use client';

/**
 * VisitFilter — un solo selector de visita para todo el caso.
 *
 * Los tabs clínicos ya agrupan por visita, y con 4 visitas eso se lee bien. Pero
 * medido sobre los casos reales: mediana 4, p90 12, máximo 40 — y 463 casos con
 * 10 o más. A esa escala, buscar "qué pasó el 5 de agosto" es scrollear.
 *
 * Por qué UNO y no uno por tab: "qué pasó el 5 de agosto" es una pregunta de la
 * VISITA, no del tab. Con un filtro por tab había que volver a elegir la fecha
 * en cada uno — tres controles para una sola pregunta. Este se elige una vez y
 * aplica a Labs, Recetas, Servicios, Férulas y Finanzas.
 *
 * Solo aparece con 2+ visitas: con una sola, un filtro es ruido.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays } from 'lucide-react';

export interface VisitOption {
  appointmentId: string;
  scheduledFor: string;
  providerName: string | null;
}

export function VisitFilter({ visits, value, onChange }: {
  visits: VisitOption[];
  /** null = todas las visitas */
  value: string | null;
  onChange: (visitId: string | null) => void;
}): React.ReactElement | null {
  const t = useTranslations('phoenix.caseTabs.clinical');

  if (visits.length < 2) return null;

  const etiqueta = (v: VisitOption): string => {
    const fecha = new Date(v.scheduledFor).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Denver',
    });
    return v.providerName ? `${fecha} · ${v.providerName}` : fecha;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <CalendarDays className="w-3.5 h-3.5 text-text-muted shrink-0" />
      <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
        {t('visitFilterLabel')}
      </span>
      {/* Un select y no chips: con 3 visitas los chips son más rápidos, pero con
          24 no caben. El select se comporta igual en cualquier caso. */}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 rounded-md bg-bg-2 px-2 pr-7 text-[12.5px] text-text-1 outline-none focus:ring-1 focus:ring-brand/40"
      >
        <option value="">{t('visitFilterAll', { count: visits.length })}</option>
        {visits.map((v) => (
          <option key={v.appointmentId} value={v.appointmentId}>{etiqueta(v)}</option>
        ))}
      </select>
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[11.5px] font-semibold text-brand-text hover:underline"
        >
          {t('visitFilterClear')}
        </button>
      )}
    </div>
  );
}
