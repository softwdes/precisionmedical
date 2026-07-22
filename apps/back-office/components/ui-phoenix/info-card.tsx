/**
 * InfoCard — sección con título uppercase + icon brand + children.
 *
 * Patrón canónico para agrupar info en pantallas de detalle y modales largos.
 * Match con el estilo del case-detail-client (apps/web admin).
 *
 * Uso:
 *   <InfoCard title="Accidente" icon={Calendar}>
 *     <InfoRow label="DOL" value="..." />
 *   </InfoCard>
 *
 * Para variant con número (modales numerados B.2 style):
 *   <InfoCard title="Datos del paciente" icon={User} number={1} />
 *
 * Para acentos visuales (alerta amber, danger rose, success emerald):
 *   <InfoCard title="Abogado" icon={Scale} tone="rose" />
 *   Pero úsalo con cuidado · si todo es acento, nada destaca.
 */

import * as React from 'react';

type Tone = 'default' | 'brand' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet';

const TONE_BORDER: Record<Tone, string> = {
  default: 'border-border',
  brand:   'border-brand/25',
  cyan:    'border-cyan/25',
  emerald: 'border-emerald/25',
  amber:   'border-amber/25',
  rose:    'border-rose/25',
  violet:  'border-violet/25',
};

const TONE_ICON: Record<Tone, string> = {
  default: 'text-brand',
  brand:   'text-brand',
  cyan:    'text-cyan',
  emerald: 'text-emerald',
  amber:   'text-amber',
  rose:    'text-rose',
  violet:  'text-violet',
};

// Background MUY sutil del tono · diferencia visual sin saturar
// (regla #0: no gradients agresivos · solo accent suave por intención)
const TONE_BG: Record<Tone, string> = {
  default: 'bg-bg-1',
  brand:   'bg-brand/[0.04]',
  cyan:    'bg-cyan/[0.04]',
  emerald: 'bg-emerald/[0.04]',
  amber:   'bg-amber/[0.04]',
  rose:    'bg-rose/[0.04]',
  violet:  'bg-violet/[0.04]',
};

// Color del título cuando hay tone · sutil pero distintivo
const TONE_TITLE: Record<Tone, string> = {
  default: 'text-text-1',
  brand:   'text-text-1',
  cyan:    'text-cyan',
  emerald: 'text-emerald',
  amber:   'text-amber',
  rose:    'text-rose',
  violet:  'text-violet',
};

export interface InfoCardProps {
  title: React.ReactNode;
  icon?: React.ElementType;
  /** Número opcional para listas numeradas tipo B.2 mockup */
  number?: number;
  /** Subtitle a la derecha del título · típico para meta o badges */
  rightSlot?: React.ReactNode;
  /** Tono del borde + color del icono · default 'default' (brand) */
  tone?: Tone;
  children: React.ReactNode;
  /** Padding interno · default 'md' */
  padding?: 'sm' | 'md' | 'lg';
}

const PADDING: Record<NonNullable<InfoCardProps['padding']>, string> = {
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export function InfoCard({
  title,
  icon: Icon,
  number,
  rightSlot,
  tone = 'default',
  children,
  padding = 'md',
}: InfoCardProps) {
  return (
    <div className={`rounded-lg border ${TONE_BORDER[tone]} ${TONE_BG[tone]} ${PADDING[padding]}`}>
      <div className="flex items-center gap-2 mb-3">
        {number !== undefined && (
          <div className="w-6 h-6 rounded-full bg-bg-2 border border-border text-text-muted flex items-center justify-center text-[10px] font-bold shrink-0">
            {number}
          </div>
        )}
        {Icon && <Icon className={`w-4 h-4 ${TONE_ICON[tone]} shrink-0`} />}
        <h3 className={`font-semibold text-sm uppercase tracking-wider flex-1 ${TONE_TITLE[tone]}`}>{title}</h3>
        {rightSlot}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/**
 * InfoRow — fila label + value para usar dentro de InfoCard de tipo "tabla de datos".
 * Misma forma que el InfoRow del case-detail-client.
 */
export function InfoRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 items-start py-1.5 border-b border-border/20 last:border-0">
      <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">{label}</div>
      <div className="col-span-2 text-sm text-text-1">{value}</div>
    </div>
  );
}
