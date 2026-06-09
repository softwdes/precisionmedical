'use client';

/**
 * B.27 — Ledger del caso (Brunella / Billing)
 *
 * Dos vistas:
 *  1. Movimientos — tabla interactiva con running balance
 *  2. Account Overview — PDF preview imprimible (Screen 2 del mockup)
 *
 * Reporte mensual (Screen 3) → botón linkea a /billing/report
 *
 * Color identity: amber (Billing, Regla #5)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Mail, BarChart3, Printer, ExternalLink, TrendingUp, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix/PageHeader';
import { KpiCard }    from '@/components/ui-phoenix/KpiCard';
import { EmptyState }  from '@/components/ui-phoenix/EmptyState';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CaseInfo {
  id:            string;
  caseCode:      string;
  caseType:      string;
  status:        string;
  accidentDate:  string | null;
  patientName:   string;
  patientNameFmt: string;
  patientPhone:  string | null;
  firmName:      string | null;
  firmEmail:     string | null;
  firmPhone:     string | null;
  attorneyName:  string | null;
  insurerName:   string | null;
  pipNumber:     string | null;
  visitCount:    number;
  clinicName:    string;
  clinicAddress: string | null;
  lienSignedAt:  string | null;
}

interface Financial {
  totalCharge:     number;
  totalChargeFmt:  string;
  totalPayment:    number;
  totalPaymentFmt: string;
  totalBalance:    number;
  totalBalanceFmt: string;
  cptCount:        number;
}

interface Tx {
  id:          string;
  date:        string;
  type:        'charge' | 'payment';
  subtype:     'visit' | 'hcfa_payment' | 'partial_payment';
  description: string;
  charge:      number;
  chargeFmt:   string;
  payment:     number;
  paymentFmt:  string;
  balance:     number;
  balanceFmt:  string;
}

interface LedgerData {
  ok:           boolean;
  case:         CaseInfo;
  financial:    Financial;
  transactions: Tx[];
}

// ─── TX badge config ──────────────────────────────────────────────────────────

const TX_CONFIG = {
  visit:           { label: 'Visita',        bg: 'bg-cyan/15 text-cyan border-cyan/25' },
  hcfa_payment:    { label: 'Pago PIP',      bg: 'bg-emerald/15 text-emerald border-emerald/25' },
  partial_payment: { label: 'Pago parcial',  bg: 'bg-emerald/10 text-emerald/80 border-emerald/20' },
} as const;

// ─── Status badge ─────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const cfg: Record<string, string> = {
    ACTIVE:   'bg-emerald/15 text-emerald border-emerald/25',
    SETTLED:  'bg-brand/15 text-brand border-brand/25',
    CLOSED:   'bg-text-muted/15 text-text-muted border-border',
    DEFAULT:  'bg-amber/15 text-amber border-amber/25',
  };
  return (cfg[status] ?? cfg.DEFAULT) + ' rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider';
}

// ─── PDF Account Overview Component ──────────────────────────────────────────
// White, printable, Times New Roman style matching Screen 2 of mockup

function AccountOverview({ d, financial, transactions }: {
  d: CaseInfo;
  financial: Financial;
  transactions: Tx[];
}) {
  const now     = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const accDate = d.accidentDate
    ? new Date(d.accidentDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/Denver' })
    : '—';

  // Summary rows for the PDF table
  const charges  = transactions.filter(t => t.type === 'charge');
  const payments = transactions.filter(t => t.type === 'payment');

  return (
    <div
      id="account-overview-print"
      style={{
        background:  '#ffffff',
        color:       '#1a1a2e',
        fontFamily:  '"Times New Roman", Times, serif',
        padding:     '40px',
        maxWidth:    '800px',
        margin:      '0 auto',
        lineHeight:  '1.4',
        fontSize:    '12px',
      }}
    >
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '2px solid #1a1a2e', paddingBottom: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '4px' }}>
          Central Billing Office, Inc.
        </div>
        <div style={{ fontSize: '13px', color: '#4a4a6a', marginBottom: '8px' }}>
          Precision Medical Pain Management and Orthopedics
        </div>
        <div style={{
          display:    'inline-block',
          padding:    '4px 16px',
          background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
          color:      '#ffffff',
          fontFamily: 'Arial, sans-serif',
          fontSize:   '11px',
          fontWeight: 'bold',
          letterSpacing: '0.5px',
          borderRadius: '3px',
          marginBottom: '8px',
        }}>
          ACCOUNT OVERVIEW
        </div>
        <div style={{ fontSize: '11px', color: '#666' }}>
          Generated: {now} · Case #{d.caseCode} · {d.caseType}
        </div>
      </div>

      {/* ── Patient info grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6366f1', fontWeight: 'bold', marginBottom: '6px', fontFamily: 'Arial, sans-serif' }}>
            Provider Organization
          </div>
          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Precision Medical</div>
          <div>Pain Management and Orthopedics</div>
          <div>{d.clinicName}</div>
          {d.clinicAddress && <div style={{ color: '#555' }}>{d.clinicAddress}</div>}
        </div>
        <div>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6366f1', fontWeight: 'bold', marginBottom: '6px', fontFamily: 'Arial, sans-serif' }}>
            Guarantor
          </div>
          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{d.patientNameFmt}</div>
          {d.patientPhone && <div>{d.patientPhone}</div>}
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#555' }}>
            Account #{d.caseCode} · DOL: {accDate}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6366f1', fontWeight: 'bold', marginBottom: '6px', fontFamily: 'Arial, sans-serif' }}>
            Law Firm / Attorney
          </div>
          <div style={{ fontWeight: 'bold' }}>{d.firmName ?? 'N/A'}</div>
          {d.attorneyName && <div>Atty. {d.attorneyName}</div>}
          {d.firmPhone && <div style={{ color: '#555' }}>{d.firmPhone}</div>}
        </div>
        <div>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#6366f1', fontWeight: 'bold', marginBottom: '6px', fontFamily: 'Arial, sans-serif' }}>
            PIP Insurer
          </div>
          <div style={{ fontWeight: 'bold' }}>{d.insurerName ?? '—'}</div>
          {d.pipNumber && <div>Policy: {d.pipNumber}</div>}
        </div>
      </div>

      {/* ── Transaction table ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: '#f0f0f8', fontFamily: 'Arial, sans-serif' }}>
            {['Date', 'Patient', 'Provider', 'Description', 'Charges', 'Payment', 'Balance'].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Charges' || h === 'Payment' || h === 'Balance' ? 'right' : 'left', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', border: '1px solid #ddd', color: '#333' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, i) => (
            <tr key={tx.id} style={{ background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
              <td style={{ padding: '5px 8px', border: '1px solid #eee', whiteSpace: 'nowrap' }}>{tx.date}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #eee' }}>{d.patientName}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #eee' }}>{tx.subtype === 'visit' ? 'Provider' : 'Insurance'}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #eee', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tx.description}
              </td>
              <td style={{ padding: '5px 8px', border: '1px solid #eee', textAlign: 'right', color: tx.charge > 0 ? '#dc2626' : '#999' }}>
                {tx.chargeFmt}
              </td>
              <td style={{ padding: '5px 8px', border: '1px solid #eee', textAlign: 'right', color: tx.payment > 0 ? '#059669' : '#999' }}>
                {tx.paymentFmt}
              </td>
              <td style={{ padding: '5px 8px', border: '1px solid #eee', textAlign: 'right', fontWeight: tx.balance > 0 ? 'bold' : 'normal', color: tx.balance > 100 ? '#dc2626' : '#333' }}>
                {tx.balanceFmt}
              </td>
            </tr>
          ))}
          {/* Totals row */}
          <tr style={{ background: '#f0f0f8', fontWeight: 'bold' }}>
            <td colSpan={4} style={{ padding: '6px 8px', border: '1px solid #ddd', fontFamily: 'Arial, sans-serif', fontSize: '10px', textTransform: 'uppercase' }}>
              TOTALS ({transactions.length} transactions · {d.visitCount} visits)
            </td>
            <td style={{ padding: '6px 8px', border: '1px solid #ddd', textAlign: 'right', color: '#dc2626' }}>
              {financial.totalChargeFmt}
            </td>
            <td style={{ padding: '6px 8px', border: '1px solid #ddd', textAlign: 'right', color: '#059669' }}>
              {financial.totalPaymentFmt}
            </td>
            <td style={{ padding: '6px 8px', border: '1px solid #ddd', textAlign: 'right', color: '#dc2626', fontWeight: 'bold' }}>
              {financial.totalBalanceFmt}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '12px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#166534', fontWeight: 'bold', fontFamily: 'Arial, sans-serif', marginBottom: '6px' }}>
            Case Summary · {d.caseType}
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.6' }}>
            <div>DOL: {accDate}</div>
            <div>Visits: {d.visitCount}</div>
            <div>Insurer: {d.insurerName ?? '—'}</div>
            <div>Policy #: {d.pipNumber ?? '—'}</div>
          </div>
        </div>
        <div style={{
          background:    '#fff1f2',
          border:        '1px solid #fda4af',
          borderRadius:  '6px',
          padding:       '12px',
        }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#9f1239', fontWeight: 'bold', fontFamily: 'Arial, sans-serif', marginBottom: '6px' }}>
            Lien Status
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.6' }}>
            <div>Total charged: <b>{financial.totalChargeFmt}</b></div>
            <div>Collected: {financial.totalPaymentFmt}</div>
            <div>Balance (lien): <b style={{ color: '#dc2626' }}>{financial.totalBalanceFmt}</b></div>
            <div>Signed: {d.lienSignedAt ? new Date(d.lienSignedAt).toLocaleDateString('en-US') : 'Pending'}</div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: '1px solid #ddd', paddingTop: '12px', fontSize: '10px', color: '#888', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <div>Precision Medical · Central Billing Office · {d.clinicAddress ?? 'Utah, USA'}</div>
        <div style={{ marginTop: '4px' }}>
          Audit: #{d.caseCode}-{now.replace(/[^0-9]/g, '').slice(-6)} · HIPAA Compliant · Confidential — Attorney-Client Privilege
        </div>
        <div style={{ marginTop: '2px' }}>Page 1 of 1</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LedgerClient() {
  const params = useParams<{ caseId: string }>();
  const router = useRouter();
  const caseId = params.caseId;

  const [data,    setData]    = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tab,     setTab]     = useState<'movimientos' | 'account-overview'>('movimientos');
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/billing/${caseId}/ledger`);
      const json = await res.json() as LedgerData;
      if (!json.ok) throw new Error('NOT_FOUND');
      setData(json);
    } catch (e) {
      setError('No se pudo cargar el ledger del caso.');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  function handlePrint() {
    const content = document.getElementById('account-overview-print');
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Account Overview – ${data?.case.caseCode ?? caseId}</title>
          <style>
            @page { margin: 20mm; }
            body { margin: 0; padding: 0; }
            * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-bg-1" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-24 animate-pulse rounded-lg bg-bg-1" />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-bg-1" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState.Rich
          icon={AlertCircle}
          title="Error cargando ledger"
          subtitle={error ?? 'Caso no encontrado'}
        />
      </div>
    );
  }

  const { case: d, financial, transactions } = data;

  const accDate = d.accidentDate
    ? new Date(d.accidentDate).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' })
    : '—';

  // Initials for avatar
  const initials = d.patientName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Print styles (hide UI chrome when printing) ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* ── Topbar ── */}
      <div className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-bg-0/95 px-5 py-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => router.push(`/billing/${caseId}`)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-muted transition-colors hover:bg-bg-1 hover:text-text-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Billing
        </button>
        <span className="text-border">/</span>
        <span className="text-[12px] text-text-1 font-medium">Ledger · {d.caseCode}</span>
      </div>

      <div className="no-print flex flex-col gap-6 p-5">

        {/* ── Patient Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Avatar */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/15 border border-brand/25 text-brand font-bold text-sm">
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-text-1">{d.patientName}</h1>
              <span className="font-mono text-[11px] text-violet bg-violet/10 border border-violet/25 rounded-full px-2 py-0.5">
                MVA #{d.caseCode}
              </span>
              <span className={statusBadge(d.status)}>{d.status}</span>
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-text-muted">
              <span>DOL: {accDate}</span>
              <span className="text-border">·</span>
              <span>{d.visitCount} visita{d.visitCount !== 1 ? 's' : ''}</span>
              <span className="text-border">·</span>
              <span>{d.firmName ?? 'Sin bufete'}</span>
              {d.insurerName && <>
                <span className="text-border">·</span>
                <span>{d.insurerName}</span>
              </>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap no-print">
            <button
              type="button"
              onClick={() => router.push('/billing/report')}
              className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/8 px-3 py-1.5 text-[11px] text-brand hover:bg-brand/15 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Reporte mensual
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Total facturado */}
          <div
            className="rounded-xl border p-4"
            style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.10),rgba(99,102,241,0.04))', borderColor: 'rgba(99,102,241,0.25)' }}
          >
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
              Total facturado
            </div>
            <div className="text-2xl font-bold font-mono text-text-1">{financial.totalChargeFmt}</div>
            <div className="text-[11px] text-text-muted mt-1">{financial.cptCount} líneas CPT</div>
          </div>

          {/* Cobrado del PIP */}
          <div
            className="rounded-xl border p-4"
            style={{ background: 'linear-gradient(135deg,rgba(52,211,153,0.10),rgba(52,211,153,0.04))', borderColor: 'rgba(52,211,153,0.25)' }}
          >
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
              Cobrado del PIP
            </div>
            <div className="text-2xl font-bold font-mono" style={{ color: '#34d399' }}>{financial.totalPaymentFmt}</div>
            <div className="text-[11px] text-text-muted mt-1">{d.insurerName ?? 'Insurer'}</div>
          </div>

          {/* Balance → Lien */}
          <div
            className="rounded-xl border p-4"
            style={{ background: 'linear-gradient(135deg,rgba(251,113,133,0.10),rgba(251,113,133,0.04))', borderColor: 'rgba(251,113,133,0.25)' }}
          >
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
              Balance → Lien
            </div>
            <div className="text-2xl font-bold font-mono" style={{ color: '#fda4af' }}>{financial.totalBalanceFmt}</div>
            <div className="text-[11px] text-text-muted mt-1">
              {d.lienSignedAt ? '⚖ Lien firmado' : 'Pendiente cobro'}
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 border-b border-border pb-0">
          {(['movimientos', 'account-overview'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors -mb-px ${
                tab === t
                  ? 'border-amber text-amber'
                  : 'border-transparent text-text-muted hover:text-text-1'
              }`}
            >
              {t === 'movimientos' ? (
                <><TrendingUp className="w-3.5 h-3.5" />Movimientos</>
              ) : (
                <><FileText className="w-3.5 h-3.5" />Account Overview</>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: Movimientos ── */}
        {tab === 'movimientos' && (
          <div>
            {transactions.length === 0 ? (
              <EmptyState.Rich
                icon={TrendingUp}
                title="Sin transacciones"
                subtitle="No hay cargos ni pagos registrados para este caso"
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-bg-1">
                <table className="w-full text-[12.5px] min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border bg-bg-2/40">
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Fecha</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Tipo</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Descripción</th>
                      <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Cargo</th>
                      <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Pago</th>
                      <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => {
                      const cfg = TX_CONFIG[tx.subtype];
                      return (
                        <tr
                          key={tx.id}
                          className={`border-b border-border/60 hover:bg-white/[0.02] transition-colors ${i === transactions.length - 1 ? 'border-b-0' : ''}`}
                        >
                          <td className="px-4 py-3 text-text-muted whitespace-nowrap">{tx.date}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.bg}`}>
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-text-1 max-w-[260px] truncate" title={tx.description}>
                            {tx.description}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {tx.charge > 0 ? (
                              <span className="text-rose/90">{tx.chargeFmt}</span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {tx.payment > 0 ? (
                              <span className="text-emerald">{tx.paymentFmt}</span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold">
                            <span className={tx.balance > 0 ? 'text-text-1' : 'text-emerald'}>
                              {tx.balanceFmt}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals footer */}
                  <tfoot>
                    <tr className="border-t-2 border-border bg-bg-2/60">
                      <td colSpan={3} className="px-4 py-3 text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                        Total · {transactions.length} mov · {d.visitCount} visita{d.visitCount !== 1 ? 's' : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose/90">{financial.totalChargeFmt}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald">{financial.totalPaymentFmt}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-text-1">{financial.totalBalanceFmt}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ── Bottom actions ── */}
            <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setTab('account-overview')}
                className="flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/10 px-4 py-2 text-[12px] font-medium text-amber hover:bg-amber/20 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Account Overview PDF
              </button>
              {d.firmEmail && (
                <a
                  href={`mailto:${d.firmEmail}?subject=Account Overview – ${d.caseCode}&body=Adjunto el estado de cuenta para el caso ${d.caseCode}.`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-bg-1 px-4 py-2 text-[12px] text-text-muted hover:text-text-1 hover:border-amber/30 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Enviar a {d.firmName ?? 'bufete'}
                </a>
              )}
              <button
                type="button"
                onClick={() => router.push('/billing/report')}
                className="flex items-center gap-2 rounded-lg border border-border bg-bg-1 px-4 py-2 text-[12px] text-text-muted hover:text-text-1 hover:border-brand/30 transition-colors"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Reporte mensual consolidado
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Account Overview ── */}
        {tab === 'account-overview' && (
          <div>
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap mb-4 no-print">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-2 rounded-lg bg-amber px-4 py-2 text-[12px] font-medium text-black hover:bg-amber/90 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir / Guardar PDF
              </button>
              {d.firmEmail && (
                <a
                  href={`mailto:${d.firmEmail}?subject=Account Overview – ${d.caseCode}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-bg-1 px-4 py-2 text-[12px] text-text-muted hover:text-text-1 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Enviar a {d.firmName ?? 'bufete'}
                </a>
              )}
            </div>

            {/* White document preview */}
            <div className="rounded-xl border border-border overflow-hidden shadow-xl">
              <div ref={printRef}>
                <AccountOverview d={d} financial={financial} transactions={transactions} />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
