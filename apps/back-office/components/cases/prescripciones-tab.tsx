'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
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
  'Cliente', 'Paciente', 'Privado', 'Medicaid', 'Medicare', 'Compensación laboral',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    IN_USE: 'bg-emerald/10 text-emerald border-emerald/30',
    HISTORY: 'bg-bg-2 text-text-muted border-border/30',
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
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${colors[status] ?? 'bg-bg-2 text-text-muted border-border/30'}`}>
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

// ─── Providers hook — usa el GET de /api/admin/providers (Provider model clínico) ─

function useProviders() {
  const [providers, setProviders] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    fetch('/api/admin/providers?status=ACTIVE&limit=100')
      .then(r => r.ok ? r.json() : { providers: [] })
      .then((d: { providers: Array<{ id: string; firstName: string; lastName: string }> }) =>
        setProviders(d.providers?.map(p => ({ id: p.id, label: `Dr. ${p.firstName} ${p.lastName}` })) ?? [])
      )
      .catch(() => {});
  }, []);
  return providers;
}

// ─── Lab catalog search hook — carga inmediato con query vacío ────────────────

function useLabSearch(query: string) {
  const [results, setResults] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    // delay 0ms para query vacío (carga inicial), 200ms para búsqueda
    const delay = query.length === 0 ? 0 : 200;
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/lab-catalog/search?q=${encodeURIComponent(query)}&limit=20`);
        if (r.ok) {
          const data = await r.json();
          setResults(data.results ?? []);
        }
      } catch { setResults([]); }
    }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  return results;
}

// ─── Diagnosis search hook — carga inmediato con query vacío ─────────────────

function useDiagSearch(query: string) {
  const [results, setResults] = useState<Array<{ id: string; code: string; label: string }>>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const delay = query.length === 0 ? 0 : 200;
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/diagnoses/search?q=${encodeURIComponent(query)}&limit=20`);
        if (r.ok) {
          const data = await r.json();
          setResults(data.results ?? []);
        }
      } catch { setResults([]); }
    }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  return results;
}

// ─── Multi-select searchable ──────────────────────────────────────────────────

interface SelectItem { id: string | number; label: string; sublabel?: string }

function MultiSelectSearch({
  placeholder,
  selected,
  onAdd,
  onRemove,
  results,
  onQueryChange,
  query,
  openUpward = false,
}: {
  placeholder: string;
  selected: SelectItem[];
  onAdd: (item: SelectItem) => void;
  onRemove: (id: string | number) => void;
  results: SelectItem[];
  onQueryChange: (q: string) => void;
  query: string;
  openUpward?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selected.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-brand/10 border border-brand/30 px-2 py-0.5 text-[11px] text-brand">
              {s.label}
              <button onClick={() => onRemove(s.id)} className="hover:text-rose leading-none">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div
        className="flex items-center gap-2 rounded-md bg-bg-2 border border-border/30 px-3 py-2 cursor-text focus-within:border-brand transition-colors"
        onClick={() => setOpen(true)}
      >
        <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
        <input
          type="text"
          value={query}
          onChange={e => { onQueryChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-text-1 placeholder-text-muted outline-none"
        />
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className={`absolute z-20 left-0 right-0 rounded-md border border-border/30 bg-bg-1 shadow-xl max-h-52 overflow-y-auto scroll-thin ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          {results.map(r => {
            const already = selected.some(s => s.id === r.id);
            return (
              <button
                key={r.id}
                onClick={() => { if (!already) { onAdd(r); onQueryChange(''); } setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm flex items-baseline gap-2 transition-colors ${already ? 'opacity-40 cursor-default' : 'hover:bg-bg-2'}`}
              >
                {r.sublabel && <span className="font-mono text-text-muted text-[11px] shrink-0">{r.sublabel}</span>}
                <span className="text-text-1 truncate">{r.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Modal: Nueva prescripción ────────────────────────────────────────────────

function PrescriptionModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: Partial<Prescription>) => Promise<void>;
}) {
  const t  = useTranslations('phoenix.caseTabs.prescripciones');
  const tc = useTranslations('phoenix.common');
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
        className="bg-bg-1 border border-border/30 rounded-xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 shrink-0">
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
                  placeholder={t('placeholderMed')}
                  className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
                />
                {drugResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 bottom-full mb-1 rounded-md border border-border/30 bg-bg-1 shadow-lg max-h-36 overflow-y-auto">
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
              placeholder={t('placeholderDose')}
              className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
            />
          </div>

          {/* Indicaciones */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Indicaciones</label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={3}
              placeholder={t('placeholderSig')}
              className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand resize-none"
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
                className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Unidad de dispensación</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
              >
                <option value="">{tc('selectOption')}</option>
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Reposiciones</label>
              <select
                value={refills}
                onChange={e => setRefills(e.target.value)}
                className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
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
                className="rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
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
              className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
            >
              <option value="">{t('placeholderDoctor')}</option>
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
                  placeholder={t('placeholderDiagnosis')}
                  className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
                />
                {diagResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 bottom-full mb-1 rounded-md border border-border/30 bg-bg-1 shadow-lg max-h-36 overflow-y-auto">
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
              placeholder={t('placeholderPharmacy')}
              className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
            />
          </div>

          {/* Nota farmacia */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Nota para la farmacia</label>
            <textarea
              value={pharmacyNote}
              onChange={e => setPharmacyNote(e.target.value)}
              rows={2}
              placeholder={t('placeholderSigSpec')}
              className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/30 flex justify-end gap-2 shrink-0">
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

// ─── Modal: Nuevo laboratorio (v2 layout) ────────────────────────────────────

function LabModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: Partial<Lab>) => Promise<void>;
}) {
  const t  = useTranslations('phoenix.caseTabs.prescripciones');
  const tc = useTranslations('phoenix.common');
  const providers = useProviders();
  const [saving, setSaving] = useState(false);

  // Fields
  const [providerId, setProviderId]     = useState('');
  const [providerName, setProviderName] = useState('');
  const [sampleDate, setSampleDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [billingType, setBillingType]   = useState('');

  // Lab catalog multi-select
  const [labQuery, setLabQuery]         = useState('');
  const labResults                      = useLabSearch(labQuery);
  const [selectedLabs, setSelectedLabs] = useState<SelectItem[]>([]);

  // Diagnosis multi-select
  const [diagQuery, setDiagQuery]       = useState('');
  const diagResults                     = useDiagSearch(diagQuery);
  const [selectedDiags, setSelectedDiags] = useState<SelectItem[]>([]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        sampleDate:   sampleDate || null,
        billingType:  billingType || null,
        providerName: providerName || null,
        status:       'PENDING',
        labItems:     selectedLabs.map(l => `${l.sublabel} - ${l.label}`),
        diagnoses:    selectedDiags.map(d => `${d.sublabel} - ${d.label}`),
      });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-bg-1 border border-border/30 rounded-xl w-full max-w-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 shrink-0">
          <h2 className="text-text-1 font-semibold text-sm flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-cyan" /> Crear laboratorio
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-1 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 pb-52">

          {/* Médico — full width dropdown */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Médico</label>
            <select
              value={providerId}
              onChange={e => {
                setProviderId(e.target.value);
                const found = providers.find(p => p.id === e.target.value);
                setProviderName(found?.label ?? '');
              }}
              className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
            >
              <option value="">{t('placeholderUser')}</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>

          {/* Fecha + Tipo de facturación — 2 columnas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Fecha de toma de muestra</label>
              <input
                type="date"
                value={sampleDate}
                onChange={e => setSampleDate(e.target.value)}
                className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Tipo de facturación</label>
              <select
                value={billingType}
                onChange={e => setBillingType(e.target.value)}
                className="w-full rounded-md bg-bg-2 border border-border/30 px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
              >
                <option value="">{t('placeholderBilling')}</option>
                {BILLING_TYPE_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          {/* Laboratorios + Diagnósticos — 2 columnas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Laboratorios</label>
              <MultiSelectSearch
                placeholder={t('placeholderLabs')}
                selected={selectedLabs}
                onAdd={item => setSelectedLabs(prev => [...prev, item])}
                onRemove={id => setSelectedLabs(prev => prev.filter(l => l.id !== id))}
                results={labResults.map(r => ({ id: r.id, label: r.name, sublabel: r.code }))}
                query={labQuery}
                onQueryChange={setLabQuery}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Diagnósticos</label>
              <MultiSelectSearch
                placeholder={t('placeholderDiagnoses')}
                selected={selectedDiags}
                onAdd={item => setSelectedDiags(prev => [...prev, item])}
                onRemove={id => setSelectedDiags(prev => prev.filter(d => d.id !== id))}
                results={diagResults.map(r => ({ id: r.id, label: r.label, sublabel: r.code }))}
                query={diagQuery}
                onQueryChange={setDiagQuery}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/30 flex justify-end gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Crear laboratorio
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Prescription table ───────────────────────────────────────────────────────

function PrescriptionsSection({ caseId, patientId }: { caseId: string; patientId: string }) {
  const t  = useTranslations('phoenix.caseTabs.prescripciones');
  const tc = useTranslations('phoenix.common');
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
    <div className="rounded-lg border border-border/30 bg-bg-1 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/30 flex-wrap">
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
          placeholder={t('placeholderSearch')}
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
          <EmptyState.Rich icon={Pill} title={t('emptyMeds')} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 bg-bg-2/50">
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
  const t  = useTranslations('phoenix.caseTabs.prescripciones');
  const tc = useTranslations('phoenix.common');
  const providers = useProviders();
  const [items, setItems] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [billingFilter, setBillingFilter] = useState('');
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
    (!statusFilter || l.status === statusFilter) &&
    (!providerFilter || l.providerName === providerFilter) &&
    (!billingFilter || l.billingType === billingFilter)
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
    <div className="rounded-lg border border-border/30 bg-bg-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/30 flex-wrap">
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
      <div className="px-4 py-2 border-b border-border/40 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('placeholderSearchAlt')}
            className="flex-1 bg-transparent text-sm text-text-1 placeholder-text-muted outline-none min-w-0"
          />
        </div>
        <select
          value={billingFilter}
          onChange={e => { setBillingFilter(e.target.value); setPage(1); }}
          className="rounded-md bg-bg-2 border border-border/30 px-2 py-1.5 text-xs text-text-1 outline-none focus:border-brand"
        >
          <option value="">{t('filterAllBilling')}</option>
          {BILLING_TYPE_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={providerFilter}
          onChange={e => { setProviderFilter(e.target.value); setPage(1); }}
          className="rounded-md bg-bg-2 border border-border/30 px-2 py-1.5 text-xs text-text-1 outline-none focus:border-brand"
        >
          <option value="">{t('filterAllDoctors')}</option>
          {providers.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md bg-bg-2 border border-border/30 px-2 py-1.5 text-xs text-text-1 outline-none focus:border-brand"
        >
          <option value="">{t('filterAllStatuses')}</option>
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
          <EmptyState.Rich icon={FlaskConical} title={t('emptyLabs')} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 bg-bg-2/50">
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
