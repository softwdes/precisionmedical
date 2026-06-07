'use client';

/**
 * B.12 — Bandeja de Edson (Intake Specialist)
 *
 * Centro de control de verificación de casos MVA antes de la primera cita.
 * Edson verifica: law firm (abogado + lien) + PIP (seguro auto-accidente).
 *
 * Colores (Regla #5): amber como color de identidad del módulo.
 * - amber  → pendiente / en proceso
 * - rose   → urgente / no iniciado
 * - emerald → verificado / listo para cita
 * - cyan   → nuevo hoy
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Scale,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Phone,
  Mail,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix/page-header';
import { EmptyState }  from '@/components/ui-phoenix/empty-state';

// ─── Types ────────────────────────────────────────────────────────────────────
interface IntakeCase {
  id:             string;
  caseCode:       string;
  caseType:       string;
  status:         string;
  accidentDate:   string | null;
  accidentType:   string | null;
  createdAt:      string;
  daysPending:    number;
  isUrgent:       boolean;
  awaitingLawFirm: boolean;
  awaitingPip:    boolean;
  isReady:        boolean;
  pipVerifiedAt:  string | null;
  intakeFormCompletedAt: string | null;
  primaryPolicyNumber: string | null;
  patient: {
    id: string; firstName: string; lastName: string;
    phone: string | null; email: string | null;
  };
  lawFirm: { id: string; firmName: string | null; phone: string | null; email: string | null } | null;
  attorney: { id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null } | null;
  primaryInsurance: { id: string; name: string; claimsPhone: string | null; claimsEmail: string | null } | null;
}

interface Kpis {
  newToday: number; awaitingLawFirm: number; awaitingPip: number; readyForVisit: number;
}

type FilterTab = 'all' | 'urgent' | 'lawFirm' | 'pip';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ACCIDENT_TYPE_LABELS: Record<string, string> = {
  AUTO: 'Auto', MOTORCYCLE: 'Moto', PEDESTRIAN: 'Peatón',
  WORKPLACE: 'Trabajo', OTHER: 'Otro',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, tone,
}: { label: string; value: number; sub?: string; tone: 'cyan' | 'amber' | 'emerald' | 'rose' }) {
  const colors: Record<typeof tone, string> = {
    cyan:    'text-cyan border-cyan/30 bg-cyan/5',
    amber:   'text-amber border-amber/30 bg-amber/5',
    emerald: 'text-emerald border-emerald/30 bg-emerald/5',
    rose:    'text-rose border-rose/30 bg-rose/5',
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-70 mb-1">{label}</div>
      <div className="text-3xl font-black">{value}</div>
      {sub && <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
      ok
        ? 'bg-emerald/10 text-emerald border border-emerald/25'
        : 'bg-amber/10 text-amber border border-amber/25'
    }`}>
      {ok ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
      {label}
    </span>
  );
}

function CaseCard({ c }: { c: IntakeCase }) {
  const borderClass = c.isReady
    ? 'border-emerald/30 hover:border-emerald/50'
    : c.isUrgent
      ? 'border-rose/40 hover:border-rose/60'
      : 'border-amber/25 hover:border-amber/40';

  const badgeClass = c.isReady
    ? 'bg-emerald/10 text-emerald border-emerald/25'
    : c.isUrgent
      ? 'bg-rose/10 text-rose border-rose/25'
      : 'bg-amber/10 text-amber border-amber/25';

  const badgeLabel = c.isReady ? 'Listo para cita' : c.isUrgent ? '⚠ Urgente' : 'En verificación';

  return (
    <Link href={`/intake/${c.id}`} className={`block rounded-lg border bg-bg-1 p-4 transition-all hover:bg-white/[0.015] ${borderClass} group`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-mono text-[11px] font-bold text-amber">{c.caseCode}</span>
            <span className={`border rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${badgeClass}`}>
              {badgeLabel}
            </span>
            {c.intakeFormCompletedAt && (
              <span className="border border-emerald/25 rounded-full px-2 py-0.5 text-[9px] bg-emerald/5 text-emerald font-semibold">
                ✓ Form completo
              </span>
            )}
          </div>

          {/* Patient name */}
          <div className="text-text-1 font-bold text-sm mb-1">
            {c.patient.firstName} {c.patient.lastName}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
            {c.accidentDate && <span>DOL {fmtDate(c.accidentDate)}</span>}
            {c.accidentType && <span>{ACCIDENT_TYPE_LABELS[c.accidentType] ?? c.accidentType}</span>}
            {c.attorney && (
              <span className="flex items-center gap-1">
                <Scale className="w-3 h-3" />
                {c.attorney.firstName} {c.attorney.lastName}
              </span>
            )}
            {c.lawFirm?.firmName && !c.attorney && (
              <span className="flex items-center gap-1">
                <Scale className="w-3 h-3" />
                {c.lawFirm.firmName}
              </span>
            )}
            {c.primaryInsurance && (
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                {c.primaryInsurance.name}
              </span>
            )}
          </div>

          {/* Verification chips */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <StatusChip label="Law Firm" ok={!c.awaitingLawFirm} />
            <StatusChip label="PIP"      ok={!c.awaitingPip} />
          </div>
        </div>

        {/* Right: days + arrow */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {c.daysPending > 0 && (
            <span className={`text-[10px] font-semibold ${c.isUrgent ? 'text-rose' : 'text-text-muted'}`}>
              {c.daysPending}d
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-amber transition-colors" />
        </div>
      </div>

      {/* Contact mini-row if pending */}
      {!c.isReady && (
        <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-3">
          {c.awaitingLawFirm && c.lawFirm?.phone && (
            <a
              href={`tel:${c.lawFirm.phone}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] text-cyan hover:text-cyan/80 transition-colors"
            >
              <Phone className="w-3 h-3" /> {c.lawFirm.phone}
            </a>
          )}
          {c.awaitingPip && c.primaryInsurance?.claimsPhone && (
            <a
              href={`tel:${c.primaryInsurance.claimsPhone}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] text-cyan hover:text-cyan/80 transition-colors"
            >
              <Phone className="w-3 h-3" /> {c.primaryInsurance.name}
            </a>
          )}
        </div>
      )}
    </Link>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function IntakeClient() {
  const [cases,   setCases]   = useState<IntakeCase[]>([]);
  const [kpis,    setKpis]    = useState<Kpis>({ newToday: 0, awaitingLawFirm: 0, awaitingPip: 0, readyForVisit: 0 });
  const [filter,  setFilter]  = useState<FilterTab>('all');
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (tab: FilterTab) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/intake?filter=${tab}`);
      const data = await res.json();
      if (data.ok) {
        setCases(data.cases);
        setKpis(data.kpis);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all',     label: 'Todos',              count: kpis.newToday + kpis.awaitingLawFirm + kpis.awaitingPip },
    { key: 'urgent',  label: '⚠ Urgentes'                                                                         },
    { key: 'lawFirm', label: '⚖ Esperando Law Firm', count: kpis.awaitingLawFirm                                  },
    { key: 'pip',     label: '🚗 Esperando PIP',       count: kpis.awaitingPip                                     },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Bandeja de Edson"
        subtitle="Verificación pre-visita · Law Firm + PIP"
        action={
          <button
            type="button"
            onClick={() => load(filter)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-amber/40 hover:text-amber transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        }
      />

      <div className="px-6 pb-6 space-y-5">
        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Nuevos hoy"          value={kpis.newToday}        tone="cyan"    sub="Creados hoy" />
          <KpiCard label="Esperando Law Firm"  value={kpis.awaitingLawFirm} tone="amber"   sub="Sin abogado" />
          <KpiCard label="Esperando PIP"       value={kpis.awaitingPip}     tone="amber"   sub="Sin PIP" />
          <KpiCard label="Listos para cita"    value={kpis.readyForVisit}   tone="emerald" sub="Verificados" />
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs transition-all ${
                filter === tab.key
                  ? 'bg-amber/10 border border-amber/40 text-amber font-semibold'
                  : 'border border-border text-text-2 hover:border-border-strong'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                  filter === tab.key ? 'bg-amber/20 text-amber' : 'bg-white/10 text-text-muted'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Case list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-lg bg-bg-2/40 animate-pulse" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <EmptyState.Rich
            icon={UserCheck}
            title={filter === 'all' ? 'No hay casos pendientes' : 'Ningún caso en este filtro'}
            subtitle={
              filter === 'all'
                ? 'Todos los casos han sido verificados o están activos.'
                : 'Cambiá el filtro para ver otros casos.'
            }
          />
        ) : (
          <div className="space-y-2.5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted px-1">
              {total} caso{total !== 1 ? 's' : ''}
            </div>
            {cases.map(c => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
