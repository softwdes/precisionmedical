/**
 * Skeleton — bloque placeholder con shimmer animation del tailwind preset.
 *
 * Uso:
 *   <Skeleton className="h-8 w-32" />     ← bloque chiquito
 *   <Skeleton.Text lines={3} />            ← 3 líneas de texto
 *   <Skeleton.Card>...</Skeleton.Card>     ← card con padding y border
 *
 * El animate-shimmer está definido en packages/tailwind-config/preset.ts y
 * usa un gradient lineal que se mueve de -200% a 200% en 1.5s.
 *
 * ⚠️ Este archivo concatena el className a mano, así que una utilidad que ya
 * esté acá GANA sobre la que mande el que llama, pase lo que pase: las dos
 * clases caen en el mismo elemento con la misma especificidad y decide el
 * orden de la hoja compilada, no el orden del atributo. Para pisar una hay que
 * mandarla con `!` (`!rounded-none`, `!p-0`).
 *
 * Costó encontrarlo: el 2026-10-01 había 12 call sites con la clase escrita y
 * sin efecto en pantalla — 6 `rounded-none` sobre el `rounded-md` de Box, 4
 * `p-0` sobre el `p-5` de Card (que es el peor: el punto de esas cards es
 * contener una tabla a ras del borde, y salían con 20px de marco), y 2
 * `rounded` sueltos. Sobrevivieron porque son pantallas de carga: el error
 * dura lo que dura el spinner y nadie llega a mirarlo.
 *
 * Por qué NO está resuelto con `cn()`, que sería lo correcto: `twMerge` deja
 * ganar al que llama, y `Circle` se apoya justamente en lo contrario — pasa
 * `rounded-full` y hay 13 call sites que encima le mandan `rounded-md`, que
 * hoy es una clase muerta y con `cn()` pasaría a ganar, dejando 13 círculos
 * cuadrados. Migrar a `cn()` exige limpiar esos 13 primero. Está medido pero
 * no hecho.
 */

import * as React from 'react';

function Box({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-md bg-bg-2 relative overflow-hidden ${className}`}
      style={style}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 animate-shimmer"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
        }}
      />
    </div>
  );
}

function Text({ lines = 1, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Box
          key={i}
          className="h-3"
          style={{ width: i === lines - 1 && lines > 1 ? '70%' : '100%' }}
        />
      ))}
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-bg-1 p-5 ${className}`}>
      {children}
    </div>
  );
}

function Circle({ size = 9, className = '' }: { size?: number; className?: string }) {
  const px = `${size * 4}px`;
  return <Box className={`rounded-full ${className}`} style={{ width: px, height: px }} />;
}

export const Skeleton = Object.assign(Box, { Text, Card, Circle });
