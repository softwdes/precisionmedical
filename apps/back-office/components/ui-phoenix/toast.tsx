'use client';

/**
 * Toast — notificación breve de éxito/error, estilo del sistema.
 *
 * Uso:
 *   const toast = useToast();
 *   toast.success('Plantilla guardada');
 *   toast.error('No se pudo guardar');
 *
 * `<ToastProvider>` ya está montado en AdminShell — no hace falta agregarlo
 * de nuevo en cada pantalla.
 */

import * as React from 'react';
import { CheckCircle2, XCircle, X, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  /** Toast accionable — clic en el cuerpo (ej. "Nuevo mensaje" → abrir inbox) */
  onClick?: () => void;
}

export interface ToastOptions {
  onClick?: () => void;
  /** Por defecto 3500ms; los avisos accionables conviene dejarlos más tiempo */
  durationMs?: number;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  /** Aviso neutro, opcionalmente clickeable (llegada de mensajes, etc.) */
  info: (message: string, opts?: ToastOptions) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setItems((list) => list.filter((i) => i.id !== id));
  }, []);

  const push = React.useCallback((type: ToastType, message: string, opts?: ToastOptions) => {
    const id = ++idRef.current;
    setItems((list) => [...list, { id, type, message, onClick: opts?.onClick }]);
    setTimeout(() => dismiss(id), opts?.durationMs ?? 3500);
  }, [dismiss]);

  const value = React.useMemo<ToastContextValue>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m, o) => push('info', m, o),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        {items.map((it) => (
          <div
            key={it.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-md border bg-bg-1 px-3.5 py-2.5 shadow-lg text-[13px] font-medium animate-fade-in ${
              it.type === 'success' ? 'border-emerald/30'
              : it.type === 'info' ? 'border-cyan/30'
              : 'border-rose/30'
            }`}
          >
            {it.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald" />
            ) : it.type === 'info' ? (
              <Info className="w-4 h-4 shrink-0 text-cyan" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0 text-rose" />
            )}
            {/* Accionable: el cuerpo entero es el clic, y se cierra al usarlo */}
            {it.onClick ? (
              <button
                type="button"
                onClick={() => { it.onClick?.(); dismiss(it.id); }}
                className="text-text-1 text-left hover:text-cyan transition-colors"
              >
                {it.message}
              </button>
            ) : (
              <span className="text-text-1">{it.message}</span>
            )}
            <button
              type="button"
              onClick={() => dismiss(it.id)}
              className="text-text-muted hover:text-text-1 ml-1"
              aria-label="Cerrar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
