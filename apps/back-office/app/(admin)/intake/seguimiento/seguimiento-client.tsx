'use client';

/**
 * B.23 — Bandeja de Edson · Post-visita · Seguimiento y Cobranzas
 *
 * Muestra los casos con notas SIGNED que están pendientes de cobro.
 * Bucketing por urgencia:
 *   urgent  (>60d) → rose  (⚠ acción inmediata)
 *   warning (>30d) → amber
 *   partial         → emerald (pago parcial recibido)
 *   normal  (<30d) → neutral
 *
 * Colores (Regla #5): amber + rose como identidad del módulo B.23.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign,
  Clock,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  Phone,
  FileText,
  CreditCard,
  RefreshCw,
  Scale,
  Briefcase,
  ArrowLeft,
} from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix/page-header';
import { EmptyState }  from '@/components/ui-phoenix/empty-state';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FollowupCase {
  caseId:           string;
  caseCode:         string;
  caseType:         string;
  patientName:      string;
  firmName:         string | null;
  firmPhone:        string | null;
  attorneyName:     string | null;
  lastVisitDate:    string | null;
  daysPending:      number;
  totalBilled:      number;
  totalBilledFmt:   string;
  visitCount:       number;
  urgency:          'urgent' | 'warning' | 'partial' | 'normal';
  faltaDocs:        boolean;
  sinRespuesta:     boolean;
  bufeteContactado: boolean;
  pagoParcial:      boolean;
}

interface Kpis {
  totalPending:   string;
  over30:         number;
  over60:         number;
  recoveredMonth: string;
}

interface Counts {
  all:     number;
  urgent:  number;
  waiting: number;
  docs:    number;
  partial: number;
}

type FilterTab = 'all' | 'urgent' | 'waiting' | 'docs' | 'partial';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/Denver',
  });
}

// Urgency visual tokens
const URGENCY_CONFIG = {
  urgent: {
    border:  'border-rose/40 hover:border-rose/60',
    bg:      'bg-rose/[0.06]',
    badge:   'bg-rose/10 text-rose border-rose/30',
    amount:  'text-rose',
    dot:     'bg-rose',
    button:  'bg-rose/10 text-rose border-rose/30 hover:bg-rose/20',
  },
  warning: {
    border:  'border-amber/35 hover:border-amber/55',
    bg:      'bg-amber/[0.04]',
    badge:   'bg-amber/10 text-amber border-amber/30',
    amount:  'text-amber',
    dot:     'bg-amber',
    button:  'bg-amber/10 text-amber border-amber/30 hover:bg-amber/20',
  },
  partial: {
    border:  'border-emerald/30 hover:border-emerald/50',
    bg:      'bg-emerald/[0.04]',
    badge:   'bg-emerald/10 text-emerald border-emerald/30',
    amount:  'text-emerald',
    dot:     'bg-emerald',
    button:  'bg-emerald/10 text-emerald border-emerald/30 hover:bg-emerald/20',
  },
  normal: {
    border:  'border-border hover:border-border/80',
    bg:      'bg-bg-1',
    badge:   'bg-white/5 text-text-muted border-border',
    amount:  'text-text-1',
    dot:     'bg-text-muted',
    button:  'bg-white/5 text-text-muted border-border hover:bg-white/10',
  },
} as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  tone: 'amber' | 'rose' | 'emerald' | 'cyan';
}) {
  const tones = {
    amber:   'text-amber border-amber/30 bg-amber/5',
    rose:    'text-rose  border-rose/30  bg-rose/5',
    emerald: 'text-emerald border-emerald/30 bg-emerald/5',
    cyan:    'text-cyan  border-cyan/30  bg-cyan/5',
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 opacity-70" />
        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</span>
      </div>
      <div className="text-2xl font-black">{value}</div>
      {sub && <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${className}`}>
      {children}
    </span>
  );
}

function CaseRow({ c, onClick }: { c: FollowupCase; onClick: () => void }) {
  const cfg = URGENCY_CONFIG[c.urgency];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`rounded-lg border p-4 transition-all cursor-pointer group ${cfg.border} ${cfg.bg}`}
    >
      {/* Row: code + urgency badge + amount */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Case code */}
          <span className="font-mono text-[11px] font-bold text-text-muted bg-white/5 rounded px-1.5 py-0.5 border border-border/50">
            {c.caseCode}
          </span>

          {/* Urgency badge */}
          {c.urgency === 'urgent' && (
            <Badge className="bg-rose/10 text-rose border-rose/30">
              <AlertTriangle className="w-2.5 h-2.5" />
              ⚠ {c.daysPending} días sin cobrar
            </Badge>
          )}
          {c.urgency === 'warning' && (
            <Badge className="bg-amber/10 text-amber border-amber/30">
              <Clock className="w-2.5 h-2.5" />
              {c.daysPending} días pendiente
            </Badge>
          )}
          {c.urgency === 'partial' && (
            <Badge className="bg-emerald/10 text-emerald border-emerald/30">
              <CreditCard className="w-2.5 h-2.5" />
              Pago parcial
            </Badge>
          )}

          {/* Extra badges */}
          {c.sinRespuesta && c.urgency !== 'partial' && (
            <Badge className="bg-rose/8 text-rose/80 border-rose/20">
              <Phone className="w-2.5 h-2.5" />
              Sin respuesta del bufete
            </Badge>
          )}
          {c.faltaDocs && (
            <Badge className="bg-amber/8 text-amber/80 border-amber/20">
              <FileText className="w-2.5 h-2.5" />
              Falta docs PIP
            </Badge>
          )}
        </div>

        {/* Amount + action */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className={`text-lg font-black ${cfg.amount}`}>{c.totalBilledFmt}</div>
            <div className="text-[10px] text-text-muted">{c.visitCount} visita{c.visitCount !== 1 ? 's' : ''}</div>
          </div>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onClick(); }}
            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all ${cfg.button}`}
          >
            Trabajar
            <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Patient + law firm info */}
      <div className="mt-2.5 flex items-center gap-3 text-[12px] text-text-muted flex-wrap">
        <span className="text-text-2 font-medium">{c.patientName}</span>
        {c.firmName && (
          <>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <Scale className="w-3 h-3" />
              {c.firmName}
              {c.attorneyName && ` · ${c.attorneyName}`}
            </span>
          </>
        )}
        {c.lastVisitDate && (
          <>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Última visita: {fmtDate(c.lastVisitDate)}
            </span>
          </>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-wider opacity-50">
          {c.caseType.replace('_', ' ')}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SeguimientoClient() {
  const router = useRouter();

  const [tab,     setTab]     = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [items,   setItems]   = useState<FollowupCase[]>([]);
  const [kpis,    setKpis]    = useState<Kpis | null>(null);
  const [counts,  setCounts]  = useState<Counts | null>(null);
  const [total,   setTotal]   = useState(0);
  const [error,   setError]   = useState<string | null>(null);

  const fetch = useCallback(async (t: FilterTab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.fetch(`/api/admin/intake/seguimiento?tab=${t}`);
      if (!res.ok) throw new Error('Error al cargar datos');
      const json = await res.json() as {
        ok: boolean; items: FollowupCase[]; kpis: Kpis; counts: Counts; total: number;
      };
      setItems(json.items);
      setKpis(json.kpis);
      setCounts(json.counts);
      setTotal(json.total);
    } catch (err) {
      setError('No se pudo cargar la bandeja. Intentá de nuevo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetch('all'); }, [fetch]);

  function switchTab(t: FilterTab) {
    setTab(t);
    void fetch(t);
  }

  // ─── Filter tab definitions
  const TABS: { key: FilterTab; label: string; emoji: string; count?: number }[] = [
    { key: 'all',     label: 'Todos',              emoji: '',   count: counts?.all },
    { key: 'urgent',  label: 'Urgentes >60d',      emoji: '⚠',  count: counts?.urgent },
    { key: 'waiting', label: 'Esperando bufete',   emoji: '📞', count: counts?.waiting },
    { key: 'docs',    label: 'Falta documentación',emoji: '📄', count: counts?.docs },
    { key: 'partial', label: 'Pago parcial',        emoji: '💰', count: counts?.partial },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg-0 pb-16">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-amber" />
            Seguimiento y Cobranzas
          </span>
        }
        subtitle="Casos post-visita pendientes de cobro"
        action={
          <button
            type="button"
            onClick={() => void fetch(tab)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] text-text-muted hover:text-text-1 hover:border-border/70 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 space-y-5 mt-5">

        {/* ── Toggle Pre / Post ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-bg-1 p-1 w-fit">
          <button
            type="button"
            onClick={() => router.push('/intake')}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold text-text-muted hover:text-text-1 hover:bg-white/[0.04] transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Pre-visita
            {total > 0 && (
              <span className="rounded-full bg-white/10 px-1.5 text-[10px]">{total}</span>
            )}
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-bold transition-all
              bg-gradient-to-r from-amber to-rose/80 text-white shadow-sm"
          >
            Post-visita · Cobranzas
            {total > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{total}</span>
            )}
          </button>
        </div>

        {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={DollarSign}
            label="Pendiente cobro"
            value={kpis?.totalPending ?? '—'}
            sub="Total facturado sin cobrar"
            tone="amber"
          />
          <KpiCard
            icon={Clock}
            label="Casos >30 días"
            value={kpis?.over30 ?? '—'}
            sub="Seguimiento prioritario"
            tone="amber"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Casos >60 días"
            value={kpis?.over60 ?? '—'}
            sub="Acción inmediata"
            tone="rose"
          />
          <KpiCard
            icon={TrendingUp}
            label="Recuperado este mes"
            value={kpis?.recoveredMonth ?? '—'}
            sub="Phase 2: ledger real"
            tone="emerald"
          />
        </div>

        {/* ── Filter Tabs ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition-all ${
                tab === t.key
                  ? 'bg-amber/15 text-amber border-amber/40'
                  : 'bg-transparent text-text-muted border-border hover:border-border/70 hover:text-text-2'
              }`}
            >
              {t.emoji && <span>{t.emoji}</span>}
              {t.label}
              {t.count !== undefined && (
                <span className={`rounded-full px-1.5 text-[10px] font-bold ml-0.5 ${
                  tab === t.key ? 'bg-amber/20' : 'bg-white/8'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Case List ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-lg border border-rose/30 bg-rose/5 px-4 py-3 text-[13px] text-rose">
            {error}
          </div>
        )}

        {loading && !error && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-20 rounded-lg border border-border bg-bg-1 animate-pulse"
              />
            ))}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState.Rich
            icon={TrendingUp}
            title="No hay casos pendientes"
            subtitle={
              tab === 'all'
                ? 'Todos los casos están al día. ¡Buen trabajo!'
                : 'No hay casos que coincidan con este filtro.'
            }
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-2.5">
            {items.map(c => (
              <CaseRow
                key={c.caseId}
                c={c}
                onClick={() => router.push(`/intake/seguimiento/${c.caseId}`)}
              />
            ))}
          </div>
        )}

        {/* Phase 2 notice */}
        {!loading && items.length > 0 && (
          <p className="text-center text-[11px] text-text-muted italic py-2">
            Phase 2: ledger de pagos real, integración bufete, generación de balances.
          </p>
        )}

      </div>
    </div>
  );
}
