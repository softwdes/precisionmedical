'use client';

/**
 * CopyButton — copiar un valor al portapapeles, con confirmación.
 *
 * Existe porque el patrón estaba reescrito a mano en **ocho** pantallas
 * (patients, new-case-dialog, intake-form-link, lawyer-detail, case-managers,
 * attorney/users…), cada una con su propio feedback o sin ninguno: en varias, el
 * usuario aprieta y no pasa nada visible, así que aprieta de nuevo.
 *
 * Lo que resuelve, y que las versiones inline no hacían:
 *  · **Confirma**: pasa a "Copiado" con un check por 2 s y vuelve solo.
 *  · **Falla en voz alta**: `navigator.clipboard` necesita contexto seguro
 *    (HTTPS o localhost). Si rechaza, se dice — antes se perdía en un `.catch()`
 *    vacío y el usuario creía que había copiado.
 *  · Área de toque de 44px en mobile (Regla #4), que un botón de ícono suelto no
 *    alcanza.
 *
 * Uso:
 *   <CopyButton value={url} label="Copiar" />
 *   <CopyButton value={email} iconOnly />
 */

import * as React from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@precision/ui';

export interface CopyButtonProps {
  value: string;
  /** Texto del botón. Sin esto, solo ícono (usar con `title`/`aria-label`). */
  label?: string;
  /** Lo que se muestra mientras confirma. Default: "Copiado". */
  copiedLabel?: string;
  /** Solo el ícono, para celdas y filas apretadas. */
  iconOnly?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  /** Para lectores de pantalla cuando es solo ícono. */
  ariaLabel?: string;
}

export function CopyButton({
  value, label, copiedLabel = 'Copiado', iconOnly = false,
  variant = 'outline', className = '', ariaLabel,
}: CopyButtonProps): React.ReactElement {
  const [estado, setEstado] = React.useState<'idle' | 'ok' | 'error'>('idle');

  // El temporizador se limpia al desmontar: sin esto, copiar y cerrar el diálogo
  // deja un setState apuntando a un componente que ya no existe.
  React.useEffect(() => {
    if (estado === 'idle') return;
    const id = setTimeout(() => setEstado('idle'), 2000);
    return () => clearTimeout(id);
  }, [estado]);

  const copiar = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setEstado('ok');
    } catch {
      setEstado('error');
    }
  };

  const Icono = estado === 'ok' ? Check : estado === 'error' ? AlertTriangle : Copy;
  const color = estado === 'ok' ? 'text-emerald' : estado === 'error' ? 'text-amber' : '';
  const texto = estado === 'ok' ? copiedLabel : estado === 'error' ? '' : label;

  return (
    <Button
      variant={variant}
      onClick={() => { void copiar(); }}
      aria-label={ariaLabel ?? label ?? 'Copiar'}
      title={estado === 'error' ? value : undefined}
      className={`shrink-0 gap-1.5 min-h-11 sm:min-h-0 sm:h-8 ${iconOnly ? 'px-2.5' : ''} ${className}`}
    >
      <Icono className={`w-3.5 h-3.5 ${color}`} />
      {!iconOnly && texto}
    </Button>
  );
}
