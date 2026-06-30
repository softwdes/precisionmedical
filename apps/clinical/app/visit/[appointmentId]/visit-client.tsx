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
import { useTranslations } from 'next-intl';
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
    checkedInAt:        string | null;
    attendanceSignedAt: string | null;
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

// ─── Drug / Lab types ────────────────────────────────────────────────────────

interface RxDrug {
  id:       number;
  name:     string;
  generic:  string;
  schedule: string | null;
  category: string;
}

interface LabEntry {
  code:     string;
  name:     string;
  loinc?:   string | null;
  category: string;
}

const SCHEDULE_COLORS: Record<string, string> = {
  II:  '#f43f5e', III: '#f97316', IV: '#fbbf24', V: '#a3e635',
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

// ─── B.19 RxModal ────────────────────────────────────────────────────────────
function RxModal({
  appointmentId,
  visitNoteId,
  providerName,
  patientName,
  caseCode,
  onClose,
}: {
  appointmentId: string;
  visitNoteId:   string | null;
  providerName:  string;
  patientName:   string;
  caseCode:      string;
  onClose:       (created?: boolean) => void;
}) {
  const tv = useTranslations('clinical.visit.rx');
  const tc = useTranslations('clinical.common');

  const [search,      setSearch]      = useState('');
  const [selected,    setSelected]    = useState<RxDrug | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [dose,        setDose]        = useState('');
  const [frequency,   setFrequency]   = useState('');
  const [duration,    setDuration]    = useState('');
  const [quantity,    setQuantity]    = useState('');
  const [refills,     setRefills]     = useState('0');
  const [indication,  setIndication]  = useState('');
  const [pharmacy,    setPharmacy]    = useState('');
  const [interactionOverride, setInteractionOverride] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [result,      setResult]      = useState<{ ok: boolean; controlled: boolean } | null>(null);
  const [results,      setResults]      = useState<RxDrug[]>([]);
  const [interactions, setInteractions] = useState<{ drug: string; interactsWith: string; warning: string }[]>([]);

  // Fetch drug search results from API
  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    fetch(`/api/catalog/drugs?q=${encodeURIComponent(search.trim())}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setResults((d.drugs ?? []).slice(0, 7)))
      .catch(() => {});
    return () => ctrl.abort();
  }, [search]);

  // Fetch known interactions for selected drug
  useEffect(() => {
    if (!selected) { setInteractions([]); return; }
    fetch(`/api/catalog/drug-interactions?drug=${encodeURIComponent(selected.generic)}`)
      .then(r => r.json())
      .then(d => setInteractions(d.interactions ?? []))
      .catch(() => {});
  }, [selected?.generic]);

  const hasInteraction = interactions.length > 0;
  const isControlled   = !!selected?.schedule;
  const canSubmit = selected && dose && frequency && duration && quantity && indication.trim()
    && (!hasInteraction || interactionOverride);

  function handleSelectDrug(d: RxDrug) {
    setSelected(d);
    setSearch(d.name);
    setShowResults(false);
    setInteractionOverride(false);
    // Auto-set refills 0 for Schedule II
    if (d.schedule === 'II') setRefills('0');
  }

  const handleSubmit = async () => {
    if (!selected || !canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/visit/${appointmentId}/rx`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drugName:           selected.name,
          drugGeneric:        selected.generic,
          deaSchedule:        selected.schedule,
          dose,
          frequency,
          durationStr:        duration,
          quantityTotal:      Number(quantity),
          refills:            Number(refills),
          clinicalIndication: indication.trim(),
          pharmacyName:       pharmacy.trim() || undefined,
          prescriberName:     providerName,
          visitNoteId,
        }),
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        setResult({ ok: true, controlled: isControlled });
        setTimeout(() => onClose(true), 2200);
      }
    } finally { setSaving(false); }
  };

  if (result) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 960,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center', padding: 40, maxWidth: 380 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>
            {result.controlled ? '📋' : '✅'}
          </div>
          {result.controlled ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#fda4af', marginBottom: 8 }}>
                Prescripción guardada · Pendiente DAW
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65 }}>
                La prescripción de <strong style={{ color: '#fff' }}>Schedule {selected?.schedule}</strong> se guardó localmente.<br />
                Se transmitirá vía <strong style={{ color: '#a5b4fc' }}>DAW EPCS</strong> cuando la integración esté activa.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#34d399', marginBottom: 8 }}>
                Prescripción enviada
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                {selected?.name} guardada exitosamente
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 960,
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: 580, maxHeight: '92vh',
        background: 'linear-gradient(135deg,#0f172a,#131c34)',
        border: '1px solid rgba(99,102,241,0.30)', borderRadius: 14,
        boxShadow: '0 32px 80px rgba(0,0,0,0.60)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>💊</span>
              <span style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>
                {tv('title')}
              </span>
              {isControlled && (
                <span style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 100,
                  background: 'linear-gradient(135deg,#ec4899,#f43f5e)',
                  color: '#fff', fontWeight: 700, letterSpacing: '0.06em',
                }}>
                  CONTROLADA — DEA SCHEDULE {selected?.schedule}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>
              {patientName} · {caseCode}
            </div>
          </div>
          <button onClick={() => onClose()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.50)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Drug search */}
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 8 }}>
              {tv('drug')}
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setShowResults(true); if (!e.target.value) setSelected(null); }}
                onFocus={() => setShowResults(true)}
                placeholder={tv('drugPlaceholder')}
                style={{
                  width: '100%', padding: '9px 12px 9px 30px', fontSize: 12,
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${selected ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.10)'}`,
                  borderRadius: 7, color: '#fff', outline: 'none',
                }}
              />
            </div>

            {/* Dropdown results */}
            {showResults && results.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: '#0f172a', border: '1px solid rgba(99,102,241,0.30)',
                borderRadius: '0 0 8px 8px', boxShadow: '0 12px 32px rgba(0,0,0,0.50)',
                maxHeight: 240, overflowY: 'auto',
              }}>
                {results.map((d, i) => (
                  <button
                    key={i}
                    onMouseDown={() => handleSelectDrug(d)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12,
                      background: selected?.name === d.name ? 'rgba(99,102,241,0.18)' : 'none',
                      border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.85)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    }}
                  >
                    <span>{d.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {d.schedule && (
                        <span style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                          background: `${SCHEDULE_COLORS[d.schedule]}30`,
                          color: SCHEDULE_COLORS[d.schedule],
                        }}>
                          ⚠ Schedule {d.schedule}
                        </span>
                      )}
                      {selected?.name === d.name && <span style={{ fontSize: 11 }}>✓</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Schedule II-V warning */}
          {selected?.schedule && (
            <div style={{
              background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)',
              borderRadius: 6, padding: '9px 14px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>⚠</span>
              <span style={{ fontSize: 11, color: '#fda4af', lineHeight: 1.5 }}>
                Se enviará vía <strong style={{ color: '#fff' }}>DAW</strong> con doble autenticación del prescriber{' '}
                <span style={{ color: 'rgba(253,164,175,0.70)' }}>(DEA verificada)</span>.
              </span>
            </div>
          )}

          {/* Dose / Frequency / Duration */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: tv('dose'),      val: dose,      set: setDose,      ph: 'ej: 1 tab, 600mg' },
              { label: tv('frequency'), val: frequency, set: setFrequency, ph: 'ej: Cada 8h con alimentos' },
              { label: tv('duration'),  val: duration,  set: setDuration,  ph: 'ej: 7 días, 2 semanas' },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 6 }}>
                  {f.label}
                </div>
                <input
                  value={f.val}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.ph}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 12,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 6, color: '#fff', outline: 'none',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Quantity / Refills */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 6 }}>
                {tv('quantity')}
              </div>
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="ej: 28"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 12,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 6, color: '#fff', outline: 'none',
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 6 }}>
                {tv('refills')}{selected?.schedule ? ` (controladas: 0 máx.)` : ''}
              </div>
              {selected?.schedule === 'II' ? (
                <div style={{
                  width: '100%', padding: '8px 10px', fontSize: 12,
                  background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.20)',
                  borderRadius: 6, color: 'rgba(253,164,175,0.80)',
                }}>
                  0 (Schedule II — no refills)
                </div>
              ) : (
                <input
                  type="number"
                  value={refills}
                  onChange={e => setRefills(e.target.value)}
                  min="0" max={selected?.schedule ? 1 : 5}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 12,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 6, color: '#fff', outline: 'none',
                  }}
                />
              )}
            </div>
          </div>

          {/* Clinical indication */}
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 6 }}>
              {tv('indication')}
            </div>
            <textarea
              value={indication}
              onChange={e => setIndication(e.target.value)}
              rows={3}
              placeholder="Post-MVA cervical strain w/ radiculopathy. Dolor severo 8/10…"
              style={{
                width: '100%', padding: '9px 12px', fontSize: 12, resize: 'vertical',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 6, color: '#fff', outline: 'none', lineHeight: 1.6,
              }}
            />
          </div>

          {/* Interaction check */}
          {hasInteraction && (
            <div style={{
              background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 6, padding: '10px 14px',
            }}>
              {interactions.map((i, idx) => (
                <div key={idx} style={{ fontSize: 11, color: '#fbbf24', marginBottom: 6, lineHeight: 1.6 }}>
                  <span style={{ marginRight: 5 }}>⚠</span>
                  <strong>{i.warning}</strong>
                  {' '}CDC recomienda evitar combinación de opioide + benzodiazepina/relajante.{' '}
                  <button
                    onClick={() => setInteractionOverride(true)}
                    style={{ background: 'none', border: 'none', padding: 0, color: '#fbbf24', cursor: 'pointer', fontSize: 11, textDecoration: 'underline', fontWeight: 600 }}
                  >
                    {interactionOverride ? '✓ Continuar con justificación' : '[Continuar con justificación]'}
                  </button>
                  {' '}
                  <button
                    style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(251,191,36,0.60)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}
                    onClick={() => {/* revisar */}}
                  >
                    [Revisar]
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* PDMP (Phase 1A mock) */}
          {isControlled && (
            <div style={{
              background: 'rgba(49,10,101,0.35)', border: '1px solid rgba(139,92,246,0.35)',
              borderRadius: 6, padding: '10px 14px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd', marginBottom: 5 }}>
                📊 PDMP (vía DAW)
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.65 }}>
                Verificación automática del Prescription Drug Monitoring Program de Utah.{' '}
                <strong style={{ color: '#34d399' }}>✓ Sin alertas — paciente sin historial reciente de controladas.</strong>
              </div>
            </div>
          )}

          {/* Pharmacy */}
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 6 }}>
              {tv('pharmacy')}
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.20)',
              borderRadius: 6, padding: '0 12px',
            }}>
              <span style={{ fontSize: 13, color: '#67e8f9', flexShrink: 0 }}>📍</span>
              <input
                value={pharmacy}
                onChange={e => setPharmacy(e.target.value)}
                placeholder="CVS Pharmacy — Provo · o nombre de farmacia preferida"
                style={{
                  flex: 1, padding: '9px 0', fontSize: 12, background: 'none',
                  border: 'none', color: '#fff', outline: 'none',
                }}
              />
              {isControlled && pharmacy.trim() && (
                <span style={{ fontSize: 10, color: '#67e8f9', flexShrink: 0, opacity: 0.75 }}>
                  · DAW transmitirá electrónicamente
                </span>
              )}
            </div>
          </div>

          {/* EPCS auth notice (controlled only) */}
          {isControlled && (
            <div style={{
              background: 'rgba(127,29,29,0.25)', border: '1px solid rgba(244,63,94,0.25)',
              borderRadius: 6, padding: '10px 14px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#fda4af', marginBottom: 8 }}>
                🔒 Autenticación requerida (EPCS)
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>
                Por ser Schedule {selected?.schedule}, se requiere:
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                <div>
                  <span style={{ color: '#34d399', marginRight: 6 }}>✓</span>
                  <span style={{ color: 'rgba(255,255,255,0.75)' }}>DEA # del prescriber:</span>
                  <span style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 6, fontStyle: 'italic' }}>(verificado)</span>
                </div>
                <div>
                  <span style={{ color: '#f87171', marginRight: 6 }}>✗</span>
                  <span style={{ color: 'rgba(255,255,255,0.75)' }}>Two-factor authentication:</span>
                  <span style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 6, fontStyle: 'italic' }}>(ingresará al confirmar)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0,
          background: 'rgba(255,255,255,0.01)',
        }}>
          <button
            onClick={() => onClose()}
            style={{
              padding: '9px 16px', fontSize: 12, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
              color: 'rgba(255,255,255,0.60)', cursor: 'pointer',
            }}
          >
            {tc('cancel')}
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving || !canSubmit}
            style={{
              padding: '9px 22px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none',
              background: !canSubmit
                ? 'rgba(99,102,241,0.20)'
                : isControlled
                  ? 'linear-gradient(135deg,#7c3aed,#6d28d9)'
                  : 'linear-gradient(135deg,#7c3aed,#a78bfa)',
              color: '#fff',
              cursor: !canSubmit ? 'default' : 'pointer',
              opacity: !canSubmit ? 0.50 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: !canSubmit ? 'none' : '0 4px 14px rgba(124,58,237,0.40)',
            }}
          >
            {saving
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {tc('saving')}</>
              : isControlled
                ? <>{tv('authenticateBtn')}</>
                : <><CheckCircle2 size={13} /> {tv('sendBtn')}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── B.21 CPT types ───────────────────────────────────────────────────────────
interface CatalogCode {
  id:               string;
  code:             string;
  type:             string;
  shortDescription: string;
  currentFee:       number;
  category:         string;
  modifiersAllowed: string[];
  isInternalOnly:   boolean;
}

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
  const tcpt = useTranslations('clinical.visit.cpt');
  const tc   = useTranslations('clinical.common');

  const [assigned,    setAssigned]    = useState<VisitCpt[]>([]);
  const [catalog,     setCatalog]     = useState<CatalogCode[]>([]);
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
        const [cptRes, catRes] = await Promise.all([
          fetch(`/api/visit/${appointmentId}/cpt`),
          fetch('/api/visit/cpt-catalog'),
        ]);
        const [cptJson, catJson] = await Promise.all([
          cptRes.json() as Promise<{ ok: boolean; cpts: VisitCpt[] }>,
          catRes.json() as Promise<{ ok: boolean; codes: CatalogCode[] }>,
        ]);
        if (cptJson.ok) setAssigned(cptJson.cpts);
        if (catJson.ok) setCatalog(catJson.codes);
      } finally {
        setLoading(false);
      }
    })();
  }, [appointmentId]);

  // Búsqueda dinámica en catálogo cuando query ≥ 2 caracteres
  useEffect(() => {
    if (cptSearch.length < 2) return;
    const t = setTimeout(() => {
      void fetch(`/api/visit/cpt-catalog?q=${encodeURIComponent(cptSearch)}`)
        .then(r => r.json() as Promise<{ ok: boolean; codes: CatalogCode[] }>)
        .then(d => { if (d.ok) setCatalog(d.codes); })
        .catch(() => undefined);
    }, 280);
    return () => clearTimeout(t);
  }, [cptSearch]);

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
    ? catalog.filter(s =>
        s.code.toLowerCase().includes(cptSearch.toLowerCase()) ||
        s.shortDescription.toLowerCase().includes(cptSearch.toLowerCase()))
    : catalog
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
                {tcpt('title')}
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
                    {tcpt('available')}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
                    <input
                      value={cptSearch}
                      onChange={e => setCptSearch(e.target.value)}
                      placeholder={tcpt('searchPlaceholder')}
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
                        {s.type === 'CUSTOM_PM' ? 'PM' : s.type}
                      </span>
                      <span style={{ fontFamily: 'monospace', color: '#67e8f9', fontSize: 12, fontWeight: 700, width: 60, flexShrink: 0 }}>
                        {s.code}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>{s.shortDescription}</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', flexShrink: 0 }}>
                        ${s.currentFee.toFixed(2)}
                      </span>
                      <button
                        onClick={() => void handleAdd(s.code, s.shortDescription, s.currentFee)}
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
                      {cptSearch ? 'Sin resultados en el catálogo' : loading ? 'Cargando catálogo...' : 'Todos los CPTs ya asignados'}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Assigned CPTs ── */}
              {assigned.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', fontWeight: 700, marginBottom: 10 }}>
                    {tcpt('assigned')} · {assigned.length}
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
                              ✓ {tc('save')}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.60)', cursor: 'pointer' }}
                            >
                              {tc('cancel')}
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
                  {tcpt('closeVisit')}
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
                    {tcpt('saveDraftBtn')}
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
                      : <>{tcpt('signBtn')}</>
                    }
                  </button>
                </div>
                {assigned.length === 0 && (
                  <div style={{ fontSize: 10, color: 'rgba(245,158,11,0.80)', marginTop: 8 }}>
                    {tcpt('warningNoCpt')}
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
  const tlab = useTranslations('clinical.visit.lab');
  const tc   = useTranslations('clinical.common');

  const ORDER_TYPES = ['IMAGING', 'LABORATORY', 'CARDIOLOGY'] as const;
  type OrderType = typeof ORDER_TYPES[number];

  const [orderType,    setOrderType]    = useState<OrderType>('IMAGING');
  const [search,       setSearch]       = useState('');
  const [selected,     setSelected]     = useState<LabEntry | null>(null);
  const [indication,   setIndication]   = useState('');
  const [urgency,      setUrgency]      = useState<'ROUTINE' | 'URGENT' | 'STAT'>('ROUTINE');
  const [center,       setCenter]       = useState('');
  const [saving,       setSaving]       = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [catalog,      setCatalog]      = useState<LabEntry[]>([]);

  const icd10Display = diagnoses.slice(0, 5).map(d => d.icd10Code).filter(Boolean).join(', ');
  const icd10Array   = diagnoses.slice(0, 5).map(d => d.icd10Code).filter(Boolean) as string[];

  // Fetch catalog when orderType changes
  useEffect(() => {
    fetch(`/api/catalog/labs?category=${orderType}`)
      .then(r => r.json())
      .then(d => setCatalog(d.labs ?? []))
      .catch(() => {});
  }, [orderType]);

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
            <span style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>{tlab('title')}</span>
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
              {tlab('orderType')}
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
              {tlab('study')}
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
              {tlab('indication')}
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
                {tlab('urgency')}
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
                {tlab('preferredCenter')}
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
            {tc('cancel')}
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
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {tc('saving')}</>
              : <>{tlab('createBtn')}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

/** Sidebar izquierdo: info del paciente y caso */
function PatientSidebar({ data, onEditInsurance, onEditLegal }: {
  data: VisitData;
  onEditInsurance?: () => void;
  onEditLegal?: () => void;
}) {
  const { appointment: appt } = data;
  const [open, setOpen] = useState<Record<string, boolean>>({
    patient: true, case: true, triage: true,
  });
  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

  function Section({ id, title, children, onEdit }: { id: string; title: string; children: React.ReactNode; onEdit?: () => void }) {
    return (
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '10px 16px',
        }}>
          <button
            onClick={() => toggle(id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.70)', fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'left',
            }}
          >
            {title}
            {open[id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {onEdit && (
            <span
              onClick={onEdit}
              title="Editar"
              style={{ fontSize: 12, color: 'rgba(99,102,241,0.7)', cursor: 'pointer', marginLeft: 8, lineHeight: 1 }}
            >✏</span>
          )}
        </div>
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
        </Section>
      )}

      {/* Seguro */}
      {appt.case && (
        <Section id="insurance" title="Seguro" onEdit={onEditInsurance}>
          <Row label="Aseguradora" value={appt.case.primaryInsurance?.name} />
          <Row label="Póliza"      value={appt.case.primaryPolicyNumber ?? undefined} />
        </Section>
      )}

      {/* Legal */}
      {appt.case && (
        <Section id="legal" title="Legal" onEdit={onEditLegal}>
          <Row label="Bufete"   value={appt.case.lawFirm?.firmName} />
          <Row label="Abogado"  value={appt.case.attorney ? `${appt.case.attorney.firstName} ${appt.case.attorney.lastName}` : undefined} />
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
  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState<DiagnosisResult[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMode, setSearchMode] = useState<'icd' | 'snomed'>('icd');
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
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {(['icd', 'snomed'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSearchMode(mode)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: searchMode === mode
                    ? (mode === 'icd' ? 'rgba(139,92,246,0.25)' : 'rgba(6,182,212,0.20)')
                    : 'rgba(255,255,255,0.04)',
                  border: searchMode === mode
                    ? (mode === 'icd' ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(6,182,212,0.4)')
                    : '1px solid rgba(255,255,255,0.10)',
                  color: searchMode === mode
                    ? (mode === 'icd' ? '#a78bfa' : '#22d3ee')
                    : 'rgba(255,255,255,0.45)',
                }}
              >
                {mode === 'icd' ? 'ICD-10' : 'SNOMED CT'}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchMode === 'icd' ? 'Buscar ICD-10, código o descripción...' : 'Buscar SNOMED CT, código o término...'}
              style={{
                width: '100%', padding: '8px 10px 8px 30px', boxSizing: 'border-box',
                borderRadius: 8, background: 'rgba(255,255,255,0.07)',
                border: `1px solid ${searchMode === 'icd' ? 'rgba(139,92,246,0.25)' : 'rgba(6,182,212,0.25)'}`,
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
                const snomedFirst = searchMode === 'snomed';
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
                    {snomedFirst ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {d.snomedCode && (
                            <span style={{
                              fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#22d3ee',
                              background: 'rgba(6,182,212,0.12)', padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                            }}>
                              {d.snomedCode}
                            </span>
                          )}
                          <span style={{ fontSize: 12 }}>{d.snomedDescription ?? d.icd10Description}</span>
                          {d.piRelevant && (
                            <span style={{ fontSize: 9, color: '#34d399', background: 'rgba(16,185,129,0.12)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>PI</span>
                          )}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
                          ICD-10 {d.icd10Code}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#a78bfa',
                            background: 'rgba(139,92,246,0.12)', padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                          }}>
                            {d.icd10Code}
                          </span>
                          <span style={{ fontSize: 12 }}>{d.icd10Description}</span>
                          {d.piRelevant && (
                            <span style={{ fontSize: 9, color: '#34d399', background: 'rgba(16,185,129,0.12)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>PI</span>
                          )}
                        </div>
                        {d.snomedDescription && (
                          <div style={{ marginTop: 2, fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
                            SNOMED {d.snomedCode} · {d.snomedDescription}
                          </div>
                        )}
                      </>
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
  const router    = useRouter();
  const tc        = useTranslations('clinical.common');
  const tTriage   = useTranslations('clinical.triage');

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
  const [showRxModal,        setShowRxModal]         = useState(false);
  const [isSigned,    setIsSigned]    = useState(false);
  const [signedAt,    setSignedAt]    = useState<string | null>(null);
  const [signedBy,    setSignedBy]    = useState<string | null>(null);

  // ── Insurance modal ──
  const [insModal,    setInsModal]    = useState(false);
  const [insQuery,    setInsQuery]    = useState('');
  const [insResults,  setInsResults]  = useState<{id:string;label:string;subtitle:string}[]>([]);
  const [insSelected, setInsSelected] = useState<{id:string;name:string;claimsPhone:string|null}|null>(null);
  const [insPolicy,   setInsPolicy]   = useState('');
  const [insSaving,   setInsSaving]   = useState(false);

  // ── Legal modal ──
  const [legalModal,   setLegalModal]   = useState(false);
  const [firmQuery,    setFirmQuery]    = useState('');
  const [firmResults,  setFirmResults]  = useState<{id:string;label:string;subtitle:string}[]>([]);
  const [firmSelected, setFirmSelected] = useState<{id:string;firmName:string}|null>(null);
  const [attQuery,     setAttQuery]     = useState('');
  const [attResults,   setAttResults]   = useState<{id:string;label:string;subtitle:string}[]>([]);
  const [attSelected,  setAttSelected]  = useState<{id:string;firstName:string|null;lastName:string|null}|null>(null);
  const [legalSaving,  setLegalSaving]  = useState(false);

  useEffect(() => {
    if (!insModal) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/insurances/autocomplete?q=${encodeURIComponent(insQuery)}`);
      const d = await res.json().catch(() => ({ results: [] }));
      setInsResults(d.results ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [insQuery, insModal]);

  useEffect(() => {
    if (!legalModal) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/lawyers/autocomplete?q=${encodeURIComponent(firmQuery)}`);
      const d = await res.json().catch(() => ({ results: [] }));
      setFirmResults(d.results ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [firmQuery, legalModal]);

  useEffect(() => {
    if (!legalModal || !firmSelected) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/lawyers/autocomplete?q=${encodeURIComponent(attQuery)}&firmId=${firmSelected.id}`);
      const d = await res.json().catch(() => ({ results: [] }));
      setAttResults(d.results ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [attQuery, firmSelected, legalModal]);

  function openInsModal() {
    const c = data?.appointment?.case;
    setInsSelected(c?.primaryInsurance ? { id: c.primaryInsurance.id, name: c.primaryInsurance.name, claimsPhone: null } : null);
    setInsPolicy(c?.primaryPolicyNumber ?? '');
    setInsQuery(''); setInsResults([]);
    setInsModal(true);
  }

  function openLegalModal() {
    const c = data?.appointment?.case;
    setFirmSelected(c?.lawFirm ? { id: c.lawFirm.id, firmName: c.lawFirm.firmName } : null);
    setAttSelected(c?.attorney ?? null);
    setFirmQuery(''); setAttQuery('');
    setFirmResults([]); setAttResults([]);
    setLegalModal(true);
  }

  async function saveInsurance() {
    const caseId = data?.appointment?.case?.id;
    if (!caseId) return;
    setInsSaving(true);
    await fetch(`/api/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primaryInsuranceId:  insSelected?.id ?? null,
        primaryPolicyNumber: insPolicy.trim() || null,
      }),
    });
    setInsModal(false); setInsSaving(false);
    const res = await fetch(`/api/visit/${appointmentId}`);
    const d = await res.json() as { ok: boolean; appointment: VisitData['appointment'] };
    if (d.ok) setData({ appointment: d.appointment });
  }

  async function saveLegal() {
    const caseId = data?.appointment?.case?.id;
    if (!caseId) return;
    setLegalSaving(true);
    await fetch(`/api/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lawFirmId:  firmSelected?.id ?? null,
        attorneyId: attSelected?.id ?? null,
      }),
    });
    setLegalModal(false); setLegalSaving(false);
    const res = await fetch(`/api/visit/${appointmentId}`);
    const d = await res.json() as { ok: boolean; appointment: VisitData['appointment'] };
    if (d.ok) setData({ appointment: d.appointment });
  }

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
  const [guardrailMissing, setGuardrailMissing] = useState<string[]>([]);

  const handleSign = useCallback(async () => {
    if (isSigned || signing) return;
    setSigning(true);
    setGuardrailMissing([]);
    try {
      await doSave(true);
      const res = await fetch(`/api/visit/${appointmentId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedByName: data?.appointment.provider
          ? `Dr. ${data.appointment.provider.firstName} ${data.appointment.provider.lastName}`
          : 'Doctor',
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string; missing?: string[] };
      if (json.ok) {
        setIsSigned(true);
        setSignedAt(new Date().toISOString());
        setTimeout(() => router.push('/doctor'), 1500);
      } else if (json.error === 'GUARDRAIL_FAILED' && json.missing) {
        setGuardrailMissing(json.missing);
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
                <CheckCircle2 size={12} /> {tc('saved')}
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
                {tTriage('saveDraft')}
              </button>
            )}
          </div>
        </header>

        {/* ─── Content area (sidebar + main) ───────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left Sidebar */}
          <PatientSidebar data={data} onEditInsurance={openInsModal} onEditLegal={openLegalModal} />

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
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    color: '#a78bfa', fontSize: 12, fontWeight: 600,
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckCircle2 size={16} />
                      <span>
                        Nota firmada por {signedBy ?? 'Doctor'}{' '}
                        {signedAt ? `el ${new Date(signedAt).toLocaleDateString('es-US', { timeZone: 'America/Denver' })} a las ${new Date(signedAt).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })}` : ''}
                      </span>
                    </div>
                    <a
                      href={`/visit/${appointmentId}/print`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 12px', borderRadius: 7,
                        background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)',
                        color: '#a78bfa', fontSize: 11, fontWeight: 700, textDecoration: 'none',
                        flexShrink: 0,
                      }}
                    >
                      🖨 Imprimir / PDF
                    </a>
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

            {/* Spacer so last section isn't hidden under footer */}
            <div style={{ height: 80 }} />
          </main>
        </div>

        {/* ─── Footer (sign action) ────────────────────────────────────────────
             position:fixed garantiza visibilidad sin importar el scroll del <main>.
             El spacer de 80px dentro de <main> evita que el contenido quede tapado.
        ─────────────────────────────────────────────────────────────────────── */}
        {!isSigned && (
          <footer style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            padding: '12px 24px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: '#0a1224',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
            zIndex: 400,
          }}>
            <div style={{ fontSize: 11, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data && (!data.appointment.checkedInAt || !data.appointment.attendanceSignedAt || !data.appointment.triageRecord) ? (
                <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={11} />
                  {[
                    !data.appointment.checkedInAt        && 'Check-in pendiente',
                    !data.appointment.attendanceSignedAt && 'Firma asistencia pendiente',
                    !data.appointment.triageRecord       && 'Triaje pendiente',
                  ].filter(Boolean).join(' · ')}
                </span>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Auto-guardado cada 30 seg. Asigna CPTs antes de firmar.
                </span>
              )}
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
              <Save size={13} /> {tTriage('saveDraft')}
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

            {/* B.19 — Rx */}
            <button
              onClick={() => setShowRxModal(true)}
              style={{
                padding: '10px 16px', borderRadius: 8,
                background: 'rgba(167,139,250,0.10)',
                border: '1px solid rgba(167,139,250,0.30)',
                color: '#c4b5fd', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              title="B.19 — Nueva prescripción (DAW/EPCS Phase 2)"
            >
              💊 Rx
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

        {/* Guardrail banner — se muestra al intentar firmar sin precondiciones */}
        {guardrailMissing.length > 0 && (
          <div style={{
            position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            zIndex: 900, minWidth: 320, maxWidth: 480,
            background: '#1c0a00', border: '1px solid rgba(239,68,68,0.50)',
            borderRadius: 12, padding: '14px 18px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.60)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={16} color="#f87171" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f87171' }}>
                No se puede firmar — precondiciones pendientes
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {guardrailMissing.includes('CHECK_IN') && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#f87171' }}>⛔</span> El paciente no hizo check-in en recepción
                </div>
              )}
              {guardrailMissing.includes('ATTENDANCE_SIGNATURE') && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#f87171' }}>⛔</span> Falta la firma de asistencia del paciente
                </div>
              )}
              {guardrailMissing.includes('TRIAGE') && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#f87171' }}>⛔</span> Falta el triaje del MA (signos vitales)
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setGuardrailMissing([])}
              style={{
                marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.40)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              Cerrar ×
            </button>
          </div>
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

        {/* B.19 Prescription */}
        {showRxModal && data && (
          <RxModal
            appointmentId={appointmentId}
            visitNoteId={data.appointment.visitNote?.id ?? null}
            providerName={data.appointment.provider
              ? `Dr. ${data.appointment.provider.firstName} ${data.appointment.provider.lastName}`
              : 'Doctor'}
            patientName={data.appointment.patient
              ? `${data.appointment.patient.lastName.toUpperCase()}, ${data.appointment.patient.firstName}`
              : 'Paciente'}
            caseCode={data.appointment.case?.caseCode ?? ''}
            onClose={() => setShowRxModal(false)}
          />
        )}
      </div>

      {/* ═══ INSURANCE MODAL ════════════════════════════════════════════════════ */}
      {insModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setInsModal(false)}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14, padding: 24, width: '100%', maxWidth: 420,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{tTriage('editInsurance')}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginBottom: 18 }}>{data?.appointment?.case?.caseCode}</div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.40)', fontWeight: 600, marginBottom: 6 }}>{tTriage('insurer')}</div>
              {insSelected ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.30)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#67e8f9' }}>{insSelected.name}</div>
                  <button onClick={() => { setInsSelected(null); setInsQuery(''); }} style={{ fontSize: 16, color: 'rgba(255,255,255,0.40)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                </div>
              ) : (
                <>
                  <input autoFocus value={insQuery} onChange={e => setInsQuery(e.target.value)} placeholder={tTriage('searchInsurer')}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  {insResults.length > 0 && (
                    <div style={{ marginTop: 4, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#131c34' }}>
                      {insResults.map(r => (
                        <div key={r.id} onClick={() => { setInsSelected({ id: r.id, name: r.label, claimsPhone: null }); setInsQuery(''); setInsResults([]); }}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.80)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <div style={{ fontWeight: 600 }}>{r.label}</div>
                          {r.subtitle && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>{r.subtitle}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.40)', fontWeight: 600, marginBottom: 6 }}>{tTriage('policyNumber')}</div>
              <input value={insPolicy} onChange={e => setInsPolicy(e.target.value)} placeholder={tTriage('policyPlaceholder')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'monospace' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setInsModal(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)', cursor: 'pointer' }}>{tc('cancel')}</button>
              <button onClick={saveInsurance} disabled={insSaving} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(6,182,212,0.20)', border: '1px solid rgba(6,182,212,0.40)', color: '#67e8f9', cursor: insSaving ? 'not-allowed' : 'pointer' }}>
                {insSaving ? tc('saving') : tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ LEGAL MODAL ════════════════════════════════════════════════════════ */}
      {legalModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setLegalModal(false)}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14, padding: 24, width: '100%', maxWidth: 420,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{tTriage('editLegal')}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginBottom: 18 }}>{data?.appointment?.case?.caseCode}</div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.40)', fontWeight: 600, marginBottom: 6 }}>{tTriage('firm')}</div>
              {firmSelected ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.30)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>{firmSelected.firmName}</div>
                  <button onClick={() => { setFirmSelected(null); setFirmQuery(''); setAttSelected(null); setAttResults([]); }} style={{ fontSize: 16, color: 'rgba(255,255,255,0.40)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                </div>
              ) : (
                <>
                  <input autoFocus value={firmQuery} onChange={e => setFirmQuery(e.target.value)} placeholder={tTriage('searchFirm')}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#fff', fontSize: 12, outline: 'none' }} />
                  {firmResults.length > 0 && (
                    <div style={{ marginTop: 4, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#131c34' }}>
                      {firmResults.map(r => (
                        <div key={r.id} onClick={() => { setFirmSelected({ id: r.id, firmName: r.label }); setFirmQuery(''); setFirmResults([]); setAttSelected(null); setAttQuery(''); }}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.80)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <div style={{ fontWeight: 600 }}>{r.label}</div>
                          {r.subtitle && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>{r.subtitle}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {firmSelected && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.40)', fontWeight: 600, marginBottom: 6 }}>{tTriage('attorney')}</div>
                {attSelected ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)' }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>{`${attSelected.firstName ?? ''} ${attSelected.lastName ?? ''}`.trim()}</div>
                    <button onClick={() => { setAttSelected(null); setAttQuery(''); }} style={{ fontSize: 16, color: 'rgba(255,255,255,0.40)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                  </div>
                ) : (
                  <>
                    <input value={attQuery} onChange={e => setAttQuery(e.target.value)} placeholder={tTriage('searchAttorney')}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#fff', fontSize: 12, outline: 'none' }} />
                    {attResults.length > 0 && (
                      <div style={{ marginTop: 4, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#131c34' }}>
                        {attResults.map(r => (
                          <div key={r.id} onClick={() => { const [fn, ...rest] = r.label.split(' '); setAttSelected({ id: r.id, firstName: fn ?? null, lastName: rest.join(' ') || null }); setAttQuery(''); setAttResults([]); }}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.80)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ fontWeight: 600 }}>{r.label}</div>
                            {r.subtitle && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>{r.subtitle}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setLegalModal(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)', cursor: 'pointer' }}>{tc('cancel')}</button>
              <button onClick={saveLegal} disabled={legalSaving} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(99,102,241,0.20)', border: '1px solid rgba(99,102,241,0.40)', color: '#a5b4fc', cursor: legalSaving ? 'not-allowed' : 'pointer' }}>
                {legalSaving ? tc('saving') : tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
