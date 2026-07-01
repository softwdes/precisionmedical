'use client';

/**
 * B.28 — Settlement Workflow (Brunella)
 * Route: /billing/[caseId]/settlement
 *
 * Layout: 2 columnas
 *   Izquierda: Datos del caso + Desglose del lien
 *   Derecha:   Formulario de recepción + Checklist de acciones + Botón procesar
 *
 * Color identity: emerald (success/settled) sobre base amber (Billing)
 * Regla #5: amber = Billing identity, emerald = estado confirmado / settlement
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Scale,
  FileText, Mail, DollarSign, Calendar, User, Building2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix/page-header';
import { EmptyState }  from '@/components/ui-phoenix/empty-state';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LienRow {
  label:     string;
  amount:    number;
  amountFmt: string;
}

interface ExistingSettlement {
  content:     string;
  processedAt: string;
}

interface SettlementData {
  ok: boolean;
  settlement: {
    caseId:       string;
    caseCode:     string;
    caseType:     string;
    status:       string;
    isSettled:    boolean;
    accidentDate: string;
    lastVisitDate: string;
    visitCount:   number;
    patientName:  string;
    patientPhone: string | null;
    patientEmail: string | null;
    firmName:     string | null;
    firmEmail:    string | null;
    firmPhone:    string | null;
    trustAccount: string | null;
    attorneyName: string | null;
    insurerName:  string | null;
    totalCharged:    number;
    totalChargedFmt: string;
    totalPaid:       number;
    totalPaidFmt:    string;
    lienTotal:       number;
    lienTotalFmt:    string;
    lienBreakdown:   LienRow[];
    existingSettlement: ExistingSettlement | null;
  };
}

interface FormState {
  receivedDate: string;
  method:       'check' | 'wire' | 'ach';
  reference:    string;
  payor:        string;
  amount:       string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

// ─── Diff indicator ──────────────────────────────────────────────────────────

function DiffIndicator({ lienTotal, amountStr }: { lienTotal: number; amountStr: string }) {
  const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));
  if (!amount || isNaN(amount)) return null;
  const diff = amount - lienTotal;
  const exact = Math.abs(diff) < 0.01;

  if (exact) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Coincide exactamente con el lien
      </div>
    );
  }
  if (diff < 0) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-rose">
        <AlertCircle className="w-3.5 h-3.5" />
        Settlement parcial · faltan {fmtMoney(Math.abs(diff))}
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber">
      <AlertCircle className="w-3.5 h-3.5" />
      Monto superior al lien por {fmtMoney(diff)} — verificar
    </div>
  );
}

// ─── Success overlay ──────────────────────────────────────────────────────────

function SuccessScreen({ caseId, caseCode, amount, method, payor, onBack }: {
  caseId:   string;
  caseCode: string;
  amount:   string;
  method:   string;
  payor:    string;
  onBack:   () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full"
        style={{ background: 'linear-gradient(135deg,rgba(52,211,153,0.20),rgba(16,185,129,0.10))', border: '2px solid rgba(52,211,153,0.40)' }}
      >
        <CheckCircle2 className="w-10 h-10 text-emerald" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-text-1 mb-2">Settlement procesado</h2>
        <p className="text-text-muted text-[13px]">Caso {caseCode} cerrado exitosamente</p>
      </div>
      <div className="rounded-xl border border-emerald/25 bg-emerald/8 p-5 w-full max-w-sm text-left">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald mb-3">Resumen</div>
        {[
          { label: 'Monto', value: amount },
          { label: 'Método', value: method },
          { label: 'Emisor', value: payor },
        ].map(r => (
          <div key={r.label} className="flex justify-between text-[12px] mb-2">
            <span className="text-text-muted">{r.label}</span>
            <span className="text-text-1 font-medium">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-2 text-[12px] text-text-muted">
        <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald" /> Ledger actualizado — balance $0</div>
        <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald" /> Caso marcado como SETTLED</div>
        <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald" /> Nota de settlement registrada</div>
        <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald" /> Audit log guardado</div>
      </div>
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg bg-amber px-6 py-2.5 text-[13px] font-semibold text-black hover:bg-amber/90 transition-colors"
        >
          Volver al billing ←
        </button>
        <a
          href={`/billing/${caseId}/settlement/print`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-emerald/30 bg-emerald/10 px-6 py-2.5 text-[13px] font-semibold text-emerald hover:bg-emerald/15 transition-colors"
        >
          🖨 Imprimir comprobante
        </a>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SettlementClient() {
  const params = useParams<{ caseId: string }>();
  const router = useRouter();
  const caseId = params.caseId;

  const [data,      setData]      = useState<SettlementData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [settled,   setSettled]   = useState(false);
  const [settledResult, setSettledResult] = useState<{ amount: string; method: string; payor: string } | null>(null);

  const [form, setForm] = useState<FormState>({
    receivedDate: todayISO(),
    method:       'check',
    reference:    '',
    payor:        '',
    amount:       '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/billing/${caseId}/settlement-data`);
      const json = await res.json() as SettlementData;
      if (!json.ok) throw new Error('NOT_FOUND');
      setData(json);
      // Pre-fill form
      const s = json.settlement;
      setForm(f => ({
        ...f,
        payor:  s.trustAccount ?? s.firmName ?? '',
        amount: s.lienTotal > 0 ? s.lienTotal.toFixed(2) : '',
      }));
    } catch {
      setError('No se pudo cargar el caso para settlement.');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      setSubmitError('El monto debe ser un número positivo.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/billing/${caseId}/settle`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          receivedDate: form.receivedDate,
          method:       form.method,
          reference:    form.reference.trim(),
          payor:        form.payor.trim(),
          amount,
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string; settled?: { amountFmt: string } };
      if (!json.ok) {
        if (json.error === 'ALREADY_SETTLED') {
          setSubmitError('Este caso ya fue settlado anteriormente.');
        } else {
          setSubmitError('Error al procesar el settlement. Intentá de nuevo.');
        }
        return;
      }
      const METHOD_LABELS: Record<string, string> = { check: 'Cheque', wire: 'Wire Transfer', ach: 'ACH' };
      setSettledResult({
        amount: json.settled?.amountFmt ?? fmtMoney(amount),
        method: METHOD_LABELS[form.method] ?? form.method,
        payor:  form.payor,
      });
      setSettled(true);
    } catch {
      setSubmitError('Error de red. Revisá la conexión e intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-bg-1" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="h-80 animate-pulse rounded-xl bg-bg-1" />
          <div className="h-80 animate-pulse rounded-xl bg-bg-1" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState.Rich icon={AlertCircle} title="Error" subtitle={error ?? 'Caso no encontrado'} />
      </div>
    );
  }

  const s = data.settlement;

  // ── Already settled (existing settlement note) ────────────────────────────

  if (s.isSettled && s.existingSettlement && !settled) {
    return (
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.push(`/billing/${caseId}`)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-muted hover:bg-bg-1 hover:text-text-1 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Billing
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-5 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald/40 bg-emerald/10">
            <CheckCircle2 className="w-8 h-8 text-emerald" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-1 mb-1">Caso ya settlado</h2>
            <p className="text-text-muted text-[13px]">{s.caseCode} · {s.patientName}</p>
          </div>
          <div className="rounded-xl border border-emerald/25 bg-emerald/5 p-4 w-full max-w-md text-left">
            <div className="text-[11px] text-text-muted leading-relaxed">{s.existingSettlement.content}</div>
            <div className="mt-2 text-[10px] text-text-muted">
              Procesado: {new Date(s.existingSettlement.processedAt).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Denver' })}
            </div>
          </div>
          <button type="button" onClick={() => router.push(`/billing/${caseId}`)}
            className="rounded-lg bg-amber px-6 py-2.5 text-[13px] font-semibold text-black hover:bg-amber/90 transition-colors">
            ← Volver al billing
          </button>
        </div>
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (settled && settledResult) {
    return (
      <SuccessScreen
        caseId={caseId}
        caseCode={s.caseCode}
        amount={settledResult.amount}
        method={settledResult.method}
        payor={settledResult.payor}
        onBack={() => router.push(`/billing/${caseId}`)}
      />
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────

  const amountNum    = parseFloat(form.amount) || 0;
  const diffFromLien = amountNum - s.lienTotal;
  const isExact      = Math.abs(diffFromLien) < 0.01;
  const isPartial    = amountNum > 0 && diffFromLien < -0.01;

  const canSubmit = amountNum > 0 && form.receivedDate && form.payor.trim() && !submitting;

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Topbar ── */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-bg-0/95 px-5 py-3 backdrop-blur-sm">
        <button type="button" onClick={() => router.push(`/billing/${caseId}`)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-muted hover:bg-bg-1 hover:text-text-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Billing
        </button>
        <span className="text-border">/</span>
        <span className="text-[12px] font-medium text-text-1">Settlement · {s.caseCode}</span>
      </div>

      <div className="p-5">
        <PageHeader
          title="🎯 Settlement recibido"
          subtitle={`${s.firmName ?? 'Bufete'} envió el cheque del settlement. Aplicar al lien y cerrar el caso.`}
        />

        <form onSubmit={handleSubmit}>
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* ══ LEFT: Datos del caso + Desglose del lien ══ */}
            <div className="flex flex-col gap-4">

              {/* 📋 Datos del caso */}
              <div className="rounded-xl border border-border bg-bg-1 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-brand" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    Datos del caso
                  </span>
                </div>

                <div className="space-y-2.5">
                  {[
                    { icon: User,      label: 'Paciente',     value: s.patientName },
                    { icon: FileText,  label: 'Caso',         value: s.caseCode, mono: true },
                    { icon: Calendar,  label: 'DOL',          value: s.accidentDate },
                    { icon: null,      label: 'Tratamiento',  value: `${s.visitCount} visita${s.visitCount !== 1 ? 's' : ''} · MMI ${s.lastVisitDate}` },
                    { icon: Scale,     label: 'Abogado',      value: [s.attorneyName, s.firmName].filter(Boolean).join(' · ') || '—' },
                    { icon: null,      label: 'Aseguradora',  value: s.insurerName ?? '—' },
                  ].map(row => (
                    <div key={row.label} className="flex items-start justify-between gap-3 text-[11.5px]">
                      <span className="text-text-muted shrink-0">{row.label}</span>
                      <span className={`text-right font-medium text-text-1 ${row.mono ? 'font-mono' : ''}`}>
                        {row.value || '—'}
                      </span>
                    </div>
                  ))}
                  {/* Lien acumulado — highlighted */}
                  <div className="flex items-center justify-between border-t border-border pt-2.5 mt-1">
                    <span className="text-[11.5px] text-text-muted">Lien acumulado</span>
                    <span className="font-mono font-bold text-[14px]" style={{ color: '#fda4af' }}>
                      {s.lienTotalFmt}
                    </span>
                  </div>
                </div>
              </div>

              {/* 💰 Detalle del lien */}
              <div className="rounded-xl border border-border bg-bg-1 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-4 h-4 text-amber" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    Detalle del lien
                  </span>
                </div>

                {s.lienBreakdown.length === 0 ? (
                  <div className="text-[12px] text-text-muted">Sin detalle de CPT disponible</div>
                ) : (
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left pb-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Concepto</th>
                        <th className="text-right pb-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.lienBreakdown.map(row => (
                        <tr key={row.label} className="border-b border-border/40">
                          <td className="py-2 text-text-1">{row.label}</td>
                          <td className="py-2 text-right font-mono text-text-1">{row.amountFmt}</td>
                        </tr>
                      ))}
                      {/* Deducciones PIP pagado */}
                      {s.totalPaid > 0 && (
                        <tr className="border-b border-border/40">
                          <td className="py-2 text-emerald">− PIP recibido</td>
                          <td className="py-2 text-right font-mono text-emerald">({s.totalPaidFmt})</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr
                        className="rounded-lg"
                        style={{ background: 'rgba(244,63,94,0.06)' }}
                      >
                        <td className="py-2.5 px-1 font-bold text-[12px]" style={{ color: '#fda4af' }}>
                          Total lien
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-[13px]" style={{ color: '#fda4af' }}>
                          {s.lienTotalFmt}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>

            {/* ══ RIGHT: Formulario + Checklist + Botón ══ */}
            <div className="flex flex-col gap-4">

              {/* 📥 Settlement recibido — form */}
              <div
                className="rounded-xl border-2 p-5"
                style={{
                  background:   'linear-gradient(135deg,rgba(16,185,129,0.10),rgba(6,182,212,0.06))',
                  borderColor:  'rgba(16,185,129,0.30)',
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    Settlement recibido
                  </span>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Fecha de recepción */}
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                      Fecha de recepción
                    </label>
                    <input
                      type="date"
                      lang="en-US"
                      value={form.receivedDate}
                      onChange={e => setForm(f => ({ ...f, receivedDate: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-bg-2 px-3 py-2 text-[12px] text-text-1 focus:border-emerald/50 focus:outline-none"
                      required
                    />
                  </div>

                  {/* Método + Referencia */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                        Método
                      </label>
                      <select
                        value={form.method}
                        onChange={e => setForm(f => ({ ...f, method: e.target.value as FormState['method'] }))}
                        className="w-full rounded-lg border border-border bg-bg-2 px-3 py-2 text-[12px] text-text-1 focus:border-emerald/50 focus:outline-none"
                      >
                        <option value="check">Cheque</option>
                        <option value="wire">Wire Transfer</option>
                        <option value="ach">ACH</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                        {form.method === 'check' ? '# Cheque' : 'Referencia'}
                        <span className="font-normal text-text-muted ml-1">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={form.reference}
                        onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                        placeholder={form.method === 'check' ? '#84720' : 'REF-001'}
                        className="w-full rounded-lg border border-border bg-bg-2 px-3 py-2 text-[12px] text-text-1 placeholder:text-text-muted focus:border-emerald/50 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Emisor */}
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                      Emisor
                    </label>
                    <input
                      type="text"
                      value={form.payor}
                      onChange={e => setForm(f => ({ ...f, payor: e.target.value }))}
                      placeholder="Smith & Johnson LLP Trust Account"
                      className="w-full rounded-lg border border-border bg-bg-2 px-3 py-2 text-[12px] text-text-1 placeholder:text-text-muted focus:border-emerald/50 focus:outline-none"
                      required
                    />
                  </div>

                  {/* Monto recibido — big input */}
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                      Monto recibido
                    </label>
                    <div
                      className="rounded-lg border p-3"
                      style={{
                        background:  'rgba(16,185,129,0.10)',
                        borderColor: 'rgba(16,185,129,0.30)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-emerald">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.amount}
                          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                          placeholder="0.00"
                          className="flex-1 bg-transparent text-2xl font-bold font-mono text-emerald placeholder:text-emerald/40 focus:outline-none min-w-0"
                          required
                        />
                        {isExact && form.amount && (
                          <CheckCircle2 className="w-6 h-6 text-emerald shrink-0" />
                        )}
                      </div>
                    </div>
                    {form.amount && (
                      <DiffIndicator lienTotal={s.lienTotal} amountStr={form.amount} />
                    )}
                  </div>
                </div>
              </div>

              {/* 📤 Al confirmar Settlement — checklist */}
              <div className="rounded-xl border border-border bg-bg-1 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Mail className="w-4 h-4 text-brand" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    Al confirmar settlement
                  </span>
                </div>

                <div className="space-y-2.5 text-[12px] text-text-2 leading-relaxed">
                  {[
                    { text: 'Ledger se actualiza: balance pasa a $0', always: true },
                    { text: `Caso pasa a estado SETTLED`, always: true },
                    { text: 'Nota de settlement registrada y archivada', always: true },
                    { text: 'Audit log guardado (HIPAA)', always: true },
                    { text: `Email al paciente: "Tu caso está cerrado"  (Phase 2)`, always: false },
                    { text: `Email a ${s.firmName ?? 'bufete'}: confirmación de recepción (Phase 2)`, always: false },
                    { text: 'Reporte agregado a métricas del mes', always: true },
                  ].map((item, i) => (
                    <div key={i} className={`flex items-start gap-2 ${!item.always ? 'opacity-50' : ''}`}>
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${item.always ? 'text-emerald' : 'text-text-muted'}`} />
                      <span>{item.text}</span>
                    </div>
                  ))}
                  {isPartial && (
                    <div className="flex items-start gap-2 text-amber">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Balance restante {fmtMoney(s.lienTotal - amountNum)} queda como saldo pendiente</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {submitError && (
                <div className="rounded-lg border border-rose/30 bg-rose/8 px-4 py-3 text-[12px] text-rose flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {submitError}
                </div>
              )}

              {/* ✓ Procesar Settlement — CTA */}
              <button
                type="submit"
                disabled={!canSubmit}
                className={`w-full rounded-xl py-4 text-[13px] font-bold transition-all ${
                  canSubmit
                    ? 'bg-emerald text-bg-0 hover:bg-emerald/90 shadow-lg shadow-emerald/20'
                    : 'bg-bg-2 text-text-muted cursor-not-allowed'
                }`}
              >
                {submitting
                  ? '⏳ Procesando...'
                  : isExact
                  ? `✓ Procesar Settlement ${fmtMoney(amountNum)} y cerrar caso`
                  : amountNum > 0
                  ? `✓ Procesar Settlement ${fmtMoney(amountNum)} y cerrar caso`
                  : '✓ Procesar Settlement y cerrar caso'
                }
              </button>

              {/* Contact quick-links */}
              <div className="flex items-center gap-2 flex-wrap">
                {s.firmPhone && (
                  <a href={`tel:${s.firmPhone}`}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] text-text-muted hover:text-text-1 transition-colors">
                    📞 {s.firmName ?? 'Bufete'}
                  </a>
                )}
                {s.firmEmail && (
                  <a href={`mailto:${s.firmEmail}?subject=Settlement – ${s.caseCode}`}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] text-text-muted hover:text-text-1 transition-colors">
                    <Mail className="w-3 h-3" /> {s.firmEmail}
                  </a>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
