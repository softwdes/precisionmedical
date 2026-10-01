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
 * Las clases se componen con `cn()` (= `twMerge(clsx(...))`), no a mano: la
 * utilidad que manda el que llama GANA sobre la que trae el primitivo, que es
 * lo que cualquiera espera al escribir `<Skeleton className="rounded-none" />`.
 *
 * Hasta el 2026-10-01 se concatenaba con un template literal y pasaba lo
 * contrario: las dos clases caian en el mismo elemento con la misma
 * especificidad y ganaba la del primitivo por orden de la hoja compilada.
 * Habia **25 call sites con la clase escrita y sin efecto en pantalla** — 6
 * `rounded-none`, 4 `p-0` sobre el `p-5` de Card, 2 `rounded` sueltos y los 13
 * `rounded-md` que `Circle` recibe de los esqueletos de botones de accion.
 * Sobrevivieron porque son pantallas de carga: el error dura lo que dura el
 * spinner y nadie llega a mirarlo.
 *
 * ⚠️ `Circle` sigue pasando `rounded-full`, pero ahora es un DEFAULT, no una
 * imposicion: quien le mande `rounded-md` obtiene un cuadrado redondeado. Esta
 * bien que sea asi — los 13 call sites que lo hacen son placeholders de
 * botones de icono, y el boton real (`IconAction`, la paginacion de patients)
 * es `rounded-md`. El avatar, que si es redondo, usa `<Skeleton.Circle />`
 * pelado.
 */

import * as React from 'react';
import { cn } from '@precision/ui';

function Box({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn('rounded-md bg-bg-2 relative overflow-hidden', className)}
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
    <div className={cn('space-y-1.5', className)}>
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
    <div className={cn('rounded-lg border border-border bg-bg-1 p-5', className)}>
      {children}
    </div>
  );
}

function Circle({ size = 9, className = '' }: { size?: number; className?: string }) {
  const px = `${size * 4}px`;
  return <Box className={cn('rounded-full', className)} style={{ width: px, height: px }} />;
}

export const Skeleton = Object.assign(Box, { Text, Card, Circle });
