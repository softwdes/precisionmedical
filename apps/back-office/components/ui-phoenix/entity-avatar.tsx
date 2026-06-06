/**
 * EntityAvatar — Avatar `rounded-lg` para entidades NO-personas (bufetes, aseguradoras, clínicas).
 *
 * Default w-9 h-9 con gradient cyan + iniciales o código corto.
 * Si pasás `color`, usa ese color sólido (típico de aseguradoras con su brand color).
 *
 * Uso:
 *   <EntityAvatar name="Smith & Johnson LLP" />              ← extrae "SJ" automático
 *   <EntityAvatar name="GEICO" code="G" color="#0EA5E9" />  ← color custom + code explícito
 */

import * as React from 'react';

export interface EntityAvatarProps {
  /** Nombre full · usado para extraer iniciales si no pasás `code` */
  name?: string;
  /** Código corto custom (1-4 letras). Si lo pasás, ignora `name` para el texto. */
  code?: string;
  /** Color hex sólido. Si no, usa `bg-gradient-cyan`. */
  color?: string;
  /** Tamaño · default 9 (w-9 h-9). Aumentá para headers de detail. */
  size?: 8 | 9 | 10 | 12;
}

function extractInitials(name: string): string {
  return name
    .split(/[\s&\-/]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const SIZE_CLASSES = {
  8:  'w-8 h-8 text-[10px]',
  9:  'w-9 h-9 text-[11px]',
  10: 'w-10 h-10 text-xs',
  12: 'w-12 h-12 text-sm',
} as const;

export function EntityAvatar({ name, code, color, size = 9 }: EntityAvatarProps) {
  const text = code ?? (name ? extractInitials(name) : '?');
  const sizeClass = SIZE_CLASSES[size];

  const style: React.CSSProperties | undefined = color
    ? { background: color, boxShadow: `0 4px 12px ${color}40` }
    : undefined;

  return (
    <div
      className={`${sizeClass} rounded-lg flex items-center justify-center text-white font-bold shrink-0 ${color ? 'shadow-md' : 'bg-gradient-cyan shadow-glow'}`}
      style={style}
    >
      {text}
    </div>
  );
}
