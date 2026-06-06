/**
 * IconAction — Botón cuadrado 32x32 con icono lucide w-3.5 h-3.5.
 *
 * Usado en celdas "Acciones" al final de cada fila de tabla.
 * Variantes:
 *   - default: hover brand
 *   - danger:  hover rose (delete)
 *   - success: hover emerald (confirm / send)
 *
 * Soporta `disabled` (gris + cursor-not-allowed).
 *
 * Uso:
 *   <div className="flex items-center justify-end gap-1">
 *     <IconAction onClick={onView}   icon={Eye}      label="Ver" />
 *     <IconAction onClick={onEdit}   icon={Pencil}   label="Editar" />
 *     <IconAction onClick={onPerms}  icon={KeyRound} label="Permisos" disabled />
 *     <IconAction onClick={onDelete} icon={Trash2}   label="Eliminar" variant="danger" />
 *   </div>
 */

import * as React from 'react';

export interface IconActionProps {
  icon: React.ElementType;
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'default' | 'danger' | 'success';
  disabled?: boolean;
  /** Útil para inline en una fila clickeable (evita propagar el click al row) */
  stopPropagation?: boolean;
}

export function IconAction({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  disabled,
  stopPropagation,
}: IconActionProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) e.stopPropagation();
    onClick?.(e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
        disabled
          ? 'text-text-muted/40 cursor-not-allowed'
          : variant === 'danger'
            ? 'text-text-muted hover:text-rose hover:bg-rose/10'
            : variant === 'success'
              ? 'text-text-muted hover:text-emerald hover:bg-emerald/10'
              : 'text-text-muted hover:text-text-1 hover:bg-white/5'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
