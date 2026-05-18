'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SuccessToast } from './SuccessToast';

export type ToastData = {
  icon: React.ReactNode;
  title: string;
  detail: string;
  statusText: string;
  barColor?: string;
  warning?: string;
  autoCloseMs?: number;
};

type ToastItem = ToastData & { id: string };

type ToastManagerState = {
  toasts: ToastItem[];
  addToast: (data: ToastData) => void;
  removeToast: (id: string) => void;
};

export function useToastManager(): ToastManagerState {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((data: ToastData) => {
    setToasts(prev => [...prev, { ...data, id: `${Date.now()}-${Math.random()}` }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

type PortalProps = {
  toasts: ToastItem[];
  removeToast: (id: string) => void;
};

function ToastPortalInner({ toasts, removeToast }: PortalProps): React.ReactElement {
  return (
    <div style={{
      position: 'fixed',
      top: 80,
      right: 20,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <SuccessToast
            icon={t.icon}
            title={t.title}
            detail={t.detail}
            statusText={t.statusText}
            barColor={t.barColor}
            warning={t.warning}
            autoCloseMs={t.autoCloseMs}
            onClose={() => removeToast(t.id)}
          />
        </div>
      ))}
    </div>
  );
}

export function ToastPortal({ toasts, removeToast }: PortalProps): React.ReactPortal | null {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  if (!mounted || toasts.length === 0) return null;
  return createPortal(<ToastPortalInner toasts={toasts} removeToast={removeToast} />, document.body);
}
