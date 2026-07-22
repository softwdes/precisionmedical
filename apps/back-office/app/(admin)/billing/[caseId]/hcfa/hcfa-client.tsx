'use client';

/**
 * B.26 — HCFA / CMS-1500 Generación
 *
 * Layout: 60/40
 *   Izquierda: Vista previa del formulario CMS-1500 (fondo blanco, texto oscuro)
 *   Derecha:   Panel de configuración + validaciones + botón generar
 *
 * Color identity (Regla #5): amber — módulo Billing / Brunella
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  FileText,
  Mail,
  Phone,
  RefreshCw,
  AlertTriangle,
  Check,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceLine {
  date:        string;
  cptCode:     string;
  description: string;
  units:       number;
  amount:      number;
  amountFmt:   string;
}

interface DiagnosisBox {
  letter: string;
  code:   string;
  label:  string;
}

interface HcfaValidations {
  diagnosesLinked: boolean;
  cptCodesValid:   boolean;
  npiActive:       boolean;
  taxIdVerified:   boolean;
}

interface HcfaData {
  caseId:         string;
  caseCode:       string;
  caseType:       string;
  insuredId:      string;
  patientName:    string;
  patientFirstName: string;
  patientLastName:  string;
  dob:            string;
  address:        string;
  insurerName:    string;
  insurerLegal:   string | null;
  groupNumber:    string;
  dateOfInjury:   string;
  injuryType:     string;
  diagnoses:      DiagnosisBox[];
  serviceLines:   ServiceLine[];
  taxId:          string;
  totalCharge:    number;
  totalChargeFmt: string;
  facility:       { name: string; address: string };
  billingProvider: string;
  providerName:   string;
  providerNpi:    string | null;
  insurerFax:     string | null;
  insurerEmail:   string | null;
  insurerPhone:   string | null;
  alreadyGenerated: boolean;
  validations:    HcfaValidations;
  allValid:       boolean;
}

// ─── CMS-1500 Preview ─────────────────────────────────────────────────────────

function CmsPreview({ d }: { d: HcfaData }) {
  return (
    <div style={{ background: 'white', color: '#1a2236', borderRadius: 6, padding: '14px 16px', fontSize: 9.5, lineHeight: 1.55, fontFamily: 'ui-monospace, monospace' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, marginBottom: 8, borderBottom: '2px solid #1a2236', paddingBottom: 4 }}>
        HEALTH INSURANCE CLAIM FORM · CMS-1500
      </div>
      <div style={{ textAlign: 'center', fontSize: 9, color: '#555', marginBottom: 10 }}>
        APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE (NUCC)
      </div>

      {/* Row 1: Box 1a + Box 2 */}
      <CmsRow cols={2}>
        <CmsBox num="1a." label="INSURED'S I.D. NUMBER" value={d.insuredId} />
        <CmsBox num="2."  label="PATIENT'S NAME (Last, First, MI)" value={d.patientName} />
      </CmsRow>

      {/* Row 2: Box 3 + Box 5 */}
      <CmsRow cols={2}>
        <CmsBox num="3."  label="PATIENT'S BIRTH DATE / SEX" value={`${d.dob} · —`} />
        <CmsBox num="5."  label="PATIENT'S ADDRESS" value={d.address} />
      </CmsRow>

      {/* Row 3: Box 9 + Box 11 */}
      <CmsRow cols={2}>
        <CmsBox num="9."  label="OTHER INSURED'S NAME" value={d.insurerName} />
        <CmsBox num="11." label="INSURED'S GROUP NUMBER" value={d.groupNumber} />
      </CmsRow>

      {/* Row 4: Box 14 */}
      <CmsRow cols={1}>
        <CmsBox
          num="14."
          label="DATE OF CURRENT ILLNESS, INJURY, OR PREGNANCY"
          value={`${d.dateOfInjury}  (${d.injuryType})`}
        />
      </CmsRow>

      {/* Row 5: Box 21 Diagnoses */}
      <div style={{ border: '1px solid #ccc', borderRadius: 3, padding: '6px 8px', marginBottom: 5, background: '#fafbfc' }}>
        <div style={{ fontWeight: 700, fontSize: 9, color: '#444', marginBottom: 4 }}>
          21. DIAGNOSIS OR NATURE OF ILLNESS OR INJURY (ICD-10)
        </div>
        {d.diagnoses.length === 0 ? (
          <span style={{ color: '#888', fontSize: 9 }}>— Sin diagnósticos registrados —</span>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '3px 8px' }}>
            {d.diagnoses.map(diag => (
              <div key={diag.letter}>
                <span style={{ fontWeight: 700 }}>{diag.letter}. </span>
                <span style={{ color: '#2563eb' }}>{diag.code}</span>
                <span style={{ color: '#555' }}> · {diag.label.length > 20 ? diag.label.slice(0, 20) + '…' : diag.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Box 24: Service lines */}
      <div style={{ border: '1px solid #ccc', borderRadius: 3, marginBottom: 5 }}>
        <div style={{ background: '#eef2f8', padding: '4px 8px', fontWeight: 700, fontSize: 9, color: '#444' }}>
          24. SERVICE LINES
        </div>
        <div style={{ padding: '6px 8px' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 30px 55px', gap: 4, fontWeight: 700, fontSize: 8.5, color: '#666', borderBottom: '1px solid #ddd', paddingBottom: 3, marginBottom: 3 }}>
            <span>DATE</span>
            <span>PROCEDURE / CPT</span>
            <span style={{ textAlign: 'center' }}>UNITS</span>
            <span style={{ textAlign: 'right' }}>CHARGES</span>
          </div>
          {d.serviceLines.length === 0 ? (
            <span style={{ color: '#888', fontSize: 9 }}>— Sin servicios registrados —</span>
          ) : (
            d.serviceLines.map((line, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 30px 55px', gap: 4, fontSize: 9, paddingBottom: 2, borderBottom: i < d.serviceLines.length - 1 ? '1px solid #f0f0f0' : 'none', paddingTop: 2 }}>
                <span>{line.date}</span>
                <span>
                  <span style={{ fontWeight: 700, color: '#1e40af' }}>{line.cptCode}</span>
                  {line.description ? ` · ${line.description.length > 25 ? line.description.slice(0, 25) + '…' : line.description}` : ''}
                </span>
                <span style={{ textAlign: 'center' }}>{line.units}</span>
                <span style={{ textAlign: 'right', fontWeight: 600 }}>{line.amountFmt}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Box 25 + 28 */}
      <CmsRow cols={2}>
        <CmsBox num="25." label="FEDERAL TAX I.D. NUMBER" value={d.taxId} />
        <CmsBox num="28." label="TOTAL CHARGE" value={<strong style={{ color: '#1e40af', fontSize: 11 }}>{d.totalChargeFmt}</strong>} bold />
      </CmsRow>

      {/* Box 32 */}
      <div style={{ border: '1px solid #ccc', borderRadius: 3, padding: '4px 8px', marginBottom: 5 }}>
        <span style={{ fontWeight: 700 }}>32. </span>
        <span style={{ color: '#555' }}>SERVICE FACILITY: </span>
        {d.facility.name} · {d.facility.address}
      </div>

      {/* Box 33 */}
      <div style={{ border: '1px solid #ccc', borderRadius: 3, padding: '4px 8px', marginBottom: 5 }}>
        <span style={{ fontWeight: 700 }}>33. </span>
        <span style={{ color: '#555' }}>BILLING PROVIDER: </span>
        {d.billingProvider}
        {d.providerNpi && <span style={{ color: '#888', marginLeft: 8 }}>NPI: {d.providerNpi}</span>}
      </div>

      {/* Provider signature line */}
      <div style={{ borderTop: '1px solid #ccc', paddingTop: 6, marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <span style={{ fontWeight: 700 }}>31. PHYSICIAN SIGNATURE: </span>
          <span style={{ borderBottom: '1px solid #aaa', display: 'inline-block', width: 100 }} />
        </div>
        <div>
          <span style={{ fontWeight: 700 }}>DATE: </span>
          <span>{new Date().toLocaleDateString('en-US')}</span>
        </div>
      </div>
    </div>
  );
}

function CmsRow({ cols, children }: { cols: 1 | 2; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: cols === 2 ? '1fr 1fr' : '1fr',
      gap: '5px 8px',
      marginBottom: 5,
    }}>
      {children}
    </div>
  );
}

function CmsBox({ num, label, value, bold }: { num: string; label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 3, padding: '4px 8px' }}>
      <div style={{ fontSize: 7.5, color: '#888', fontWeight: 700, textTransform: 'uppercase', marginBottom: 1 }}>{num} {label}</div>
      <div style={{ fontWeight: bold ? 700 : 500, fontSize: 9.5 }}>{value}</div>
    </div>
  );
}

// ─── Validation Row ───────────────────────────────────────────────────────────

function ValidationItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[11px] font-medium ${
      ok
        ? 'bg-emerald/5 border-emerald/25 text-emerald'
        : 'bg-rose/5 border-rose/25 text-rose'
    }`}>
      {ok
        ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        : <XCircle      className="w-3.5 h-3.5 shrink-0" />
      }
      {label}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HcfaClient() {
  const router = useRouter();
  const params = useParams<{ caseId: string }>();
  const caseId = params.caseId;

  const [data,       setData]       = useState<HcfaData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated,  setGenerated]  = useState(false);

  // Delivery method state
  const [sendFax,   setSendFax]   = useState(true);
  const [sendEmail, setSendEmail] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.fetch(`/api/admin/billing/${caseId}/hcfa-data`);
      if (!res.ok) throw new Error('Error al cargar datos');
      const json = await res.json() as { ok: boolean; hcfaData: HcfaData };
      if (!json.ok) throw new Error('Caso no encontrado');
      setData(json.hcfaData);
      setGenerated(json.hcfaData.alreadyGenerated);
    } catch (err) {
      setError('No se pudo cargar los datos del HCFA. Intentá de nuevo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  const handleGenerate = async () => {
    if (!data || generating) return;
    setGenerating(true);
    try {
      const res = await window.fetch(`/api/admin/billing/${caseId}/generate-hcfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendFax, sendEmail }),
      });
      if (!res.ok) throw new Error('Error al generar HCFA');
      setGenerated(true);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-0 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="h-8 w-40 rounded-lg bg-bg-1 animate-pulse" />
        <div className="h-12 rounded-xl bg-bg-1 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-5">
          <div className="h-[520px] rounded-xl bg-bg-1 animate-pulse" />
          <div className="h-[520px] rounded-xl bg-bg-1 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg-0 px-4 sm:px-6 lg:px-8 py-6">
        <button type="button" onClick={() => router.back()} className="flex items-center gap-2 text-[13px] text-text-muted hover:text-text-1 mb-6">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <div className="rounded-lg border border-rose/30 bg-rose/5 px-4 py-3 text-[13px] text-rose">
          {error ?? 'Caso no encontrado.'}
        </div>
      </div>
    );
  }

  const d = data;
  const validList: { label: string; ok: boolean }[] = [
    { label: 'Diagnósticos vinculados (Box 21)',       ok: d.validations.diagnosesLinked },
    { label: `CPT codes válidos (${d.serviceLines.length} servicio${d.serviceLines.length !== 1 ? 's' : ''})`, ok: d.validations.cptCodesValid },
    { label: `NPI de ${d.providerName} activo`,        ok: d.validations.npiActive },
    { label: 'Tax ID PMPMO verificado (Box 25)',        ok: d.validations.taxIdVerified },
  ];

  return (
    <div className="min-h-screen bg-bg-0 pb-10">

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b border-border bg-bg-0/90 backdrop-blur-sm px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push(`/billing/${caseId}`)}
          className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-1 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Bandeja
        </button>
        <span className="text-border">/</span>
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-amber">
          <FileText className="w-4 h-4" />
          Generar HCFA · {d.caseCode}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto text-text-muted hover:text-text-1 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 pt-5">

        {/* ── Title row ──────────────────────────────────────────────────── */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-text-1 flex items-center gap-2">
            <FileText className="w-6 h-6 text-amber" />
            HCFA / CMS-1500
          </h1>
          <p className="text-text-2 text-sm mt-1">
            Datos pre-cargados desde la nota SOAP firmada
            {d.providerName !== '—' ? ` por ${d.providerName}` : ''}
          </p>
        </div>

        {/* Already generated banner */}
        {generated && !generating && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald/30 bg-emerald/5 px-4 py-3 text-[13px] text-emerald">
            <Check className="w-4 h-4" />
            HCFA ya fue generado para este caso. Podés regenerarlo si es necesario.
          </div>
        )}

        {/* ── 60/40 layout ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[60%_1fr] gap-5">

          {/* LEFT: CMS-1500 Preview */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="text-[9px] text-text-muted uppercase tracking-widest font-bold mb-3">
              VISTA PREVIA · CMS-1500
            </div>
            {/* Scrollable preview */}
            <div className="overflow-auto rounded-md" style={{ maxHeight: 600 }}>
              <CmsPreview d={d} />
            </div>
          </div>

          {/* RIGHT: Config + Validations + Actions */}
          <div className="space-y-5">

            {/* ── Configuration ─────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-bg-1 p-4">
              <div className="text-[10px] uppercase tracking-wider text-amber font-bold mb-3 flex items-center gap-1.5">
                <span>⚙️</span> Configuración
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-text-muted block mb-1">
                    Aseguradora destino
                  </label>
                  <div className="rounded-lg border border-border bg-bg-2/40 px-3 py-2 text-[13px] text-text-1">
                    {d.insurerName}
                    {d.insurerLegal && (
                      <span className="text-text-muted text-[11px] ml-2">({d.insurerLegal})</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-text-muted block mb-2">
                    Método de envío
                  </label>
                  <div className="space-y-2">
                    <label className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-all ${
                      sendFax ? 'border-amber/40 bg-amber/5' : 'border-border bg-bg-2/30'
                    }`}>
                      <input
                        type="checkbox"
                        checked={sendFax}
                        onChange={e => setSendFax(e.target.checked)}
                        className="accent-amber"
                      />
                      <span className="text-[12px] font-medium">
                        📠 Fax
                        {d.insurerFax && (
                          <span className="text-text-muted font-normal ml-1.5">({d.insurerFax})</span>
                        )}
                        {!d.insurerFax && (
                          <span className="text-text-muted/60 font-normal ml-1.5">— sin fax registrado</span>
                        )}
                      </span>
                    </label>
                    <label className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-all ${
                      sendEmail ? 'border-amber/40 bg-amber/5' : 'border-border bg-bg-2/30'
                    }`}>
                      <input
                        type="checkbox"
                        checked={sendEmail}
                        onChange={e => setSendEmail(e.target.checked)}
                        className="accent-amber"
                      />
                      <span className="text-[12px] font-medium">
                        📧 Email
                        {d.insurerEmail && (
                          <span className="text-text-muted font-normal ml-1.5">({d.insurerEmail})</span>
                        )}
                        {!d.insurerEmail && (
                          <span className="text-text-muted/60 font-normal ml-1.5">— sin email registrado</span>
                        )}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Validations ──────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-bg-1 p-4">
              <div className="text-[10px] uppercase tracking-wider text-amber font-bold mb-3 flex items-center gap-1.5">
                <span>✓</span> Validaciones
              </div>
              <div className="space-y-2">
                {validList.map(v => (
                  <ValidationItem key={v.label} label={v.label} ok={v.ok} />
                ))}
              </div>
              {!d.allValid && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber/30 bg-amber/5 px-3 py-2 text-[11px] text-amber">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Hay validaciones pendientes. Podés generar igualmente, pero verificá los datos antes de enviar.
                </div>
              )}
            </div>

            {/* ── Post-generation checklist ──────────────────────── */}
            <div className="rounded-xl border border-border bg-bg-1 p-4">
              <div className="text-[10px] uppercase tracking-wider text-amber font-bold mb-3 flex items-center gap-1.5">
                <span>📤</span> Después de generar
              </div>
              <div className="space-y-1.5 text-[11px] text-text-2">
                {[
                  'HCFA PDF archivado en el caso',
                  'Ledger actualizado (Phase 2)',
                  sendEmail ? `Email a ${d.insurerName}` : null,
                  sendFax   ? 'Fax a aseguradora'         : null,
                  'Tracking enviado a Edson',
                ].filter(Boolean).map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Generate button ────────────────────────────────── */}
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating}
              className={`w-full flex items-center justify-center gap-2 rounded-xl border py-3.5 text-[13px] font-bold transition-all ${
                generated
                  ? 'border-emerald/40 bg-emerald/10 text-emerald hover:bg-emerald/15'
                  : 'border-amber/40 bg-amber/10 text-amber hover:bg-amber/20 disabled:opacity-50'
              }`}
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generando…
                </>
              ) : generated ? (
                <>
                  <Check className="w-4 h-4" />
                  HCFA Generado · Regenerar
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  📄 Generar HCFA y enviar
                </>
              )}
            </button>

            {/* Total display */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-bg-1 px-4 py-3">
              <span className="text-[11px] text-text-muted uppercase tracking-wider">Total facturado</span>
              <span className="font-mono font-black text-amber text-lg">{d.totalChargeFmt}</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
