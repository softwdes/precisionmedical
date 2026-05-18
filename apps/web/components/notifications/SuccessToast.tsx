'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

type Props = {
  icon: React.ReactNode;
  title: string;
  detail: string;
  statusText: string;
  barColor?: string;
  warning?: string;
  onClose: () => void;
  autoCloseMs?: number;
};

export function SuccessToast({
  icon, title, detail, statusText, barColor = '#10B981', warning, onClose, autoCloseMs = 5000,
}: Props): React.ReactElement {
  const [exiting, setExiting] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissedRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const barRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    clearTimeout(autoTimerRef.current);
    clearInterval(progressIntervalRef.current);
    setExiting(true);
    exitTimerRef.current = setTimeout(() => onCloseRef.current(), 300);
  }, []);

  useEffect(() => {
    autoTimerRef.current = setTimeout(dismiss, autoCloseMs);
    return () => {
      clearTimeout(autoTimerRef.current);
      clearTimeout(exitTimerRef.current);
      clearInterval(progressIntervalRef.current);
    };
  }, [dismiss, autoCloseMs]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const totalMs = autoCloseMs - 500;
    const intervalMs = 30;
    let elapsed = 0;
    progressIntervalRef.current = setInterval(() => {
      elapsed += intervalMs;
      const pct = Math.max(0, 100 - (elapsed / totalMs * 100));
      bar.style.width = `${pct}%`;
      if (elapsed >= totalMs) {
        clearInterval(progressIntervalRef.current);
        bar.style.width = '0%';
      }
    }, intervalMs);
    return () => clearInterval(progressIntervalRef.current);
  }, [autoCloseMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        width: 320,
        background: 'var(--surface)',
        border: '0.5px solid var(--border-strong)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        animation: exiting
          ? 'toast-slide-out 0.3s cubic-bezier(0.4,0,1,1) forwards'
          : 'toast-slide-in 0.35s cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 3, background: barColor, width: '100%' }} />

      {/* Content */}
      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flexShrink: 0, marginTop: 1 }}>{icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>{title}</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</p>
            {warning && (
              <p style={{ fontSize: 11, color: '#F59E0B', margin: '4px 0 0', lineHeight: 1.3 }}>{warning}</p>
            )}
          </div>
          <button
            onClick={dismiss}
            aria-label="Cerrar"
            style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 10.5, color: 'var(--text-3)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{statusText}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.08)' }}>
        <div
          ref={barRef}
          style={{
            width: '100%',
            height: '100%',
            background: barColor,
            transition: 'none',
          }}
        />
      </div>
    </div>
  );
}
