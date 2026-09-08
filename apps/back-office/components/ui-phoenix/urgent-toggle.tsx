/**
 * UrgentToggle — la casilla de "marcarlo como urgente".
 *
 * Apagada es una fila tranquila; encendida se pinta de **rose** con el
 * triángulo, porque el que escribe tiene que VER que el mensaje sale marcado
 * (y del otro lado la bandeja ya lo muestra en rojo). Es el único estado que
 * cambia de color, así que el rojo no se gasta en decoración — ver la tabla de
 * "color por intención" del CLAUDE.md: rose es alerta.
 *
 * El borde aparece SOLO cuando está activa: es el caso que la Regla #0 permite
 * (el borde ES el significado). Apagada lleva `border-transparent` para que la
 * fila no salte de alto al encenderse.
 *
 * El `accent` va con `var(--rose)` y no con `accent-rose` para igualar lo que
 * ya hace el compose de mensajería (`compose-message-dialog.tsx`).
 *
 * Uso:
 *   <UrgentToggle
 *     checked={urgente}
 *     onChange={setUrgente}
 *     label={t('vigiaReqUrgent')}
 *     hint={t('vigiaReqUrgentHint')}
 *   />
 */

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface UrgentToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  /** Qué implica marcarlo. Se muestra solo cuando está encendida. */
  hint?: React.ReactNode;
  disabled?: boolean;
}

export function UrgentToggle({ checked, onChange, label, hint, disabled }: UrgentToggleProps) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-md border px-3 py-2 transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'border-rose/30 bg-rose/10' : 'border-transparent bg-bg-2/40 hover:bg-bg-2/60'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[var(--rose,#f43f5e)]"
      />
      <AlertTriangle
        className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${checked ? 'text-rose' : 'text-text-muted'}`}
      />
      <span className="min-w-0">
        <span className={`block text-sm ${checked ? 'text-rose font-medium' : 'text-text-2'}`}>
          {label}
        </span>
        {checked && hint ? (
          <span className="block text-[11px] text-rose/80 mt-0.5">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
