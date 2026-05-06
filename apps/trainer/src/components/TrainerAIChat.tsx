'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  trainerId: string;
  onClose?: () => void;
}

const QUICK_PILLS = [
  '¿Quién no pagó?',
  'Baja adherencia',
  'Resumen cobros',
  'Clases de hoy',
  'Progreso peso',
  'Rutinas por vencer',
];

export default function TrainerAIChat({ trainerId, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '¡Hola! Soy TrainerAI. ¿En qué puedo ayudarte hoy?' },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasSpeech, setHasSpeech] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [usage, setUsage] = useState({ usadas: 0, restantes: 100, limite: 100 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHasSpeech(
      typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    );
  }, []);

  useEffect(() => {
    if (!trainerId) return;
    fetch(`/api/ai/usage?trainerId=${trainerId}`)
      .then((r) => r.json())
      .then((d: { usadas?: number; restantes?: number; limite?: number }) => {
        setUsage({ usadas: d.usadas ?? 0, restantes: d.restantes ?? 100, limite: d.limite ?? 100 });
      })
      .catch(() => {});
  }, [trainerId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isTyping) return;
      const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
      setMessages(next);
      setInputText('');
      setIsTyping(true);
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next, trainerId }),
        });
        const data = (await res.json()) as {
          reply?: string;
          error?: string;
          mensaje?: string;
          usage?: { usadas: number; restantes: number; limite: number };
        };
        if (data.error === 'limite_alcanzado') {
          setMessages([...next, { role: 'assistant', content: data.mensaje ?? 'Límite diario alcanzado.' }]);
          setUsage({ usadas: 100, restantes: 0, limite: 100 });
          return;
        }
        if (data.usage) setUsage(data.usage);
        setMessages([...next, { role: 'assistant', content: data.reply ?? 'Sin respuesta.' }]);
      } catch {
        setMessages([...next, { role: 'assistant', content: 'Error al conectar. Intenta de nuevo.' }]);
      } finally {
        setIsTyping(false);
      }
    },
    [messages, isTyping, trainerId]
  );

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any;
    recognition.lang = 'es-PE';
    recognition.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript: string = e.results?.[0]?.[0]?.transcript ?? '';
      if (transcript) sendMessage(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  }, [sendMessage]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'var(--bg-header-card)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32,
          borderRadius: '8px',
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <SparklesIcon size={17} color="var(--fg-on-accent)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-strong)' }}>
            TrainerAI
          </div>
          <div style={{ fontSize: '10px', color: 'var(--accent)', letterSpacing: '0.05em' }}>
            Asistente inteligente
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '10px', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>En línea</span>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 2s infinite' }} />
          </div>
          <UsageBar usadas={usage.usadas} limite={usage.limite} />
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              marginLeft: '4px',
              color: 'var(--fg-muted)',
              fontSize: 16,
              lineHeight: 1,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: '8px',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <div style={{
              width: 28, height: 28,
              borderRadius: '6px',
              background: msg.role === 'assistant' ? 'var(--accent)' : 'var(--bg-row-active)',
              border: msg.role === 'user' ? '1px solid var(--border-strong)' : 'none',
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              color: msg.role === 'assistant' ? 'var(--fg-on-accent)' : 'var(--accent)',
              letterSpacing: '0.04em',
            }}>
              {msg.role === 'assistant' ? 'AI' : 'TR'}
            </div>
            <div style={{
              maxWidth: '75%',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: 1.55,
              background: msg.role === 'assistant' ? 'var(--bg-row)' : '#E1F5EE',
              color: msg.role === 'assistant' ? 'var(--fg)' : '#0A2E24',
              border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '6px',
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: 'var(--fg-on-accent)',
            }}>AI</div>
            <div style={{ background: 'var(--bg-row)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: '8px' }}>
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick pills */}
      <div style={{
        padding: '6px 12px',
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {QUICK_PILLS.map((q) => (
          <button
            key={q}
            onClick={() => sendMessage(q)}
            disabled={isTyping || usage.restantes === 0}
            style={{
              padding: '3px 10px',
              borderRadius: '999px',
              border: '1px solid var(--border-strong)',
              background: 'transparent',
              fontSize: '11px',
              color: 'var(--fg-muted)',
              cursor: isTyping || usage.restantes === 0 ? 'not-allowed' : 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      {usage.restantes === 0 ? (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>
            Límite diario alcanzado
          </div>
          <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
            Se renueva mañana a las 00:00
          </div>
        </div>
      ) : (
        <div style={{
          padding: '10px 12px',
          display: 'flex',
          gap: '8px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(inputText);
              }
            }}
            placeholder="Escribe tu consulta..."
            style={{
              flex: 1,
              background: 'var(--bg-row)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '13px',
              color: 'var(--fg)',
              outline: 'none',
            }}
          />
          {hasSpeech && (
            <button
              onClick={startListening}
              disabled={isTyping}
              aria-label={isListening ? 'Escuchando...' : 'Dictar mensaje'}
              style={{
                padding: '0 12px',
                background: isListening ? 'var(--accent)' : 'var(--bg-row)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: isListening ? 'var(--fg-on-accent)' : 'var(--fg-muted)',
                cursor: isTyping ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </button>
          )}
          <button
            onClick={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isTyping}
            style={{
              padding: '8px 16px',
              background: !inputText.trim() || isTyping ? 'var(--bg-row)' : 'var(--accent)',
              color: !inputText.trim() || isTyping ? 'var(--fg-muted)' : 'var(--fg-on-accent)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor: !inputText.trim() || isTyping ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            Enviar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export function SparklesIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path
        fillRule="evenodd"
        d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 010 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 01-1.422 0l-.395-1.183a1.5 1.5 0 00-.948-.948l-1.183-.395a.75.75 0 010-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0116.5 15z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function UsageBar({ usadas, limite }: { usadas: number; limite: number }) {
  const pct = Math.min(100, Math.round((usadas / limite) * 100));
  const color = usadas < limite - 5 ? '#1D9E75' : usadas < limite - 2 ? '#EF9F27' : '#FF6B6B';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <span style={{ fontSize: '10px', color: 'var(--fg-muted)', letterSpacing: '0.05em' }}>
        {usadas} / {limite}
      </span>
      <div style={{ width: 60, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

function TypingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % 4), 400);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ fontSize: '13px', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 2 }}>
      Escribiendo{'.'.repeat(frame)}
    </span>
  );
}
