'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Pill, FlaskConical, Plus, RefreshCw, Search, Loader2,
  ChevronLeft, ChevronRight, X, Calendar,
} from 'lucide-react';
import { Button } from '@precision/ui';
import { EmptyState } from '@/components/ui-phoenix';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Prescription {
  id: string;
  medicationName: string;
  dose: string | null;
  instructions: string | null;
  quantity: number | null;
  unit: string | null;
  refills: string | null;
  startDate: string | null;
  expirationDate: string | null;
  autoExpire: boolean;
  autoRenew: boolean;
  prescribedBy: string | null;
  diagnosisCode: string | null;
  diagnosisLabel: string | null;
  pharmacy: string | null;
  pharmacyNote: string | null;
  status: 'IN_USE' | 'HISTORY';
  createdAt: string;
}

interface Lab {
  id: string;
  sampleDate: string | null;
  billingType: string | null;
  providerName: string | null;
  status: string;
  labItems: string[];
  diagnoses: string[];
  createdAt: string;
}

interface Props {
  caseId: string;
  patientId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REFILLS_OPTIONS = ['Sin reposiciones', '1', '2', '3', '4', '5', '6', '9', '11'] as const;

const UNIT_OPTIONS = [
  'Tableta(s)', 'Cápsula(s)', 'ml', 'mg', 'Parche(s)', 'Supositorio(s)', 'Gotas', 'Inhalación(es)',
] as const;

const LAB_STATUS_OPTIONS = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const LAB_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente', IN_PROGRESS: 'En proceso', COMPLETED: 'Completado', CANCELLED: 'Cancelado',
};

const BILLING_TYPE_OPTIONS = [
  'Seguro primario', 'Seguro secundario', 'Self-Pay', 'Medicare', 'Medicaid', 'Otro',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    IN_USE: 'bg-emerald/10 text-emerald border-emerald/30',
    HISTORY: 'bg-bg-2 text-text-muted border-border',
    PENDING: 'bg-amber/10 text-amber border-amber/30',
    IN_PROGRESS: 'bg-cyan/10 text-cyan border-cyan/30',
    COMPLETED: 'bg-emerald/10 text-emerald border-emerald/30',
    CANCELLED: 'bg-rose/10 text-rose border-rose/30',
  };
  const labels: Record<string, string> = {
    IN_USE: 'En uso', HISTORY: 'Historial',
    ...LAB_STATUS_LABELS,
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${colors[status] ?? 'bg-bg-2 text-text-muted border-border'}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ─── Drug autocomplete hook ───────────────────────────────────────────────────

function useDrugSearch(query: string) {
  const [results, setResults] = useState<Array<{ label: string; value: string }>>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/patients/search-drugs?q=${encodeURIComponent(query)}`);
        if (r.ok) {
          const data = await r.json();
          setResults((data.results ?? []).slice(0, 8));
        }
      } catch { setResults([]); }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  return results;
}

// ─── Providers hook ───────────────────────────────────────────────────────────

function useProviders() {
  const [providers, setProviders] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    fetch('/api/admin/providers?limit=100')
      .then(r => r.ok ? r.json() : { providers: [] })
      .then((d: { providers: Array<{ id: string; firstName: string; lastName: string }> }) =>
        setProviders(d.providers?.map(p => ({ id: p.id, label: `Dr. ${p.firstName} ${p.lastName}` })) ?? [])
      )
      .catch(() => {});
  }, []);
  return providers;
}

// ─── Modal: Nueva prescripción ────────────────────────────────────────────────

function PrescriptionModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: Partial<Prescription>) => Promise<void>;
}) {
  const providers = useProviders();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'IN_USE' | 'HISTORY'>('IN_USE');
  const [drugQuery, setDrugQuery] = useState('');
  const [drugSelected, setDrugSelected] = useState('');
  const drugResults = useDrugSearch(drugQuery);
  const [dose, setDose] = useState('');
  const [instructions, setInstructions] = useState('');
  const [quantity, setQuantity] = useState('30');
  const [unit, setUnit] = useState('');
  const [refills, setRefills] = useState('Sin reposiciones');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [autoExpire, setAutoExpire] = useState(true);
  const [autoRenew, setAutoRenew] = useState(false);
  const [prescribedBy, setPrescribedBy] = useState('');
  const [diagnosisQuery, setDiagnosisQuery] = useState('');
  const [diagnosisSelected, setDiagnosisSelected] = useState('');
  const [diagResults, setDiagResults] = useState<Array<{ label: string; code: string }>>([]);
  const [pharmacy, setPharmacy] = useState('');
  const [pharmacyNote, setPharmacyNote] = useState('');

  const diagTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (diagTimer.current) clearTimeout(diagTimer.current);
    if (diagnosisQuery.length < 2) { setDiagResults([]); return; }
    diagTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/patients/search-diagnoses?q=${encodeURIComponent(diagnosisQuery)}`);
        if (r.ok) {
          const d = await r.json();
          setDiagResults((d.results ?? []).slice(0, 6));
        }
      } catch { setDiagResults([]); }
    }, 250);
  }, [diagnosisQuery]);

  async function handleSave() {
    if (!drugSelected) return;
    setSaving(true);
    try {
      await onSave({
        medicationName: drugSelected,
        dose: dose || null,
        instructions: instructions || null,
        quantity: quantity ? parseInt(quantity) : null,
        unit: unit || null,
        refills: refills === 'Sin reposiciones' ? '0' : refills,
        startDate: startDate || null,
        autoExpire,
        autoRenew,
        prescribedBy: prescribedBy || null,
        diagnosisCode: diagnosisSelected ? diagnosisSelected.split(' ')[0] : null,
        diagnosisLabel: diagnosisSelected || null,
        pharmacy: pharmacy || null,
        pharmacyNote: pharmacyNote || null,
        status,
      });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-bg-1 border border-border rounded-xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-text-1 font-semibold text-sm flex items-center gap-2">
            <Pill className="w-4 h-4 text-violet" /> Nueva prescripción
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-1 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4 scroll-thin">
          {/* Estado */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-2">Estado</label>
            <div className="flex gap-4">
              {(['IN_USE', 'HISTORY'] as const).map(s => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={status === s}
                    onChange={() => setStatus(s)}
                    className="accent-brand"
                  />
                  <span className="text-sm text-text-1">{s === 'IN_USE' ? 'En uso' : 'Historial médico'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Medicamento */}
          <div className="relative">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
              Medicamento <span className="text-rose">*</span>
            </label>
            {drugSelected ? (
              <div className="flex items-center justify-between rounded-md bg-violet/10 border border-violet/30 px-3 py-2">
                <span className="text-sm text-text-1">{drugSelected}</span>
                <button onClick={() => { setDrugSelected(''); setDrugQuery(''); }} className="text-text-muted hover:text-rose ml-2 text-xs">✕</button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={drugQuery}
                  onChange={e => setDrugQuery(e.target.value)}
                  placeholder="Selecciona un medicamento"
                  className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
                />
                {drugResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-border bg-bg-1 shadow-lg max-h-36 overflow-y-auto">
                    {drugResults.map(d => (
                      <button key={d.value} onClick={() => { setDrugSelected(d.label); setDrugQuery(''); }}
                        className="w-full text-left px-3 py-2 text-sm text-text-1 hover:bg-bg-2">
                        {d.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {!drugSelected && drugQuery && (
              <p className="text-[10px] text-text-muted mt-1">O escribe el nombre directamente:
                <button onClick={() => { setDrugSelected(drugQuery); setDrugQuery(''); }} className="ml-1 text-brand underline">usar "{drugQuery}"</button>
              </p>
            )}
          </div>

          {/* Dosis */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Dosis</label>
            <input
              type="text"
              value={dose}
              onChange={e => setDose(e.target.value)}
              placeholder="Ej.: 5 mg, 20 mg, 10 ml"
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
            />
          </div>

          {/* Indicaciones */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Indicaciones</label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={3}
              placeholder="Ej.: Tomar 1 tableta por vía oral dos veces al día con alimentos"
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand resize-none"
            />
          </div>

          {/* Cantidad / Unidad / Reposiciones */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Cantidad a dispensar</label>
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Unidad de dispensación</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
              >
                <option value="">Selecciona una opción</option>
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Reposiciones</label>
              <select
                value={refills}
                onChange={e => setRefills(e.target.value)}
                className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
              >
                {REFILLS_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Fecha inicio + checkboxes */}
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Fecha de inicio</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <input type="checkbox" checked={autoExpire} onChange={e => setAutoExpire(e.target.checked)} className="accent-brand" />
              <span className="text-sm text-text-1">Expiración automática</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <input type="checkbox" checked={autoRenew} onChange={e => setAutoRenew(e.target.checked)} className="accent-brand" />
              <span className="text-sm text-text-1">Renovación automática</span>
            </label>
          </div>

          {/* Prescrito por */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Prescrito por</label>
            <select
              value={prescribedBy}
              onChange={e => setPrescribedBy(e.target.value)}
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
            >
              <option value="">Selecciona el médico que prescribe</option>
              {providers.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
            </select>
          </div>

          {/* Diagnóstico */}
          <div className="relative">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Diagnóstico</label>
            {diagnosisSelected ? (
              <div className="flex items-center justify-between rounded-md bg-brand/10 border border-brand/30 px-3 py-2">
                <span className="text-sm text-text-1">{diagnosisSelected}</span>
                <button onClick={() => { setDiagnosisSelected(''); setDiagnosisQuery(''); }} className="text-text-muted hover:text-rose ml-2 text-xs">✕</button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={diagnosisQuery}
                  onChange={e => setDiagnosisQuery(e.target.value)}
                  placeholder="Selecciona un diagnóstico"
                  className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
                />
                {diagResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-border bg-bg-1 shadow-lg max-h-36 overflow-y-auto">
                    {diagResults.map(d => (
                      <button key={d.code} onClick={() => { setDiagnosisSelected(`${d.code} · ${d.label}`); setDiagnosisQuery(''); }}
                        className="w-full text-left px-3 py-2 text-sm text-text-1 hover:bg-bg-2">
                        <span className="font-mono text-text-muted text-xs mr-2">{d.code}</span>{d.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {!diagnosisSelected && <p className="text-[10px] text-text-muted mt-0.5">Selecciona un diagnóstico para ver su descripción</p>}
          </div>

          {/* Farmacia */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Nombre de la farmacia</label>
            <input
              type="text"
              value={pharmacy}
              onChange={e => setPharmacy(e.target.value)}
              placeholder="Nombre de la farmacia"
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
            />
          </div>

          {/* Nota farmacia */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Nota para la farmacia</label>
            <textarea
              value={pharmacyNote}
              onChange={e => setPharmacyNote(e.target.value)}
              rows={2}
              placeholder="Instrucciones especiales para la farmacia..."
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !drugSelected}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Crear prescripción
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Nuevo laboratorio ─────────────────────────────────────────────────

function LabModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: Partial<Lab>) => Promise<void>;
}) {
  const providers = useProviders();
  const [saving, setSaving] = useState(false);
  const [sampleDate, setSampleDate] = useState('');
  const [billingType, setBillingType] = useState('');
  const [providerName, setProviderName] = useState('');
  const [status, setStatus] = useState<string>('PENDING');
  const [labItems, setLabItems] = useState('');
  const [diagnoses, setDiagnoses] = useState('');

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        sampleDate: sampleDate || null,
        billingType: billingType || null,
        providerName: providerName || null,
        status,
        labItems: labItems.split(',').map(s => s.trim()).filter(Boolean),
        diagnoses: diagnoses.split(',').map(s => s.trim()).filter(Boolean),
      });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-bg-1 border border-border rounded-xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-text-1 font-semibold text-sm flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-cyan" /> Agregar laboratorio
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-1 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4 scroll-thin">
          {/* Fecha de muestra */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Fecha de muestra</label>
            <input
              type="date"
              value={sampleDate}
              onChange={e => setSampleDate(e.target.value)}
              className="rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
            />
          </div>

          {/* Tipo de facturación */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Tipo de facturación</label>
            <select
              value={billingType}
              onChange={e => setBillingType(e.target.value)}
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
            >
              <option value="">Todos los tipos de facturación</option>
              {BILLING_TYPE_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Médico */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Médico</label>
            <select
              value={providerName}
              onChange={e => setProviderName(e.target.value)}
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
            >
              <option value="">Todos los médicos</option>
              {providers.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
            </select>
          </div>

          {/* Estado */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Estado</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
            >
              {LAB_STATUS_OPTIONS.map(s => <option key={s} value={s}>{LAB_STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          {/* Laboratorios */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Laboratorios</label>
            <textarea
              value={labItems}
              onChange={e => setLabItems(e.target.value)}
              rows={2}
              placeholder="CBC, BMP, HbA1c… (separados por coma)"
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand resize-none"
            />
          </div>

          {/* Diagnósticos */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Diagnósticos</label>
            <textarea
              value={diagnoses}
              onChange={e => setDiagnoses(e.target.value)}
              rows={2}
              placeholder="ICD-10 o descripción… (separados por coma)"
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Agregar laboratorio
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Prescription table ───────────────────────────────────────────────────────

function PrescriptionsSection({ caseId, patientId }: { caseId: string; patientId: string }) {
  const [items, setItems] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const PAGE_SIZE = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/cases/${caseId}/prescriptions`);
      if (r.ok) {
        const d = await r.json();
        setItems(d.prescriptions ?? []);
      }
    } catch { /* stub — API pendiente */ }
    finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(p =>
    !search || p.medicationName.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleSave(data: Partial<Prescription>) {
    await fetch(`/api/admin/cases/${caseId}/prescriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, patientId }),
    });
    await load();
  }

  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap">
        <h3 className="text-text-1 font-semibold text-sm flex items-center gap-2">
          <Pill className="w-4 h-4 text-violet" /> Prescripciones
        </h3>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Agregar prescripción
          </Button>
          <button onClick={load} className="p-1.5 rounded-md text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors" title="Recargar">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border/40 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Presiona Enter para buscar"
          className="flex-1 bg-transparent text-sm text-text-1 placeholder-text-muted outline-none"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-text-muted gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-sm">Cargando…</span>
        </div>
      ) : paged.length === 0 ? (
        <div className="py-4">
          <EmptyState.Rich icon={Pill} title="No se encontraron resultados" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-2/50">
                {['Medicamento', 'Dosis', 'Indicaciones', 'Cantidad', 'Reposiciones', 'Fecha de inicio', 'Expiración', 'Renovación', 'Prescrito por', 'Estado', 'Creado'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map(p => (
                <tr key={p.id} className="border-b border-border/40 hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 text-text-1 font-medium whitespace-nowrap">{p.medicationName}</td>
                  <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">{p.dose ?? '—'}</td>
                  <td className="px-3 py-2.5 text-text-2 max-w-[200px] truncate" title={p.instructions ?? ''}>{p.instructions ?? '—'}</td>
                  <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">{p.quantity ?? '—'} {p.unit ?? ''}</td>
                  <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">{p.refills ?? '—'}</td>
                  <td className="px-3 py-2.5 text-text-2 whitespace-nowrap font-mono text-xs">{fmtDate(p.startDate)}</td>
                  <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">{p.autoExpire ? 'Auto' : '—'}</td>
                  <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">{p.autoRenew ? 'Auto' : '—'}</td>
                  <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">{p.prescribedBy ?? '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap"><StatusPill status={p.status} /></td>
                  <td className="px-3 py-2.5 text-text-muted whitespace-nowrap font-mono text-xs">{fmtDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-end gap-3 px-4 py-2 border-t border-border/40 text-xs text-text-muted">
        <span>Página {page} de {totalPages}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-bg-2 disabled:opacity-40">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-bg-2 disabled:opacity-40">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {modalOpen && <PrescriptionModal onClose={() => setModalOpen(false)} onSave={handleSave} />}
    </div>
  );
}

// ─── Labs section ─────────────────────────────────────────────────────────────

function LabsSection({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const PAGE_SIZE = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/cases/${caseId}/labs`);
      if (r.ok) {
        const d = await r.json();
        setItems(d.labs ?? []);
      }
    } catch { /* stub */ }
    finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(l =>
    (!search || l.labItems.join(' ').toLowerCase().includes(search.toLowerCase())) &&
    (!statusFilter || l.status === statusFilter)
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleSave(data: Partial<Lab>) {
    await fetch(`/api/admin/cases/${caseId}/labs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await load();
  }

  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap">
        <h3 className="text-text-1 font-semibold text-sm flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-cyan" /> Laboratorios
        </h3>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Agregar laboratorio
          </Button>
          <button onClick={load} className="p-1.5 rounded-md text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-border/40 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Presiona Intro para buscar..."
            className="flex-1 bg-transparent text-sm text-text-1 placeholder-text-muted outline-none min-w-0"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md bg-bg-2 border border-border px-2 py-1.5 text-xs text-text-1 outline-none focus:border-brand"
        >
          <option value="">Todos los estados</option>
          {LAB_STATUS_OPTIONS.map(s => <option key={s} value={s}>{LAB_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-text-muted gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-sm">Cargando…</span>
        </div>
      ) : paged.length === 0 ? (
        <div className="py-4">
          <EmptyState.Rich icon={FlaskConical} title="No se encontraron resultados" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-2/50">
                {['Fecha de muestra', 'Tipo de facturación', 'Médico', 'Estado', 'Laboratorios', 'Diagnósticos'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map(l => (
                <tr key={l.id} className="border-b border-border/40 hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 text-text-2 whitespace-nowrap font-mono text-xs">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(l.sampleDate)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">{l.billingType ?? '—'}</td>
                  <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">{l.providerName ?? '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap"><StatusPill status={l.status} /></td>
                  <td className="px-3 py-2.5 text-text-2 max-w-[160px] truncate" title={l.labItems.join(', ')}>{l.labItems.join(', ') || '—'}</td>
                  <td className="px-3 py-2.5 text-text-2 max-w-[160px] truncate" title={l.diagnoses.join(', ')}>{l.diagnoses.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-end gap-3 px-4 py-2 border-t border-border/40 text-xs text-text-muted">
        <span>Página {page} de {totalPages}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-bg-2 disabled:opacity-40">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-bg-2 disabled:opacity-40">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {modalOpen && <LabModal onClose={() => setModalOpen(false)} onSave={handleSave} />}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function PrescripcionesTab({ caseId, patientId }: Props) {
  return (
    <div className="space-y-6">
      <PrescriptionsSection caseId={caseId} patientId={patientId} />
      <LabsSection caseId={caseId} />
    </div>
  );
}
