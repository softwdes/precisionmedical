'use client';

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { createCuota } from '@/actions/finanzas';
import { marcarSesionCompletada } from '@/actions/metricas2';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type PendingAction =
  | {
      type: 'register_payment';
      student_id: string | null;
      student_name: string;
      monto: number;
      periodo: string;
      fecha_vencimiento: string;
    }
  | {
      type: 'mark_session_complete';
      student_id: string | null;
      student_name: string;
      fecha: string;
    };

interface Props {
  trainerId: string;
  onClose?: () => void;
}

const QUICK_PILLS = [
  'Alumnos activos',
  'Próximas a vencer',
  'Clases de hoy',
  'Adherencia del mes',
];

const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function formatPeriodo(ym: string) {
  const parts = ym.split('-');
  const y = parts[0] ?? ym;
  const m = parts[1] ?? '1';
  return `${MESES_FULL[parseInt(m, 10) - 1] ?? ym} ${y}`;
}

function fmtFecha(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${MESES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export default function TrainerAIChat({ trainerId, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '¡Hola! Soy TrainerAI. Puedo consultar datos y registrar pagos. ¿En qué te ayudo?' },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasSpeech, setHasSpeech] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [noSpeechMsg, setNoSpeechMsg] = useState(false);
  const [usage, setUsage] = useState({ usadas: 0, restantes: 100, limite: 100 });
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isConfirming, startConfirm] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setHasSpeech(
      typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    );
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
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
  }, [messages, isTyping, pendingAction]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isTyping) return;
      setPendingAction(null);
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
          action?: PendingAction;
          usage?: { usadas: number; restantes: number; limite: number };
        };
        if (data.error === 'limite_alcanzado') {
          setMessages([...next, { role: 'assistant', content: data.mensaje ?? 'Límite diario alcanzado.' }]);
          setUsage({ usadas: 100, restantes: 0, limite: 100 });
          return;
        }
        if (data.usage) setUsage(data.usage);
        setMessages([...next, { role: 'assistant', content: data.reply ?? 'Sin respuesta.' }]);
        if (data.action) setPendingAction(data.action);
      } catch {
        setMessages([...next, { role: 'assistant', content: 'Error al conectar. Intenta de nuevo.' }]);
      } finally {
        setIsTyping(false);
      }
    },
    [messages, isTyping, trainerId]
  );

  function confirmPayment() {
    if (!pendingAction || pendingAction.type !== 'register_payment' || !pendingAction.student_id) return;
    const action = pendingAction;
    startConfirm(async () => {
      const res = await createCuota({
        alumno_id: action.student_id!,
        monto: action.monto,
        fecha_vencimiento: action.fecha_vencimiento,
        periodo: action.periodo,
      });
      setPendingAction(null);
      if (res.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `No pude registrar el pago: ${res.error}` }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Pago registrado. S/ ${action.monto} para ${action.student_name} — ${formatPeriodo(action.periodo)}. Podés verlo en Finanzas.`,
        }]);
      }
    });
  }

  function confirmSession() {
    if (!pendingAction || pendingAction.type !== 'mark_session_complete' || !pendingAction.student_id) return;
    const action = pendingAction;
    startConfirm(async () => {
      const res = await marcarSesionCompletada(action.student_id!, action.fecha);
      setPendingAction(null);
      if (res.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `No pude marcar la sesión: ${res.error}` }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Sesión marcada como completada. ${action.student_name} — ${fmtFecha(action.fecha)}.`,
        }]);
      }
    });
  }

  const startListening = useCallback(() => {
    // Toggle off if already listening
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      setIsListening(false);
      return;
    }

    if (!hasSpeech) {
      setNoSpeechMsg(true);
      setTimeout(() => setNoSpeechMsg(false), 3500);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    // Abort any lingering session before starting a new one
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any;
    recognition.lang = 'es-PE';
    recognition.interimResults = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript: string = e.results?.[0]?.[0]?.transcript ?? '';
      if (transcript) sendMessage(transcript);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      recognitionRef.current = null;
      setIsListening(false);
      if (e.error === 'no-speech') {
        setNoSpeechMsg(true);
        setTimeout(() => setNoSpeechMsg(false), 2500);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
    }
  }, [hasSpeech, isListening, sendMessage]);

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
            Consultas + acciones
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

        {/* Action confirmation card */}
        {pendingAction && !isTyping && (
          <ActionCard
            action={pendingAction}
            isConfirming={isConfirming}
            onConfirmPayment={confirmPayment}
            onConfirmSession={confirmSession}
            onCancel={() => setPendingAction(null)}
          />
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
          flexDirection: 'column',
          gap: '6px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
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
              placeholder="Ej: registra un pago de 200 para Carlos..."
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
            <button
              onClick={startListening}
              disabled={isTyping}
              aria-label={isListening ? 'Escuchando...' : 'Dictar mensaje'}
              title={hasSpeech ? (isListening ? 'Escuchando...' : 'Dictar mensaje') : 'Requiere Chrome o Edge'}
              style={{
                width: 38,
                flexShrink: 0,
                background: isListening ? 'var(--accent)' : 'var(--bg-row)',
                border: `1px solid ${isListening ? 'var(--accent)' : noSpeechMsg ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
                borderRadius: '6px',
                color: isListening ? 'var(--fg-on-accent)' : noSpeechMsg ? '#ef4444' : 'var(--fg-muted)',
                cursor: isTyping ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              }}
            >
              {isListening ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                </svg>
              )}
            </button>
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
          {noSpeechMsg && (
            <div style={{
              fontSize: '11px',
              color: '#ef4444',
              padding: '4px 6px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '4px',
              animation: 'fadeIn 0.2s ease-out',
            }}>
              Tu navegador no soporta dictado por voz. Usá Chrome o Edge.
            </div>
          )}
          {isListening && (
            <div style={{
              fontSize: '11px',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite' }} />
              Escuchando... hablá ahora
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionCard({
  action, isConfirming, onConfirmPayment, onConfirmSession, onCancel,
}: {
  action: PendingAction;
  isConfirming: boolean;
  onConfirmPayment: () => void;
  onConfirmSession: () => void;
  onCancel: () => void;
}) {
  const isPayment = action.type === 'register_payment';
  const rows: [string, string][] = isPayment && action.type === 'register_payment'
    ? [
        ['Alumno', action.student_name],
        ['Monto', `S/ ${action.monto}`],
        ['Período', formatPeriodo(action.periodo)],
        ['Vencimiento', action.fecha_vencimiento],
      ]
    : action.type === 'mark_session_complete'
      ? [
          ['Alumno', action.student_name],
          ['Fecha', fmtFecha(action.fecha)],
        ]
      : [];

  return (
    <div style={{
      marginLeft: '36px',
      background: 'var(--bg-row)',
      border: '1px solid var(--accent)',
      borderRadius: '10px',
      padding: '14px 16px',
      animation: 'fadeIn 0.25s ease-out',
    }}>
      <div style={{
        fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--accent)', marginBottom: '10px',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        {isPayment ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
        {isPayment ? 'Confirmar registro de pago' : 'Confirmar sesión completada'}
      </div>

      {action.student_id ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginBottom: '12px' }}>
            {rows.map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: '10px', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                <div style={{ fontSize: '13px', color: 'var(--fg-strong)', fontWeight: 600, marginTop: '2px' }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={isPayment ? onConfirmPayment : onConfirmSession}
              disabled={isConfirming}
              style={{
                padding: '7px 18px',
                background: isConfirming ? 'rgba(63,248,200,0.3)' : 'var(--accent)',
                color: 'var(--fg-on-accent)',
                border: 'none', borderRadius: '6px',
                fontSize: '11px', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                cursor: isConfirming ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {isConfirming ? 'Guardando...' : 'Confirmar'}
            </button>
            <button
              onClick={onCancel}
              disabled={isConfirming}
              style={{
                padding: '7px 14px',
                background: 'none',
                border: '1px solid var(--border-strong)',
                borderRadius: '6px',
                fontSize: '11px', color: 'var(--fg-muted)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: '13px', color: '#ef4444' }}>
          No encontré a &quot;{action.student_name}&quot; en el sistema. Verificá el nombre e intentá de nuevo.
        </div>
      )}
    </div>
  );
}

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
