'use client';

/**
 * Section — el bloque con marco de las pantallas clínicas.
 *
 * Nació de comparar nuestros tabs del doctor contra v2 (Erick, 2026-08-13:
 * "v2 se ve un poco más organizada"). La causa medida no eran los campos ni la
 * disposición: los cinco tabs usaban **tres lenguajes de tarjeta distintos**
 * —`bg-1` plano en Labs y Férulas, `bg-2/30` en la Nota, `bg-2` + `bg-3` en los
 * vitales—, dos radios de esquina y bordes apilados (19 solo en el Resumen). Al
 * cambiar de pestaña el ojo tenía que recalibrar. v2 se veía prolijo porque
 * repite UN solo objeto en toda la pantalla.
 *
 * Es la misma lección que el formulario de órdenes de laboratorio en agosto: el
 * desorden venía de tener cinco lenguajes de control, no de los campos.
 *
 * Anatomía:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ ⚡ TÍTULO   (3)              [acción]  ⌄    │  ← barra de encabezado
 *   ├─────────────────────────────────────────────┤  ← la ÚNICA frontera
 *   │ cuerpo — las cajas de adentro se separan    │
 *   │ por fondo, sin borde                        │
 *   └─────────────────────────────────────────────┘
 *
 * Reglas que hace cumplir por construcción:
 *  · **Una sola frontera por nivel** — la línea del encabezado. Adentro el
 *    escalón de fondo separa y la línea sobra (regla de bordes del CLAUDE.md).
 *  · **La acción del bloque va a la derecha del encabezado**, nunca inventada en
 *    medio del cuerpo — la barra que Erick aprobó en agosto con Férulas y Labs.
 *  · **Un solo token de tarjeta**: `bg-1` + `rounded-lg`, en los cinco tabs.
 */

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Color del icono y del acento, por intención de módulo (Regla #5).
 * Clases COMPLETAS y no interpoladas: Tailwind no ve `text-${tone}` y la clase
 * nunca se genera — el elemento cae al default sin ningún error.
 */
const TONE: Record<string, string> = {
  cyan:    'text-cyan',
  violet:  'text-violet',
  brand:   'text-brand',
  emerald: 'text-emerald',
  amber:   'text-amber',
  rose:    'text-rose',
};

export interface SectionProps {
  /** Icono de lucide (el componente, no el elemento). */
  icon?: React.ElementType;
  title: string;
  /** Contador de filas del bloque — se muestra como píldora junto al título. */
  count?: number;
  /** Acción del bloque: botón, indicador de guardado, lo que sea. */
  action?: React.ReactNode;
  tone?: keyof typeof TONE;
  /** Se puede plegar con clic en el encabezado. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /**
   * Recuerda plegado/desplegado entre visitas. Sin esto el doctor tiene que
   * volver a cerrar lo que no usa en cada paciente.
   */
  storageKey?: string;
  /** Cuerpo sin padding — para listas de filas a sangre (`row-sep` entre ellas). */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Section({
  icon: Icon, title, count, action, tone = 'cyan',
  collapsible = false, defaultOpen = true, storageKey,
  flush = false, className = '', children,
}: SectionProps): React.ReactElement {
  const [open, setOpen] = React.useState(defaultOpen);

  /**
   * El estado guardado se lee en un efecto y NO en el inicializador del `useState`:
   * el server no tiene `localStorage`, así que leerlo al montar haría que el HTML
   * del server y el del cliente no coincidan (error de hidratación). El costo es
   * un cuadro con el bloque abierto antes de plegarse.
   */
  React.useEffect(() => {
    if (!collapsible || !storageKey) return;
    try {
      const v = window.localStorage.getItem(`section:${storageKey}`);
      if (v === '0') setOpen(false);
      if (v === '1') setOpen(true);
    } catch { /* modo privado o storage lleno: queda el default */ }
  }, [collapsible, storageKey]);

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (!storageKey) return;
    try { window.localStorage.setItem(`section:${storageKey}`, next ? '1' : '0'); } catch { /* idem */ }
  };

  const head = (
    <>
      {Icon && <Icon className={`w-4 h-4 shrink-0 ${TONE[tone] ?? TONE.cyan}`} />}
      <span className="text-[12px] uppercase tracking-wider font-semibold text-text-1 truncate">
        {title}
      </span>
      {count !== undefined && (
        <span className="text-[10px] tabular-nums text-text-muted bg-bg-2 rounded-full px-1.5 py-px shrink-0">
          {count}
        </span>
      )}
    </>
  );

  return (
    <div className={`rounded-lg bg-bg-1 overflow-hidden ${className}`}>
      {/* La línea de abajo es la única frontera del bloque. */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border">
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {head}
          </button>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">{head}</div>
        )}

        {/* `flex-wrap` no: en el encabezado la acción se mantiene en la fila y el
            título trunca — envolver hace crecer la barra y rompe el ritmo. */}
        {(action || collapsible) && (
          <div className="flex items-center gap-2 shrink-0">
            {action}
            {collapsible && (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-label={title}
                className="p-0.5 rounded text-text-muted hover:text-text-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
              </button>
            )}
          </div>
        )}
      </div>

      {open && <div className={flush ? '' : 'p-3.5'}>{children}</div>}
    </div>
  );
}

/**
 * Corte dentro de una sección — el separador centrado con líneas a los dos lados.
 *
 * La versión anterior era una etiqueta chica pegada a la izquierda con una línea
 * después, y no se leía como un corte sino como otro título más. Centrado, el
 * bloque de abajo se entiende como una segunda tanda de lo mismo (la 2ª toma de
 * vitales, sin repetir los encabezados).
 */
export function SectionDivider({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-3 my-4">
      <span className="flex-1 h-px bg-border" />
      <span className="text-[9.5px] uppercase tracking-[0.12em] font-semibold text-text-muted whitespace-nowrap">
        {label}
      </span>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}
