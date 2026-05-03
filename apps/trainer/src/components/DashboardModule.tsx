'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Metrics {
  alumnosActivos: number;
  cobradoMes: number;
  adherenciaGlobal: number | null;
  clasesCompletadas: number;
  clasesPendientes: number;
}

interface Alertas {
  cuotasVencidas: number;
  cuotasProximas: number;
  alumnosBajaAdherencia: string[];
}

interface ClaseHoy {
  id: string;
  titulo: string;
  hora_inicio: string;
  hora_fin: string;
  tipo: string;
  color: string;
}

interface PagoUrgente {
  id: string;
  alumnoNombre: string;
  monto: number;
  fechaVencimiento: string;
  estado: string;
}

interface ActividadItem {
  id: string;
  tipo: 'pago' | 'alumno' | 'clase';
  descripcion: string;
  tiempo: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DashboardModuleProps {
  trainerId: string;
  initialMetrics: Metrics;
  alertas: Alertas;
  clasesHoy: ClaseHoy[];
  pagosUrgentes: PagoUrgente[];
  actividadReciente: ActividadItem[];
  adherenciaSemanal: number[];
  capacidadMax: number;
  metaMensual: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  green: '#22C55E',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  amber: '#F59E0B',
  coral: '#F87171',
};

const TIPO_LABEL: Record<string, string> = {
  personal: 'Personal',
  grupal: 'Grupal',
  evaluacion: 'Evaluación',
  bloque: 'Bloque',
};

function diasHasta(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardModule({
  trainerId,
  initialMetrics,
  alertas,
  clasesHoy,
  pagosUrgentes,
  actividadReciente,
  adherenciaSemanal,
  capacidadMax,
  metaMensual,
}: DashboardModuleProps) {
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [clock, setClock] = useState('');
  const [alertaDismissed, setAlertaDismissed] = useState(false);
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasSpeech, setHasSpeech] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [usage, setUsage] = useState({ usadas: 0, restantes: 10, limite: 10 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Clock ──
  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString('es-PE', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Speech detection ──
  useEffect(() => {
    setHasSpeech(
      typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    );
  }, []);

  // ── Fetch usage on mount ──
  useEffect(() => {
    if (!trainerId) return;
    fetch(`/api/ai/usage?trainerId=${trainerId}`)
      .then((r) => r.json())
      .then((d: { usadas?: number; restantes?: number; limite?: number }) => {
        setUsage({ usadas: d.usadas ?? 0, restantes: d.restantes ?? 10, limite: d.limite ?? 10 });
      })
      .catch(() => {});
  }, [trainerId]);

  // ── Welcome message ──
  useEffect(() => {
    const total = initialMetrics.clasesCompletadas + initialMetrics.clasesPendientes;
    const lines = [
      `¡Hola! Aquí tu resumen del día 📋`,
      `• ${initialMetrics.alumnosActivos} alumnos activos`,
      `• ${total} clase${total !== 1 ? 's' : ''} hoy (${initialMetrics.clasesCompletadas} completada${initialMetrics.clasesCompletadas !== 1 ? 's' : ''})`,
      `• S/ ${initialMetrics.cobradoMes.toFixed(0)} cobrado este mes`,
      alertas.cuotasVencidas > 0
        ? `• ⚠️ ${alertas.cuotasVencidas} cuota${alertas.cuotasVencidas !== 1 ? 's' : ''} vencida${alertas.cuotasVencidas !== 1 ? 's' : ''}`
        : null,
      `\n¿En qué puedo ayudarte?`,
    ]
      .filter(Boolean)
      .join('\n');
    setMessages([{ role: 'assistant', content: lines }]);
  }, []);

  // ── Scroll to bottom on new message ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Pulse trigger ──
  const triggerPulse = useCallback((key: string) => {
    setPulsing((prev) => new Set([...prev, key]));
    setTimeout(() => {
      setPulsing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 1600);
  }, []);

  // ── Realtime subscriptions ──
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const refreshCobrado = async () => {
      const today = new Date().toISOString().split('T')[0] as string;
      const startOfMonth = `${today.slice(0, 7)}-01`;
      const { data } = await supabase
        .from('cuotas')
        .select('monto')
        .eq('trainer_id', trainerId)
        .eq('estado', 'pagado')
        .gte('fecha_pago', startOfMonth);
      const total = (data ?? []).reduce((acc, c) => acc + Number(c.monto), 0);
      setMetrics((prev) => ({ ...prev, cobradoMes: total }));
      triggerPulse('cobrado');
    };

    const refreshAdherencia = async () => {
      const today = new Date().toISOString().split('T')[0] as string;
      const ago28 = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0] as string;
      const { data } = await supabase
        .from('sesiones_entrenamiento')
        .select('alumno_id, completada')
        .gte('fecha', ago28)
        .lte('fecha', today);
      if (!data || data.length === 0) return;
      const map = new Map<string, { total: number; done: number }>();
      for (const s of data) {
        const prev = map.get(s.alumno_id) ?? { total: 0, done: 0 };
        map.set(s.alumno_id, { total: prev.total + 1, done: prev.done + (s.completada ? 1 : 0) });
      }
      const vals = Array.from(map.values());
      const avg = Math.round(vals.reduce((a, v) => a + (v.done / v.total) * 100, 0) / vals.length);
      setMetrics((prev) => ({ ...prev, adherenciaGlobal: avg }));
      triggerPulse('adherencia');
    };

    const channel = supabase
      .channel('dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cuotas' },
        refreshCobrado
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sesiones_entrenamiento' },
        refreshAdherencia
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trainerId, triggerPulse]);

  // ── AI Chat ──
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
          setUsage({ usadas: 10, restantes: 0, limite: 10 });
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
    [messages, isTyping]
  );

  // ── Voice ──
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

  // ─── Derived values ───────────────────────────────────────────────────────
  const alumnosPct = Math.min(100, Math.round((metrics.alumnosActivos / capacidadMax) * 100));
  const cobradoPct = Math.min(100, Math.round((metrics.cobradoMes / metaMensual) * 100));
  const adherenciaPct = metrics.adherenciaGlobal ?? 0;
  const clasesTotal = metrics.clasesCompletadas + metrics.clasesPendientes;
  const clasesPct = clasesTotal > 0 ? Math.round((metrics.clasesCompletadas / clasesTotal) * 100) : 0;
  const showAlert =
    !alertaDismissed &&
    (alertas.cuotasVencidas > 0 ||
      alertas.cuotasProximas > 0 ||
      alertas.alumnosBajaAdherencia.length > 0);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>

      {/* ── Alert Banner ─────────────────────────────────── */}
      {showAlert && (
        <div style={{
          background: 'rgba(245, 193, 108, 0.10)',
          border: '1px solid rgba(245, 193, 108, 0.35)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          animation: 'fadeIn 0.3s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--warning)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase' }}>
              ⚠ Alertas
            </span>
            {alertas.cuotasVencidas > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                {alertas.cuotasVencidas} cuota{alertas.cuotasVencidas !== 1 ? 's' : ''} vencida{alertas.cuotasVencidas !== 1 ? 's' : ''}
              </span>
            )}
            {alertas.cuotasProximas > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                · {alertas.cuotasProximas} vence{alertas.cuotasProximas !== 1 ? 'n' : ''} pronto
              </span>
            )}
            {alertas.alumnosBajaAdherencia.length > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                · Baja adherencia: {alertas.alumnosBajaAdherencia.join(', ')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexShrink: 0 }}>
            <Link href="/finanzas" style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', fontWeight: 700 }}>
              Ver pagos →
            </Link>
            <button
              onClick={() => setAlertaDismissed(true)}
              style={{ color: 'var(--fg-muted)', fontSize: 16, lineHeight: 1 }}
              aria-label="Cerrar alerta"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Section Head ─────────────────────────────────── */}
      <section className="section-head">
        <span className="eyebrow">Telemetría // 01</span>
        <h1>Centro de Control</h1>
      </section>

      {/* ── 4 Metric Cards ───────────────────────────────── */}
      <section className="metrics-row">
        {/* Alumnos Activos */}
        <MetricCard
          label="Alumnos Activos"
          value={String(metrics.alumnosActivos)}
          sub={`Cap. ${alumnosPct}%`}
          pct={alumnosPct}
          color="#1D9E75"
          pulsing={pulsing.has('alumnos')}
        />
        {/* Cobrado Este Mes */}
        <MetricCard
          label="Cobrado Este Mes"
          value={`S/ ${metrics.cobradoMes >= 1000 ? (metrics.cobradoMes / 1000).toFixed(1) + 'k' : metrics.cobradoMes.toFixed(0)}`}
          sub={`${cobradoPct}% meta`}
          pct={cobradoPct}
          color="#378ADD"
          pulsing={pulsing.has('cobrado')}
        />
        {/* Adherencia Global */}
        <MetricCard
          label="Adherencia Global"
          value={metrics.adherenciaGlobal !== null ? `${metrics.adherenciaGlobal}%` : '—'}
          sub="Últimas 4 semanas"
          pct={adherenciaPct}
          color="#7F77DD"
          pulsing={pulsing.has('adherencia')}
        />
        {/* Clases Hoy */}
        <MetricCard
          label="Clases Hoy"
          value={String(clasesTotal)}
          sub={`${metrics.clasesCompletadas} completadas · ${metrics.clasesPendientes} pendientes`}
          pct={clasesPct}
          color="#EF9F27"
          pulsing={pulsing.has('clases')}
        />
      </section>

      {/* ── TrainerAI Panel ───────────────────────────────── */}
      <section>
        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            background: 'var(--bg-header-card)',
          }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg-on-accent)' }}>
                <path d="M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2z"/>
                <path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--fg-strong)' }}>
                TrainerAI
              </div>
              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--accent)', letterSpacing: 'var(--tracking-wide)' }}>
                Asistente inteligente
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>En línea</span>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 2s infinite' }} />
              </div>
              <UsageBar usadas={usage.usadas} limite={usage.limite} />
            </div>
          </div>

          {/* Messages */}
          <div style={{
            height: 300,
            overflowY: 'auto',
            padding: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  animation: 'fadeIn 0.2s ease-out',
                }}
              >
                <div style={{
                  width: 28, height: 28,
                  borderRadius: 'var(--radius-sm)',
                  background: msg.role === 'assistant' ? 'var(--accent)' : 'var(--bg-row-active)',
                  border: msg.role === 'user' ? '1px solid var(--border-strong)' : 'none',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: msg.role === 'assistant' ? 'var(--fg-on-accent)' : 'var(--accent)',
                  letterSpacing: '0.04em',
                }}>
                  {msg.role === 'assistant' ? 'AI' : 'TR'}
                </div>
                <div style={{
                  maxWidth: '75%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
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
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <div style={{
                  width: 28, height: 28,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: 'var(--fg-on-accent)',
                }}>
                  AI
                </div>
                <div style={{ background: 'var(--bg-row)', border: '1px solid var(--border)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick pills */}
          <div style={{ padding: 'var(--space-2) var(--space-4)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
            {['¿Quién no pagó?', 'Baja adherencia', 'Resumen cobros', 'Clases de hoy', 'Progreso peso', 'Rutinas por vencer'].map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={isTyping}
                style={{
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--border-strong)',
                  background: 'transparent',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--fg-muted)',
                  cursor: isTyping ? 'not-allowed' : 'pointer',
                  transition: 'color var(--t), border-color var(--t)',
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input row */}
          {usage.restantes === 0 ? (
            <div style={{
              padding: 'var(--space-4) var(--space-5)',
              borderTop: '1px solid var(--border)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>
                Límite diario alcanzado
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                Se renueva mañana a las 00:00
              </div>
            </div>
          ) : (
            <div style={{
              padding: 'var(--space-3) var(--space-4)',
              display: 'flex',
              gap: 'var(--space-2)',
              borderTop: '1px solid var(--border)',
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
                  borderRadius: 'var(--radius)',
                  padding: 'var(--space-2) var(--space-3)',
                  fontSize: 'var(--text-sm)',
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
                    padding: '0 var(--space-3)',
                    background: isListening ? 'var(--accent)' : 'var(--bg-row)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    color: isListening ? 'var(--fg-on-accent)' : 'var(--fg-muted)',
                    cursor: isTyping ? 'not-allowed' : 'pointer',
                    transition: 'background var(--t)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
                  </svg>
                </button>
              )}
              <button
                onClick={() => sendMessage(inputText)}
                disabled={!inputText.trim() || isTyping}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  background: !inputText.trim() || isTyping ? 'var(--bg-row)' : 'var(--accent)',
                  color: !inputText.trim() || isTyping ? 'var(--fg-muted)' : 'var(--fg-on-accent)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-wide)',
                  cursor: !inputText.trim() || isTyping ? 'not-allowed' : 'pointer',
                  transition: 'background var(--t), color var(--t)',
                }}
              >
                Enviar
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Bottom Grid 1: Clases hoy + Pagos urgentes + Adherencia ─── */}
      <section className="grid-asym">
        {/* Clases de hoy */}
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Clases de Hoy</div>
              <div className="card-subtitle">{clasesHoy.length} programadas</div>
            </div>
            <Link href="/horarios" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 700 }}>
              Ver calendario →
            </Link>
          </div>
          <div className="card-body">
            {clasesHoy.length === 0 ? (
              <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                Sin clases programadas para hoy
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {clasesHoy.map((clase) => {
                  const colorHex = COLOR_MAP[clase.color] ?? '#3FF8C8';
                  return (
                    <div
                      key={clase.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-3) var(--space-5)',
                        borderBottom: '1px solid var(--divider)',
                      }}
                    >
                      <div style={{ width: 3, height: 32, borderRadius: 2, background: colorHex, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--fg-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {clase.titulo}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                          {clase.hora_inicio} – {clase.hora_fin}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 'var(--text-2xs)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 'var(--tracking-wide)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--fg-muted)',
                      }}>
                        {TIPO_LABEL[clase.tipo] ?? clase.tipo}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Pagos urgentes + Adherencia semanal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Pagos urgentes */}
          <div className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Pagos Urgentes</div>
                <div className="card-subtitle">{pagosUrgentes.length} pendiente{pagosUrgentes.length !== 1 ? 's' : ''}</div>
              </div>
              <Link href="/finanzas" style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', fontWeight: 700 }}>
                Ver →
              </Link>
            </div>
            <div className="card-body">
              {pagosUrgentes.length === 0 ? (
                <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                  Sin pagos urgentes ✓
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {pagosUrgentes.slice(0, 4).map((p) => {
                    const dias = diasHasta(p.fechaVencimiento);
                    const esVencido = p.estado === 'vencido';
                    return (
                      <div key={p.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 'var(--space-2) var(--space-4)',
                        borderBottom: '1px solid var(--divider)',
                        gap: 'var(--space-2)',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.alumnoNombre}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: esVencido ? 'var(--danger)' : 'var(--warning)' }}>
                            {esVencido ? `Vencida hace ${Math.abs(dias)}d` : `Vence en ${dias}d`}
                          </div>
                        </div>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--fg-strong)', flexShrink: 0 }}>
                          S/ {p.monto}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Adherencia semanal mini chart */}
          <div className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Adherencia Semanal</div>
                <div className="card-subtitle">Últimas 4 semanas</div>
              </div>
            </div>
            <div className="card-body card-body--padded">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', height: 80, padding: '0 var(--space-2)' }}>
                {adherenciaSemanal.map((pct, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-muted)' }}>{pct}%</div>
                    <div style={{ width: '100%', height: `${Math.max(4, pct * 0.6)}px`, background: '#7F77DD', borderRadius: 'var(--radius-xs)', opacity: 0.7 + (i / adherenciaSemanal.length) * 0.3 }} />
                    <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-subtle)' }}>S{i + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom Grid 2: Actividad reciente ─────────────── */}
      <section className="grid-asym">
        {/* Alumnos últimas actividades — mostrar desde actividadReciente tipo alumno o pago */}
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Actividad de Alumnos</div>
              <div className="card-subtitle">Últimas 24 horas</div>
            </div>
            <Link href="/alumnos" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 700 }}>
              Ver alumnos →
            </Link>
          </div>
          <div className="card-body">
            {actividadReciente.length === 0 ? (
              <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                Sin actividad reciente
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {actividadReciente.slice(0, 6).map((item) => (
                  <div key={item.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-5)',
                    borderBottom: '1px solid var(--divider)',
                  }}>
                    <div style={{
                      width: 8, height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: item.tipo === 'pago' ? '#1D9E75' : item.tipo === 'alumno' ? '#378ADD' : '#7F77DD',
                    }} />
                    <div style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                      {item.descripcion}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', flexShrink: 0 }}>
                      {item.tiempo}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Feed actividad reciente */}
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Feed Reciente</div>
              <div className="card-subtitle">Eventos del sistema</div>
            </div>
          </div>
          <div className="card-body">
            {actividadReciente.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                Sin eventos recientes
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
                {actividadReciente.map((item) => (
                  <div key={item.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                    <div style={{
                      width: 20, height: 20,
                      borderRadius: 'var(--radius-xs)',
                      background: item.tipo === 'pago' ? 'rgba(29,158,117,0.15)' : item.tipo === 'alumno' ? 'rgba(55,138,221,0.15)' : 'rgba(127,119,221,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, flexShrink: 0, marginTop: 1,
                    }}>
                      {item.tipo === 'pago' ? '💳' : item.tipo === 'alumno' ? '👤' : '📅'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)', lineHeight: 1.4 }}>
                        {item.descripcion}
                      </div>
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-muted)', marginTop: 2 }}>
                        {item.tiempo}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsageBar({ usadas, limite }: { usadas: number; limite: number }) {
  const pct = Math.min(100, Math.round((usadas / limite) * 100));
  const color = usadas < limite - 5 ? '#1D9E75' : usadas < limite - 2 ? '#EF9F27' : '#FF6B6B';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-muted)', letterSpacing: 'var(--tracking-wide)' }}>
        Consultas: {usadas} / {limite}
      </span>
      <div style={{ width: 80, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  pct,
  color,
  pulsing,
}: {
  label: string;
  value: string;
  sub: string;
  pct: number;
  color: string;
  pulsing: boolean;
}) {
  return (
    <div
      className="metric"
      style={{
        transition: 'background 0.3s ease',
        background: pulsing ? `${color}08` : undefined,
      }}
    >
      <div className="label-caps">{label}</div>
      <div className="metric-row">
        <span className="metric-value">{value}</span>
        <span
          className="metric-delta"
          style={{ color }}
        >
          {sub}
        </span>
      </div>
      <div className="metric-bar">
        <span style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}55` }} />
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
  const dots = '.'.repeat(frame);
  return (
    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 2 }}>
      Escribiendo{dots}
    </span>
  );
}
