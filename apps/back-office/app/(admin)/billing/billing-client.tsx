'use client';

/**
 * B.25 — Bandeja de Brunella (Billing & Finance)
 *
 * Centro de operaciones de facturación. Notas SOAP firmadas listas para
 * generar HCFA, seguimiento de cobros, comunicaciones legales.
 *
 * Color de identidad (Regla #5): amber
 * Tabs: Notas pendientes | HCFA generados | Ledgers* | Legal* | Settlements*
 * (* = Phase 2 stub)
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw, DollarSign, FileText, CheckCircle2,
  Clock, ChevronRight, Phone, Scale, ShieldCheck,
  Briefcase,
} from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix/page-header';
import { KpiCard    } from '@/components/ui-phoenix/kpi-card';
import { EmptyState  } from '@/components/ui-phoenix/empty-state';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BillingItem {
  noteId:       string;
  caseId:       string;
  caseCode:     string;
  caseType:     string;
  caseStatus:   string;
  accidentDate: string | null;
  signedAt:     string | null;
  signedByName: string | null;
  cptCount:     number;
  cptTotal:     number;
  hcfaGeneratedAt: string | null;
  assessmentSnippet: string | null;
  patient:         { firstName: string; lastName: string };
  lawFirm:         { firmName: string | null; phone: string | null } | null;
  attorney:        { firstName: string | null; lastName: string | null } | null;
  primaryInsurance:{ name: string; shortCode: string; color: string } | null;
  primaryPolicyNumber: string | null;
}

interface Kpis {
  notesReady:        number;
  hcfaSent:          number;
  totalBilled:       number;
  pendingCollection: number;
}

type TabKey = 'pending' | 'hcfa' | 'ledger' | 'legal' | 'settlements';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}
function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}
function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function CaseRow({ item, onHcfa }: {
  item: BillingItem;
  onHcfa: (item: BillingItem) => void;
}) {
  const router = useRouter();
  const isNew   = !item.hcfaGeneratedAt;
  const isReady = isNew;

  const borderCls = item.hcfaGeneratedAt
    ? 'border-border hover:border-border-strong'
    : 'border-brand/20 hover:border-brand/35';
  const bgCls = item.hcfaGeneratedAt ? 'bg-bg-1' : 'bg-brand/[0.03]';

  return (
    <div className={`rounded-lg border ${borderCls} ${bgCls} p-4 transition-all`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">

        {/* Left: case info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-mono text-[11px] font-bold text-amber">{item.caseCode}</span>

            {isNew ? (
              <span className="border border-brand/30 rounded-full px-2 py-0.5 text-[9px] bg-brand/10 text-brand font-semibold uppercase tracking-wide">
                Nueva nota
              </span>
            ) : (
              <span className="border border-emerald/30 rounded-full px-2 py-0.5 text-[9px] bg-emerald/8 text-emerald font-semibold">
                ✓ HCFA generado
              </span>
            )}

            {item.primaryInsurance && (
              <span
                className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white shrink-0"
                style={{ backgroundColor: item.primaryInsurance.color }}
              >
                {item.primaryInsurance.shortCode.slice(0,3)}
              </span>
            )}
          </div>

          <div className="font-bold text-text-1 text-sm mb-1">
            {item.patient.firstName} {item.patient.lastName}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
            {item.signedByName && (
              <span>Dr. {item.signedByName.split(' ').at(-1)} firmó · {fmtTime(item.signedAt)}</span>
            )}
            {item.cptCount > 0 && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {item.cptCount} CPT {item.cptCount === 1 ? 'code' : 'codes'}
              </span>
            )}
            {item.cptTotal > 0 && (
              <span className="text-amber font-semibold">{fmtMoney(item.cptTotal)}</span>
            )}
            {item.primaryInsurance && (
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                {item.primaryInsurance.name}
              </span>
            )}
            {(item.attorney || item.lawFirm) && (
              <span className="flex items-center gap-1">
                <Scale className="w-3 h-3" />
                {item.attorney
                  ? `${item.attorney.firstName ?? ''} ${item.attorney.lastName ?? ''}`.trim()
                  : item.lawFirm?.firmName}
              </span>
            )}
          </div>

          {item.hcfaGeneratedAt && (
            <div className="text-[10px] text-text-muted mt-1">
              HCFA enviado el {fmtDate(item.hcfaGeneratedAt)}
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => router.push(`/billing/${item.caseId}`)}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-amber/35 hover:text-amber transition-all"
          >
            👁 Ver nota
          </button>

          {isReady ? (
            <button
              type="button"
              onClick={() => onHcfa(item)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-amber text-black text-xs font-semibold hover:bg-amber/90 transition-all"
            >
              📄 Generar HCFA →
            </button>
          ) : item.primaryInsurance?.['claimsPhone' as keyof typeof item.primaryInsurance] && (
            <a
              href={`tel:${(item.primaryInsurance as Record<string, string>)['claimsPhone']}`}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-cyan/35 hover:text-cyan transition-all"
            >
              <Phone className="w-3 h-3" />
              Llamar aseguradora
            </a>
          )}

          <ChevronRight className="w-4 h-4 text-text-muted hidden sm:block" />
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function BillingClient() {
  const [items,   setItems]   = useState<BillingItem[]>([]);
  const [kpis,    setKpis]    = useState<Kpis>({ notesReady: 0, hcfaSent: 0, totalBilled: 0, pendingCollection: 0 });
  const [tab,     setTab]     = useState<TabKey>('pending');
  const [loading, setLoading] = useState(true);
  const [hcfaLoading, setHcfaLoading] = useState<string | null>(null);

  const load = useCallback(async (t: TabKey) => {
    if (t !== 'pending' && t !== 'hcfa') { setLoading(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/billing?tab=${t}`);
      const data = await res.json() as { ok: boolean; kpis: Kpis; items: BillingItem[]; total: number };
      if (data.ok) {
        setItems(data.items);
        setKpis(data.kpis);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(tab); }, [tab, load]);

  async function handleHcfa(item: BillingItem) {
    setHcfaLoading(item.caseId);
    try {
      await fetch(`/api/admin/billing/${item.caseId}/generate-hcfa`, { method: 'POST' });
      await load(tab);
    } finally {
      setHcfaLoading(null);
    }
  }

  const TABS: { key: TabKey; label: string; count?: number; locked?: boolean }[] = [
    { key: 'pending',     label: '📝 Notas pendientes',  count: kpis.notesReady },
    { key: 'hcfa',        label: '📄 HCFA generados',    count: kpis.hcfaSent   },
    { key: 'ledger',      label: '💰 Ledgers',            locked: true           },
    { key: 'legal',       label: '⚖️ Comunicación legal', locked: true           },
    { key: 'settlements', label: '🎯 Settlements',        locked: true           },
  ];

  const isActiveContent = tab === 'pending' || tab === 'hcfa';

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Bandeja de Brunella"
        subtitle="Billing & Finance · Notas firmadas listas para HCFA"
        action={
          <button
            type="button"
            onClick={() => load(tab)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-amber/40 hover:text-amber transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        }
      />

      <div className="px-6 pb-8 space-y-5">

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Notas listas"       value={kpis.notesReady}                  color="text-cyan"    sub="Generar HCFA"    compact />
          <KpiCard label="HCFA enviados"      value={kpis.hcfaSent}                    color="text-brand"   sub="Confirmados"     compact />
          <KpiCard label="Cobros recibidos"   value={fmtMoney(kpis.totalBilled)}       color="text-emerald" sub="Mes (mock)"      compact />
          <KpiCard label="Pendiente cobro"    value={fmtMoney(kpis.pendingCollection)} color="text-amber"   sub="Lien acumulado"  compact />
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => !t.locked && setTab(t.key)}
              disabled={t.locked}
              className={[
                'flex items-center gap-1.5 px-3 h-8 rounded-md text-xs transition-all',
                t.locked
                  ? 'border border-border text-text-muted cursor-not-allowed opacity-50'
                  : tab === t.key
                    ? 'bg-amber/10 border border-amber/40 text-amber font-semibold'
                    : 'border border-border text-text-2 hover:border-border-strong',
              ].join(' ')}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                  tab === t.key ? 'bg-amber/20 text-amber' : 'bg-white/10 text-text-muted'
                }`}>
                  {t.count}
                </span>
              )}
              {t.locked && <span className="text-[9px] opacity-60">Phase 2</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        {!isActiveContent ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-text-muted text-sm">
            Disponible en Phase 2 🔒
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-lg bg-bg-2/40 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState.Rich
            icon={Briefcase}
            title={tab === 'pending' ? 'No hay notas pendientes de billing' : 'No hay HCFA generados aún'}
            subtitle={tab === 'pending'
              ? 'Cuando el doctor firme una nota SOAP, aparecerá aquí.'
              : 'Las notas con HCFA generado aparecerán aquí.'}
          />
        ) : (
          <div className="space-y-2.5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted px-1">
              {items.length} caso{items.length !== 1 ? 's' : ''}
            </div>
            {items.map(item => (
              <CaseRow
                key={item.caseId}
                item={{ ...item, primaryInsurance: item.primaryInsurance }}
                onHcfa={hcfaLoading ? () => {} : handleHcfa}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
