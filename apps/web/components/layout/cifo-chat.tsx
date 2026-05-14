'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@precision-medical/ui';
import { X, Mic, MicOff, Send, Sparkles } from 'lucide-react';

export function CifoChat(): React.ReactElement {
  const t = useTranslations('cifo');
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const handleSend = (): void => {
    if (!input.trim()) return;
    setInput('');
  };

  const handleKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <>
      {/* ── Popup ── */}
      <div
        className={cn(
          'fixed bottom-[88px] right-6 z-[90] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-border bg-bg-1 shadow-2xl flex flex-col overflow-hidden',
          'transition-all duration-300 ease-out-expo origin-bottom-right',
          open
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-95 translate-y-4 pointer-events-none',
        )}
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.40), 0 0 0 1px rgba(99,102,241,0.12)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.08) 50%, rgba(6,182,212,0.06) 100%)' }}>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[10px] shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 60%, #06B6D4 100%)', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}
          >
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-small font-bold text-text-1">CIFO</span>
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.20)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
                Fase 4
              </span>
            </div>
            <p className="text-[10px] text-text-muted leading-none mt-0.5">Precision Medical · AI Agent</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-3 hover:bg-surface hover:text-text-1 transition-all shrink-0"
            aria-label={t('close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[180px] max-h-[260px]">
          {/* Greeting bubble */}
          <div className="flex items-start gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-[8px] shrink-0 mt-0.5"
              style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 60%, #06B6D4 100%)' }}
            >
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div
              className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[260px]"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.14)' }}
            >
              <p className="text-small text-text-1 leading-relaxed">{t('greeting')}</p>
            </div>
          </div>

          {/* Phase 4 notice */}
          <div
            className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.14)' }}
          >
            <span className="text-amber text-base mt-0.5 shrink-0">⚡</span>
            <p className="text-tiny text-text-3 leading-relaxed">
              CIFO estará completamente operativo en la <span className="font-semibold text-amber">Fase 4</span>. Por ahora puedes explorar la interfaz.
            </p>
          </div>
        </div>

        {/* Mic listening indicator */}
        {listening && (
          <div
            className="flex items-center gap-2 mx-4 mb-2 rounded-xl px-3 py-2"
            style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.20)' }}
          >
            <span className="h-2 w-2 rounded-full bg-cyan animate-pulse" style={{ boxShadow: '0 0 8px #06B6D4' }} />
            <span className="text-tiny font-medium text-cyan">{t('listening')}</span>
            <div className="flex items-end gap-0.5 ml-auto h-4">
              {[3, 5, 4, 6, 3, 5, 4].map((h, i) => (
                <span
                  key={i}
                  className="w-0.5 rounded-full bg-cyan/60"
                  style={{ height: `${h * 2}px`, animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-center gap-2 px-3 py-3 border-t border-border">
          <button
            onClick={() => setListening((v) => !v)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-all',
              listening
                ? 'text-white'
                : 'text-text-3 hover:text-text-1 hover:bg-surface',
            )}
            style={listening ? {
              background: 'linear-gradient(135deg, #06B6D4, #0891B2)',
              boxShadow: '0 0 12px rgba(6,182,212,0.5)',
            } : undefined}
            aria-label={listening ? t('mute') : t('unmute')}
          >
            {listening ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          </button>

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('placeholder')}
            className="flex-1 min-w-0 h-8 rounded-lg border border-border bg-surface px-3 text-small text-text-1 placeholder:text-text-muted outline-none focus:border-brand/50 transition-colors"
          />

          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-all',
              input.trim()
                ? 'text-white'
                : 'text-text-muted cursor-not-allowed opacity-40',
            )}
            style={input.trim() ? {
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
            } : undefined}
            aria-label="Enviar"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── FAB ── */}
      <button
        onClick={() => { setOpen((v) => !v); if (listening) setListening(false); }}
        className="fixed bottom-6 right-6 z-[90] flex h-14 w-14 items-center justify-center rounded-[18px] text-white cifo-fab"
        style={{
          background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 55%, #06B6D4 100%)',
          boxShadow: '0 12px 32px rgba(99,102,241,0.45)',
        }}
        aria-label={open ? t('close') : t('open')}
      >
        {open ? (
          <X className="h-5 w-5 relative z-10 transition-transform duration-200" />
        ) : (
          <Sparkles className="h-5 w-5 relative z-10 transition-transform duration-200" />
        )}
        {/* Glass shine */}
        <span
          className="absolute rounded-full pointer-events-none"
          style={{
            top: 8, left: 12, width: 14, height: 14,
            background: 'rgba(255,255,255,0.45)',
            filter: 'blur(2px)',
          }}
        />
      </button>

      <style>{`
        .cifo-fab {
          animation: cifo-breathe 3s ease-in-out infinite;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .cifo-fab:hover {
          transform: scale(1.08) rotate(-6deg);
          box-shadow: 0 16px 40px rgba(99,102,241,0.55) !important;
          animation-play-state: paused;
        }
        @keyframes cifo-breathe {
          0%,100% { box-shadow: 0 12px 32px rgba(99,102,241,0.45), 0 0 0 0 rgba(99,102,241,0.35); }
          50%      { box-shadow: 0 12px 36px rgba(99,102,241,0.55), 0 0 0 8px rgba(99,102,241,0); }
        }
      `}</style>
    </>
  );
}
