'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';

export type SuccessModalCard = {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
};

type Props = {
  title: string;
  subtitle: string;
  name: string;
  card1?: SuccessModalCard;
  card2?: SuccessModalCard;
  onClose: () => void;
  autoCloseMs?: number;
};

function SuccessModalInner({ title, subtitle, name, card1, card2, onClose, autoCloseMs = 4000 }: Props): React.ReactElement {
  const [exiting, setExiting] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissedRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const barRef = useRef<HTMLDivElement>(null);
  const gradientId = useRef(`smg-${Math.random().toString(36).slice(2)}`).current;

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
    const totalMs = autoCloseMs - 1000;
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

  const autoCloseSec = Math.round(autoCloseMs / 1000);

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 9998,
        animation: exiting ? 'modal-fade-out 0.3s ease-out forwards' : 'modal-fade-in 0.3s ease-out both',
      }} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          width: 420, maxWidth: 'calc(100vw - 32px)',
          background: 'var(--surface)',
          border: '0.5px solid var(--border-strong)',
          borderRadius: 20,
          overflow: 'hidden',
          zIndex: 9999,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          animation: exiting
            ? 'modal-out 0.3s cubic-bezier(0.4,0,1,1) forwards'
            : 'modal-in 0.45s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: 0 }}>{title}</p>
          <button
            onClick={dismiss}
            aria-label="Cerrar"
            style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Animated check circle + name */}
        <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 16, animation: 'modal-pop-in 0.5s 0.2s ease-out both', opacity: 0 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(6,182,212,0.12))',
              border: '2px solid rgba(99,102,241,0.22)',
            }} />
            <svg width="80" height="80" viewBox="0 0 80 80" style={{ position: 'absolute', inset: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366F1" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
              <circle
                cx="40" cy="40" r="30"
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="2.5"
                strokeDasharray="188.4"
                strokeDashoffset="188.4"
                strokeLinecap="round"
                style={{ transformOrigin: '40px 40px', transform: 'rotate(-90deg)', animation: 'modal-circle-draw 1s 0.3s ease-out forwards' }}
              />
              <polyline
                points="27,40 36,49 53,31"
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="60"
                strokeDashoffset="60"
                style={{ animation: 'modal-check-draw 0.4s 1.1s ease-out forwards' }}
              />
            </svg>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.10em', margin: '0 0 4px', animation: 'modal-fade-in-up 0.4s 0.9s ease-out both', opacity: 0 }}>
            {subtitle}
          </p>
          <p style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-1)', margin: '0 0 20px', animation: 'modal-fade-in-up 0.4s 1.0s ease-out both', opacity: 0 }}>
            {name}
          </p>
        </div>

        {/* Info cards */}
        {(card1 || card2) && (
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {card1 && (
              <div style={{
                background: `${card1.color}0f`,
                border: `1px solid ${card1.color}38`,
                borderRadius: 12, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                animation: 'modal-fade-in-up 0.4s 1.1s ease-out both', opacity: 0,
              }}>
                <div style={{ flexShrink: 0, color: card1.color, display: 'flex', alignItems: 'center' }}>{card1.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: card1.color, margin: 0 }}>{card1.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card1.value}</p>
                </div>
                <Check size={16} color={card1.color} style={{ flexShrink: 0 }} />
              </div>
            )}
            {card2 && (
              <div style={{
                background: `${card2.color}0f`,
                border: `1px solid ${card2.color}38`,
                borderRadius: 12, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                animation: 'modal-fade-in-up 0.4s 1.2s ease-out both', opacity: 0,
              }}>
                <div style={{ flexShrink: 0, color: card2.color, display: 'flex', alignItems: 'center' }}>{card2.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: card2.color, margin: 0 }}>{card2.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card2.value}</p>
                </div>
                <Check size={16} color={card2.color} style={{ flexShrink: 0 }} />
              </div>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div style={{ padding: '16px 20px 8px 20px' }}>
          <p style={{ fontSize: 11, color: '#6B7592', textAlign: 'center', margin: '0 0 8px 0' }}>
            Se cerrará en {autoCloseSec} segundos
          </p>
          <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.10)', borderRadius: 999, overflow: 'hidden' }}>
            <div
              ref={barRef}
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 999,
                background: 'linear-gradient(90deg, #6366F1, #8B5CF6, #06B6D4)',
                transition: 'none',
              }}
            />
          </div>
        </div>

        {/* Close button */}
        <div style={{ padding: '10px 20px 20px', animation: 'modal-fade-in-up 0.4s 1.4s ease-out both', opacity: 0 }}>
          <button
            onClick={dismiss}
            style={{
              width: '100%', padding: 12, borderRadius: 10,
              fontWeight: 500, fontSize: 14, cursor: 'pointer',
              background: 'transparent',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-1)',
              fontFamily: 'inherit',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}

export function SuccessModal(props: Props): React.ReactPortal | null {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(<SuccessModalInner {...props} />, document.body);
}
