'use client';

/**
 * B.25 Pantalla 2 — Detalle de caso · Brunella
 *
 * Layout de dos paneles:
 *   Izquierda (38%): Resumen del caso + Notas SOAP firmadas + Acciones
 *   Derecha  (62%): Notas internas de Brunella con timeline + compositor
 *
 * Color de identidad (Regla #5): amber
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Scale, ShieldCheck, Phone, Mail,
  CheckCircle2, Plus, FileText, DollarSign,
  RefreshCw, AlertTriangle,
} from 'lucide-react';
import { PageHeader }   from '@/components/ui-phoenix/page-header';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill }   from '@/components/ui-phoenix/status-pill';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CptCode {
  cptCode:     string;
  description: string;
  fee:         number;
}

interface Visit {
  appointmentId: string;
  visitNum:      number;
  scheduledFor:  string;
  provider:      string | null;
  note: {
    id:          string;
    signedAt:    string | null;
    signedBy:    string | null;
    assessment:  string | null;
    plan:        string | null;
    cpts:        CptCode[];
    total:       number;
  } | null;
}

interface InternalNote {
  id:         string;
  content:    string;
  authorName: string;
  createdAt:  string;
  tag:        string;
}

interface CaseDetail {
  id:               string;
  caseCode:         string;
  caseType:         string;
  status:           string;
  accidentDate:     string | null;
  primaryPolicyNumber: string | null;
  visitsTotal:      number;
  billedTotal:      number;
  hcfaGeneratedAt:  string | null;
  patient:          { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
  lawFirm:          { firmName: string | null; phone: string | null; email: string | null } | null;
  attorney:         { firstName: string | null; lastName: string | null; phone: string | null; email: string | null } | null;
  primaryInsurance: { id: string; name: string; shortCode: string; color: string; claimsPhone: string | null; claimsEmail: string | null } | null;
  visits:           Visit[];
  notes:            InternalNote[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TAG_CONFIG: Record<string, { emoji: string; label: string; color: string; border: string; bg: string }> = {
  legal:    { emoji: '⚖️', label: 'Legal',       color: 'text-brand',   border: 'border-brand/30',   bg: 'bg-brand/10'   },
  insurer:  { emoji: '🏥', label: 'Aseguradora', color: 'text-emerald', border: 'border-emerald/30', bg: 'bg-emerald/10' },
  reminder: { emoji: '⏰', label: 'Recordatorio', color: 'text-amber',  border: 'border-amber/30',   bg: 'bg-amber/10'   },
  general:  { emoji: '📝', label: 'General',      color: 'text-text-2',  border: 'border-border',     bg: 'bg-bg-2/50'    },
  system:   { emoji: '🤖', label: 'Sistema',      color: 'text-violet',  border: 'border-violet/30',  bg: 'bg-violet/10'  },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}
function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function cleanContent(content: string): string {
  return content.replace(/^(⚖️|🏥|⏰|📝|🤖)\s*/, '').trim();
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────
function NoteCard({ note }: { note: InternalNote }) {
  const cfg = TAG_CONFIG[note.tag] ?? TAG_CONFIG['general'];
  return (
    <div className="relative mb-4">
      {/* Timeline dot */}
      <div className={`absolute left-[-21px] top-[6px] w-3 h-3 rounded-full border-2 border-bg-1 ${cfg.bg} box-content`} />
      <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold border ${cfg.border} ${cfg.bg} ${cfg.color}`}>
              {cfg.emoji} {cfg.label}
            </span>
            <span className="text-text-2 text-[10.5px] font-semibold">{note.authorName}</span>
          </div>
          <span className="font-mono text-text-muted text-[9.5px]">{fmtDateTime(note.createdAt)}</span>
        </div>
        <div className="text-[11px] text-text-1 leading-relaxed">{cleanContent(note.content)}</div>
      </div>
    </div>
  );
}

// ─── NoteComposer ─────────────────────────────────────────────────────────────
function NoteComposer({ caseId, onSaved }: { caseId: string; onSaved: () => void }) {
  const [content, setContent] = useState('');
  const [tag,     setTag]     = useState<string>('general');
  const [saving,  setSaving]  = useState(false);

  const TAGS = ['legal', 'insurer', 'reminder', 'general'] as const;

  async function save() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/billing/${caseId}/note`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content, tag, authorName: 'Brunella' }),
      });
      setContent('');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-brand/25 bg-brand/5 p-4 mb-5">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Escribir nueva nota interna..."
        rows={3}
        className="w-full rounded-md border border-border bg-bg-2 px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:border-amber/50 focus:outline-none resize-none mb-3"
      />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Tag selector */}
        <div className="flex gap-1.5 flex-wrap">
          {TAGS.map(t => {
            const cfg = TAG_CONFIG[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${
                  tag === t ? `${cfg.border} ${cfg.bg} ${cfg.color}` : 'border-border text-text-muted hover:border-border-strong'
                }`}
              >
                {cfg.emoji} {cfg.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!content.trim() || saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-amber text-black text-xs font-semibold hover:bg-amber/90 disabled:opacity-50 transition-all"
        >
          <Plus className="w-3 h-3" />
          {saving ? 'Guardando...' : 'Guardar nota'}
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function BillingDetailClient({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [detail,     setDetail]     = useState<CaseDetail | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [hcfaBusy,   setHcfaBusy]   = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/billing/${caseId}`);
      const data = await res.json() as { ok: boolean; case: CaseDetail };
      if (data.ok) setDetail(data.case);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  async function generateHcfa() {
    setHcfaBusy(true);
    try {
      await fetch(`/api/admin/billing/${caseId}/generate-hcfa`, { method: 'POST' });
      await loadDetail();
    } finally {
      setHcfaBusy(false);
    }
  }

  if (loading || !detail) {
    return (
      <div className="flex flex-col">
        <PageHeader title="Cargando..." subtitle="Billing · Brunella" />
        <div className="px-6 pb-6 space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-lg bg-bg-2/40 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const d   = detail;
  const patientName  = `${d.patient.firstName} ${d.patient.lastName}`;
  const latestVisit  = d.visits.at(-1);
  const isHcfaDone   = !!d.hcfaGeneratedAt;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={patientName}
        subtitle={d.caseCode}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-amber/40 hover:text-amber transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Bandeja
            </button>
            {!isHcfaDone && (
              <button
                type="button"
                onClick={generateHcfa}
                disabled={hcfaBusy}
                className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-amber text-black text-xs font-semibold hover:bg-amber/90 disabled:opacity-50 transition-all"
              >
                📄 {hcfaBusy ? 'Generando...' : 'Generar HCFA →'}
              </button>
            )}
            {isHcfaDone && (
              <div className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-emerald/35 bg-emerald/8 text-emerald text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                HCFA enviado {fmtDate(d.hcfaGeneratedAt)}
              </div>
            )}
          </div>
        }
      />

      <div className="px-4 sm:px-6 pb-8">
        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[38%_62%] gap-5">

          {/* ── LEFT PANEL ────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Case summary */}
            <div className="rounded-lg border border-border bg-bg-1 p-4">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">
                📋 Resumen del caso
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Tipo',       value: d.caseType               },
                  { label: 'Estado',     value: d.status.replace(/_/g, ' ') },
                  { label: 'Accidente',  value: fmtDate(d.accidentDate)  },
                  { label: 'Abogado',    value: d.attorney
                      ? `${d.attorney.firstName ?? ''} ${d.attorney.lastName ?? ''}`.trim()
                      : d.lawFirm?.firmName ?? '—'
                  },
                  { label: 'PIP',        value: d.primaryInsurance
                      ? `${d.primaryInsurance.name}${d.primaryPolicyNumber ? ' · ' + d.primaryPolicyNumber : ''}`
                      : '—'
                  },
                  { label: 'Visitas',    value: `${d.visitsTotal} facturadas` },
                  { label: 'Saldo',      value: fmtMoney(d.billedTotal)  },
                ].map(row => (
                  <div key={row.label} className="flex justify-between text-[10.5px] gap-2">
                    <span className="text-text-muted">{row.label}</span>
                    <span className="text-text-1 text-right font-medium truncate max-w-[60%]">{row.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Latest signed note snippet */}
            {latestVisit?.note && (
              <div className="rounded-lg border border-brand/20 bg-brand/5 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-brand/80 mb-2">
                  📝 Nota SOAP — Visita {latestVisit.visitNum}
                </div>
                <div className="text-[9.5px] text-brand/80 font-bold uppercase tracking-wider mb-1">
                  {latestVisit.provider ?? ''} · {fmtDate(latestVisit.note.signedAt)} · {fmtMoney(latestVisit.note.total)}
                </div>
                {latestVisit.note.assessment && (
                  <div className="text-[11px] text-text-2 leading-relaxed mb-2 line-clamp-3">
                    <span className="text-brand font-bold">A: </span>{latestVisit.note.assessment}
                  </div>
                )}
                {/* CPT list */}
                {latestVisit.note.cpts.length > 0 && (
                  <div className="space-y-1">
                    {latestVisit.note.cpts.map(cpt => (
                      <div key={cpt.cptCode} className="flex justify-between text-[10px]">
                        <span className="font-mono text-brand/80">{cpt.cptCode}</span>
                        <span className="text-text-muted truncate mx-2 flex-1">{cpt.description}</span>
                        <span className="text-amber font-semibold shrink-0">{fmtMoney(cpt.fee)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Visit timeline (if multiple) */}
            {d.visits.length > 1 && (
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">
                  Historial de visitas ({d.visits.length})
                </div>
                <div className="space-y-2">
                  {d.visits.map(v => (
                    <div key={v.appointmentId} className="flex items-center justify-between text-[11px] gap-2">
                      <span className="text-text-muted">Visita {v.visitNum}</span>
                      <span className="text-text-2">{fmtDate(v.scheduledFor)}</span>
                      <span className="text-amber font-semibold">{v.note ? fmtMoney(v.note.total) : '—'}</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-2 flex justify-between text-[11px] font-bold">
                    <span className="text-text-muted">Total</span>
                    <span className="text-amber">{fmtMoney(d.billedTotal)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="rounded-lg border border-border bg-bg-1 p-4">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">
                🚀 Acciones del caso
              </div>
              <div className="space-y-2">
                {d.attorney?.phone && (
                  <a
                    href={`tel:${d.attorney.phone}`}
                    className="flex items-center gap-2 w-full py-2 px-3 rounded-md border border-border text-text-2 text-xs hover:border-amber/30 hover:text-amber transition-colors"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    Llamar al abogado
                  </a>
                )}
                {d.primaryInsurance?.claimsPhone && (
                  <a
                    href={`tel:${d.primaryInsurance.claimsPhone}`}
                    className="flex items-center gap-2 w-full py-2 px-3 rounded-md border border-border text-text-2 text-xs hover:border-cyan/30 hover:text-cyan transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Llamar a {d.primaryInsurance.name}
                  </a>
                )}
                {d.primaryInsurance?.claimsEmail && (
                  <a
                    href={`mailto:${d.primaryInsurance.claimsEmail}`}
                    className="flex items-center gap-2 w-full py-2 px-3 rounded-md border border-border text-text-2 text-xs hover:border-violet/30 hover:text-violet transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Email a aseguradora
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL — Notes timeline ──────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="text-sm font-bold text-text-1 uppercase tracking-wider">
                📒 Notas internas · Brunella
              </div>
              <span className="border border-brand/30 rounded-full px-2.5 py-0.5 text-[10px] bg-brand/8 text-brand font-semibold">
                {d.notes.length} notas
              </span>
            </div>

            {/* Composer */}
            <NoteComposer caseId={caseId} onSaved={loadDetail} />

            {/* Timeline */}
            {d.notes.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm border border-dashed border-border rounded-lg">
                Sin notas internas aún. Agregá la primera nota arriba.
              </div>
            ) : (
              <div className="relative pl-5 border-l-2 border-brand/15">
                {d.notes.map(n => (
                  <NoteCard key={n.id} note={n} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
