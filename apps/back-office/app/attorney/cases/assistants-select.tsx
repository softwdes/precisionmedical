'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';

/**
 * Selector MÚLTIPLE de asistentes legales — réplica del de v2.
 *
 * Es el único puesto del caso que admite varias personas; abogado y paralegal
 * siguen siendo uno solo, así que esos usan un `<select>` común.
 *
 * Se dibuja en un PORTAL con posición fija por la misma razón que el menú de
 * acciones: vive dentro de `DataTable.Scroll`, que es `overflow-x-auto`, y por
 * spec eso hace que `overflow-y` compute a `auto` — un panel `absolute` queda
 * recortado en las últimas filas.
 */

export interface AssistantOption {
  id: string;
  name: string;
  /** Etiqueta del rol, ya traducida — v2 la muestra al lado de cada nombre. */
  roleLabel: string;
}

interface Props {
  options: AssistantOption[];
  selected: string[];
  disabled?: boolean;
  onChange: (ids: string[]) => Promise<void> | void;
}

export function AssistantsSelect({ options, selected, disabled, onChange }: Props): React.ReactElement {
  const t = useTranslations('phoenix.attorney');

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const [query, setQuery] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const open = pos !== null;

  const openPanel = React.useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setQuery('');
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (panelRef.current?.contains(n) || triggerRef.current?.contains(n)) return;
      setPos(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    const onScroll = () => setPos(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const byId = React.useMemo(
    () => new Map(options.map((o) => [o.id, o])),
    [options],
  );

  const visible = options.filter((o) =>
    o.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  /**
   * El panel NO se cierra al marcar: elegir varios es el punto de este control,
   * y cerrarse en cada clic obligaría a reabrirlo por cada persona. Se manda la
   * lista completa en cada cambio — el servidor espera el estado final.
   */
  async function toggle(id: string): Promise<void> {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    setSaving(true);
    try { await onChange(next); } finally { setSaving(false); }
  }

  // "Camila Rojas, Daiana…" + contador, igual que v2: los nombres completos no
  // entran en el ancho de la celda y truncar sin decir cuántos faltan esconde
  // información.
  const chosen = selected.map((id) => byId.get(id)?.name).filter(Boolean) as string[];
  const label = chosen.length === 0 ? t('selectAssistants') : chosen.join(', ');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setPos(null) : openPanel())}
        className="w-full min-w-[150px] flex items-center gap-1.5 rounded-md border border-border bg-bg-1 px-2 py-1 text-[12.5px] text-left focus:outline-none focus:ring-1 focus:ring-brand/40 disabled:opacity-50"
      >
        <span className={`flex-1 truncate ${chosen.length ? 'text-text-1' : 'text-text-muted'}`}>
          {label}
        </span>
        {chosen.length > 1 && (
          <TagPill label={`+${chosen.length - 1}`} compact mono colorClass="bg-brand/10 text-brand-text border-brand/20" />
        )}
        {saving
          ? <Loader2 className="w-3 h-3 text-text-muted animate-spin shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />}
      </button>

      {pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 240) }}
          className="z-[60] rounded-lg bg-bg-1 shadow-xl py-1 max-h-72 overflow-y-auto"
        >
          <div className="px-2 py-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholderShort')}
              className="w-full rounded-md bg-bg-2/40 px-2 py-1 text-[12.5px] text-text-1 placeholder:text-text-muted focus:outline-none"
            />
          </div>

          {visible.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-text-muted italic">{t('noMembersForRole')}</div>
          ) : visible.map((o) => {
            const isOn = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => void toggle(o.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-white/5 ${isOn ? 'text-text-1' : 'text-text-2'}`}
              >
                <span className="w-3.5 shrink-0">
                  {isOn && <Check className="w-3.5 h-3.5 text-emerald" />}
                </span>
                <span className="flex-1 truncate">{o.name}</span>
                <TagPill label={o.roleLabel} compact colorClass="bg-white/5 text-text-muted border-border" />
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
