/**
 * PersonAvatar — Avatar circular `rounded-full` para personas (pacientes, users, attorneys, employees).
 *
 * Default w-9 h-9 con gradient brand + iniciales (1ª letra firstName + 1ª de lastName).
 * Match con el patrón de apps/web (admin) para consistencia cross-app.
 *
 * Uso:
 *   <PersonAvatar firstName="Maria" lastName="Lopez" />
 *   <PersonAvatar firstName="Carlos" lastName="Quispe" size={12} />  ← header detail
 *   <PersonAvatar … photoUrl={url} onEditPhoto={abrirArchivos} />    ← editable
 *
 * ⚠️ **A propósito NO lleva `'use client'`.** Se usa en 62 lugares y la enorme
 * mayoría son de solo lectura: marcarlo cliente abriría una frontera de bundle
 * en cada Server Component que lo renderiza, por una interacción que casi
 * ninguno usa. Sin la directiva se comporta como corresponda según quién lo
 * importe.
 *
 * La contracara: `onEditPhoto` es una función, y una función NO cruza de un
 * Server Component a un cliente. Pasala solo desde componentes que ya sean
 * `'use client'` — que es donde tiene sentido, porque abre un diálogo. Sin esa
 * prop el componente retorna antes de tocar el `<button>` y no serializa nada.
 * (Mismo filo que `Section`, que sí es cliente y revienta en runtime cuando un
 * Server Component le pasa `icon`.)
 */

import * as React from 'react';

export interface PersonAvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  /** Si querés gradient diferente al default brand. Ej: `bg-gradient-cyan` */
  gradientClass?: string;
  size?: 6 | 8 | 9 | 10 | 12;
  /** URL de foto real — si se provee, se muestra la imagen en lugar de las iniciales */
  photoUrl?: string | null;
  /**
   * Hace del avatar el BOTÓN para subir la foto.
   *
   * El lugar donde falta la foto es el lugar donde se sube — es el gesto que
   * todo el mundo ya conoce de cualquier app, y no gasta espacio de pantalla en
   * un botón nuevo. Existe porque la subida vivía enterrada en el menú ⋮ de una
   * fila de la lista de pacientes y no la encontraba nadie: de 2.992 casos solo
   * 7 tenían selfie.
   *
   * ⚠️ **No se enciende en todos lados.** Solo donde el avatar identifica a UNA
   * persona que se está mirando: encabezado del caso, tarjeta de datos
   * personales y ficha del paciente. En calendario, admisión y listas un clic
   * ya significa "abrir", y que además subiera fotos lo vuelve impredecible.
   */
  onEditPhoto?: () => void;
  /** Texto del tooltip del modo editable. */
  editLabel?: string;
}

const SIZE_CLASSES = {
  6:  'w-6 h-6 text-[9px]',
  8:  'w-8 h-8 text-[10px]',
  9:  'w-9 h-9 text-[11px]',
  10: 'w-10 h-10 text-xs',
  12: 'w-12 h-12 text-sm',
} as const;

/** Tamaño del ícono de cámara del overlay, por tamaño de avatar. */
const ICON_CLASSES = {
  6:  'w-2.5 h-2.5',
  8:  'w-3 h-3',
  9:  'w-3 h-3',
  10: 'w-3.5 h-3.5',
  12: 'w-4 h-4',
} as const;

export function PersonAvatar({
  firstName,
  lastName,
  gradientClass = 'bg-gradient-brand',
  size = 9,
  photoUrl,
  onEditPhoto,
  editLabel,
}: PersonAvatarProps) {
  const a = (firstName ?? '').trim().charAt(0).toUpperCase();
  const b = (lastName ?? '').trim().charAt(0).toUpperCase();
  const initials = (a + b) || '?';
  const sizeClass = SIZE_CLASSES[size];
  const nombre = `${firstName ?? ''} ${lastName ?? ''}`.trim();

  const cara = photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl}
      alt={nombre}
      className={`${sizeClass} rounded-full object-cover shrink-0 shadow-glow`}
    />
  ) : (
    <div className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold shrink-0 ${gradientClass} shadow-glow`}>
      {initials}
    </div>
  );

  if (!onEditPhoto) return cara;

  return (
    <button
      type="button"
      onClick={onEditPhoto}
      title={editLabel}
      aria-label={editLabel ?? nombre}
      className={`${sizeClass} relative rounded-full shrink-0 group
        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0`}
    >
      {cara}
      {/**
        * El overlay vive DENTRO del círculo y aparece en hover/focus. Sin foto
        * el ícono se insinúa siempre (opacity-60) — si estuviera solo en hover,
        * en una pantalla táctil no habría ninguna pista de que se puede tocar,
        * que es exactamente el problema que este cambio viene a resolver.
        */}
      <span
        className={`absolute inset-0 rounded-full flex items-center justify-center
          transition-colors bg-black/0 group-hover:bg-black/55 group-focus-visible:bg-black/55
          ${photoUrl ? '' : 'bg-black/25'}`}
      >
        <CameraIcon
          className={`${ICON_CLASSES[size]} text-white transition-opacity
            ${photoUrl ? 'opacity-0' : 'opacity-60'}
            group-hover:opacity-100 group-focus-visible:opacity-100`}
        />
      </span>
    </button>
  );
}

/** Cámara inline — el primitivo no arrastra `lucide-react` por un solo ícono. */
function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
