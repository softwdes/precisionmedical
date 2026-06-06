/**
 * PersonAvatar — Avatar circular `rounded-full` para personas (pacientes, users, attorneys, employees).
 *
 * Default w-9 h-9 con gradient brand + iniciales (1ª letra firstName + 1ª de lastName).
 * Match con el patrón de apps/web (admin) para consistencia cross-app.
 *
 * Uso:
 *   <PersonAvatar firstName="Maria" lastName="Lopez" />
 *   <PersonAvatar firstName="Carlos" lastName="Quispe" size={12} />  ← header detail
 */

import * as React from 'react';

export interface PersonAvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  /** Si querés gradient diferente al default brand. Ej: `bg-gradient-cyan` */
  gradientClass?: string;
  size?: 8 | 9 | 10 | 12;
}

const SIZE_CLASSES = {
  8:  'w-8 h-8 text-[10px]',
  9:  'w-9 h-9 text-[11px]',
  10: 'w-10 h-10 text-xs',
  12: 'w-12 h-12 text-sm',
} as const;

export function PersonAvatar({
  firstName,
  lastName,
  gradientClass = 'bg-gradient-brand',
  size = 9,
}: PersonAvatarProps) {
  const a = (firstName ?? '').trim().charAt(0).toUpperCase();
  const b = (lastName ?? '').trim().charAt(0).toUpperCase();
  const initials = (a + b) || '?';
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold shrink-0 ${gradientClass} shadow-glow`}>
      {initials}
    </div>
  );
}
