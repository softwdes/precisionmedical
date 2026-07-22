'use client';

/**
 * B.24 — Detalle de seguimiento del caso (Edson)
 *
 * Layout: header del caso → 3 KPIs financieros → tabs (Timeline | Docs | Comms)
 *         + barra de acciones rápidas abajo
 *
 * Colores (Regla #5): amber+rose como identidad B.23/B.24.
 * Header urgency: rose gradient si >60d, amber si >30d, neutral si <30d.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Phone,
  Mail,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
  Scale,
  FileText,
  DollarSign,
  MessageSquare,
  Stethoscope,
  AlertOctagon,
  RefreshCw,
  ChevronRight,
  Send,
  X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TimelineEventType =
  | 'visit' | 'call' | 'email' | 'payment'
  | 'escalate' | 'lien' | 'hcfa' | 'system' | 'note' | 'urgent';

interface TimelineEntry {
  id:         string;
  type:       TimelineEventType;
  date:       string;
  title:      string;
  subtitle:   string;
  authorName: string | null;
}

interface DocItem {
  key:   string;
  label: string;
  done:  boolean;
}

interface CaseDetail {
  id:           string;
  caseCode:     string;
  caseType:     string;
  status:       string;
  accidentDate: string | null;
  daysPending:  number;
  patientName:  string;
  patientPhone: string | null;
  firmName:     string | null;
  firmPhone:    string | null;
  firmEmail:    string | null;
  attorney: {
    firstName: string | null;
    lastName:  string | null;
    phone:     string | null;
    email:     string | null;
  } | null;
  visitCount: number;
}

interface Financial {
  totalBilled:       number;
  totalBilledFmt:    string;
  totalCollected:    number;
  totalCollectedFmt: string;
  totalPending:      number;
  totalPendingFmt:   string;
}

interface DetailData {
  ok:        boolean;
  case:      CaseDetail;
  financial: Financial;
  timeline:  TimelineEntry[];
  docs:      DocItem[];
}

type ActiveAction = 'call' | 'email' | 'payment' | 'escalate' | null;
type Tab          = 'timeline' | 'docs' | 'comms';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/Denver',
  });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday =
    d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) ===
    today.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

  if (isToday) {
    return `Hoy · ${d.toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })}`;
  }
  return d.toLocaleDateString('es-US', {
    day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'America/Denver',
  });
}

// Timeline icon + colors by event type
const EVENT_CONFIG: Record<TimelineEventType, { icon: string; bg: string; color: string }> = {
  visit:    { icon: '✓',  bg: 'bg-emerald/15', color: 'text-emerald' },
  call:     { icon: '📞', bg: 'bg-brand/15',   color: 'text-brand' },
  email:    { icon: '📧', bg: 'bg-brand/15',   color: 'text-brand' },
  payment:  { icon: '💰', bg: 'bg-emerald/15', color: 'text-emerald' },
  escalate: { icon: '🚨', bg: 'bg-rose/15',    color: 'text-rose' },
  lien:     { icon: '⚖',  bg: 'bg-emerald/15', color: 'text-emerald' },
  hcfa:     { icon: '📄', bg: 'bg-brand/15',   color: 'text-brand' },
  system:   { icon: '🤖', bg: 'bg-white/8',    color: 'text-text-muted' },
  note:     { icon: '📝', bg: 'bg-amber/15',   color: 'text-amber' },
  urgent:   { icon: '⚠',  bg: 'bg-rose/15',    color: 'text-rose' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function FinancialCard({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'emerald' | 'rose';
}) {
  const tones = {
    brand:   'bg-brand/5 border-brand/20 text-brand',
    emerald: 'bg-emerald/5 border-emerald/20 text-emerald',
    rose:    'bg-rose/5 border-rose/20 text-rose',
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-[9px] uppercase tracking-widest opacity-60 mb-1">{label}</div>
      <div className="font-mono font-bold text-[15px]">{value}</div>
    </div>
  );
}

function TimelineEvent({ e }: { e: TimelineEntry }) {
  const cfg = EVENT_CONFIG[e.type] ?? EVENT_CONFIG['note'];
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.035] transition-colors">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] ${cfg!.bg}`}>
        {cfg!.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[12px] text-text-1 font-semibold leading-tight">
            {e.title}
          </span>
          <span className="text-[10px] text-text-muted shrink-0">{fmtDateTime(e.date)}</span>
        </div>
        {e.subtitle && (
          <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{e.subtitle}</p>
        )}
        {e.authorName && (
          <span className="text-[10px] text-text-muted/60 mt-1 block">{e.authorName}</span>
        )}
      </div>
    </div>
  );
}

function DocChecklist({ docs }: { docs: DocItem[] }) {
  const done  = docs.filter(d => d.done).length;
  const total = docs.length;
  const pct   = Math.round((done / total) * 100);

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
        <span>{done}/{total} documentos completos</span>
        <span className={pct === 100 ? 'text-emerald font-semibold' : 'text-amber'}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald' : 'bg-amber'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Items */}
      {docs.map(d => (
        <div key={d.key} className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
          {d.done
            ? <CheckCircle2 className="w-4 h-4 text-emerald shrink-0" />
            : <Circle       className="w-4 h-4 text-text-muted shrink-0" />
          }
          <span className={`text-[13px] ${d.done ? 'text-text-2' : 'text-text-1 font-medium'}`}>
            {d.label}
          </span>
          <span className={`ml-auto text-[10px] font-semibold rounded-full px-2 py-0.5 ${
            d.done
              ? 'bg-emerald/10 text-emerald'
              : 'bg-amber/10 text-amber'
          }`}>
            {d.done ? 'Listo' : 'Pendiente'}
          </span>
        </div>
      ))}
    </div>
  );
}

// Inline action form triggered by quick-action buttons
function ActionForm({
  type,
  onSubmit,
  onCancel,
  loading,
}: {
  type:       ActiveAction;
  onSubmit:   (content: string, amount?: number) => Promise<void>;
  onCancel:   () => void;
  loading:    boolean;
}) {
  const [content, setContent] = useState('');
  const [amount,  setAmount]  = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textRef.current?.focus(); }, []);

  const config = {
    call:    { title: '📞 Registrar llamada al bufete',    placeholder: 'Ej: Mary Smith no disponible, dejé mensaje con asistente Jane…', needsAmount: false },
    email:   { title: '📧 Registrar email enviado',        placeholder: 'Ej: Envié HCFA + balance a mary@smithjohnson.com…',              needsAmount: false },
    payment: { title: '💰 Registrar pago parcial',         placeholder: 'Ej: Cheque recibido de Smith & Johnson LLP…',                    needsAmount: true  },
    escalate:{ title: '🚨 Escalar a Brunella',             placeholder: 'Ej: Sin respuesta después de 3 intentos, necesita atención…',    needsAmount: false },
  };

  const cfg = config[type as NonNullable<ActiveAction>];
  if (!cfg) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    const amt = cfg.needsAmount && amount ? parseFloat(amount) : undefined;
    await onSubmit(content, amt);
    setContent('');
    setAmount('');
  }

  return (
    <form
      onSubmit={e => void handleSubmit(e)}
      className="rounded-xl border border-amber/30 bg-amber/5 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-amber">{cfg.title}</span>
        <button type="button" onClick={onCancel} className="text-text-muted hover:text-text-1 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {cfg.needsAmount && (
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted block mb-1">
            Monto recibido (USD)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-border bg-bg-2/40 px-3 py-2 text-sm text-text-1 placeholder-text-muted focus:outline-none focus:border-amber/50"
          />
        </div>
      )}

      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Notas</label>
        <textarea
          ref={textRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={cfg.placeholder}
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-bg-2/40 px-3 py-2 text-sm text-text-1 placeholder-text-muted focus:outline-none focus:border-amber/50"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-text-muted hover:text-text-1 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-amber/15 border border-amber/40 px-4 py-1.5 text-[12px] font-semibold text-amber hover:bg-amber/25 transition-all disabled:opacity-50"
        >
          <Send className="w-3 h-3" />
          {loading ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SeguimientoDetailClient() {
  const router    = useRouter();
  const params    = useParams<{ caseId: string }>();
  const caseId    = params.caseId;

  const [data,         setData]         = useState<DetailData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [tab,          setTab]          = useState<Tab>('timeline');
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Filtered timeline by tab
  const timelineForTab = (t: Tab, timeline: TimelineEntry[]): TimelineEntry[] => {
    if (t === 'comms') return timeline.filter(e => ['call','email','escalate','payment'].includes(e.type));
    return timeline;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.fetch(`/api/admin/intake/seguimiento/${caseId}`);
      if (!res.ok) throw new Error('Error al cargar datos');
      const json = await res.json() as DetailData;
      if (!json.ok) throw new Error('Caso no encontrado');
      setData(json);
    } catch (err) {
      setError('No se pudo cargar el caso. Intentá de nuevo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  const handleSubmitNote = useCallback(async (content: string, amount?: number) => {
    if (!activeAction || !caseId) return;
    setActionLoading(true);
    try {
      const res = await window.fetch(`/api/admin/intake/seguimiento/${caseId}/note`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: activeAction, content, amount }),
      });
      if (!res.ok) throw new Error('Error al guardar nota');
      setActiveAction(null);
      await load(); // reload timeline
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  }, [activeAction, caseId, load]);

  // ─── Loading / Error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-0 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="h-8  w-32 rounded-lg bg-bg-1 animate-pulse" />
        <div className="h-24 rounded-xl bg-bg-1 animate-pulse" />
        <div className="h-16 rounded-lg bg-bg-1 animate-pulse" />
        <div className="h-64 rounded-lg bg-bg-1 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg-0 px-4 sm:px-6 lg:px-8 py-6">
        <button
          type="button"
          onClick={() => router.push('/intake/seguimiento')}
          className="flex items-center gap-2 text-[13px] text-text-muted hover:text-text-1 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Seguimiento
        </button>
        <div className="rounded-lg border border-rose/30 bg-rose/5 px-4 py-3 text-[13px] text-rose">
          {error ?? 'Caso no encontrado.'}
        </div>
      </div>
    );
  }

  const { case: c, financial, timeline, docs } = data;

  // Header urgency styling
  const urgency =
    c.daysPending > 60 ? 'urgent'
    : c.daysPending > 30 ? 'warning'
    : 'normal';

  const headerStyle =
    urgency === 'urgent'
      ? 'border-rose/30 bg-gradient-to-br from-rose/10 to-rose/[0.04]'
      : urgency === 'warning'
        ? 'border-amber/30 bg-gradient-to-br from-amber/8 to-amber/[0.03]'
        : 'border-border bg-bg-1';

  const codeColor  = urgency === 'urgent' ? 'text-rose/80' : urgency === 'warning' ? 'text-amber/80' : 'text-text-muted';
  const amountColor = urgency === 'urgent' ? 'text-rose' : urgency === 'warning' ? 'text-amber' : 'text-text-1';

  const visibleTimeline = timelineForTab(tab, timeline);

  // Tab count badges
  const commCount = timeline.filter(e => ['call','email','escalate','payment'].includes(e.type)).length;

  return (
    <div className="min-h-screen bg-bg-0 pb-24">

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b border-border bg-bg-0/80 backdrop-blur-sm px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push('/intake/seguimiento')}
          className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-1 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Seguimiento
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[12px] text-text-muted hidden sm:block">{c.caseCode}</span>
          <span className="text-text-2 font-semibold text-[13px] truncate">{c.patientName}</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-text-muted hover:text-text-1 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 space-y-4 pt-5">

        {/* ── Case Header ─────────────────────────────────────────────────── */}
        <div className={`rounded-xl border p-4 sm:p-5 ${headerStyle}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                <span className={`font-mono text-[13px] font-bold ${codeColor}`}>{c.caseCode}</span>
                {urgency === 'urgent' && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-rose/15 text-rose border border-rose/30">
                    <AlertTriangle className="w-3 h-3" />
                    ⚠ {c.daysPending} días sin cobrar
                  </span>
                )}
                {urgency === 'warning' && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber/15 text-amber border border-amber/30">
                    <Clock className="w-3 h-3" />
                    {c.daysPending} días pendiente
                  </span>
                )}
              </div>
              <h1 className="text-text-1 font-bold text-[17px] sm:text-lg">{c.patientName}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                {c.accidentDate && <span>DOL {fmtDate(c.accidentDate)}</span>}
                {c.firmName && (
                  <span className="flex items-center gap-1">
                    <Scale className="w-3 h-3" />
                    {c.firmName}
                  </span>
                )}
                {c.attorney && (
                  <span>
                    {c.attorney.firstName} {c.attorney.lastName}
                  </span>
                )}
                <span>{c.visitCount} visita{c.visitCount !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-[9px] uppercase tracking-widest text-text-muted mb-0.5">Pendiente</div>
              <div className={`font-mono font-black text-[20px] sm:text-2xl ${amountColor}`}>
                {financial.totalPendingFmt}
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">
                de {financial.totalBilledFmt} facturado
              </div>
            </div>
          </div>
        </div>

        {/* ── Financial Summary ────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2.5">
          <FinancialCard label="Facturado"  value={financial.totalBilledFmt}    tone="brand"   />
          <FinancialCard label="Cobrado"    value={financial.totalCollectedFmt} tone="emerald" />
          <FinancialCard label="Pendiente"  value={financial.totalPendingFmt}   tone="rose"    />
        </div>

        {/* ── Attorney Contact ─────────────────────────────────────────────── */}
        {(c.attorney?.phone || c.firmPhone || c.attorney?.email || c.firmEmail) && (
          <div className="rounded-lg border border-border bg-bg-1 px-4 py-3 flex flex-wrap items-center gap-4 text-[12px]">
            <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Contacto bufete</span>
            {(c.attorney?.phone || c.firmPhone) && (
              <a
                href={`tel:${c.attorney?.phone ?? c.firmPhone}`}
                className="flex items-center gap-1.5 text-brand hover:underline"
              >
                <Phone className="w-3.5 h-3.5" />
                {c.attorney?.phone ?? c.firmPhone}
              </a>
            )}
            {(c.attorney?.email || c.firmEmail) && (
              <a
                href={`mailto:${c.attorney?.email ?? c.firmEmail}`}
                className="flex items-center gap-1.5 text-brand hover:underline"
              >
                <Mail className="w-3.5 h-3.5" />
                {c.attorney?.email ?? c.firmEmail}
              </a>
            )}
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex gap-0 border-b border-border">
          {(
            [
              { key: 'timeline' as Tab, label: 'Timeline',          count: timeline.length },
              { key: 'docs'     as Tab, label: 'Documentación',     count: docs.filter(d => !d.done).length || undefined },
              { key: 'comms'    as Tab, label: 'Comunicaciones',    count: commCount || undefined },
            ] as { key: Tab; label: string; count?: number }[]
          ).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium transition-all border-b-2 -mb-px ${
                tab === t.key
                  ? 'text-amber border-amber'
                  : 'text-text-muted border-transparent hover:text-text-2'
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`rounded-full px-1.5 text-[9px] font-bold ${
                  tab === t.key ? 'bg-amber/20 text-amber' : 'bg-white/10 text-text-muted'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ─────────────────────────────────────────────────── */}
        {tab === 'docs' ? (
          <DocChecklist docs={docs} />
        ) : (
          <div className="space-y-2">
            {visibleTimeline.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-text-muted">
                {tab === 'comms'
                  ? 'Aún no hay comunicaciones registradas con el bufete.'
                  : 'No hay eventos en el timeline todavía.'}
              </div>
            ) : (
              visibleTimeline.map(e => <TimelineEvent key={e.id} e={e} />)
            )}
          </div>
        )}

        {/* ── Inline Action Form ───────────────────────────────────────────── */}
        {activeAction && (
          <ActionForm
            type={activeAction}
            onSubmit={handleSubmitNote}
            onCancel={() => setActiveAction(null)}
            loading={actionLoading}
          />
        )}

      </div>

      {/* ── Quick Actions Bar (fixed bottom) ────────────────────────────── */}
      {!activeAction && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-0/95 backdrop-blur-sm px-4 sm:px-6 py-3"
          style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}
        >
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
            <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold hidden sm:block">
              Acciones:
            </span>
            <button
              type="button"
              onClick={() => setActiveAction('call')}
              className="flex items-center gap-1.5 rounded-lg bg-brand/10 border border-brand/30 px-3 py-1.5 text-[11px] font-semibold text-brand hover:bg-brand/20 transition-all"
            >
              <Phone className="w-3.5 h-3.5" /> Llamar bufete
            </button>
            <button
              type="button"
              onClick={() => setActiveAction('email')}
              className="flex items-center gap-1.5 rounded-lg bg-brand/10 border border-brand/30 px-3 py-1.5 text-[11px] font-semibold text-brand hover:bg-brand/20 transition-all"
            >
              <Mail className="w-3.5 h-3.5" /> Enviar recordatorio
            </button>
            <button
              type="button"
              onClick={() => setActiveAction('payment')}
              className="flex items-center gap-1.5 rounded-lg bg-emerald/10 border border-emerald/30 px-3 py-1.5 text-[11px] font-semibold text-emerald hover:bg-emerald/20 transition-all"
            >
              <DollarSign className="w-3.5 h-3.5" /> Pago parcial
            </button>
            <button
              type="button"
              onClick={() => setActiveAction('escalate')}
              className="flex items-center gap-1.5 rounded-lg bg-rose/10 border border-rose/30 px-3 py-1.5 text-[11px] font-semibold text-rose hover:bg-rose/20 transition-all"
            >
              <AlertOctagon className="w-3.5 h-3.5" /> Escalar a Brunella
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
