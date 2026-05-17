'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { cn } from '@precision/ui';
import { X, Mic, MicOff, Send, Sparkles } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  isError?: boolean;
}

interface SessionHistoryMessage {
  role: string;
  content: string;
  created_at: string;
  language: string;
}

const SUGGESTIONS: Record<'es' | 'en', string[]> = {
  es: [
    '¿Cómo está el sistema hoy?',
    '¿Cuánto hay en caja chica?',
    '¿Hay hallazgos del Audit Agent?',
    'Resumen de empleados activos',
  ],
  en: [
    'How is the system today?',
    "What's the petty cash balance?",
    'Any Audit Agent findings?',
    'Summary of active employees',
  ],
};

function detectLanguage(text: string): 'es' | 'en' {
  const spanishWords = ['hola', 'qué', 'cómo', 'cuánto', 'cuál', 'hay', 'dame', 'muestra', 'dime', 'está', 'son', 'tiene', 'puedes', 'gracias', 'resumen', 'empleados', 'pago', 'quiero', 'necesito'];
  return spanishWords.some(w => text.toLowerCase().includes(w)) ? 'es' : 'en';
}

export function CifoChat(): React.ReactElement {
  const t = useTranslations('cifo');
  const locale = useLocale();
  const defaultLang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';

  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<'es' | 'en'>(defaultLang);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t('greeting'), timestamp: new Date() },
  ]);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<unknown>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for "open session" events dispatched from the CIFO tab
  useEffect(() => {
    const handler = (e: Event): void => {
      const sid = (e as CustomEvent<{ sessionId: string }>).detail.sessionId;
      setOpen(true);
      setSessionId(sid);
      setShowSuggestions(false);

      // Load session history
      fetch(`/api/cifo/chat?session_id=${sid}`)
        .then(res => res.json() as Promise<{ messages: SessionHistoryMessage[] }>)
        .then(data => {
          if (data.messages?.length) {
            setMessages(
              data.messages.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
                timestamp: new Date(m.created_at),
              })),
            );
            const lastLang = data.messages[data.messages.length - 1]?.language as 'es' | 'en' | undefined;
            if (lastLang) setLanguage(lastLang);
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener('cifo:open-session', handler);
    return () => window.removeEventListener('cifo:open-session', handler);
  }, []);

  type AnyRecognition = {
    lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
    start(): void; stop(): void;
    onstart: (() => void) | null;
    onresult: ((e: { resultIndex: number; results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
  };

  const stopListening = (): void => {
    (recognitionRef.current as AnyRecognition | null)?.stop();
    recognitionRef.current = null;
    setListening(false);
  };

  const toggleMic = (): void => {
    if (listening) { stopListening(); return; }

    const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null;
    const RecognitionCtor = (win?.['SpeechRecognition'] ?? win?.['webkitSpeechRecognition']) as (new () => AnyRecognition) | undefined;

    if (!RecognitionCtor) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: language === 'es'
          ? 'Tu navegador no soporta reconocimiento de voz. Prueba con Chrome.'
          : 'Your browser does not support voice recognition. Try Chrome.',
        timestamp: new Date(),
        isError: true,
      }]);
      return;
    }

    const recognition = new RecognitionCtor();
    recognition.lang = language === 'es' ? 'es-ES' : 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = (): void => { setListening(true); };

    recognition.onresult = (event): void => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i]?.[0]?.transcript ?? '';
        if (event.results[i]?.isFinal) { final += transcript; }
        else { interim += transcript; }
      }
      if (interim) setInput(interim);
      if (final.trim()) {
        setInput('');
        stopListening();
        void sendMessage(final.trim());
      }
    };

    recognition.onerror = (event): void => {
      console.error('Speech recognition error:', event.error);
      stopListening();
      if (event.error === 'not-allowed') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: language === 'es'
            ? 'Permiso de micrófono denegado. Habilítalo en la configuración del navegador.'
            : 'Microphone permission denied. Enable it in your browser settings.',
          timestamp: new Date(),
          isError: true,
        }]);
      }
    };

    recognition.onend = (): void => { setListening(false); };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const resetChat = (): void => {
    setSessionId(null);
    setMessages([{ role: 'assistant', content: t('greeting'), timestamp: new Date() }]);
    setShowSuggestions(true);
    setLanguage(defaultLang);
    setInput('');
  };

  const handleClose = (): void => {
    stopListening();
    setOpen(false);
    resetChat();
  };

  const sendMessage = async (userMessage: string): Promise<void> => {
    if (!userMessage.trim() || isLoading) return;

    const detectedLang = detectLanguage(userMessage);
    setShowSuggestions(false);

    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '...', timestamp: new Date(), isLoading: true }]);

    try {
      const response = await fetch('/api/cifo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, session_id: sessionId, language: detectedLang }),
      });

      const data = await response.json() as { message: string; session_id: string; language: string; error?: string };

      setMessages(prev => [
        ...prev.filter(m => !m.isLoading),
        { role: 'assistant', content: data.message, timestamp: new Date() },
      ]);

      if (data.session_id && !sessionId) setSessionId(data.session_id);
      if (data.language) setLanguage(data.language as 'es' | 'en');
    } catch {
      setMessages(prev => [
        ...prev.filter(m => !m.isLoading),
        {
          role: 'assistant',
          content: language === 'es' ? 'Error de conexión. Intenta de nuevo.' : 'Connection error. Please try again.',
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = (): void => {
    if (!input.trim() || isLoading) return;
    const msg = input;
    setInput('');
    void sendMessage(msg);
  };

  const handleKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') handleClose();
  };

  return (
    <>
      {/* ── Popup ── */}
      <div
        className={cn(
          'fixed bottom-[88px] right-6 z-[90] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-border bg-bg-1 shadow-2xl flex flex-col overflow-hidden',
          'transition-all duration-300 ease-out-expo origin-bottom-right',
          open ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 translate-y-4 pointer-events-none',
        )}
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.40), 0 0 0 1px rgba(99,102,241,0.12)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-border"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.08) 50%, rgba(6,182,212,0.06) 100%)' }}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[10px] shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 60%, #06B6D4 100%)', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}
          >
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-small font-bold text-text-1">CIFO</span>
              {/* Language pill */}
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                style={{ background: 'rgba(99,102,241,0.12)', color: '#6366F1', border: '1px solid rgba(99,102,241,0.25)' }}
              >
                {language.toUpperCase()}
              </span>
              {/* Live indicator */}
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.20)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#10B981' }} />
                Live
              </span>
            </div>
            <p className="text-[10px] text-text-muted leading-none mt-0.5">Precision Medical · AI Agent</p>
          </div>
          <button
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-3 hover:bg-surface hover:text-text-1 transition-all shrink-0"
            aria-label={t('close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[200px] max-h-[300px]">
          {messages.map((msg, i) => (
            msg.role === 'assistant' ? (
              <div key={i} className="flex items-start gap-2.5">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-[8px] shrink-0 mt-0.5"
                  style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 60%, #06B6D4 100%)' }}
                >
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <div
                  className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[260px]"
                  style={msg.isError
                    ? { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }
                    : { background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.14)' }}
                >
                  {msg.isLoading ? (
                    <div className="flex items-center gap-1 py-0.5">
                      {[0, 150, 300].map(delay => (
                        <span
                          key={delay}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: 'rgba(99,102,241,0.6)', animation: `cifo-dot 1.2s ease-in-out ${delay}ms infinite` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-small text-text-1 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-end">
                <div
                  className="rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[240px]"
                  style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.14))', border: '1px solid rgba(99,102,241,0.25)' }}
                >
                  <p className="text-small text-text-1 leading-relaxed">{msg.content}</p>
                </div>
              </div>
            )
          ))}

          {/* Suggested questions — visible until first message sent */}
          {showSuggestions && messages.length === 1 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGGESTIONS[language].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => void sendMessage(suggestion)}
                  className="text-[11px] px-3 py-1.5 rounded-full cursor-pointer transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.20)', color: '#6366F1' }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Mic indicator */}
        {listening && (
          <div
            className="flex items-center gap-2 mx-4 mb-2 rounded-xl px-3 py-2"
            style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.20)' }}
          >
            <span className="h-2 w-2 rounded-full bg-cyan animate-pulse" style={{ boxShadow: '0 0 8px #06B6D4' }} />
            <span className="text-tiny font-medium text-cyan">{t('listening')}</span>
            <div className="flex items-end gap-0.5 ml-auto h-4">
              {[3, 5, 4, 6, 3, 5, 4].map((h, i) => (
                <span key={i} className="w-0.5 rounded-full bg-cyan/60" style={{ height: `${h * 2}px` }} />
              ))}
            </div>
          </div>
        )}

        {/* Max length warning */}
        {input.length > 1800 && (
          <p className="text-[10px] text-amber mx-4 mb-1">
            {input.length}/2000 {language === 'es' ? 'caracteres' : 'characters'}
          </p>
        )}

        {/* Input row */}
        <div className="flex items-center gap-2 px-3 py-3 border-t border-border">
          <button
            onClick={toggleMic}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-all',
              listening ? 'text-white' : 'text-text-3 hover:text-text-1 hover:bg-surface',
            )}
            style={listening ? { background: 'linear-gradient(135deg, #06B6D4, #0891B2)', boxShadow: '0 0 12px rgba(6,182,212,0.5)' } : undefined}
            aria-label={listening ? t('mute') : t('unmute')}
          >
            {listening ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          </button>

          <input
            ref={inputRef}
            value={input}
            maxLength={2000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('placeholder')}
            disabled={isLoading}
            className="flex-1 min-w-0 h-8 rounded-lg border border-border bg-surface px-3 text-small text-text-1 placeholder:text-text-muted outline-none focus:border-brand/50 transition-colors disabled:opacity-60"
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-all',
              input.trim() && !isLoading ? 'text-white' : 'text-text-muted cursor-not-allowed opacity-40',
            )}
            style={input.trim() && !isLoading
              ? { background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }
              : undefined}
            aria-label="Enviar"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── FAB ── */}
      <button
        onClick={() => { setOpen(v => !v); if (listening) stopListening(); }}
        className="fixed bottom-6 right-6 z-[90] flex h-14 w-14 items-center justify-center rounded-[18px] text-white cifo-fab"
        style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 55%, #06B6D4 100%)', boxShadow: '0 12px 32px rgba(99,102,241,0.45)' }}
        aria-label={open ? t('close') : t('open')}
      >
        {open
          ? <X className="h-5 w-5 relative z-10 transition-transform duration-200" />
          : <Sparkles className="h-5 w-5 relative z-10 transition-transform duration-200" />}
        <span
          className="absolute rounded-full pointer-events-none"
          style={{ top: 8, left: 12, width: 14, height: 14, background: 'rgba(255,255,255,0.45)', filter: 'blur(2px)' }}
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
        @keyframes cifo-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </>
  );
}
