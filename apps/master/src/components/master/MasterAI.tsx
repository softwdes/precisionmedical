'use client';

import { useState, useRef, useEffect } from 'react';
import type { MasterAIMessage, MasterMetrics } from '@/types/master';

const V = '#534AB7';
const V_LIGHT = '#EEEDFE';
const V_TEXT = '#3C3489';

interface Props {
  adminId: string;
  metrics: MasterMetrics;
}

function buildWelcome(m: MasterMetrics): string {
  return `¡Hola! Tenés ${m.trainers_activos} trainers activos, ${m.trainers_trial} en trial y un MRR de $${m.mrr_actual.toLocaleString()}. Esta semana hay situaciones que requieren atención. La distribución actual muestra ${m.trainers_activos} activos y ${m.trainers_trial} en período de prueba con una tasa de conversión del ${m.trials_conv_rate}%. ¿En qué te puedo ayudar?`;
}

const QUICK = [
  'Trials por vencer',
  'Facturación del mes',
  'Top trainers',
  'Churn rate',
  'Sin actividad',
  'Uso IA total',
];

const uid = () => Math.random().toString(36).slice(2, 9);

export default function MasterAI({ adminId, metrics }: Props) {
  const [messages, setMessages] = useState<MasterAIMessage[]>([
    { id: 'welcome', role: 'assistant', content: buildWelcome(metrics), timestamp: new Date(0) },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [hasSpeech, setHasSpeech] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) setHasSpeech(true);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: MasterAIMessage = { id: uid(), role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/master/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, adminId }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: data.reply, timestamp: new Date() }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: `Error: ${data.error}`, timestamp: new Date() }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: 'Error de conexión. Intentá de nuevo.', timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  }

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'es-AR';
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      send(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  function timeLabel(d: Date) {
    if (d.getTime() === 0) return '';
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(83,74,183,0.05)' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: V, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 22, height: 22 }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--fg-strong)' }}>MasterAI — Agente SAAS</div>
          <div style={{ fontSize: '12px', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3FF8C8', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Activo · conectado a todos los datos
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '99px', background: 'rgba(83,74,183,0.2)', color: V, letterSpacing: '0.04em' }}>IA activa</span>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '99px', background: 'rgba(59,130,246,0.15)', color: '#60A5FA', letterSpacing: '0.04em' }}>Voz + texto</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ height: '340px', overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '10px' }}>
            {msg.role === 'assistant' && (
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: V, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 14, height: 14 }}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
            )}
            {msg.role === 'user' && (
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: V_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: V_TEXT }}>MA</span>
              </div>
            )}
            <div style={{ maxWidth: '75%' }}>
              <div style={{
                padding: '10px 14px', borderRadius: msg.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                background: msg.role === 'user' ? V_LIGHT : 'rgba(255,255,255,0.06)',
                color: msg.role === 'user' ? V_TEXT : 'var(--fg)',
                fontSize: '13px', lineHeight: 1.55,
              }}>
                {msg.content}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--fg-subtle)', marginTop: '4px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                {timeLabel(msg.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: V, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 14, height: 14 }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div style={{ padding: '10px 16px', borderRadius: '4px 14px 14px 14px', background: 'rgba(255,255,255,0.06)', display: 'flex', gap: '5px', alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fg-muted)', animation: `bounce 1s ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick buttons */}
      <div style={{ padding: '0 20px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {QUICK.map(q => (
          <button key={q} onClick={() => send(q)} disabled={loading}
            style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '99px', background: 'rgba(83,74,183,0.12)', border: '1px solid rgba(83,74,183,0.25)', color: V, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(83,74,183,0.22)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(83,74,183,0.12)')}>
            {q}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px', alignItems: 'center' }}>
        {hasSpeech && (
          <button onClick={toggleVoice} title={listening ? 'Detener' : 'Voz'}
            style={{ width: 38, height: 38, borderRadius: '50%', border: listening ? '2px solid #f87171' : '1px solid rgba(255,255,255,0.15)', background: listening ? 'rgba(248,113,113,0.1)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: listening ? 'pulse 1s infinite' : 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={listening ? '#f87171' : 'var(--fg-muted)'} strokeWidth="2" style={{ width: 16, height: 16 }}>
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
            </svg>
          </button>
        )}
        <input
          className="input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send(input))}
          placeholder="Preguntá sobre trainers, facturación, métricas del sistema..."
          disabled={loading}
          style={{ flex: 1, height: 38 }}
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()}
          style={{ width: 38, height: 38, borderRadius: '8px', background: input.trim() && !loading ? V : 'rgba(255,255,255,0.06)', border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 16, height: 16 }}>
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}
