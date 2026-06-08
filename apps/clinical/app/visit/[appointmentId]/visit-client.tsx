'use client';

/**
 * B.18 — Nota de visita del doctor (editor SOAP completo)
 *
 * Layout 2 paneles en iPad:
 *  · Izquierda (sidebar ~300px): contexto del paciente / caso (colapsable)
 *  · Derecha (área principal): vitales + 6 secciones SOAP + diagnósticos
 *
 * Color accent: violet — #a78bfa / #7c3aed
 *
 * Flujo:
 *  1. Al abrir → GET /api/visit/[id] (appointment + triageRecord + visitNote si existe)
 *  2. Si hay TriageRecord → pre-llenar vitales
 *  3. Auto-save cada 30s (POST save draft)
 *  4. "Firmar nota →" → POST /api/visit/[id]/sign → redirige a /doctor
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, ChevronRight, Save, CheckCircle2,
  Bot, Search, X, Plus, Loader2, AlertTriangle,
  ArrowLeft, Stethoscope, FileText, History,
  ClipboardList, FlaskConical, Trash2, Pencil,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface VisitNoteDiagnosis {
  id?: string;
  icd10Code: string | null;
  icd10Label: string | null;
  snomedCode: string | null;
  snomedLabel: string | null;
  diagnosisId: string | null;
  sortOrder: number;
}

interface DiagnosisResult {
  id: string;
  icd10Code: string;
  icd10Description: string;
  snomedCode: string | null;
  snomedDescription: string | null;
  category: string;
  piRelevant: boolean;
}

interface TemplateSection {
  id: string;
  sectionKey: string;
  content: string;
  enabledByDefault: boolean;
}

interface Template {
  id: string;
  title: string;
  description: string | null;
  encounterType: string;
  sections: TemplateSection[];
}

interface VisitData {
  appointment: {
    id: string;
    scheduledFor: string;
    type: string;
    status: string;
    notes: string | null;
    patient: {
      id: string;
      firstName: string;
      lastName: string;
      dateOfBirth: string | null;
      phone: string | null;
      email: string | null;
      sex: string | null;
    } | null;
    case: {
      id: string;
      caseCode: string;
      accidentType: string;
      accidentDate: string | null;
      primaryInsurance: { id: string; name: string } | null;
      primaryPolicyNumber: string | null;
      attorney: { id: string; firstName: string; lastName: string } | null;
      lawFirm: { id: string; firmName: string } | null;
    } | null;
    clinic: { id: string; name: string } | null;
    provider: { id: string; firstName: string; lastName: string; specialty: string | null } | null;
    triageRecord: {
      heightFt: number | null; heightIn: number | null; heightCm: number | null;
      weightLbs: number | null; weightOz: number | null; weightKg: number | null;
      systolicMmhg: number | null; diastolicMmhg: number | null;
      pulseBpm: number | null; tempFahrenheit: number | null; tempCelsius: number | null;
      o2Saturation: number | null; onRoomAir: boolean;
      chiefComplaint: string | null;
    } | null;
    visitNote: {
      id: string;
      status: string;
      templateId: string | null;
      heightFt: number | null; heightIn: number | null; heightCm: number | null;
      weightLbs: number | null; weightOz: number | null; weightKg: number | null;
      systolicMmhg: number | null; diastolicMmhg: number | null;
      pulseBpm: number | null; respRate: number | null;
      tempFahrenheit: number | null; tempCelsius: number | null;
      painScale: number | null; o2Saturation: number | null; onRoomAir: boolean | null;
      chiefComplaint: string | null;
      hpi: string | null;
      ros: string | null;
      physicalExam: string | null;
      assessment: string | null;
      plan: string | null;
      signedAt: string | null;
      signedByName: string | null;
      diagnoses: VisitNoteDiagnosis[];
    } | null;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcAge(dob: string | null): string {
  if (!dob) return '';
  const ms  = Date.now() - new Date(dob).getTime();
  return `${Math.floor(ms / (365.25 * 24 * 3600 * 1000))} años`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

// ─── B.21 / B.20 — Catálogos locales (Phase 1A) ───────────────────────────────

const SUGGESTED_CPTS = [
  { code: '99213', description: 'Office Outpatient Visit 15 min',     fee: 250 },
  { code: '99214', description: 'Office Outpatient Visit 25 min',     fee: 350 },
  { code: '99215', description: 'Office Outpatient Visit 40 min',     fee: 450 },
  { code: '97110', description: 'Therapeutic Exercise per 15 min',    fee: 120 },
  { code: '97140', description: 'Manual Therapy Techniques',          fee: 130 },
  { code: '20552', description: 'Injection — Trigger Point',          fee: 300 },
  { code: 'J3301', description: 'Kenalog Injection · Triamcinolone',  fee: 120 },
  { code: '98941', description: 'Chiropractic Manipulative Treatment',fee: 180 },
  { code: '97014', description: 'Electrical Stimulation (unattended)',fee: 65  },
  { code: '97035', description: 'Ultrasound Therapy per 15 min',      fee: 75  },
];

const LAB_STUDIES: Record<string, { code: string; name: string; loinc?: string }[]> = {
  IMAGING: [
    { code: 'MRI-CX', name: 'MRI Cervical Spine without contrast',     loinc: '36812-3' },
    { code: 'MRI-LS', name: 'MRI Lumbar Spine without contrast',       loinc: '36814-9' },
    { code: 'MRI-BR', name: 'MRI Brain without contrast',              loinc: '24725-8' },
    { code: 'CT-CX',  name: 'CT Cervical Spine without contrast',      loinc: '36807-3' },
    { code: 'CT-LS',  name: 'CT Lumbar Spine without contrast',        loinc: '36811-5' },
    { code: 'XR-CX',  name: 'X-Ray Cervical Spine 4 views',           loinc: '36643-2' },
    { code: 'XR-LS',  name: 'X-Ray Lumbar Spine AP/Lateral',          loinc: '36641-6' },
    { code: 'XR-SH',  name: 'X-Ray Shoulder AP + Y-view',             loinc: '36616-8' },
    { code: 'XR-KN',  name: 'X-Ray Knee AP/Lateral/Oblique',          loinc: '36620-0' },
  ],
  LABORATORY: [
    { code: 'BMP',    name: 'Basic Metabolic Panel',                   loinc: '24320-8' },
    { code: 'CMP',    name: 'Comprehensive Metabolic Panel',           loinc: '24323-2' },
    { code: 'CBC',    name: 'Complete Blood Count with Differential',  loinc: '58410-2' },
    { code: 'UA',     name: 'Urinalysis with Reflex Culture',          loinc: '5767-9'  },
    { code: 'ESR',    name: 'Erythrocyte Sedimentation Rate',          loinc: '4537-7'  },
    { code: 'CRP',    name: 'C-Reactive Protein',                      loinc: '1988-5'  },
    { code: 'PT',     name: 'Prothrombin Time / INR',                  loinc: '5902-2'  },
    { code: 'UDS',    name: 'Urine Drug Screen (10-panel)',            loinc: '19300-0' },
  ],
  CARDIOLOGY: [
    { code: 'EKG',    name: 'ECG 12-lead with interpretation',         loinc: '11524-6' },
    { code: 'ECHO',   name: 'Echocardiogram transthoracic',            loinc: '42148-7' },
    { code: 'HOLTER', name: 'Holter Monitor 24-hour',                  loinc: '18843-0' },
  ],
};

const URGENCY_LABELS: Record<string, string> = {
  ROUTINE: 'Rutinaria (5-7 días)',
  URGENT:  'Urgente (24-48 h)',
  STAT:    'STAT — inmediata',
};

const OVERRIDE_REASONS = [
  'Self-pay discount',
  'Insurance override',
  'Acuerdo con bufete',
  'Write-off promocional',
  'Otro',
];

// ─── B.21 CPT types ───────────────────────────────────────────────────────────
interface VisitCpt {
  id:             string;
  visitNoteId:    string;
  serviceCodeId:  string | null;
  cptCode:        string;
  description:    string;
  feeCatalog:     number;
  feeOverride:    number | null;
  overrideReason: string | null;
  modifier:       string | null;
  units:          number;
}

// ─── B.21 CptSignModal ────────────────────────────────────────────────────────
function CptSignModal({
  appointmentId,
  diagnoses,
  providerName,
  patientName,
  caseCode,
  onSign,
  onClose,
}: {
  appointmentId: string;
  diagnoses:     VisitNoteDiagnosis[];
  providerName:  string;
  patientName:   string;
  caseCode:      string;
  onSign:        (mode: 'draft' | 'sign') => Promise<void>;
  onClose:       () => void;
}) {
  const [assigned,    setAssigned]    = useState<VisitCpt[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [mutating,    setMutating]    = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editFee,     setEditFee]     = useState('');
  const [editReason,  setEditReason]  = useState(OVERRIDE_REASONS[0]);
  const [cptSearch,   setCptSearch]   = useState('');
  const [signing,     setSigning]     = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res  = await fetch(`/api/visit/${appointmentId}/cpt`);
        const json = await res.json() as { ok: boolean; cpts: VisitCpt[] };
        if (json.ok) setAssigned(json.cpts);
      } finally {
        setLoading(false);
      }
    })();
  }, [appointmentId]);

  const handleAdd = async (code: string, description: string, fee: number) => {
    setMutating(true);
    try {
      const res  = await fetch(`/api/visit/${appointmentId}/cpt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', cptCode: code, description, feeCatalog: fee }),
      });
      const json = await res.json() as { ok: boolean; cpt: VisitCpt };
      if (json.ok) setAssigned(p => [...p.filter(c => c.cptCode !== code), json.cpt]);
    } finally { setMutating(false); }
  };

  const handleRemove = async (cptId: string) => {
    setMutating(true);
    try {
      const res  = await fetch(`/api/visit/${appointmentId}/cpt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', cptId }),
      });
      if ((await res.json() as { ok: boolean }).ok) setAssigned(p => p.filter(c => c.id !== cptId));
    } finally { setMutating(false); }
  };

  const handleSaveFee = async (cpt: VisitCpt) => {
    setMutating(true);
    try {
      const res  = await fetch(`/api/visit/${appointmentId}/cpt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_fee', cptId: cpt.id,
          feeOverride: editFee ? Number(editFee) : null,
          overrideReason: editReason,
        }),
      });
      const json = await res.json() as { ok: boolean; cpt: VisitCpt };
      if (json.ok) { setAssigned(p => p.map(c => c.id === cpt.id ? json.cpt : c)); setEditingId(null); }
    } finally { setMutating(false); }
  };

  const isAssigned = (code: string) => assigned.some(a => a.cptCode === code);

  const suggestions = (cptSearch
    ? SUGGESTED_CPTS.filter(s =>
        s.code.toLowerCase().includes(cptSearch.toLowerCase()) ||
        s.description.toLowerCase().includes(cptSearch.toLowerCase()))
    : SUGGESTED_CPTS
  ).filter(s => !isAssigned(s.code));

  const total         = assigned.reduce((s, c) => s + (c.feeOverride ?? c.feeCatalog), 0);
  const modifiedCount = assigned.filter(c => c.feeOverride !== null).length;
  const icd10Display  = diagnoses.slice(0, 5).map(d => d.icd10Code).filter(Boolean).join(', ');

  const handleSign = async (mode: 'draft' | 'sign') => {
    setSigning(true);
    try { await onSign(mode); }
    finally { setSigning(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: 680, maxHeight: '90vh',
        background: 'linear-gradient(135deg,#0f172a,#131c34)',
        border: '1px solid rgba(99,102,241,0.30)', borderRadius: 14,
        boxShadow: '0 32px 80px rgba(0,0,0,0.60)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardList size={16} color="#a78bfa" />
              <span style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>
                Asignar servicios CPT
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              {patientName} · {caseCode} · Servicios prestados en esta visita
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.50)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>

          {loading ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.40)', padding: 40 }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <>
              {/* ── Suggested CPTs ── */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', fontWeight: 700 }}>
                    CPTs disponibles
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
                    <input
                      value={cptSearch}
                      onChange={e => setCptSearch(e.target.value)}
                      placeholder="Buscar código..."
                      style={{
                        padding: '5px 8px 5px 24px', fontSize: 11,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: 6, color: '#fff', width: 160, outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {suggestions.map(s => (
                    <div key={s.code} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: 'rgba(16,185,129,0.06)',
                      border: '1px solid rgba(16,185,129,0.20)',
                      borderRadius: 8, padding: '9px 12px',
                    }}>
                      <span style={{ fontSize: 9, background: 'rgba(16,185,129,0.25)', color: '#34d399', padding: '2px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        SUGERIDO
                      </span>
                      <span style={{ fontFamily: 'monospace', color: '#67e8f9', fontSize: 12, fontWeight: 700, width: 52, flexShrink: 0 }}>
                        {s.code}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>{s.description}</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', flexShrink: 0 }}>
                        ${s.fee.toFixed(2)}
                      </span>
                      <button
                        onClick={() => void handleAdd(s.code, s.description, s.fee)}
                        disabled={mutating}
                        style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 700,
                          background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                          border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                        }}
                      >
                        <Plus size={11} /> Agregar
                      </button>
                    </div>
                  ))}
                  {suggestions.length === 0 && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', textAlign: 'center', padding: '12px 0' }}>
                      {cptSearch ? 'Sin resultados' : 'Todos los CPTs sugeridos ya asignados'}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Assigned CPTs ── */}
              {assigned.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', fontWeight: 700, marginBottom: 10 }}>
                    Servicios asignados · {assigned.length}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {assigned.map(cpt => (
                      <div key={cpt.id}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: 'rgba(99,102,241,0.10)',
                          border: `1px solid ${editingId === cpt.id ? 'rgba(245,158,11,0.40)' : 'rgba(99,102,241,0.30)'}`,
                          borderRadius: editingId === cpt.id ? '8px 8px 0 0' : 8,
                          padding: '9px 12px',
                        }}>
                          <span style={{ fontFamily: 'monospace', color: '#67e8f9', fontSize: 12, fontWeight: 700, width: 52, flexShrink: 0 }}>
                            {cpt.cptCode} ✓
                          </span>
                          <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>{cpt.description}</span>
                          {/* Fee display */}
                          {cpt.feeOverride !== null ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through', fontFamily: 'monospace' }}>
                                ${cpt.feeCatalog.toFixed(2)}
                              </span>
                              <span style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700, fontFamily: 'monospace' }}>
                                ${cpt.feeOverride.toFixed(2)}
                              </span>
                              <span style={{ fontSize: 9, background: 'rgba(245,158,11,0.20)', color: '#fbbf24', padding: '2px 5px', borderRadius: 4, fontWeight: 700 }}>
                                MOD
                              </span>
                            </span>
                          ) : (
                            <span style={{ fontSize: 13, color: '#fff', fontWeight: 600, fontFamily: 'monospace', flexShrink: 0 }}>
                              ${cpt.feeCatalog.toFixed(2)}
                            </span>
                          )}
                          {/* Edit fee button */}
                          <button
                            onClick={() => { setEditingId(cpt.id === editingId ? null : cpt.id); setEditFee(String(cpt.feeOverride ?? cpt.feeCatalog)); setEditReason(cpt.overrideReason ?? OVERRIDE_REASONS[0]); }}
                            style={{
                              padding: '4px 8px', fontSize: 11,
                              background: 'rgba(99,102,241,0.20)',
                              border: '1px solid rgba(99,102,241,0.40)',
                              borderRadius: 6, color: '#a5b4fc', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', flexShrink: 0,
                            }}
                            title="Editar fee"
                          >
                            <Pencil size={11} />
                          </button>
                          {/* Remove button */}
                          <button
                            onClick={() => void handleRemove(cpt.id)}
                            disabled={mutating}
                            style={{
                              padding: '4px 8px', fontSize: 11,
                              background: 'rgba(244,63,94,0.15)',
                              border: '1px solid rgba(244,63,94,0.30)',
                              borderRadius: 6, color: '#fda4af', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', flexShrink: 0,
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>

                        {/* Inline fee edit panel */}
                        {editingId === cpt.id && (
                          <div style={{
                            background: 'rgba(245,158,11,0.06)',
                            border: '1px dashed rgba(245,158,11,0.40)',
                            borderTop: 'none',
                            borderRadius: '0 0 8px 8px',
                            padding: '10px 14px',
                            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                          }}>
                            <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              ✏ Editando fee · {cpt.cptCode}
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                              Catálogo: <span style={{ fontFamily: 'monospace' }}>${cpt.feeCatalog.toFixed(2)}</span> · Esta visita:
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#fff', fontFamily: 'monospace' }}>$</span>
                              <input
                                type="number"
                                value={editFee}
                                onChange={e => setEditFee(e.target.value)}
                                style={{
                                  width: 72, padding: '4px 8px', fontFamily: 'monospace', fontSize: 13,
                                  background: 'rgba(0,0,0,0.30)', color: '#fff',
                                  border: '1px solid rgba(245,158,11,0.50)', borderRadius: 4, outline: 'none',
                                }}
                              />
                            </div>
                            <select
                              value={editReason}
                              onChange={e => setEditReason(e.target.value)}
                              style={{
                                fontSize: 11, padding: '4px 8px',
                                background: 'rgba(0,0,0,0.30)', color: '#fff',
                                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, outline: 'none',
                              }}
                            >
                              {OVERRIDE_REASONS.map(r => <option key={r}>{r}</option>)}
                            </select>
                            <button
                              onClick={() => void handleSaveFee(cpt)}
                              disabled={mutating}
                              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', border: 'none', borderRadius: 5, color: '#fff', cursor: 'pointer' }}
                            >
                              ✓ Guardar
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.60)', cursor: 'pointer' }}
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Total ── */}
              {assigned.length > 0 && (
                <div style={{
                  background: 'rgba(6,182,212,0.10)',
                  border: '1px solid rgba(6,182,212,0.30)',
                  borderRadius: 8, padding: '12px 16px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 18,
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                    Total visita
                    {modifiedCount > 0 && (
                      <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#fbbf24', padding: '2px 7px', borderRadius: 100, marginLeft: 8, fontWeight: 700 }}>
                        {modifiedCount} fee modificado
                      </span>
                    )}
                  </span>
                  <span style={{ color: '#67e8f9', fontSize: 20, fontWeight: 800, fontFamily: 'monospace' }}>
                    ${total.toFixed(2)}
                  </span>
                </div>
              )}

              {/* ── ICD-10 info ── */}
              {icd10Display && (
                <div style={{
                  background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                  borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#a5b4fc', marginBottom: 18,
                }}>
                  📋 Diagnósticos de la nota: <strong style={{ color: '#fff' }}>{icd10Display}</strong>
                </div>
              )}

              {/* ── Cerrar visita ── */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '14px 16px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 10 }}>
                  🏁 Cerrar visita
                </div>
                <ul style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginLeft: 16, lineHeight: 1.75, marginBottom: 14 }}>
                  <li>✓ La nota SOAP queda inmutable y firmada con tu credencial</li>
                  <li>✓ Se notifica a Brunella para iniciar el billing del caso</li>
                  <li>✓ Se genera narrativa para el bufete (MVA)</li>
                  {assigned.length > 0 && (
                    <li>✓ {assigned.length} servicio{assigned.length > 1 ? 's' : ''} CPT · total <span style={{ fontFamily: 'monospace', color: '#67e8f9' }}>${total.toFixed(2)}</span></li>
                  )}
                </ul>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => void handleSign('draft')}
                    disabled={signing}
                    style={{
                      padding: '9px 16px', fontSize: 12, fontWeight: 600,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8, color: 'rgba(255,255,255,0.60)', cursor: 'pointer',
                    }}
                  >
                    Guardar borrador
                  </button>
                  <button
                    onClick={() => void handleSign('sign')}
                    disabled={signing || assigned.length === 0}
                    style={{
                      padding: '9px 22px', fontSize: 13, fontWeight: 700,
                      background: signing ? 'rgba(139,92,246,0.20)' : 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                      border: 'none', borderRadius: 8, color: '#fff',
                      cursor: (signing || assigned.length === 0) ? 'default' : 'pointer',
                      opacity: assigned.length === 0 ? 0.50 : 1,
                      display: 'flex', alignItems: 'center', gap: 6,
                      boxShadow: (signing || assigned.length === 0) ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
                    }}
                    title={assigned.length === 0 ? 'Agrega al menos 1 CPT para firmar' : undefined}
                  >
                    {signing
                      ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Firmando...</>
                      : <><CheckCircle2 size={13} /> Firmar y cerrar visita →</>
                    }
                  </button>
                </div>
                {assigned.length === 0 && (
                  <div style={{ fontSize: 10, color: 'rgba(245,158,11,0.80)', marginTop: 8 }}>
                    ⚠ Agrega al menos 1 código CPT antes de firmar
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── B.20 LabOrderModal ───────────────────────────────────────────────────────
function LabOrderModal({
  appointmentId,
  visitNoteId,
  diagnoses,
  providerName,
  onClose,
}: {
  appointmentId: string;
  visitNoteId:   string | null;
  diagnoses:     VisitNoteDiagnosis[];
  providerName:  string;
  onClose:       (created?: boolean) => void;
}) {
  const ORDER_TYPES = ['IMAGING', 'LABORATORY', 'CARDIOLOGY'] as const;
  type OrderType = typeof ORDER_TYPES[number];

  const [orderType,    setOrderType]    = useState<OrderType>('IMAGING');
  const [search,       setSearch]       = useState('');
  const [selected,     setSelected]     = useState<{ code: string; name: string; loinc?: string } | null>(null);
  const [indication,   setIndication]   = useState('');
  const [urgency,      setUrgency]      = useState<'ROUTINE' | 'URGENT' | 'STAT'>('ROUTINE');
  const [center,       setCenter]       = useState('');
  const [saving,       setSaving]       = useState(false);
  const [success,      setSuccess]      = useState(false);

  const icd10Display = diagnoses.slice(0, 5).map(d => d.icd10Code).filter(Boolean).join(', ');
  const icd10Array   = diagnoses.slice(0, 5).map(d => d.icd10Code).filter(Boolean) as string[];

  const catalog = LAB_STUDIES[orderType] ?? [];
  const results = search
    ? catalog.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : catalog;

  const handleCreate = async () => {
    if (!selected || !indication.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/visit/${appointmentId}/lab`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType,
          studyName:          selected.name,
          loincCode:          selected.loinc,
          clinicalIndication: indication.trim(),
          urgency,
          preferredCenter:    center.trim() || undefined,
          icd10Codes:         icd10Array,
          orderedByName:      providerName,
          visitNoteId,
        }),
      });
      if (res.ok) { setSuccess(true); setTimeout(() => onClose(true), 1200); }
    } finally { setSaving(false); }
  };

  if (success) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 950,
        background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center', color: '#34d399', fontSize: 16, fontWeight: 700 }}>
          <CheckCircle2 size={40} style={{ marginBottom: 10 }} />
          <div>Orden creada exitosamente</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 950,
      background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: 560, maxHeight: '90vh',
        background: 'linear-gradient(135deg,#0f172a,#131c34)',
        border: '1px solid rgba(99,102,241,0.30)', borderRadius: 14,
        boxShadow: '0 32px 80px rgba(0,0,0,0.60)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FlaskConical size={16} color="#a78bfa" />
            <span style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>Nueva orden de laboratorio</span>
          </div>
          <button onClick={() => onClose()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.50)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Order type toggle */}
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 8 }}>
              Tipo de orden
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {ORDER_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => { setOrderType(t); setSelected(null); setSearch(''); }}
                  style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 7,
                    background: orderType === t ? 'rgba(99,102,241,0.20)' : 'rgba(255,255,255,0.04)',
                    border: orderType === t ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.10)',
                    color: orderType === t ? '#a5b4fc' : 'rgba(255,255,255,0.55)',
                    cursor: 'pointer',
                  }}
                >
                  {t === 'IMAGING' ? 'Imaging' : t === 'LABORATORY' ? 'Laboratorio' : 'Cardiología'}
                  {orderType === t && ' ✓'}
                </button>
              ))}
            </div>
          </div>

          {/* Study search */}
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 8 }}>
              Estudio *
            </div>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null); }}
                placeholder={`Buscar en ${orderType === 'IMAGING' ? 'imaging' : orderType === 'LABORATORY' ? 'laboratorio' : 'cardiología'}...`}
                style={{
                  width: '100%', padding: '8px 10px 8px 30px', fontSize: 12,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 7, color: '#fff', outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {results.slice(0, 6).map(s => (
                <button
                  key={s.code}
                  onClick={() => setSelected(s)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12,
                    background: selected?.code === s.code ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                    border: selected?.code === s.code ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 6, color: selected?.code === s.code ? '#a5b4fc' : 'rgba(255,255,255,0.75)',
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span>{s.name}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.loinc && <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>{s.loinc}</span>}
                    {selected?.code === s.code && <span style={{ fontSize: 11 }}>✓</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Clinical indication */}
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 8 }}>
              Indicación clínica *
            </div>
            <textarea
              value={indication}
              onChange={e => setIndication(e.target.value)}
              placeholder="Ej: Rule out cervical disc herniation. Persistent radiculopathy 8 weeks post-MVA."
              rows={3}
              style={{
                width: '100%', padding: '9px 12px', fontSize: 12, resize: 'vertical',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 7, color: '#fff', outline: 'none', lineHeight: 1.6,
              }}
            />
          </div>

          {/* Urgency + Center */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 8 }}>
                Urgencia
              </div>
              <select
                value={urgency}
                onChange={e => setUrgency(e.target.value as 'ROUTINE' | 'URGENT' | 'STAT')}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 12,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 7, color: '#fff', outline: 'none',
                }}
              >
                {Object.entries(URGENCY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 8 }}>
                Centro preferido
              </div>
              <input
                value={center}
                onChange={e => setCenter(e.target.value)}
                placeholder="Ej: Provo Imaging Center"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 12,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 7, color: '#fff', outline: 'none',
                }}
              />
            </div>
          </div>

          {/* ICD-10 auto-fill */}
          {icd10Display && (
            <div style={{
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#a5b4fc',
            }}>
              📋 ICD-10 de la nota: <strong style={{ color: '#fff' }}>{icd10Display}</strong>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0,
        }}>
          <button
            onClick={() => onClose()}
            style={{
              padding: '9px 16px', fontSize: 12, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
              color: 'rgba(255,255,255,0.60)', cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={saving || !selected || !indication.trim()}
            style={{
              padding: '9px 22px', fontSize: 12, fontWeight: 700,
              background: (saving || !selected || !indication.trim())
                ? 'rgba(139,92,246,0.20)'
                : 'linear-gradient(135deg,#7c3aed,#a78bfa)',
              border: 'none', borderRadius: 8, color: '#fff',
              cursor: (saving || !selected || !indication.trim()) ? 'default' : 'pointer',
              opacity: (!selected || !indication.trim()) ? 0.50 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: (!selected || !indication.trim()) ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
            }}
          >
            {saving
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Creando...</>
              : <><CheckCircle2 size={13} /> Crear orden →</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

/** Sidebar izquierdo: info del paciente y caso */
function PatientSidebar({ data }: { data: VisitData }) {
  const { appointment: appt } = data;
  const [open, setOpen] = useState<Record<string, boolean>>({
    patient: true, case: true, triage: true,
  });
  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

  function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => toggle(id)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.70)', fontSize: 11, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.12em',
          }}
        >
          {title}
          {open[id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {open[id] && (
          <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {children}
          </div>
        )}
      </div>
    );
  }

  function Row({ label, value }: { label: string; value: string | null | undefined }) {
    if (!value) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>{value}</span>
      </div>
    );
  }

  return (
    <aside style={{
      width: 280, flexShrink: 0,
      borderRight: '1px solid rgba(255,255,255,0.06)',
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
    }}>
      {/* Avatar + name */}
      {appt.patient && (
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', marginBottom: 10,
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 18,
          }}>
            {appt.patient.firstName[0]}{appt.patient.lastName[0]}
          </div>
          <div style={{ fontWeight: 800, color: '#fff', fontSize: 15, lineHeight: 1.3 }}>
            {appt.patient.lastName.toUpperCase()}, {appt.patient.firstName}
          </div>
          {appt.patient.dateOfBirth && (
            <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 3 }}>
              {calcAge(appt.patient.dateOfBirth)}
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
            {fmtTime(appt.scheduledFor)} · {appt.type.replace(/_/g, ' ')}
          </div>
        </div>
      )}

      {/* Paciente */}
      {appt.patient && (
        <Section id="patient" title="Paciente">
          <Row label="Teléfono" value={appt.patient.phone} />
          <Row label="Email"    value={appt.patient.email} />
          <Row label="Sexo"     value={appt.patient.sex} />
        </Section>
      )}

      {/* Caso */}
      {appt.case && (
        <Section id="case" title="Caso">
          <Row label="Código"         value={appt.case.caseCode} />
          <Row label="Tipo accidente" value={appt.case.accidentType?.replace(/_/g, ' ')} />
          <Row label="Fecha accidente" value={appt.case.accidentDate ? new Date(appt.case.accidentDate).toLocaleDateString('es-US', { timeZone: 'America/Denver' }) : undefined} />
          <Row label="Seguro"         value={appt.case.primaryInsurance?.name} />
          <Row label="Póliza"         value={appt.case.primaryPolicyNumber ?? undefined} />
          <Row label="Bufete"         value={appt.case.lawFirm?.firmName} />
          <Row label="Abogado"        value={appt.case.attorney ? `${appt.case.attorney.firstName} ${appt.case.attorney.lastName}` : undefined} />
        </Section>
      )}

      {/* Triaje */}
      {appt.triageRecord && (
        <Section id="triage" title="Triaje (MA)">
          {appt.triageRecord.heightCm && (
            <Row label="Talla" value={`${appt.triageRecord.heightFt}'${appt.triageRecord.heightIn}" (${appt.triageRecord.heightCm} cm)`} />
          )}
          {appt.triageRecord.weightKg && (
            <Row label="Peso"  value={`${appt.triageRecord.weightLbs} lbs (${appt.triageRecord.weightKg} kg)`} />
          )}
          {appt.triageRecord.systolicMmhg && (
            <Row label="P/A"   value={`${appt.triageRecord.systolicMmhg}/${appt.triageRecord.diastolicMmhg} mmHg`} />
          )}
          {appt.triageRecord.pulseBpm && (
            <Row label="Pulso" value={`${appt.triageRecord.pulseBpm} bpm`} />
          )}
          {appt.triageRecord.o2Saturation && (
            <Row label="SpO₂"  value={`${appt.triageRecord.o2Saturation}% ${appt.triageRecord.onRoomAir ? '(aire am.)' : '(O₂ supl.)'}`} />
          )}
          {appt.triageRecord.tempFahrenheit && (
            <Row label="Temp"  value={`${appt.triageRecord.tempFahrenheit}°F (${appt.triageRecord.tempCelsius}°C)`} />
          )}
        </Section>
      )}

      {/* Proveedor */}
      {appt.provider && (
        <Section id="provider" title="Doctor">
          <Row label="Nombre"     value={`Dr. ${appt.provider.firstName} ${appt.provider.lastName}`} />
          <Row label="Especialidad" value={appt.provider.specialty ?? undefined} />
        </Section>
      )}
    </aside>
  );
}

// ─── Vitals Panel ─────────────────────────────────────────────────────────────
type VitalState = {
  heightFt: string; heightIn: string; heightCm: string;
  weightLbs: string; weightOz: string; weightKg: string;
  systolicMmhg: string; diastolicMmhg: string;
  pulseBpm: string; respRate: string;
  tempFahrenheit: string; tempCelsius: string;
  painScale: string; o2Saturation: string; onRoomAir: boolean;
};

function VitalInput({
  label, value, unit, onChange,
}: {
  label: string; value: string; unit: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="—"
          style={{
            width: 60, padding: '6px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'monospace',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>{unit}</span>
      </div>
    </div>
  );
}

function VitalsPanel({
  vitals, onChange, isSigned,
}: {
  vitals: VitalState;
  onChange: (v: Partial<VitalState>) => void;
  isSigned: boolean;
}) {
  return (
    <div style={{
      background: 'rgba(139,92,246,0.04)',
      border: '1px solid rgba(139,92,246,0.15)',
      borderRadius: 12, padding: '16px 20px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        🩺 Signos Vitales
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 24px', pointerEvents: isSigned ? 'none' : 'auto', opacity: isSigned ? 0.6 : 1 }}>
        {/* Altura */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <VitalInput label="Talla ft"  value={vitals.heightFt}  unit="ft"  onChange={v => {
            const cm = ((parseFloat(v)||0)*12 + (parseFloat(vitals.heightIn)||0)) * 2.54;
            onChange({ heightFt: v, heightCm: cm > 0 ? cm.toFixed(1) : '' });
          }} />
          <VitalInput label="in"        value={vitals.heightIn}  unit="in"  onChange={v => {
            const cm = ((parseFloat(vitals.heightFt)||0)*12 + (parseFloat(v)||0)) * 2.54;
            onChange({ heightIn: v, heightCm: cm > 0 ? cm.toFixed(1) : '' });
          }} />
          {vitals.heightCm && (
            <span style={{ fontSize: 11, color: '#a78bfa', marginBottom: 8 }}>{vitals.heightCm} cm</span>
          )}
        </div>
        {/* Peso */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <VitalInput label="Peso lbs"  value={vitals.weightLbs} unit="lbs" onChange={v => {
            const kg = ((parseFloat(v)||0) + (parseFloat(vitals.weightOz)||0)/16) * 0.453592;
            onChange({ weightLbs: v, weightKg: kg > 0 ? kg.toFixed(1) : '' });
          }} />
          {vitals.weightKg && (
            <span style={{ fontSize: 11, color: '#a78bfa', marginBottom: 8 }}>{vitals.weightKg} kg</span>
          )}
        </div>
        {/* P/A */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
          <VitalInput label="Sistólica"  value={vitals.systolicMmhg}  unit="/" onChange={v => onChange({ systolicMmhg: v })} />
          <VitalInput label="Diastólica" value={vitals.diastolicMmhg} unit="mmHg" onChange={v => onChange({ diastolicMmhg: v })} />
        </div>
        <VitalInput label="Pulso"   value={vitals.pulseBpm}     unit="bpm"  onChange={v => onChange({ pulseBpm: v })} />
        <VitalInput label="Resp"    value={vitals.respRate}      unit="rpm"  onChange={v => onChange({ respRate: v })} />
        {/* Temperatura */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <VitalInput label="Temp °F" value={vitals.tempFahrenheit} unit="°F" onChange={v => {
            const c = v ? (((parseFloat(v)) - 32) * 5/9).toFixed(1) : '';
            onChange({ tempFahrenheit: v, tempCelsius: c });
          }} />
          {vitals.tempCelsius && (
            <span style={{ fontSize: 11, color: '#a78bfa', marginBottom: 8 }}>{vitals.tempCelsius} °C</span>
          )}
        </div>
        <VitalInput label="SpO₂"    value={vitals.o2Saturation}  unit="%"   onChange={v => onChange({ o2Saturation: v })} />
        <VitalInput label="Dolor"   value={vitals.painScale}      unit="/10" onChange={v => onChange({ painScale: v })} />
        {/* Aire ambiental */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
            Aire ambiental
          </span>
          <button
            onClick={() => onChange({ onRoomAir: !vitals.onRoomAir })}
            style={{
              width: 52, height: 28, borderRadius: 14,
              background: vitals.onRoomAir ? '#10b981' : 'rgba(255,255,255,0.10)',
              border: 'none', cursor: 'pointer', transition: 'background 0.2s',
              display: 'flex', alignItems: 'center', padding: '0 3px',
              justifyContent: vitals.onRoomAir ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section Editor ────────────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'chiefComplaint', label: '1 — Queja Principal',              placeholder: 'Describa la queja principal del paciente...' },
  { key: 'hpi',           label: '2 — HPI (Historia de la Enfermedad)', placeholder: 'Historia detallada de la presentación actual...' },
  { key: 'ros',           label: '3 — ROS (Revisión de Sistemas)',    placeholder: 'Sistemas revisados: cardiovascular, respiratorio, musculoesquelético...' },
  { key: 'physicalExam',  label: '4 — Examen Físico',                 placeholder: 'Hallazgos del examen físico por regiones...' },
  { key: 'assessment',    label: '5 — Evaluaciones',                  placeholder: 'Evaluación diagnóstica, pronóstico, impresión clínica...' },
  { key: 'plan',          label: '6 — Plan de Tratamiento',           placeholder: 'Plan terapéutico: medicamentos, terapias, referencias, seguimiento...' },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

function SoapSection({
  section, value, onChange, isSigned, isOpen, onToggle,
}: {
  section: (typeof SECTIONS)[number];
  value: string;
  onChange: (v: string) => void;
  isSigned: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const isFilled = wordCount > 0;

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${isFilled ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)'}`,
      background: isFilled ? 'rgba(139,92,246,0.03)' : 'rgba(255,255,255,0.02)',
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
          color: isFilled ? '#a78bfa' : 'rgba(255,255,255,0.50)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isFilled && <CheckCircle2 size={13} color="#a78bfa" />}
          <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'left' }}>{section.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {wordCount > 0 && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{wordCount} palabras</span>
          )}
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>
      {isOpen && (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={section.placeholder}
          readOnly={isSigned}
          rows={6}
          style={{
            width: '100%', padding: '12px 16px', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.02)',
            border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)',
            color: isSigned ? 'rgba(255,255,255,0.60)' : '#fff',
            fontSize: 13, lineHeight: 1.6, resize: 'vertical',
            outline: 'none', fontFamily: 'inherit',
          }}
        />
      )}
    </div>
  );
}

// ─── Diagnoses Section ────────────────────────────────────────────────────────
function DiagnosesPanel({
  diagnoses, onChange, isSigned,
}: {
  diagnoses: VisitNoteDiagnosis[];
  onChange: (d: VisitNoteDiagnosis[]) => void;
  isSigned: boolean;
}) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<DiagnosisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/visit/diagnoses?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { ok: boolean; diagnoses: DiagnosisResult[] };
      if (data.ok) setResults(data.diagnoses);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showSearch) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void search(query); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, showSearch, search]);

  useEffect(() => {
    if (showSearch && results.length === 0 && !loading) void search('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSearch]);

  function addDiagnosis(d: DiagnosisResult) {
    const already = diagnoses.some(dx => dx.diagnosisId === d.id || dx.icd10Code === d.icd10Code);
    if (already) return;
    onChange([...diagnoses, {
      icd10Code:   d.icd10Code,
      icd10Label:  d.icd10Description,
      snomedCode:  d.snomedCode,
      snomedLabel: d.snomedDescription,
      diagnosisId: d.id,
      sortOrder:   diagnoses.length,
    }]);
    setQuery('');
    setShowSearch(false);
  }

  function removeDiagnosis(idx: number) {
    onChange(diagnoses.filter((_, i) => i !== idx));
  }

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${diagnoses.length > 0 ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)'}`,
      background: diagnoses.length > 0 ? 'rgba(139,92,246,0.03)' : 'rgba(255,255,255,0.02)',
      overflow: 'visible',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {diagnoses.length > 0 && <CheckCircle2 size={13} color="#a78bfa" />}
          <span style={{ fontSize: 12, fontWeight: 700, color: diagnoses.length > 0 ? '#a78bfa' : 'rgba(255,255,255,0.50)' }}>
            7 — Diagnósticos
          </span>
          {diagnoses.length > 0 && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{diagnoses.length} agregado(s)</span>
          )}
        </div>
        {!isSigned && (
          <button
            onClick={() => setShowSearch(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 6,
              background: 'rgba(139,92,246,0.12)',
              border: '1px solid rgba(139,92,246,0.25)',
              color: '#a78bfa', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={12} /> Agregar
          </button>
        )}
      </div>

      {/* Lista */}
      {diagnoses.length > 0 && (
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {diagnoses.map((dx, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(139,92,246,0.06)',
              border: '1px solid rgba(139,92,246,0.15)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                    color: '#a78bfa', background: 'rgba(139,92,246,0.15)',
                    padding: '1px 6px', borderRadius: 4,
                  }}>
                    {dx.icd10Code}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{dx.icd10Label}</span>
                </div>
                {dx.snomedCode && (
                  <div style={{ marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                    SNOMED {dx.snomedCode} · {dx.snomedLabel}
                  </div>
                )}
              </div>
              {!isSigned && (
                <button
                  onClick={() => removeDiagnosis(i)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.35)', padding: 4, flexShrink: 0,
                    display: 'flex',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      {showSearch && !isSigned && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar ICD-10, descripción..."
              style={{
                width: '100%', padding: '8px 10px 8px 30px', boxSizing: 'border-box',
                borderRadius: 8, background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 13, outline: 'none',
              }}
            />
            {loading && <Loader2 size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#a78bfa', animation: 'spin 1s linear infinite' }} />}
          </div>
          {results.length > 0 && (
            <div style={{
              maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {results.map(d => {
                const alreadyAdded = diagnoses.some(dx => dx.diagnosisId === d.id);
                return (
                  <button
                    key={d.id}
                    disabled={alreadyAdded}
                    onClick={() => addDiagnosis(d)}
                    style={{
                      textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                      cursor: alreadyAdded ? 'default' : 'pointer',
                      opacity: alreadyAdded ? 0.45 : 1,
                      color: '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#a78bfa',
                        background: 'rgba(139,92,246,0.12)', padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                      }}>
                        {d.icd10Code}
                      </span>
                      <span style={{ fontSize: 12 }}>{d.icd10Description}</span>
                      {d.piRelevant && (
                        <span style={{ fontSize: 9, color: '#34d399', background: 'rgba(16,185,129,0.12)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
                          PI
                        </span>
                      )}
                    </div>
                    {d.snomedDescription && (
                      <div style={{ marginTop: 2, fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
                        {d.snomedDescription}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Template Picker ──────────────────────────────────────────────────────────
function TemplatePicker({
  onLoad, onClose,
}: {
  onLoad: (t: Template) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/visit/templates');
        const data = await res.json() as { ok: boolean; templates: Template[] };
        if (data.ok) setTemplates(data.templates);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px',
    }}>
      <div style={{
        background: '#0f1a2e', borderRadius: 16,
        border: '1px solid rgba(139,92,246,0.30)',
        width: '100%', maxWidth: 560, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 800, color: '#fff', fontSize: 15 }}>Cargar plantilla</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              El contenido de la plantilla pre-llena las secciones. Puedes editar después.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.50)' }}>
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.45)' }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
              Sin plantillas disponibles
            </div>
          ) : templates.map(t => (
            <button
              key={t.id}
              onClick={() => onLoad(t)}
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer', color: '#fff',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
              {t.description && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 3 }}>{t.description}</div>
              )}
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(139,92,246,0.12)', padding: '1px 6px', borderRadius: 4 }}>
                  {t.encounterType.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.40)', padding: '1px 0' }}>
                  {t.sections.length} secciones
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function VisitClient({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();

  // ── Data state ──
  const [data,    setData]    = useState<VisitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // ── Editor state ──
  const [activeTab, setActiveTab]       = useState<'nota' | 'historial'>('nota');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    chiefComplaint: true, hpi: true, ros: false,
    physicalExam: false, assessment: false, plan: false,
  });

  // ── Note fields ──
  const [vitals,    setVitals]    = useState<VitalState>({
    heightFt: '', heightIn: '', heightCm: '',
    weightLbs: '', weightOz: '', weightKg: '',
    systolicMmhg: '', diastolicMmhg: '',
    pulseBpm: '', respRate: '',
    tempFahrenheit: '', tempCelsius: '',
    painScale: '', o2Saturation: '', onRoomAir: true,
  });
  const [sections,  setSections]  = useState<Record<SectionKey, string>>({
    chiefComplaint: '', hpi: '', ros: '', physicalExam: '', assessment: '', plan: '',
  });
  const [diagnoses, setDiagnoses] = useState<VisitNoteDiagnosis[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);

  // ── UI state ──
  const [saving,      setSaving]      = useState(false);
  const [signing,     setSigning]     = useState(false);
  const [saveStatus,  setSaveStatus]  = useState<'idle' | 'saved' | 'error'>('idle');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showCptModal,       setShowCptModal]        = useState(false);
  const [showLabModal,       setShowLabModal]        = useState(false);
  const [isSigned,    setIsSigned]    = useState(false);
  const [signedAt,    setSignedAt]    = useState<string | null>(null);
  const [signedBy,    setSignedBy]    = useState<string | null>(null);

  // ── Load data ──
  useEffect(() => {
    void (async () => {
      try {
        const res  = await fetch(`/api/visit/${appointmentId}`);
        const json = await res.json() as { ok: boolean; appointment: VisitData['appointment'] };
        if (!res.ok || !json.ok) { setError('Error cargando datos'); return; }

        const appt = json.appointment;
        setData({ appointment: appt });

        // Pre-fill vitales: si hay visitNote → de nota, si no → del triaje
        const src = appt.visitNote ?? appt.triageRecord;
        if (src) {
          setVitals({
            heightFt:      String(src.heightFt      ?? ''),
            heightIn:      String(src.heightIn      ?? ''),
            heightCm:      String(src.heightCm      ?? ''),
            weightLbs:     String(src.weightLbs     ?? ''),
            weightOz:      String(src.weightOz      ?? ''),
            weightKg:      String(src.weightKg      ?? ''),
            systolicMmhg:  String(src.systolicMmhg  ?? ''),
            diastolicMmhg: String(src.diastolicMmhg ?? ''),
            pulseBpm:      String(src.pulseBpm      ?? ''),
            respRate:      String('respRate' in src ? (src.respRate ?? '') : ''),
            tempFahrenheit: String(src.tempFahrenheit ?? ''),
            tempCelsius:   String(src.tempCelsius   ?? ''),
            painScale:     String('painScale' in src ? (src.painScale ?? '') : ''),
            o2Saturation:  String(src.o2Saturation  ?? ''),
            onRoomAir:     src.onRoomAir ?? true,
          });
        }

        // Pre-fill secciones SOAP si hay nota
        if (appt.visitNote) {
          const n = appt.visitNote;
          setSections({
            chiefComplaint: n.chiefComplaint ?? (appt.triageRecord?.chiefComplaint ?? ''),
            hpi:            n.hpi         ?? '',
            ros:            n.ros         ?? '',
            physicalExam:   n.physicalExam ?? '',
            assessment:     n.assessment  ?? '',
            plan:           n.plan        ?? '',
          });
          setDiagnoses(n.diagnoses ?? []);
          setTemplateId(n.templateId ?? null);
          setIsSigned(n.status === 'SIGNED');
          setSignedAt(n.signedAt ?? null);
          setSignedBy(n.signedByName ?? null);
        } else if (appt.triageRecord?.chiefComplaint) {
          // Copiar queja principal del triaje como punto de partida
          setSections(s => ({ ...s, chiefComplaint: appt.triageRecord!.chiefComplaint! }));
        }
      } catch {
        setError('Error de red');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  // ── Auto-save cada 30s ──
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSave  = useCallback(async (silent = false) => {
    if (isSigned) return;
    if (!silent) setSaving(true);
    try {
      const res = await fetch(`/api/visit/${appointmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          heightFt:      vitals.heightFt      ? Number(vitals.heightFt)      : null,
          heightIn:      vitals.heightIn      ? Number(vitals.heightIn)      : null,
          heightCm:      vitals.heightCm      ? Number(vitals.heightCm)      : null,
          weightLbs:     vitals.weightLbs     ? Number(vitals.weightLbs)     : null,
          weightOz:      vitals.weightOz      ? Number(vitals.weightOz)      : null,
          weightKg:      vitals.weightKg      ? Number(vitals.weightKg)      : null,
          systolicMmhg:  vitals.systolicMmhg  ? Number(vitals.systolicMmhg)  : null,
          diastolicMmhg: vitals.diastolicMmhg ? Number(vitals.diastolicMmhg) : null,
          pulseBpm:      vitals.pulseBpm      ? Number(vitals.pulseBpm)      : null,
          respRate:      vitals.respRate       ? Number(vitals.respRate)      : null,
          tempFahrenheit: vitals.tempFahrenheit ? Number(vitals.tempFahrenheit) : null,
          tempCelsius:   vitals.tempCelsius   ? Number(vitals.tempCelsius)   : null,
          painScale:     vitals.painScale     ? Number(vitals.painScale)     : null,
          o2Saturation:  vitals.o2Saturation  ? Number(vitals.o2Saturation)  : null,
          onRoomAir:     vitals.onRoomAir,
          ...sections,
          diagnoses,
        }),
      });
      if (res.ok) setSaveStatus('saved');
      else        setSaveStatus('error');
    } catch {
      setSaveStatus('error');
    } finally {
      if (!silent) setSaving(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [isSigned, appointmentId, templateId, vitals, sections, diagnoses]);

  useEffect(() => {
    if (isSigned) return;
    saveRef.current = setInterval(() => { void doSave(true); }, 30_000);
    return () => { if (saveRef.current) clearInterval(saveRef.current); };
  }, [isSigned, doSave]);

  // ── Sign ──
  const handleSign = useCallback(async () => {
    if (isSigned || signing) return;
    setSigning(true);
    try {
      // Guardar primero
      await doSave(true);
      // Firmar
      const res = await fetch(`/api/visit/${appointmentId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedByName: data?.appointment.provider
          ? `Dr. ${data.appointment.provider.firstName} ${data.appointment.provider.lastName}`
          : 'Doctor',
        }),
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        setIsSigned(true);
        setSignedAt(new Date().toISOString());
        setTimeout(() => router.push('/doctor'), 1500);
      }
    } catch {
      /* ignore */
    } finally {
      setSigning(false);
    }
  }, [isSigned, signing, doSave, appointmentId, data, router]);

  // ── Load template ──
  const handleLoadTemplate = useCallback((t: Template) => {
    setTemplateId(t.id);
    const sectionMap: Partial<Record<SectionKey, string>> = {};
    const keyMap: Record<string, SectionKey> = {
      QUEJA_PRINCIPAL: 'chiefComplaint',
      HPI:             'hpi',
      ROS:             'ros',
      EXAMEN_FISICO:   'physicalExam',
      EVALUACIONES:    'assessment',
      PLAN:            'plan',
    };
    for (const s of t.sections) {
      const mapped = keyMap[s.sectionKey];
      if (mapped && s.enabledByDefault) sectionMap[mapped] = s.content;
    }
    setSections(prev => ({ ...prev, ...sectionMap }));
    setShowTemplatePicker(false);
    // Abrir todas las secciones pre-llenadas
    setOpenSections({ chiefComplaint: true, hpi: true, ros: true, physicalExam: true, assessment: true, plan: true });
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a1224', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.50)' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <div>Cargando visita...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a1224', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#f87171' }}>
          <AlertTriangle size={32} style={{ marginBottom: 12 }} />
          <div>{error ?? 'Error cargando la visita'}</div>
        </div>
      </div>
    );
  }

  const appt = data.appointment;

  return (
    <>
      {/* Global spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ minHeight: '100vh', background: '#0a1224', display: 'flex', flexDirection: 'column' }}>

        {/* ─── Top Bar ──────────────────────────────────────────────────────── */}
        <header style={{
          padding: '0 20px', height: 52,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.01)', flexShrink: 0,
        }}>
          {/* Left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => router.push('/doctor')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.50)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
            >
              <ArrowLeft size={14} /> Mi Día
            </button>
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Stethoscope size={14} color="#a78bfa" />
              <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>
                {appt.patient
                  ? `${appt.patient.lastName.toUpperCase()}, ${appt.patient.firstName}`
                  : 'Visita'}
              </span>
              {appt.case && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>{appt.case.caseCode}</span>
              )}
            </div>
          </div>

          {/* Right: tabs + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['nota', 'historial'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '5px 14px', borderRadius: 8,
                    background: activeTab === tab ? 'rgba(139,92,246,0.15)' : 'none',
                    border: activeTab === tab ? '1px solid rgba(139,92,246,0.30)' : '1px solid transparent',
                    color: activeTab === tab ? '#a78bfa' : 'rgba(255,255,255,0.50)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {tab === 'nota' ? <FileText size={12} /> : <History size={12} />}
                  {tab === 'nota' ? 'Nota' : 'Historial'}
                </button>
              ))}
            </div>

            {/* Save status */}
            {saveStatus === 'saved' && (
              <span style={{ fontSize: 11, color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={12} /> Guardado
              </span>
            )}
            {saveStatus === 'error' && (
              <span style={{ fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={12} /> Error al guardar
              </span>
            )}

            {/* Template button */}
            {!isSigned && (
              <button
                onClick={() => setShowTemplatePicker(true)}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.70)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <FileText size={12} />
                {templateId ? 'Cambiar plantilla' : 'Cargar plantilla'}
              </button>
            )}

            {/* Save button */}
            {!isSigned && (
              <button
                onClick={() => void doSave(false)}
                disabled={saving}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: 'rgba(139,92,246,0.10)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  color: '#a78bfa', fontSize: 11, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                Guardar borrador
              </button>
            )}
          </div>
        </header>

        {/* ─── Content area (sidebar + main) ───────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left Sidebar */}
          <PatientSidebar data={data} />

          {/* Main Editor */}
          <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {activeTab === 'nota' ? (
              <>
                {/* Signed banner */}
                {isSigned && (
                  <div style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(139,92,246,0.10)',
                    border: '1px solid rgba(139,92,246,0.30)',
                    display: 'flex', alignItems: 'center', gap: 10,
                    color: '#a78bfa', fontSize: 12, fontWeight: 600,
                  }}>
                    <CheckCircle2 size={16} />
                    <span>
                      Nota firmada por {signedBy ?? 'Doctor'}{' '}
                      {signedAt ? `el ${new Date(signedAt).toLocaleDateString('es-US', { timeZone: 'America/Denver' })} a las ${new Date(signedAt).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })}` : ''}
                    </span>
                  </div>
                )}

                {/* Vitals */}
                <VitalsPanel
                  vitals={vitals}
                  onChange={v => setVitals(prev => ({ ...prev, ...v }))}
                  isSigned={isSigned}
                />

                {/* SOAP Sections */}
                {SECTIONS.map(s => (
                  <SoapSection
                    key={s.key}
                    section={s}
                    value={sections[s.key]}
                    onChange={v => setSections(prev => ({ ...prev, [s.key]: v }))}
                    isSigned={isSigned}
                    isOpen={openSections[s.key] ?? false}
                    onToggle={() => setOpenSections(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                  />
                ))}

                {/* Diagnósticos */}
                <DiagnosesPanel
                  diagnoses={diagnoses}
                  onChange={setDiagnoses}
                  isSigned={isSigned}
                />
              </>
            ) : (
              /* Historial tab placeholder */
              <div style={{
                padding: '60px 20px', textAlign: 'center',
                color: 'rgba(255,255,255,0.35)', fontSize: 14,
                border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12,
              }}>
                <History size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                <div>Historial médico del paciente</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Disponible en próxima fase</div>
              </div>
            )}

            {/* Spacer for footer */}
            <div style={{ height: 80 }} />
          </main>
        </div>

        {/* ─── Footer (sign action) ─────────────────────────────────────────── */}
        {!isSigned && (
          <footer style={{
            position: 'sticky', bottom: 0,
            padding: '12px 24px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: '#0a1224',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flex: 1 }}>
              Auto-guardado cada 30 seg. Asigna CPTs antes de firmar.
            </div>

            {/* Guardar borrador */}
            <button
              onClick={() => void doSave(false)}
              disabled={saving}
              style={{
                padding: '10px 18px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.60)', fontSize: 12, fontWeight: 600,
                cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Save size={13} /> Guardar borrador
            </button>

            {/* Lab Order */}
            <button
              onClick={() => setShowLabModal(true)}
              style={{
                padding: '10px 16px', borderRadius: 8,
                background: 'rgba(6,182,212,0.10)',
                border: '1px solid rgba(6,182,212,0.30)',
                color: '#67e8f9', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              title="B.20 — Ordenar estudio de laboratorio / imaging"
            >
              <FlaskConical size={13} /> Lab / Imaging
            </button>

            {/* CPTs + Firmar */}
            <button
              onClick={() => setShowCptModal(true)}
              disabled={signing}
              style={{
                padding: '10px 22px', borderRadius: 8,
                background: signing ? 'rgba(139,92,246,0.20)' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                border: 'none',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: signing ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: signing ? 'none' : '0 4px 16px rgba(124,58,237,0.40)',
              }}
            >
              <ClipboardList size={14} /> CPTs + Firmar →
            </button>
          </footer>
        )}

        {/* ─── AI Bot FAB ───────────────────────────────────────────────────── */}
        <button
          style={{
            position: 'fixed', bottom: isSigned ? 24 : 80, right: 24,
            width: 44, height: 44, borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(124,58,237,0.40)',
            zIndex: 500,
          }}
          title="AI Asistente (próximamente)"
        >
          <Bot size={20} color="#fff" />
        </button>

        {/* Template Picker Modal */}
        {showTemplatePicker && (
          <TemplatePicker
            onLoad={handleLoadTemplate}
            onClose={() => setShowTemplatePicker(false)}
          />
        )}

        {/* B.21 CPT + Firma */}
        {showCptModal && data && (
          <CptSignModal
            appointmentId={appointmentId}
            diagnoses={diagnoses}
            providerName={data.appointment.provider
              ? `Dr. ${data.appointment.provider.firstName} ${data.appointment.provider.lastName}`
              : 'Doctor'}
            patientName={data.appointment.patient
              ? `${data.appointment.patient.lastName.toUpperCase()}, ${data.appointment.patient.firstName}`
              : 'Paciente'}
            caseCode={data.appointment.case?.caseCode ?? ''}
            onSign={async (mode) => {
              if (mode === 'draft') {
                await doSave(false);
                setShowCptModal(false);
              } else {
                // Guardar primero, luego firmar
                await doSave(true);
                await handleSign();
                setShowCptModal(false);
              }
            }}
            onClose={() => setShowCptModal(false)}
          />
        )}

        {/* B.20 Lab Orders */}
        {showLabModal && data && (
          <LabOrderModal
            appointmentId={appointmentId}
            visitNoteId={data.appointment.visitNote?.id ?? null}
            diagnoses={diagnoses}
            providerName={data.appointment.provider
              ? `Dr. ${data.appointment.provider.firstName} ${data.appointment.provider.lastName}`
              : 'Doctor'}
            onClose={() => setShowLabModal(false)}
          />
        )}
      </div>
    </>
  );
}
