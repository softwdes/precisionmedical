'use client';

import { useState, useTransition, useEffect } from 'react';
import { updateMedicalHistory, searchDiagnoses, searchDrugs, searchDoctors, searchSpecialties } from './actions';
import { useTranslations } from 'next-intl';
import {
  User, Phone, Mail, AlertTriangle, Heart, Pill, Scissors, Users,
  MessageSquare, Activity, Brain, Shield, ClipboardList, Stethoscope,
  ChevronDown, ChevronUp, Edit2, Plus, Calendar, X, Search,
  Cigarette, Wine, FlaskConical, Briefcase,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@precision/ui';
import { PersonAvatar, TagPill } from '@/components/ui-phoenix';
import type { PatientRow } from './patients-client';

// ── Types ──────────────────────────────────────────────────────────────────

export type MedicalHistoryData = {
  visitInfo?:        {
    referredBy?: string; mainReason?: string; otherConcerns?: string;
    noCurrentMeds?: boolean; broughtMedList?: boolean; noSignificantHistory?: boolean;
  };
  healthInfo?:       { goals?: string; selfRating?: number | null };
  allergies?:        string;
  problems?:         Array<{ id: string; condition: string; diagnosedAt?: string; status?: string; comments?: string }>;
  history?:          Array<{ id: string; condition: string; diagnosedAt?: string; status?: string; comments?: string }>;
  medications?:      Array<{
    id: string; name: string; status: 'IN_USE' | 'HISTORY';
    dose?: string; instructions?: string;
    quantity?: number; unit?: string; refills?: string;
    startDate?: string; autoExpire?: boolean; autoRenew?: boolean;
    prescribedBy?: string; diagnosisCode?: string; diagnosisLabel?: string;
    pharmacy?: string; pharmacyNote?: string;
  }>;
  surgeries?:        Array<{ id: string; procedure: string; date?: string; notes?: string }>;
  familyHistory?:    Array<{ id: string; relation: string; condition: string }>;
  providers?:        Array<{ id: string; name: string; specialty?: string; notes?: string }>;
  vaccines?:         string[];
  cognitiveStatus?:  Array<{ name: string; status: string }>;
  functionalStatus?: Array<{ name: string; status: string }>;
  implantedDevices?: string[];
  systemsReview?:    string[];
  healthExams?:      {
    bloodTestDate?: string; normalResults?: boolean;
    colonoscopyYear?: string; abnormal?: boolean;
  };
  socialHistory?:    { work?: string; children?: string; tobacco?: string; alcohol?: string; drugs?: string };
  comments?:         Array<{ id: string; date: string; text: string; author?: string }>;
};

interface Props {
  patient: PatientRow;
  open:    boolean;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDOB(dob: Date | string | null | undefined): string {
  if (!dob) return 'N/D';
  const d = typeof dob === 'string' ? new Date(dob) : dob;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function calcAge(dob: Date | string | null | undefined): number | null {
  if (!dob) return null;
  const d = typeof dob === 'string' ? new Date(dob) : dob;
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SideSection({
  icon, title, defaultOpen = true, editBtn = false, children,
}: {
  icon: React.ReactNode; title: string; defaultOpen?: boolean;
  editBtn?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        className="flex items-center justify-between w-full py-2.5 px-4 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <span className="text-brand w-3.5 h-3.5 shrink-0">{icon}</span>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {editBtn && open && (
            <span
              className="p-0.5 rounded text-text-muted hover:text-brand transition-colors"
              onClick={e => { e.stopPropagation(); }}
            >
              <Edit2 className="w-3 h-3" />
            </span>
          )}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
        </div>
      </button>
      {open && <div className="px-4 pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function SideRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[11px]">
      <span className="text-text-muted shrink-0">{label}:</span>
      <span className="text-text-1 text-right">{value || 'N/D'}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-bg-2/40 px-3 py-2.5 text-[11px] text-text-muted text-center">
      {text}
    </div>
  );
}

function SectionCard({
  icon, title, count, onAdd, editBtn = false, onEdit, children,
}: {
  icon: React.ReactNode; title: string; count?: number;
  onAdd?: () => void; editBtn?: boolean; onEdit?: () => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="text-emerald">{icon}</span>
          <span className="text-sm font-semibold text-text-1">{title}</span>
          {count !== undefined && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald/20 text-emerald text-[9px] font-bold">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onAdd && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-brand transition-colors"
            >
              <Plus className="w-3 h-3" /> Agregar
            </button>
          )}
          {editBtn && (
            <button
              onClick={onEdit}
              className="text-text-muted hover:text-brand transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setOpen(o => !o)} className="text-text-muted hover:text-text-1 transition-colors">
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function TableShell({
  headers, rows, emptyText,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyText: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border/60">
            {headers.map((h, i) => (
              <th key={i} className="text-left pb-2 pr-4 text-text-muted font-medium last:text-right">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="py-4 text-center text-text-muted italic">{emptyText}</td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 text-text-2 last:text-right">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pt-2 text-right text-[10px] text-text-muted">
        Total registros: {rows.length}
      </div>
    </div>
  );
}

// ── Toggle row (reusable within edit modals) ───────────────────────────────

function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-md border transition-colors ${checked ? 'border-brand/40 bg-brand/5' : 'border-border/60 bg-bg-2/40'}`}>
      <span className="text-sm text-text-2">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors focus:outline-none
          ${checked ? 'bg-brand border-brand' : 'bg-white/10 border-white/20'}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform
            ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}

// ── Visit info edit dialog ─────────────────────────────────────────────────

function VisitInfoEditDialog({
  patientId, initial, open, onClose, onSaved,
}: {
  patientId: string;
  initial:   MedicalHistoryData['visitInfo'];
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    referredBy:          initial?.referredBy          ?? '',
    mainReason:          initial?.mainReason           ?? '',
    otherConcerns:       initial?.otherConcerns        ?? '',
    noCurrentMeds:       initial?.noCurrentMeds        ?? false,
    broughtMedList:      initial?.broughtMedList       ?? false,
    noSignificantHistory: initial?.noSignificantHistory ?? false,
  });

  function set(key: string, value: string | boolean) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      await updateMedicalHistory(patientId, { visitInfo: form });
      onSaved?.({ visitInfo: form });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">
            Actualizar información de la visita
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Actualizar detalles de la visita y estado de medicamentos
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Detalles de la visita */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-text-1">Detalles de la visita</p>

            <div className="space-y-1">
              <label className="text-xs text-text-muted">Referido por</label>
              <input
                value={form.referredBy}
                onChange={e => set('referredBy', e.target.value)}
                placeholder="¿Quién lo refirió?"
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-text-muted">Razón principal de la visita</label>
              <input
                value={form.mainReason}
                onChange={e => set('mainReason', e.target.value)}
                placeholder="Razón principal"
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-text-muted">Otras inquietudes</label>
              <input
                value={form.otherConcerns}
                onChange={e => set('otherConcerns', e.target.value)}
                placeholder="Cualquier otra inquietud"
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* Estado de medicamentos */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-1">Estado de medicamentos</p>
            <ToggleRow
              label="Sin medicamentos actuales"
              checked={form.noCurrentMeds}
              onChange={v => set('noCurrentMeds', v)}
            />
            <ToggleRow
              label="Trajo lista de medicamentos"
              checked={form.broughtMedList}
              onChange={v => set('broughtMedList', v)}
            />
            <ToggleRow
              label="Sin historial médico significativo"
              checked={form.noSignificantHistory}
              onChange={v => set('noSignificantHistory', v)}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Health info edit dialog ────────────────────────────────────────────────

function HealthInfoEditDialog({
  patientId, initial, open, onClose, onSaved,
}: {
  patientId: string;
  initial:   MedicalHistoryData['healthInfo'];
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [goals, setGoals]       = useState(initial?.goals ?? '');
  const [rating, setRating]     = useState<number | null>(initial?.selfRating ?? null);

  function handleSave() {
    startTransition(async () => {
      await updateMedicalHistory(patientId, { healthInfo: { goals, selfRating: rating } });
      onSaved?.({ healthInfo: { goals, selfRating: rating } });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">
            Actualizar información de salud
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Actualizar metas de salud y autoevaluación del paciente
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Metas de salud</label>
            <input
              value={goals}
              onChange={e => setGoals(e.target.value)}
              placeholder="Ingrese las metas de salud"
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-text-2">Autoevaluación (1-5)</label>
            <div className="flex items-center gap-3 flex-wrap">
              {[1, 2, 3, 4, 5].map(n => (
                <label key={n} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="rating"
                    checked={rating === n}
                    onChange={() => setRating(n)}
                    className="accent-brand"
                  />
                  <span className="text-sm text-text-2">{n}</span>
                </label>
              ))}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="rating"
                  checked={rating === null}
                  onChange={() => setRating(null)}
                  className="accent-brand"
                />
                <span className="text-sm text-text-2">N/D</span>
              </label>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add problem dialog ─────────────────────────────────────────────────────

type DiagnosisOption = { id: string; label: string; code: string };

function AddProblemDialog({
  patientId, existing, open, onClose, onSaved,
}: {
  patientId: string;
  existing:  MedicalHistoryData['problems'];
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [query,     setQuery]        = useState('');
  const [results,   setResults]      = useState<DiagnosisOption[]>([]);
  const [selected,  setSelected]     = useState<DiagnosisOption | null>(null);
  const [dropOpen,  setDropOpen]     = useState(false);
  const [isCurrent, setIsCurrent]   = useState(true);
  const [isResolved, setIsResolved] = useState(false);
  const [diagDate,   setDiagDate]   = useState('');
  const [comments,   setComments]   = useState('');

  // Initial load
  useEffect(() => { searchDiagnoses('').then(setResults); }, []);

  function handleQuery(v: string) {
    setQuery(v);
    searchDiagnoses(v).then(setResults);
  }

  function pick(opt: DiagnosisOption) {
    setSelected(opt);
    setDropOpen(false);
    setQuery('');
  }

  function handleSave() {
    if (!selected) return;
    const status = isCurrent ? 'Actual' : isResolved ? 'Resuelto' : undefined;
    const newProblem = {
      id:          crypto.randomUUID(),
      condition:   selected.label,
      diagnosedAt: diagDate || undefined,
      status,
      comments:    comments || undefined,
    };
    const updated = [...(existing ?? []), newProblem];
    startTransition(async () => {
      await updateMedicalHistory(patientId, { problems: updated });
      onSaved?.({ problems: updated });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">
            Agregar historial médico personal
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Agregar una nueva condición médica al historial del paciente
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Condición — searchable dropdown */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Condición</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropOpen(o => !o)}
                className="w-full flex items-center justify-between bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-left focus:outline-none focus:border-brand"
              >
                <span className={selected ? 'text-text-1' : 'text-text-muted'}>
                  {selected ? selected.label : 'Seleccionar una condición'}
                </span>
                <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
              </button>

              {dropOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-bg-1 shadow-lg">
                  <div className="p-2 border-b border-border/60">
                    <div className="flex items-center gap-2 bg-bg-2 rounded px-2 py-1">
                      <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      <input
                        autoFocus
                        value={query}
                        onChange={e => handleQuery(e.target.value)}
                        placeholder="Buscar..."
                        className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-muted focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {results.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-text-muted text-center">Sin resultados</p>
                    ) : results.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => pick(opt)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-brand/10 transition-colors
                          ${selected?.id === opt.id ? 'bg-brand/10 text-brand' : 'text-text-2'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Estado */}
          <div className="rounded-md border border-border/60 bg-bg-2/40 p-4 space-y-3">
            <p className="text-sm font-semibold text-text-1">Estado</p>
            <div className="grid grid-cols-2 gap-3">
              <ToggleRow label="Actual"    checked={isCurrent}  onChange={setIsCurrent} />
              <ToggleRow label="Resuelto"  checked={isResolved} onChange={setIsResolved} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-muted">Diagnosticado el</label>
              <input
                type="date"
                value={diagDate}
                onChange={e => setDiagDate(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Comentarios */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Comentarios</label>
            <textarea
              rows={3}
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Notas o detalles adicionales"
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-y"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || !selected}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared: simple searchable dropdown ────────────────────────────────────

function SearchDropdown({
  value, placeholder, options, onSearch, onSelect,
}: {
  value:       string;
  placeholder: string;
  options:     Array<{ id: string; label: string; badge?: string }>;
  onSearch:    (q: string) => void;
  onSelect:    (id: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState('');

  function handleQ(v: string) { setQ(v); onSearch(v); }
  function pick(id: string, label: string) { onSelect(id, label); setOpen(false); setQ(''); }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-left focus:outline-none focus:border-brand"
      >
        <span className={value ? 'text-text-1' : 'text-text-muted'}>{value || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-bg-1 shadow-lg">
          <div className="p-2 border-b border-border/60">
            <div className="flex items-center gap-2 bg-bg-2 rounded px-2 py-1">
              <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <input
                autoFocus
                value={q}
                onChange={e => handleQ(e.target.value)}
                placeholder="Buscar..."
                className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-muted focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {options.length === 0
              ? <p className="px-3 py-3 text-xs text-text-muted text-center">Sin resultados</p>
              : options.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => pick(opt.id, opt.label)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-brand/10 transition-colors flex items-center justify-between
                      ${value === opt.label ? 'bg-brand/10 text-brand' : 'text-text-2'}`}
                  >
                    <span>{opt.label}</span>
                    {opt.badge && (
                      <span className="text-[10px] bg-bg-2 border border-border/60 text-text-muted px-1.5 py-0.5 rounded">{opt.badge}</span>
                    )}
                  </button>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add medication dialog ──────────────────────────────────────────────────

const DISPENSE_UNITS = ['Tabletas','Cápsulas','ml','mg','Gramos','Unidades','Inhalaciones','Gotas','Parche(s)'];
const REFILL_OPTIONS = ['Sin reposiciones','1 reposición','2 reposiciones','3 reposiciones','4 reposiciones','5 reposiciones','6 reposiciones','Reposiciones ilimitadas'];

const CATEGORY_BADGE: Record<string, string> = {
  NSAID: 'NSAID', RELAXANT: 'relajante', OPIOID: 'opioide',
  NEURO: 'neuro', TOPICAL: 'tópico', STEROID: 'esteroide', OTHER: 'otro',
};

function AddMedicationDialog({
  patientId, existing, preferredPharmacy, open, onClose, onSaved,
}: {
  patientId:          string;
  existing:           MedicalHistoryData['medications'];
  preferredPharmacy?: string | null;
  open:               boolean;
  onClose:            () => void;
  onSaved?:           (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();

  // Estado
  const [status, setStatus] = useState<'IN_USE' | 'HISTORY'>('IN_USE');

  // Medicamento
  const [drugOptions,  setDrugOptions]  = useState<Array<{ id: string; label: string; badge?: string }>>([]);
  const [drugName,     setDrugName]     = useState('');

  // Dosis / indicaciones
  const [dose,         setDose]         = useState('');
  const [instructions, setInstructions] = useState('');

  // Cantidad / unidad / reposiciones
  const [quantity, setQuantity] = useState(30);
  const [unit,     setUnit]     = useState('');
  const [refills,  setRefills]  = useState('Sin reposiciones');

  // Fecha / checkboxes
  const today = new Date().toISOString().slice(0, 10);
  const [startDate,   setStartDate]   = useState(today);
  const [autoExpire,  setAutoExpire]  = useState(false);
  const [autoRenew,   setAutoRenew]   = useState(false);

  // Prescrito por
  const [doctorOptions,  setDoctorOptions]  = useState<Array<{ id: string; label: string }>>([]);
  const [prescribedBy,   setPrescribedBy]   = useState('');
  const [prescribedById, setPrescribedById] = useState('');

  // Diagnóstico
  const [diagOptions,   setDiagOptions]   = useState<Array<{ id: string; label: string }>>([]);
  const [diagLabel,     setDiagLabel]     = useState('');
  const [diagCode,      setDiagCode]      = useState('');

  // Farmacia
  const [pharmacy,     setPharmacy]     = useState(preferredPharmacy ?? '');
  const [pharmacyNote, setPharmacyNote] = useState('');

  // Initial loads
  useEffect(() => {
    searchDrugs('').then(rows =>
      setDrugOptions(rows.map(r => ({ id: String(r.id), label: r.name, badge: CATEGORY_BADGE[r.category] ?? r.category })))
    );
    searchDoctors('').then(rows => setDoctorOptions(rows.map(r => ({ id: r.id, label: r.name }))));
    searchDiagnoses('').then(rows => setDiagOptions(rows.map(r => ({ id: r.id, label: `${r.code} - ${r.label}` }))));
  }, []);

  function handleDrugSearch(q: string) {
    searchDrugs(q).then(rows =>
      setDrugOptions(rows.map(r => ({ id: String(r.id), label: r.name, badge: CATEGORY_BADGE[r.category] ?? r.category })))
    );
  }
  function handleDoctorSearch(q: string) {
    searchDoctors(q).then(rows => setDoctorOptions(rows.map(r => ({ id: r.id, label: r.name }))));
  }
  function handleDiagSearch(q: string) {
    searchDiagnoses(q).then(rows => setDiagOptions(rows.map(r => ({ id: r.id, label: `${r.code} - ${r.label}` }))));
  }

  function handleSave() {
    if (!drugName) return;
    const newMed = {
      id: crypto.randomUUID(),
      name: drugName,
      status,
      dose:          dose || undefined,
      instructions:  instructions || undefined,
      quantity,
      unit:          unit || undefined,
      refills,
      startDate,
      autoExpire,
      autoRenew,
      prescribedBy:  prescribedBy || undefined,
      diagnosisCode: diagCode || undefined,
      diagnosisLabel: diagLabel || undefined,
      pharmacy:      pharmacy || undefined,
      pharmacyNote:  pharmacyNote || undefined,
    };
    const updated = [...(existing ?? []), newMed];
    startTransition(async () => {
      await updateMedicalHistory(patientId, { medications: updated });
      onSaved?.({ medications: updated });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">Nueva prescripción</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Registrar un medicamento en el historial del paciente
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Estado */}
          <div className="flex items-center gap-6">
            {(['IN_USE', 'HISTORY'] as const).map(s => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="medStatus"
                  checked={status === s}
                  onChange={() => setStatus(s)}
                  className="accent-brand"
                />
                <span className="text-sm text-text-2">{s === 'IN_USE' ? 'En uso' : 'Historial médico'}</span>
              </label>
            ))}
          </div>

          {/* Medicamento */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Medicamento</label>
            <SearchDropdown
              value={drugName}
              placeholder="Selecciona un medicamento"
              options={drugOptions}
              onSearch={handleDrugSearch}
              onSelect={(_, label) => setDrugName(label)}
            />
            <p className="text-[11px] text-text-muted">
              {drugName ? drugName : 'Selecciona un medicamento para ver su descripción'}
            </p>
          </div>

          {/* Dosis */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Dosis</label>
            <input
              value={dose}
              onChange={e => setDose(e.target.value)}
              placeholder="Ej.: 5 mg, 20 mg, 10 ml"
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>

          {/* Indicaciones */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Indicaciones</label>
            <textarea
              rows={3}
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Ej.: Tomar 1 tableta por vía oral dos veces al día con alimentos"
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-y"
            />
          </div>

          {/* Cantidad / Unidad / Reposiciones */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm text-text-2">Cantidad a dispensar</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-text-2">Unidad de dispensación</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              >
                <option value="">Selecciona una opción</option>
                {DISPENSE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-text-2">Reposiciones</label>
              <select
                value={refills}
                onChange={e => setRefills(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              >
                {REFILL_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Fecha de inicio + checkboxes */}
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <label className="text-sm text-text-2">Fecha de inicio</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand [color-scheme:dark]"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input type="checkbox" checked={autoExpire} onChange={e => setAutoExpire(e.target.checked)} className="accent-brand" />
              <span className="text-sm text-text-2">Expiración automática</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input type="checkbox" checked={autoRenew} onChange={e => setAutoRenew(e.target.checked)} className="accent-brand" />
              <span className="text-sm text-text-2">Renovación automática</span>
            </label>
          </div>

          {/* Prescrito por */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Prescrito por</label>
            <SearchDropdown
              value={prescribedBy}
              placeholder="Selecciona el médico que prescribe"
              options={doctorOptions}
              onSearch={handleDoctorSearch}
              onSelect={(id, label) => { setPrescribedById(id); setPrescribedBy(label); }}
            />
          </div>

          {/* Diagnóstico */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Diagnóstico</label>
            <SearchDropdown
              value={diagLabel}
              placeholder="Selecciona un diagnóstico"
              options={diagOptions}
              onSearch={handleDiagSearch}
              onSelect={(_, label) => {
                const [code, ...rest] = label.split(' - ');
                setDiagCode(code.trim());
                setDiagLabel(rest.join(' - ').trim());
              }}
            />
            <p className="text-[11px] text-text-muted">
              {diagLabel ? diagLabel : 'Selecciona un diagnóstico para ver su descripción'}
            </p>
          </div>

          {/* Farmacia */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Nombre de la farmacia</label>
            <input
              value={pharmacy}
              onChange={e => setPharmacy(e.target.value)}
              placeholder="Nombre de la farmacia"
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Nota para la farmacia</label>
            <textarea
              rows={3}
              value={pharmacyNote}
              onChange={e => setPharmacyNote(e.target.value)}
              placeholder="Instrucciones especiales para la farmacia..."
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-y"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || !drugName}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Crear prescripción'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add surgery dialog ─────────────────────────────────────────────────────

function AddSurgeryDialog({
  patientId, existing, open, onClose, onSaved,
}: {
  patientId: string;
  existing:  MedicalHistoryData['surgeries'];
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [procedure, setProcedure]    = useState('');
  const [year,      setYear]         = useState('');
  const [notes,     setNotes]        = useState('');

  function handleSave() {
    if (!procedure.trim()) return;
    const newItem = {
      id:        crypto.randomUUID(),
      procedure: procedure.trim(),
      date:      year.trim() || undefined,
      notes:     notes.trim() || undefined,
    };
    const updated = [...(existing ?? []), newItem];
    startTransition(async () => {
      await updateMedicalHistory(patientId, { surgeries: updated });
      onSaved?.({ surgeries: updated });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">
            Agregar procedimiento quirúrgico
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Agregar un nuevo procedimiento quirúrgico al historial del paciente
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Nombre del procedimiento</label>
            <input
              autoFocus
              value={procedure}
              onChange={e => setProcedure(e.target.value)}
              placeholder="ej., Apendicectomía"
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Año</label>
            <input
              value={year}
              onChange={e => setYear(e.target.value)}
              placeholder="ej., 2018"
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Comentarios</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalles adicionales sobre el procedimiento"
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-y"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || !procedure.trim()}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add provider history dialog ────────────────────────────────────────────

function AddProviderDialog({
  patientId, existing, open, onClose, onSaved,
}: {
  patientId: string;
  existing:  MedicalHistoryData['providers'];
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const [doctorOptions,    setDoctorOptions]    = useState<Array<{ id: string; label: string }>>([]);
  const [providerName,     setProviderName]     = useState('');
  const [providerId,       setProviderId]       = useState('');

  const [specOptions,      setSpecOptions]      = useState<Array<{ id: string; label: string }>>([]);
  const [specialty,        setSpecialty]        = useState('');

  const [lastVisit,        setLastVisit]        = useState('');

  useEffect(() => {
    searchDoctors('').then(rows => setDoctorOptions(rows.map(r => ({ id: r.id, label: r.name }))));
    searchSpecialties('').then(rows => setSpecOptions(rows.map(r => ({ id: r.id, label: r.name }))));
  }, []);

  function handleSave() {
    if (!providerName) return;
    const newItem = {
      id:        crypto.randomUUID(),
      name:      providerName,
      specialty: specialty || undefined,
      notes:     lastVisit ? `Última visita: ${lastVisit}` : undefined,
    };
    const updated = [...(existing ?? []), newItem];
    startTransition(async () => {
      await updateMedicalHistory(patientId, { providers: updated });
      onSaved?.({ providers: updated });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">
            Agregar historial de proveedor
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Registrar la información del proveedor de salud y la fecha de su última visita.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">

          {/* Nombre del proveedor */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Nombre del proveedor</label>
            <SearchDropdown
              value={providerName}
              placeholder="Selecciona una opción"
              options={doctorOptions}
              onSearch={q => searchDoctors(q).then(rows => setDoctorOptions(rows.map(r => ({ id: r.id, label: r.name }))))}
              onSelect={(id, label) => { setProviderId(id); setProviderName(label); }}
            />
          </div>

          {/* Especialidad */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Especialidad</label>
            <SearchDropdown
              value={specialty}
              placeholder="Selecciona una opción"
              options={specOptions}
              onSearch={q => searchSpecialties(q).then(rows => setSpecOptions(rows.map(r => ({ id: r.id, label: r.name }))))}
              onSelect={(_, label) => setSpecialty(label)}
            />
          </div>

          {/* Fecha de última visita — mm/dd/yyyy */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Fecha de última visita</label>
            <input
              type="date"
              value={lastVisit}
              onChange={e => setLastVisit(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand [color-scheme:dark]"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || !providerName}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Vaccines edit dialog ───────────────────────────────────────────────────

function VaccinesEditDialog({
  patientId, initial, open, onClose, onSaved,
}: {
  patientId: string;
  initial:   string[] | undefined;
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<string[]>(initial?.length ? [...initial] : ['']);

  function addRow()                       { setItems(prev => [...prev, '']); }
  function removeRow(i: number)           { setItems(prev => prev.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, v: string){ setItems(prev => prev.map((x, idx) => idx === i ? v : x)); }

  function handleSave() {
    const vaccines = items.map(s => s.trim()).filter(Boolean);
    startTransition(async () => {
      await updateMedicalHistory(patientId, { vaccines });
      onSaved?.({ vaccines });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">Vacunas</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Agregar o actualizar los registros de vacunación del paciente. Incluir nombres de vacunas y refuerzos relevantes.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {items.map((val, i) => (
            <div key={i} className="space-y-1">
              <label className="text-xs text-text-muted">Vacuna {i + 1}</label>
              <div className="flex items-center gap-2">
                <input
                  value={val}
                  onChange={e => updateRow(i, e.target.value)}
                  autoFocus={i === items.length - 1 && i > 0}
                  className="flex-1 bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="p-1.5 rounded text-text-muted hover:text-rose transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-2 text-sm text-text-2 hover:border-brand hover:text-brand transition-colors"
          >
            <Plus className="w-4 h-4" /> Agregar vacuna
          </button>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Cognitive status edit dialog ───────────────────────────────────────────

type CognitiveEntry = { name: string; status: string };

function CognitiveEditDialog({
  patientId, initial, open, onClose, onSaved,
}: {
  patientId: string;
  initial:   CognitiveEntry[] | undefined;
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState<CognitiveEntry[]>(
    initial?.length ? [...initial] : [{ name: '', status: '' }]
  );

  function addEntry()              { setEntries(p => [...p, { name: '', status: '' }]); }
  function removeEntry(i: number)  { setEntries(p => p.filter((_, idx) => idx !== i)); }
  function update(i: number, field: 'name' | 'status', v: string) {
    setEntries(p => p.map((e, idx) => idx === i ? { ...e, [field]: v } : e));
  }

  function handleSave() {
    const cognitiveStatus = entries.filter(e => e.name.trim() || e.status.trim());
    startTransition(async () => {
      await updateMedicalHistory(patientId, { cognitiveStatus });
      onSaved?.({ cognitiveStatus });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">Estado cognitivo</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Actualizar la información del estado cognitivo del paciente. Puede agregar, editar o eliminar entradas según sea necesario.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {entries.map((entry, i) => (
            <div key={i} className="rounded-md border border-border/60 bg-bg-2/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-1">Entrada {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeEntry(i)}
                  className="p-1 rounded text-text-muted hover:text-rose transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-text-muted">Nombre cognitivo</label>
                  <input
                    value={entry.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    placeholder="ej., Memoria, Atención, Lenguaje"
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-muted">Estado</label>
                  <input
                    value={entry.status}
                    onChange={e => update(i, 'status', e.target.value)}
                    placeholder="ej., Normal, Deteriorado, Mejorando"
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addEntry}
            className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-2 text-sm text-text-2 hover:border-brand hover:text-brand transition-colors"
          >
            <Plus className="w-4 h-4" /> Agregar estado cognitivo
          </button>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Functional status edit dialog ──────────────────────────────────────────

function FunctionalEditDialog({
  patientId, initial, open, onClose, onSaved,
}: {
  patientId: string;
  initial:   Array<{ name: string; status: string }> | undefined;
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState(
    initial?.length ? [...initial] : [{ name: '', status: '' }]
  );

  function addEntry()             { setEntries(p => [...p, { name: '', status: '' }]); }
  function removeEntry(i: number) { setEntries(p => p.filter((_, idx) => idx !== i)); }
  function update(i: number, field: 'name' | 'status', v: string) {
    setEntries(p => p.map((e, idx) => idx === i ? { ...e, [field]: v } : e));
  }

  function handleSave() {
    const functionalStatus = entries.filter(e => e.name.trim() || e.status.trim());
    startTransition(async () => {
      await updateMedicalHistory(patientId, { functionalStatus });
      onSaved?.({ functionalStatus });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">Estado funcional</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Actualizar la información del estado funcional del paciente. Puede agregar, editar o eliminar entradas según sea necesario.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {entries.map((entry, i) => (
            <div key={i} className="rounded-md border border-border/60 bg-bg-2/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-1">Entrada {i + 1}</span>
                <button type="button" onClick={() => removeEntry(i)} className="p-1 rounded text-text-muted hover:text-rose transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-text-muted">Nombre funcional</label>
                  <input
                    value={entry.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    placeholder="ej., Movilidad, Autocuidado"
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-muted">Estado</label>
                  <input
                    value={entry.status}
                    onChange={e => update(i, 'status', e.target.value)}
                    placeholder="ej., Independiente, Necesita asistencia"
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>
          ))}

          <button type="button" onClick={addEntry} className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-2 text-sm text-text-2 hover:border-brand hover:text-brand transition-colors">
            <Plus className="w-4 h-4" /> Agregar estado funcional
          </button>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={handleSave} disabled={isPending} className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors">
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Implanted devices edit dialog ──────────────────────────────────────────

function DevicesEditDialog({
  patientId, initial, open, onClose, onSaved,
}: {
  patientId: string;
  initial:   string[] | undefined;
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<string[]>(initial?.length ? [...initial] : ['']);

  function addRow()                        { setItems(p => [...p, '']); }
  function removeRow(i: number)            { setItems(p => p.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, v: string) { setItems(p => p.map((x, idx) => idx === i ? v : x)); }

  function handleSave() {
    const implantedDevices = items.map(s => s.trim()).filter(Boolean);
    startTransition(async () => {
      await updateMedicalHistory(patientId, { implantedDevices });
      onSaved?.({ implantedDevices });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">Dispositivos implantados</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Actualizar la lista de dispositivos implantados para este paciente. Puede agregar o eliminar dispositivos según sea necesario.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {items.map((val, i) => (
            <div key={i} className="space-y-1">
              <label className="text-xs text-text-muted">Dispositivo {i + 1}</label>
              <div className="flex items-center gap-2">
                <input
                  value={val}
                  onChange={e => updateRow(i, e.target.value)}
                  placeholder="Ingrese el dispositivo implantado"
                  className="flex-1 bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                />
                <button type="button" onClick={() => removeRow(i)} className="p-1.5 rounded text-text-muted hover:text-rose transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addRow} className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-2 text-sm text-text-2 hover:border-brand hover:text-brand transition-colors">
            <Plus className="w-4 h-4" /> Agregar dispositivo
          </button>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={handleSave} disabled={isPending} className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors">
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Systems review edit dialog ─────────────────────────────────────────────

function SystemsReviewEditDialog({
  patientId, initial, open, onClose, onSaved,
}: {
  patientId: string;
  initial:   string[] | undefined;
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<string[]>(initial?.length ? [...initial] : ['']);

  function addRow()                        { setItems(p => [...p, '']); }
  function removeRow(i: number)            { setItems(p => p.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, v: string) { setItems(p => p.map((x, idx) => idx === i ? v : x)); }

  function handleSave() {
    const systemsReview = items.map(s => s.trim()).filter(Boolean);
    startTransition(async () => {
      await updateMedicalHistory(patientId, { systemsReview });
      onSaved?.({ systemsReview });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">Revisión de sistemas</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Registrar cualquier síntoma o inquietud identificada durante la revisión sistemática de los sistemas del cuerpo.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {items.map((val, i) => (
            <div key={i} className="space-y-1">
              <label className="text-xs text-text-muted">Revisión de sistema {i + 1}</label>
              <div className="flex items-center gap-2">
                <input
                  value={val}
                  onChange={e => updateRow(i, e.target.value)}
                  placeholder="ej., Cardiovascular - dolor en el pecho, Respiratorio - falta de aire"
                  className="flex-1 bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                />
                <button type="button" onClick={() => removeRow(i)} className="p-1.5 rounded text-text-muted hover:text-rose transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addRow} className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-2 text-sm text-text-2 hover:border-brand hover:text-brand transition-colors">
            <Plus className="w-4 h-4" /> Agregar revisión de sistema
          </button>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={handleSave} disabled={isPending} className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors">
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Health exams edit dialog ───────────────────────────────────────────────

function HealthExamsEditDialog({
  patientId, initial, open, onClose, onSaved,
}: {
  patientId: string;
  initial:   MedicalHistoryData['healthExams'];
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [bloodTestDate,   setBloodTestDate]   = useState(initial?.bloodTestDate   ?? '');
  const [normalResults,   setNormalResults]   = useState(initial?.normalResults   ?? false);
  const [colonoscopyYear, setColonoscopyYear] = useState(initial?.colonoscopyYear ?? '');
  const [abnormal,        setAbnormal]        = useState(initial?.abnormal        ?? false);

  function handleSave() {
    startTransition(async () => {
      await updateMedicalHistory(patientId, {
        healthExams: { bloodTestDate, normalResults, colonoscopyYear, abnormal },
      });
      onSaved?.({ healthExams: { bloodTestDate, normalResults, colonoscopyYear, abnormal } });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">Actualizar exámenes de salud</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Registrar las pruebas de detección de salud del paciente, incluyendo fechas, ubicaciones y resultados.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          <div className="rounded-md border border-border/60 bg-bg-2/40 p-4 space-y-4">
            <p className="text-sm font-semibold text-text-1">Exámenes médicos generales</p>

            <div className="grid grid-cols-2 gap-3">
              {/* Fecha de análisis de sangre */}
              <div className="space-y-1.5">
                <label className="text-xs text-text-muted">Fecha de análisis de sangre</label>
                <input
                  type="date"
                  value={bloodTestDate}
                  onChange={e => setBloodTestDate(e.target.value)}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
                />
              </div>

              {/* Resultados normales toggle */}
              <div className="flex items-end pb-1">
                <ToggleRow
                  label="Resultados normales"
                  checked={normalResults}
                  onChange={setNormalResults}
                />
              </div>

              {/* Año de colonoscopia */}
              <div className="space-y-1.5">
                <label className="text-xs text-text-muted">Año de colonoscopia</label>
                <input
                  value={colonoscopyYear}
                  onChange={e => setColonoscopyYear(e.target.value)}
                  placeholder="ej., 2026"
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                />
              </div>

              {/* Anormal toggle */}
              <div className="flex items-end pb-1">
                <ToggleRow
                  label="Anormal"
                  checked={abnormal}
                  onChange={setAbnormal}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={handleSave} disabled={isPending} className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors">
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add comment dialog ─────────────────────────────────────────────────────

function AddCommentDialog({
  patientId, existing, open, onClose, onSaved,
}: {
  patientId: string;
  existing:  MedicalHistoryData['comments'];
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState('');

  function handleSave() {
    if (!text.trim()) return;
    const now = new Date();
    const date = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const newComment = { id: crypto.randomUUID(), date, text: text.trim() };
    const newComments = [...(existing ?? []), newComment];
    startTransition(async () => {
      await updateMedicalHistory(patientId, { comments: newComments });
      onSaved?.({ comments: newComments });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">Agregar comentario al historial</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Proporcione los detalles del nuevo comentario que se agregará al historial médico.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Comentario</label>
            <textarea
              autoFocus
              rows={5}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Escriba su comentario aquí"
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-y"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || !text.trim()}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Agregar comentario'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add family history dialog ──────────────────────────────────────────────

const FAMILY_MEMBERS = [
  'Padre','Madre','Hijo','Hija','Hermano','Hermana',
  'Abuelo materno','Abuela materna','Abuelo paterno','Abuela paterna',
  'Tío','Tía','Sobrino','Sobrina','Primo(a)','Nieto','Nieta',
  'Esposo(a)/Pareja','Padrastro/Madrastra','Medio hermano(a)',
  'Padre/Madre adoptivo(a)','Otro',
];

function AddFamilyHistoryDialog({
  patientId, existing, open, onClose, onSaved,
}: {
  patientId: string;
  existing:  MedicalHistoryData['familyHistory'];
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const [memberQuery,   setMemberQuery]   = useState('');
  const [relation,      setRelation]      = useState('');
  const [memberOpen,    setMemberOpen]    = useState(false);

  const [diagOptions,   setDiagOptions]   = useState<Array<{ id: string; label: string }>>([]);
  const [condition,     setCondition]     = useState('');

  useEffect(() => { searchDiagnoses('').then(rows => setDiagOptions(rows.map(r => ({ id: r.id, label: r.label })))); }, []);

  const filteredMembers = FAMILY_MEMBERS.filter(m =>
    m.toLowerCase().includes(memberQuery.toLowerCase())
  );

  function handleSave() {
    if (!relation || !condition) return;
    const newItem = { id: crypto.randomUUID(), relation, condition };
    const updated = [...(existing ?? []), newItem];
    startTransition(async () => {
      await updateMedicalHistory(patientId, { familyHistory: updated });
      onSaved?.({ familyHistory: updated });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">
            Agregar historial familiar
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Registrar la condición médica de un miembro de la familia para rastrear patrones de salud hereditarios.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">

          {/* Miembro de la familia — filtro local */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Miembro de la familia</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMemberOpen(o => !o)}
                className="w-full flex items-center justify-between bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-left focus:outline-none focus:border-brand"
              >
                <span className={relation ? 'text-text-1' : 'text-text-muted'}>
                  {relation || 'Selecciona una opción'}
                </span>
                <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
              </button>
              {memberOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-bg-1 shadow-lg">
                  <div className="p-2 border-b border-border/60">
                    <div className="flex items-center gap-2 bg-bg-2 rounded px-2 py-1">
                      <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      <input
                        autoFocus
                        value={memberQuery}
                        onChange={e => setMemberQuery(e.target.value)}
                        placeholder="Buscar..."
                        className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-muted focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {filteredMembers.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setRelation(m); setMemberOpen(false); setMemberQuery(''); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-brand/10 transition-colors
                          ${relation === m ? 'bg-brand/10 text-brand' : 'text-text-2'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Condición — ICD search */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Condición</label>
            <SearchDropdown
              value={condition}
              placeholder="Selecciona una opción"
              options={diagOptions}
              onSearch={q => searchDiagnoses(q).then(rows => setDiagOptions(rows.map(r => ({ id: r.id, label: r.label }))))}
              onSelect={(_, label) => setCondition(label)}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || !relation || !condition}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add history dialog ─────────────────────────────────────────────────────

function AddHistoryDialog({
  patientId, existing, open, onClose, onSaved,
}: {
  patientId: string;
  existing:  MedicalHistoryData['history'];
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [query,     setQuery]        = useState('');
  const [results,   setResults]      = useState<DiagnosisOption[]>([]);
  const [selected,  setSelected]     = useState<DiagnosisOption | null>(null);
  const [dropOpen,  setDropOpen]     = useState(false);
  const [isCurrent, setIsCurrent]   = useState(false);
  const [isResolved, setIsResolved] = useState(false);
  const [diagDate,   setDiagDate]   = useState('');
  const [comments,   setComments]   = useState('');

  useEffect(() => { searchDiagnoses('').then(setResults); }, []);

  function handleQuery(v: string) {
    setQuery(v);
    searchDiagnoses(v).then(setResults);
  }

  function pick(opt: DiagnosisOption) {
    setSelected(opt);
    setDropOpen(false);
    setQuery('');
  }

  function handleSave() {
    if (!selected) return;
    const status = isCurrent ? 'Actual' : isResolved ? 'Resuelto' : undefined;
    const newItem = {
      id:          crypto.randomUUID(),
      condition:   selected.label,
      diagnosedAt: diagDate || undefined,
      status,
      comments:    comments || undefined,
    };
    const updated = [...(existing ?? []), newItem];
    startTransition(async () => {
      await updateMedicalHistory(patientId, { history: updated });
      onSaved?.({ history: updated });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">
            Agregar historial médico personal
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Agregar una nueva condición médica al historial del paciente
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Condición</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropOpen(o => !o)}
                className="w-full flex items-center justify-between bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-left focus:outline-none focus:border-brand"
              >
                <span className={selected ? 'text-text-1' : 'text-text-muted'}>
                  {selected ? selected.label : 'Seleccionar una condición'}
                </span>
                <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
              </button>
              {dropOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-bg-1 shadow-lg">
                  <div className="p-2 border-b border-border/60">
                    <div className="flex items-center gap-2 bg-bg-2 rounded px-2 py-1">
                      <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      <input
                        autoFocus
                        value={query}
                        onChange={e => handleQuery(e.target.value)}
                        placeholder="Buscar..."
                        className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-muted focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {results.length === 0
                      ? <p className="px-3 py-3 text-xs text-text-muted text-center">Sin resultados</p>
                      : results.map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => pick(opt)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-brand/10 transition-colors
                              ${selected?.id === opt.id ? 'bg-brand/10 text-brand' : 'text-text-2'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-bg-2/40 p-4 space-y-3">
            <p className="text-sm font-semibold text-text-1">Estado</p>
            <div className="grid grid-cols-2 gap-3">
              <ToggleRow label="Actual"   checked={isCurrent}  onChange={setIsCurrent} />
              <ToggleRow label="Resuelto" checked={isResolved} onChange={setIsResolved} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-muted">Diagnosticado el</label>
              <input
                type="date"
                value={diagDate}
                onChange={e => setDiagDate(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-text-2">Comentarios</label>
            <textarea
              rows={3}
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Notas o detalles adicionales"
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-y"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || !selected}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main content (reusable inline or inside dialog) ────────────────────────

export interface MedicalHistoryContentProps { patient: PatientRow }

export function MedicalHistoryContent({ patient }: MedicalHistoryContentProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editVisitInfo,  setEditVisitInfo]  = useState(false);
  const [editHealthInfo, setEditHealthInfo] = useState(false);
  const [addProblem,      setAddProblem]      = useState(false);
  const [addHistory,      setAddHistory]      = useState(false);
  const [addMedication,   setAddMedication]   = useState(false);
  const [addSurgery,       setAddSurgery]       = useState(false);
  const [addFamilyHistory, setAddFamilyHistory] = useState(false);
  const [addProvider,      setAddProvider]      = useState(false);
  const [editVaccines,     setEditVaccines]     = useState(false);
  const [editCognitive,    setEditCognitive]    = useState(false);
  const [editFunctional,   setEditFunctional]   = useState(false);
  const [editDevices,      setEditDevices]      = useState(false);
  const [editSystems,      setEditSystems]      = useState(false);
  const [editExams,        setEditExams]        = useState(false);
  const [addComment,       setAddComment]       = useState(false);

  const [mh, setMh] = useState<MedicalHistoryData>(() => (patient.medicalHistory ?? {}) as MedicalHistoryData);
  const onSaved = (patch: Partial<MedicalHistoryData>) => setMh(prev => ({ ...prev, ...patch }));
  const insurances = (patient.latestCase?.consentsData as Record<string, unknown> | null)?.insurances as Array<Record<string, string>> | undefined;

  const age    = calcAge(patient.dateOfBirth);
  const dobStr = fmtDOB(patient.dateOfBirth);

  // Sidebar section label maps
  const SEX_LABEL: Record<string, string> = {
    MALE: 'Masculino', FEMALE: 'Femenino', NON_BINARY: 'No binario',
    OTHER: 'Otro', PREFER_NOT_TO_SAY: 'Prefiero no decir',
  };
  const MARITAL_LABEL: Record<string, string> = {
    SINGLE: 'Soltero/a', MARRIED: 'Casado/a', DIVORCED: 'Divorciado/a',
    WIDOWED: 'Viudo/a', SEPARATED: 'Separado/a', OTHER: 'Otro',
  };
  const LANG_LABEL: Record<string, string> = {
    es: 'Español', en: 'Inglés', fr: 'Francés', it: 'Italiano', pt: 'Portugués', other: 'Otro',
  };

  return (
    <>
        {/* ── Body: left panel + main ── */}
        <div className="flex min-h-0 overflow-hidden w-full relative">

          {/* Mobile sidebar toggle button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(v => !v)}
            className="md:hidden absolute top-2 right-2 z-20 flex items-center gap-1.5 h-7 px-2.5 rounded border border-border bg-bg-1 text-text-2 text-[11px] hover:bg-bg-2 transition-colors"
          >
            <User className="w-3 h-3" />
            {sidebarOpen ? 'Cerrar' : 'Ver datos'}
          </button>

          {/* Mobile overlay backdrop */}
          {sidebarOpen && (
            <div
              className="md:hidden fixed inset-0 z-10 bg-black/50"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* ════ Left sidebar ════ */}
          <div className={`
            shrink-0 border-r border-border overflow-y-auto bg-bg-1
            md:w-72 md:static md:z-auto md:translate-x-0
            ${sidebarOpen
              ? 'fixed inset-y-0 left-0 z-20 w-72 translate-x-0'
              : 'hidden md:block'}
          `}>

            {/* Patient avatar */}
            <div className="px-4 py-4 border-b border-border/60 flex items-center gap-3">
              <PersonAvatar
                firstName={patient.firstName}
                lastName={patient.lastName}
                size={10}
              />
              <div>
                <p className="text-sm font-semibold text-text-1">{patient.lastName}, {patient.firstName}</p>
                <p className="text-[10px] text-text-muted">{patient.patientCode}</p>
              </div>
            </div>

            {/* Personal info */}
            <SideSection icon={<User className="w-3.5 h-3.5" />} title="Información personal">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] text-text-muted">Fecha de nacimiento:</span>
                <span className="text-[11px] text-text-1">{dobStr}</span>
                {age !== null && (
                  <span className="bg-emerald/20 text-emerald text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {age} años
                  </span>
                )}
              </div>
              <SideRow label="Sexo"        value={patient.sex ? (SEX_LABEL[patient.sex] ?? patient.sex) : null} />
              <SideRow label="Estado civil" value={patient.maritalStatus ? (MARITAL_LABEL[patient.maritalStatus] ?? patient.maritalStatus) : null} />
              <SideRow label="Idioma"      value={patient.preferredLanguage ? (LANG_LABEL[patient.preferredLanguage] ?? patient.preferredLanguage) : null} />
            </SideSection>

            {/* Contact */}
            <SideSection icon={<Phone className="w-3.5 h-3.5" />} title="Información de contacto">
              <SideRow label="Teléfono"          value={patient.phone} />
              <SideRow label="Celular"           value={patient.phone2} />
              <SideRow label="Correo electrónico" value={patient.email} />
            </SideSection>

            {/* Emergency + additional */}
            <SideSection icon={<AlertTriangle className="w-3.5 h-3.5" />} title="Emergencia y adicional">
              <SideRow label="Emergencia"  value={patient.emergencyContactName} />
              <SideRow label="Referido por" value={patient.referralSource} />
              <SideRow label="Farmacia"    value={patient.preferredPharmacy} />
              <SideRow label="Empleador"   value={patient.employer} />
              <SideRow label="Proveedor"   value={mh.providers?.[0]?.name ?? null} />
            </SideSection>

            {/* Insurance */}
            <SideSection icon={<Shield className="w-3.5 h-3.5" />} title="Detalles del seguro" defaultOpen={false}>
              {insurances && insurances.length > 0 ? (
                insurances.map((ins, i) => (
                  <div key={i} className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2 space-y-0.5 mb-2 last:mb-0">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                      {ins.insType === 'MEDICAL' ? 'Seguro médico' : 'Seguro de auto'}
                    </p>
                    <p className="text-[11px] text-text-1 font-medium">{ins.carrier || 'Sin nombre'}</p>
                    {ins.policyId && <p className="text-[10px] text-text-muted">Póliza: {ins.policyId}</p>}
                  </div>
                ))
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">Seguro principal</p>
                  <EmptyState text="No hay seguro principal registrado" />
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mt-2 mb-1">Seguro secundario</p>
                  <EmptyState text="No hay seguro secundario registrado" />
                </>
              )}
            </SideSection>

            {/* Allergies */}
            <SideSection icon={<AlertTriangle className="w-3.5 h-3.5" />} title="Alergias" editBtn defaultOpen={false}>
              <EmptyState text={mh.allergies ?? 'No se conocen alergias a medicamentos'} />
            </SideSection>

            {/* Problems list (sidebar) */}
            <SideSection icon={<Heart className="w-3.5 h-3.5" />} title="Lista de problemas" defaultOpen={false}>
              {(mh.problems?.length ?? 0) > 0
                ? mh.problems!.map(p => (
                    <div key={p.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{p.condition}</div>
                  ))
                : <EmptyState text="No hay problemas activos" />}
            </SideSection>

            {/* Active medications */}
            <SideSection icon={<Pill className="w-3.5 h-3.5" />} title="Medicamentos activos" defaultOpen={false}>
              {(mh.medications?.length ?? 0) > 0
                ? mh.medications!.map(m => (
                    <div key={m.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{m.name}</div>
                  ))
                : <EmptyState text="No hay medicamentos activos" />}
            </SideSection>

            {/* Surgeries */}
            <SideSection icon={<Scissors className="w-3.5 h-3.5" />} title="Cirugías y procedimientos" defaultOpen={false}>
              {(mh.surgeries?.length ?? 0) > 0
                ? mh.surgeries!.map(s => (
                    <div key={s.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{s.procedure}</div>
                  ))
                : <EmptyState text="No hay procedimientos quirúrgicos" />}
            </SideSection>

            {/* Family history */}
            <SideSection icon={<Users className="w-3.5 h-3.5" />} title="Antecedentes familiares" defaultOpen={false}>
              {(mh.familyHistory?.length ?? 0) > 0
                ? mh.familyHistory!.map(f => (
                    <div key={f.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{f.relation}: {f.condition}</div>
                  ))
                : <EmptyState text="No hay antecedentes familiares" />}
            </SideSection>

            {/* Social history */}
            <SideSection icon={<MessageSquare className="w-3.5 h-3.5" />} title="Historia social" editBtn defaultOpen={false}>
              <div className="space-y-2">
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">Trabajo y familia</p>
                  <SideRow label="Trabajo" value={mh.socialHistory?.work} />
                  <SideRow label="Hijos"   value={mh.socialHistory?.children} />
                </div>
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Cigarette className="w-3 h-3 text-text-muted" />
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted">Uso de tabaco</p>
                  </div>
                  <SideRow label="Estado" value={mh.socialHistory?.tobacco} />
                </div>
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wine className="w-3 h-3 text-text-muted" />
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted">Uso de alcohol</p>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-muted">Estado:</span>
                    {mh.socialHistory?.alcohol
                      ? <TagPill label={mh.socialHistory.alcohol} colorClass="bg-amber/10 text-amber border-amber/20" />
                      : <span className="text-text-muted">N/D</span>}
                  </div>
                </div>
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FlaskConical className="w-3 h-3 text-text-muted" />
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted">Uso de drogas</p>
                  </div>
                  <SideRow label="Estado" value={mh.socialHistory?.drugs} />
                </div>
              </div>
            </SideSection>

          </div>

          {/* ════ Main content ════ */}
          <div className="flex-1 overflow-y-auto bg-bg-2/30 p-4 space-y-4">

            {/* Row 1: Visit info + Health info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Información de la visita */}
              <SectionCard
                icon={<User className="w-4 h-4" />}
                title="Información de la visita"
                editBtn
                onEdit={() => setEditVisitInfo(true)}
              >
                <div className="space-y-2 text-[12.5px]">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Referido por:</span>
                    <span className="text-text-1">{mh.visitInfo?.referredBy || 'N/D'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Razón principal:</span>
                    <span className="text-text-1">{mh.visitInfo?.mainReason || 'N/D'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Otras inquietudes:</span>
                    <span className="text-text-1">{mh.visitInfo?.otherConcerns || 'N/D'}</span>
                  </div>
                </div>
              </SectionCard>

              {/* Información de salud */}
              <SectionCard
                icon={<Activity className="w-4 h-4" />}
                title="Información de salud"
                editBtn
                onEdit={() => setEditHealthInfo(true)}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border/60 bg-bg-2/40 p-3">
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">Metas de salud</p>
                    <p className="text-[11px] text-text-2">{mh.healthInfo?.goals || 'No hay metas establecidas'}</p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-bg-2/40 p-3">
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">Autoevaluación</p>
                    <p className="text-[11px] text-text-2">
                      {mh.healthInfo?.selfRating != null ? `${mh.healthInfo.selfRating}/5` : 'Sin calificación'}
                    </p>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* Lista de problemas */}
            <SectionCard
              icon={<Heart className="w-4 h-4" />}
              title="Lista de problemas"
              count={mh.problems?.length ?? 0}
              onAdd={() => setAddProblem(true)}
            >
              <TableShell
                headers={['Condición', 'Diagnosticado el', 'Estado', 'Comentarios', 'Acciones']}
                rows={(mh.problems ?? []).map(p => [
                  p.condition,
                  p.diagnosedAt ?? '—',
                  p.status ? <TagPill label={p.status} colorClass="bg-cyan/10 text-cyan border-cyan/20" /> : '—',
                  p.comments ?? '—',
                  <button key="del" className="text-text-muted hover:text-rose transition-colors text-[10px]">Eliminar</button>,
                ])}
                emptyText="No hay datos para mostrar."
              />
            </SectionCard>

            {/* Historial médico */}
            <SectionCard
              icon={<ClipboardList className="w-4 h-4" />}
              title="Historial médico"
              count={mh.history?.length ?? 0}
              onAdd={() => setAddHistory(true)}
            >
              <TableShell
                headers={['Condición', 'Acciones']}
                rows={(mh.history ?? []).map(h => [
                  h.condition,
                  <button key="del" className="text-text-muted hover:text-rose transition-colors text-[10px]">Eliminar</button>,
                ])}
                emptyText="No hay datos para mostrar."
              />
            </SectionCard>

            {/* Medicamentos */}
            <SectionCard
              icon={<Pill className="w-4 h-4" />}
              title="Medicamentos"
              count={mh.medications?.length ?? 0}
              onAdd={() => setAddMedication(true)}
            >
              <TableShell
                headers={['Medicamento', 'Dosis', 'Indicaciones', 'Prescrito por', 'Acciones']}
                rows={(mh.medications ?? []).map(m => [
                  m.name,
                  m.dose ?? '—',
                  m.instructions ?? '—',
                  m.prescribedBy ?? '—',
                  <button key="del" className="text-text-muted hover:text-rose transition-colors text-[10px]">Eliminar</button>,
                ])}
                emptyText="No hay datos para mostrar."
              />
            </SectionCard>

            {/* Row: Cirugías + Historial familiar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Scissors className="w-4 h-4" />} title="Cirugías y procedimientos" count={mh.surgeries?.length ?? 0} onAdd={() => setAddSurgery(true)}>
                {(mh.surgeries?.length ?? 0) === 0
                  ? <EmptyState text="No hay procedimientos quirúrgicos registrados" />
                  : mh.surgeries!.map(s => (
                      <div key={s.id} className="text-[11px] text-text-2 border-b border-border/40 py-1.5 last:border-0">{s.procedure}</div>
                    ))}
              </SectionCard>

              <SectionCard icon={<Users className="w-4 h-4" />} title="Historial familiar" count={mh.familyHistory?.length ?? 0} onAdd={() => setAddFamilyHistory(true)}>
                {(mh.familyHistory?.length ?? 0) === 0
                  ? <EmptyState text="No hay historial familiar registrado" />
                  : mh.familyHistory!.map(f => (
                      <div key={f.id} className="text-[11px] text-text-2 border-b border-border/40 py-1.5 last:border-0">
                        <span className="text-text-muted">{f.relation}:</span> {f.condition}
                      </div>
                    ))}
              </SectionCard>
            </div>

            {/* Row: Historial de proveedores + Vacunas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Briefcase className="w-4 h-4" />} title="Historial de proveedores" count={mh.providers?.length ?? 0} onAdd={() => setAddProvider(true)}>
                {(mh.providers?.length ?? 0) === 0
                  ? <EmptyState text="No hay historial de proveedores registrado" />
                  : mh.providers!.map(p => (
                      <div key={p.id} className="text-[11px] text-text-2 border-b border-border/40 py-1.5 last:border-0">{p.name}</div>
                    ))}
              </SectionCard>

              <SectionCard icon={<Shield className="w-4 h-4" />} title="Vacunas" editBtn onEdit={() => setEditVaccines(true)}>
                {(mh.vaccines?.length ?? 0) === 0
                  ? <EmptyState text="No hay vacunas registradas" />
                  : <div className="space-y-1">
                      {mh.vaccines!.map((v, i) => (
                        <div key={i} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{v}</div>
                      ))}
                    </div>
                }
              </SectionCard>
            </div>

            {/* Row: Estado cognitivo + Estado funcional */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Brain className="w-4 h-4" />} title="Estado cognitivo" editBtn onEdit={() => setEditCognitive(true)}>
                {(mh.cognitiveStatus?.length ?? 0) === 0
                  ? <EmptyState text="No hay información de estado cognitivo disponible" />
                  : <div className="space-y-1">
                      {mh.cognitiveStatus!.map((e, i) => (
                        <div key={i} className="flex justify-between text-[11px] border-b border-border/40 py-1 last:border-0">
                          <span className="text-text-muted">{e.name}</span>
                          <span className="text-text-2">{e.status}</span>
                        </div>
                      ))}
                    </div>
                }
              </SectionCard>

              <SectionCard icon={<Activity className="w-4 h-4" />} title="Estado funcional" editBtn onEdit={() => setEditFunctional(true)}>
                {(mh.functionalStatus?.length ?? 0) === 0
                  ? <EmptyState text="No hay información de estado funcional disponible" />
                  : <div className="space-y-1">
                      {mh.functionalStatus!.map((e, i) => (
                        <div key={i} className="flex justify-between text-[11px] border-b border-border/40 py-1 last:border-0">
                          <span className="text-text-muted">{e.name}</span>
                          <span className="text-text-2">{e.status}</span>
                        </div>
                      ))}
                    </div>
                }
              </SectionCard>
            </div>

            {/* Row: Dispositivos implantados + Revisión de sistemas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Stethoscope className="w-4 h-4" />} title="Dispositivos implantados" editBtn onEdit={() => setEditDevices(true)}>
                {(mh.implantedDevices?.length ?? 0) === 0
                  ? <EmptyState text="No hay dispositivos implantados registrados" />
                  : <div className="space-y-1">
                      {mh.implantedDevices!.map((d, i) => (
                        <div key={i} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{d}</div>
                      ))}
                    </div>
                }
              </SectionCard>

              <SectionCard icon={<ClipboardList className="w-4 h-4" />} title="Revisión de sistemas" editBtn onEdit={() => setEditSystems(true)}>
                {(mh.systemsReview?.length ?? 0) === 0
                  ? <EmptyState text="No hay revisiones de sistemas registradas" />
                  : <div className="space-y-1">
                      {mh.systemsReview!.map((s, i) => (
                        <div key={i} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{s}</div>
                      ))}
                    </div>
                }
              </SectionCard>
            </div>

            {/* Row: Exámenes de salud + Historial de comentarios */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Activity className="w-4 h-4" />} title="Exámenes de salud" editBtn onEdit={() => setEditExams(true)}>
                {!mh.healthExams
                  ? <EmptyState text="No hay exámenes de salud registrados" />
                  : <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {mh.healthExams.bloodTestDate && <div className="flex justify-between col-span-2"><span className="text-text-muted">Análisis de sangre:</span><span className="text-text-2">{mh.healthExams.bloodTestDate}</span></div>}
                      {mh.healthExams.colonoscopyYear && <div className="flex justify-between col-span-2"><span className="text-text-muted">Colonoscopia:</span><span className="text-text-2">{mh.healthExams.colonoscopyYear}</span></div>}
                      {mh.healthExams.normalResults && <div className="col-span-2 text-emerald">✓ Resultados normales</div>}
                      {mh.healthExams.abnormal && <div className="col-span-2 text-amber">⚠ Anormal</div>}
                    </div>
                }
              </SectionCard>

              <SectionCard
                icon={<MessageSquare className="w-4 h-4" />}
                title="Historial de comentarios"
                count={mh.comments?.length ?? 0}
                onAdd={() => setAddComment(true)}
              >
                {(mh.comments?.length ?? 0) === 0
                  ? <EmptyState text="No hay comentarios disponibles." />
                  : mh.comments!.map(c => (
                      <div key={c.id} className="border-b border-border/40 py-2 last:border-0">
                        <div className="flex justify-between text-[10px] text-text-muted mb-0.5">
                          <span>{c.author ?? 'Sistema'}</span>
                          <span>{c.date}</span>
                        </div>
                        <p className="text-[11px] text-text-2">{c.text}</p>
                      </div>
                    ))}
              </SectionCard>
            </div>

          </div>
        </div>

    {editVisitInfo && (
      <VisitInfoEditDialog
        patientId={patient.id}
        initial={mh.visitInfo}
        open={editVisitInfo}
        onClose={() => setEditVisitInfo(false)}
        onSaved={onSaved}
      />
    )}
    {editHealthInfo && (
      <HealthInfoEditDialog
        patientId={patient.id}
        initial={mh.healthInfo}
        open={editHealthInfo}
        onClose={() => setEditHealthInfo(false)}
        onSaved={onSaved}
      />
    )}
    {addProblem && (
      <AddProblemDialog
        patientId={patient.id}
        existing={mh.problems}
        open={addProblem}
        onClose={() => setAddProblem(false)}
        onSaved={onSaved}
      />
    )}
    {addHistory && (
      <AddHistoryDialog
        patientId={patient.id}
        existing={mh.history}
        open={addHistory}
        onClose={() => setAddHistory(false)}
        onSaved={onSaved}
      />
    )}
    {addComment && (
      <AddCommentDialog
        patientId={patient.id}
        existing={mh.comments}
        open={addComment}
        onClose={() => setAddComment(false)}
        onSaved={onSaved}
      />
    )}
    {editExams && (
      <HealthExamsEditDialog
        patientId={patient.id}
        initial={mh.healthExams}
        open={editExams}
        onClose={() => setEditExams(false)}
        onSaved={onSaved}
      />
    )}
    {editSystems && (
      <SystemsReviewEditDialog
        patientId={patient.id}
        initial={mh.systemsReview}
        open={editSystems}
        onClose={() => setEditSystems(false)}
        onSaved={onSaved}
      />
    )}
    {editDevices && (
      <DevicesEditDialog
        patientId={patient.id}
        initial={mh.implantedDevices}
        open={editDevices}
        onClose={() => setEditDevices(false)}
        onSaved={onSaved}
      />
    )}
    {editFunctional && (
      <FunctionalEditDialog
        patientId={patient.id}
        initial={mh.functionalStatus}
        open={editFunctional}
        onClose={() => setEditFunctional(false)}
        onSaved={onSaved}
      />
    )}
    {editCognitive && (
      <CognitiveEditDialog
        patientId={patient.id}
        initial={mh.cognitiveStatus}
        open={editCognitive}
        onClose={() => setEditCognitive(false)}
        onSaved={onSaved}
      />
    )}
    {editVaccines && (
      <VaccinesEditDialog
        patientId={patient.id}
        initial={mh.vaccines}
        open={editVaccines}
        onClose={() => setEditVaccines(false)}
        onSaved={onSaved}
      />
    )}
    {addProvider && (
      <AddProviderDialog
        patientId={patient.id}
        existing={mh.providers}
        open={addProvider}
        onClose={() => setAddProvider(false)}
        onSaved={onSaved}
      />
    )}
    {addFamilyHistory && (
      <AddFamilyHistoryDialog
        patientId={patient.id}
        existing={mh.familyHistory}
        open={addFamilyHistory}
        onClose={() => setAddFamilyHistory(false)}
        onSaved={onSaved}
      />
    )}
    {addSurgery && (
      <AddSurgeryDialog
        patientId={patient.id}
        existing={mh.surgeries}
        open={addSurgery}
        onClose={() => setAddSurgery(false)}
        onSaved={onSaved}
      />
    )}
    {addMedication && (
      <AddMedicationDialog
        patientId={patient.id}
        existing={mh.medications}
        preferredPharmacy={patient.preferredPharmacy}
        open={addMedication}
        onClose={() => setAddMedication(false)}
        onSaved={onSaved}
      />
    )}
    </>
  );
}

// ── Main dialog (thin wrapper around MedicalHistoryContent) ─────────────────

export function MedicalHistoryDialog({ patient, open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[96vw] w-full max-h-[96vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-3 border-b border-border bg-bg-1 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-text-1 text-base font-semibold">
                {patient.firstName} {patient.lastName}
              </DialogTitle>
              <DialogDescription className="text-text-muted text-xs">
                Historial médico · {patient.patientCode ?? ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <MedicalHistoryContent patient={patient} />
      </DialogContent>
    </Dialog>
  );
}
