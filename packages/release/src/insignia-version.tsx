'use client';

import * as React from 'react';
import { useVersionSinVer, EVENTO_NOVEDAD } from './use-novedad';

/**
 * El número de versión en el sidebar, y la puerta para volver a verlo.
 *
 * ── Por qué es un botón y no texto ──────────────────────────────────────────
 *
 * Porque la cortina se muestra UNA vez y después desaparece: quien la cerró sin
 * leer, o entró desde otra computadora, se quedaba sin forma de recuperarla.
 * Acá está siempre, y es donde uno la buscaría.
 *
 * ── Por qué una PASTILLA y no texto de color ────────────────────────────────
 *
 * La primera versión era el número pintado, parpadeando entre ámbar e índigo.
 * Erick la probó: *"no se nota que pueden dar clic ahí"*. Al medirlo se ve por
 * qué — eran **33×15 píxeles de texto gris**, del mismo tamaño y color que la
 * etiqueta del portal pegada al lado. Un color que late dice "pasa algo", no
 * "tocame"; y una vez apagado no decía nada.
 *
 * La pastilla se lee como control aun quieta, porque tiene borde y fondo. Va en
 * `brand` a propósito: en este sistema el índigo ES el color de lo interactivo
 * —acciones primarias, links, foco, según la regla de color del CLAUDE.md del
 * back-office—, así que no hay que enseñarle a nadie qué significa.
 *
 * ── El punto, y por qué deja de latir ───────────────────────────────────────
 *
 * Lo que late es un puntito ámbar al lado, no el texto: el número queda legible
 * y el punto es la señal universal de "hay algo nuevo". Late **solo mientras la
 * versión no se vio**.
 *
 * Que se apague no es una concesión: algo que parpadea para siempre deja de
 * significar "mirá esto" en dos días y pasa a ser ruido. Vista la versión, la
 * pastilla sigue ahí y sigue clickeable — dejó de ser novedad y pasó a ser dato.
 *
 * ── El área de toque ────────────────────────────────────────────────────────
 *
 * El dibujo mide 12px de alto; el `::after` lleva el área a 44 sin mover un
 * píxel. Recepción usa iPad y la regla mobile de este repo es vinculante.
 */
export function InsigniaVersion({
  version,
  titulo,
  className = '',
}: {
  version: string;
  /** Tooltip, en el idioma de la app. Este paquete no habla `next-intl`. */
  titulo: string;
  className?: string;
}): React.ReactElement {
  const sinVer = useVersionSinVer(version);

  return (
    <>
      {sinVer && (
        <style>{`
          @keyframes pm-version-punto {
            0%, 100% { opacity: 1;   transform: scale(1) }
            50%      { opacity: .35; transform: scale(.7) }
          }
          @media (prefers-reduced-motion: reduce) {
            .pm-version-punto { animation: none !important }
          }
        `}</style>
      )}
      <button
        type="button"
        onClick={() => {
          // Un solo evento. El hook trae el resumen y la cortina se abre sola
          // con el nonce nuevo. NO se abre el saludo de CIFO: hacerlo era el
          // bug que reportó Erick — tocar la versión daba lo mismo que tocar el
          // muñeco, y la versión no aparecía por ningún lado.
          window.dispatchEvent(new Event(EVENTO_NOVEDAD));
        }}
        title={titulo}
        className={[
          'relative inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[2px]',
          'text-[10px] leading-none normal-case tracking-normal transition-colors',
          // El área de toque real, invisible. Se hace estirando la caja y no
          // con `w-[max(100%,2.75rem)]`: esa clase, con la coma adentro del
          // `max()`, Tailwind NO la emite — medido, el área seguía en 12px.
          'after:absolute after:content-[""] after:-inset-x-2 after:-inset-y-4',
          'hover:bg-brand/20 hover:border-brand/50',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/50',
          sinVer
            ? 'border-brand/40 bg-brand/15 text-brand-text font-semibold'
            : 'border-brand/25 bg-brand/10 text-brand-text/80',
          className,
        ].join(' ')}
      >
        {sinVer && (
          <span
            aria-hidden="true"
            className="pm-version-punto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-text"
            style={{ animation: 'pm-version-punto 1.6s ease-in-out infinite' }}
          />
        )}
        v{version}
      </button>
    </>
  );
}
