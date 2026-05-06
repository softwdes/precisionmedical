'use client';

import { useState, useEffect } from 'react';
import TrainerAIChat from './TrainerAIChat';
import { SparklesIcon } from './TrainerAIChat';

interface Props {
  trainerId: string;
}

export default function TrainerAIAvatar({ trainerId }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <>
      {/* Chat panel */}
      <div
        style={{
          position: 'fixed',
          bottom: 88,
          right: 24,
          width: 380,
          maxWidth: 'calc(100vw - 32px)',
          height: 560,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 9998,
          transformOrigin: 'bottom right',
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(16px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
          transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease',
        }}
      >
        <TrainerAIChat trainerId={trainerId} onClose={() => setOpen(false)} />
      </div>

      {/* FAB button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Cerrar TrainerAI' : 'Abrir TrainerAI'}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: open ? 'var(--accent)' : 'var(--accent)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: open
            ? '0 4px 32px rgba(29,158,117,0.65)'
            : '0 4px 20px rgba(29,158,117,0.40)',
          zIndex: 9999,
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      >
        {/* Online pulse dot */}
        <div style={{
          position: 'absolute',
          top: 3,
          right: 3,
          width: 11,
          height: 11,
          borderRadius: '50%',
          background: '#22c55e',
          border: '2px solid var(--bg, #0f1117)',
          animation: 'pulse 2s infinite',
        }} />

        {/* Icon: sparkles when closed, X when open */}
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <SparklesIcon size={22} color="white" />
        )}
      </button>
    </>
  );
}
