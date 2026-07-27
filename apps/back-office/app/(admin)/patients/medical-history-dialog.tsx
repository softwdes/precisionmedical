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
  icon, title, defaultOpen = true, editBtn = false, onEdit, children,
}: {
  icon: React.ReactNode; title: string; defaultOpen?: boolean;
  editBtn?: boolean; onEdit?: () => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/30 last:border-0">
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
              onClick={e => { e.stopPropagation(); onEdit?.(); }}
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

function SideRow({ label, value, na = 'N/A' }: { label: string; value?: string | null; na?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[11px]">
      <span className="text-text-muted shrink-0">{label}:</span>
      <span className="text-text-1 text-right">{value || na}</span>
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
  icon, title, count, onAdd, addLabel = 'Add', editBtn = false, onEdit, children,
}: {
  icon: React.ReactNode; title: string; count?: number;
  onAdd?: () => void; addLabel?: string; editBtn?: boolean; onEdit?: () => void; children: React.ReactNode;
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
              <Plus className="w-3 h-3" /> {addLabel}
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
  headers, rows, emptyText, totalLabel = 'Total records:',
}: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyText: string;
  totalLabel?: string;
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
        {totalLabel} {rows.length}
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
  const t = useTranslations('phoenix.patients');
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
            {t('mh.sub.visitInfoTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.visitInfoDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Visit details */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-text-1">{t('mh.sub.visitDetails')}</p>

            <div className="space-y-1">
              <label className="text-xs text-text-muted">{t('mh.sub.referredBy')}</label>
              <input
                value={form.referredBy}
                onChange={e => set('referredBy', e.target.value)}
                placeholder={t('mh.sub.referredByPlaceholder')}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-text-muted">{t('mh.sub.mainReasonLabel')}</label>
              <input
                value={form.mainReason}
                onChange={e => set('mainReason', e.target.value)}
                placeholder={t('mh.sub.mainReasonPlaceholder')}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-text-muted">{t('mh.sub.otherConcernsLabel')}</label>
              <input
                value={form.otherConcerns}
                onChange={e => set('otherConcerns', e.target.value)}
                placeholder={t('mh.sub.otherConcernsPlaceholder')}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* Medication status */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-1">{t('mh.sub.medStatusSection')}</p>
            <ToggleRow
              label={t('mh.sub.noCurrentMeds')}
              checked={form.noCurrentMeds}
              onChange={v => set('noCurrentMeds', v)}
            />
            <ToggleRow
              label={t('mh.sub.broughtMedList')}
              checked={form.broughtMedList}
              onChange={v => set('broughtMedList', v)}
            />
            <ToggleRow
              label={t('mh.sub.noSignificantHistory')}
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
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
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
  const t = useTranslations('phoenix.patients');
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
            {t('mh.sub.healthInfoTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.healthInfoDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.healthGoalsLabel')}</label>
            <input
              value={goals}
              onChange={e => setGoals(e.target.value)}
              placeholder={t('mh.sub.healthGoalsPlaceholder')}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-text-2">{t('mh.sub.selfRatingLabel')}</label>
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
                <span className="text-sm text-text-2">{t('mh.sub.na')}</span>
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
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
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
  const t = useTranslations('phoenix.patients');
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
            {t('mh.sub.addProblemTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.addProblemDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Condition — searchable dropdown */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.condition')}</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropOpen(o => !o)}
                className="w-full flex items-center justify-between bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-left focus:outline-none focus:border-brand"
              >
                <span className={selected ? 'text-text-1' : 'text-text-muted'}>
                  {selected ? selected.label : t('mh.sub.selectCondition')}
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
                        placeholder={t('mh.sub.search')}
                        className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-muted focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {results.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-text-muted text-center">{t('mh.sub.noResults')}</p>
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

          {/* Status */}
          <div className="rounded-md border border-border/60 bg-bg-2/40 p-4 space-y-3">
            <p className="text-sm font-semibold text-text-1">{t('mh.sub.status')}</p>
            <div className="grid grid-cols-2 gap-3">
              <ToggleRow label={t('mh.sub.current')}  checked={isCurrent}  onChange={setIsCurrent} />
              <ToggleRow label={t('mh.sub.resolved')} checked={isResolved} onChange={setIsResolved} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-muted">{t('mh.sub.diagnosedAt')}</label>
              <input
                type="date"
                value={diagDate}
                onChange={e => setDiagDate(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.comments')}</label>
            <textarea
              rows={3}
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder={t('mh.sub.additionalNotes')}
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
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared: simple searchable dropdown ────────────────────────────────────

function SearchDropdown({
  value, placeholder, options, onSearch, onSelect,
  searchPlaceholder = 'Search...', emptyText = 'No results',
}: {
  value:              string;
  placeholder:        string;
  options:            Array<{ id: string; label: string; badge?: string }>;
  onSearch:           (q: string) => void;
  onSelect:           (id: string, label: string) => void;
  searchPlaceholder?: string;
  emptyText?:         string;
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
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-muted focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {options.length === 0
              ? <p className="px-3 py-3 text-xs text-text-muted text-center">{emptyText}</p>
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
  const t = useTranslations('phoenix.patients');
  const DISPENSE_UNITS = [
    t('mh.sub.unit.tablets'), t('mh.sub.unit.capsules'), t('mh.sub.unit.ml'),
    t('mh.sub.unit.mg'), t('mh.sub.unit.grams'), t('mh.sub.unit.units'),
    t('mh.sub.unit.inhalations'), t('mh.sub.unit.drops'), t('mh.sub.unit.patches'),
  ];
  const REFILL_OPTIONS = [
    t('mh.sub.refill.none'), t('mh.sub.refill.1'), t('mh.sub.refill.2'),
    t('mh.sub.refill.3'), t('mh.sub.refill.4'), t('mh.sub.refill.5'),
    t('mh.sub.refill.6'), t('mh.sub.refill.unlimited'),
  ];
  const CATEGORY_BADGE: Record<string, string> = {
    NSAID: 'NSAID',
    RELAXANT: t('mh.sub.cat.relaxant'), OPIOID: t('mh.sub.cat.opioid'),
    NEURO: t('mh.sub.cat.neuro'), TOPICAL: t('mh.sub.cat.topical'),
    STEROID: t('mh.sub.cat.steroid'), OTHER: t('mh.sub.cat.other'),
  };

  const [isPending, startTransition] = useTransition();

  // Status
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
  const [refills,  setRefills]  = useState(() => t('mh.sub.refill.none'));

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
          <DialogTitle className="text-base font-semibold text-text-1">{t('mh.sub.newPrescriptionTitle')}</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.newPrescriptionDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Status */}
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
                <span className="text-sm text-text-2">{s === 'IN_USE' ? t('mh.sub.inUse') : t('mh.sub.medHistoryLabel')}</span>
              </label>
            ))}
          </div>

          {/* Medication */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.medicationLabel')}</label>
            <SearchDropdown
              value={drugName}
              placeholder={t('mh.sub.selectMedication')}
              options={drugOptions}
              onSearch={handleDrugSearch}
              onSelect={(_, label) => setDrugName(label)}
              searchPlaceholder={t('mh.sub.search')}
              emptyText={t('mh.sub.noResults')}
            />
            <p className="text-[11px] text-text-muted">
              {drugName ? drugName : t('mh.sub.selectMedicationHint')}
            </p>
          </div>

          {/* Dose */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.doseLabel')}</label>
            <input
              value={dose}
              onChange={e => setDose(e.target.value)}
              placeholder={t('mh.sub.dosePlaceholder')}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.instructionsLabel')}</label>
            <textarea
              rows={3}
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder={t('mh.sub.instructionsPlaceholder')}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-y"
            />
          </div>

          {/* Quantity / Unit / Refills */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm text-text-2">{t('mh.sub.dispenseQtyLabel')}</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-text-2">{t('mh.sub.dispenseUnitLabel')}</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              >
                <option value="">{t('mh.sub.selectOption')}</option>
                {DISPENSE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-text-2">{t('mh.sub.refillsLabel')}</label>
              <select
                value={refills}
                onChange={e => setRefills(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              >
                {REFILL_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Start date + checkboxes */}
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <label className="text-sm text-text-2">{t('mh.sub.startDateLabel')}</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand [color-scheme:dark]"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input type="checkbox" checked={autoExpire} onChange={e => setAutoExpire(e.target.checked)} className="accent-brand" />
              <span className="text-sm text-text-2">{t('mh.sub.autoExpire')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input type="checkbox" checked={autoRenew} onChange={e => setAutoRenew(e.target.checked)} className="accent-brand" />
              <span className="text-sm text-text-2">{t('mh.sub.autoRenew')}</span>
            </label>
          </div>

          {/* Prescribed by */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.prescribedByLabel')}</label>
            <SearchDropdown
              value={prescribedBy}
              placeholder={t('mh.sub.selectPrescriber')}
              options={doctorOptions}
              onSearch={handleDoctorSearch}
              onSelect={(id, label) => { setPrescribedById(id); setPrescribedBy(label); }}
              searchPlaceholder={t('mh.sub.search')}
              emptyText={t('mh.sub.noResults')}
            />
          </div>

          {/* Diagnosis */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.diagnosisLabel')}</label>
            <SearchDropdown
              value={diagLabel}
              placeholder={t('mh.sub.selectDiagnosis')}
              options={diagOptions}
              onSearch={handleDiagSearch}
              onSelect={(_, label) => {
                const [code, ...rest] = label.split(' - ');
                setDiagCode(code.trim());
                setDiagLabel(rest.join(' - ').trim());
              }}
              searchPlaceholder={t('mh.sub.search')}
              emptyText={t('mh.sub.noResults')}
            />
            <p className="text-[11px] text-text-muted">
              {diagLabel ? diagLabel : t('mh.sub.selectDiagnosisHint')}
            </p>
          </div>

          {/* Pharmacy */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.pharmacyNameLabel')}</label>
            <input
              value={pharmacy}
              onChange={e => setPharmacy(e.target.value)}
              placeholder={t('mh.sub.pharmacyNamePlaceholder')}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.pharmacyNoteLabel')}</label>
            <textarea
              rows={3}
              value={pharmacyNote}
              onChange={e => setPharmacyNote(e.target.value)}
              placeholder={t('mh.sub.pharmacyNotePlaceholder')}
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
            {isPending ? t('mh.sub.saving') : t('mh.sub.createPrescription')}
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
  const t = useTranslations('phoenix.patients');
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
            {t('mh.sub.addSurgeryTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.addSurgeryDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.procedureNameLabel')}</label>
            <input
              autoFocus
              value={procedure}
              onChange={e => setProcedure(e.target.value)}
              placeholder={t('mh.sub.procedureNamePlaceholder')}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.yearLabel')}</label>
            <input
              value={year}
              onChange={e => setYear(e.target.value)}
              placeholder={t('mh.sub.yearPlaceholder')}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.comments')}</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('mh.sub.surgeryNotes')}
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
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
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
  const t = useTranslations('phoenix.patients');
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
      notes:     lastVisit ? t('mh.sub.lastVisitNote', { date: lastVisit }) : undefined,
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
            {t('mh.sub.addProviderTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.addProviderDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">

          {/* Provider name */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.providerNameLabel')}</label>
            <SearchDropdown
              value={providerName}
              placeholder={t('mh.sub.selectOption')}
              options={doctorOptions}
              onSearch={q => searchDoctors(q).then(rows => setDoctorOptions(rows.map(r => ({ id: r.id, label: r.name }))))}
              onSelect={(id, label) => { setProviderId(id); setProviderName(label); }}
              searchPlaceholder={t('mh.sub.search')}
              emptyText={t('mh.sub.noResults')}
            />
          </div>

          {/* Specialty */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.specialtyLabel')}</label>
            <SearchDropdown
              value={specialty}
              placeholder={t('mh.sub.selectOption')}
              options={specOptions}
              onSearch={q => searchSpecialties(q).then(rows => setSpecOptions(rows.map(r => ({ id: r.id, label: r.name }))))}
              onSelect={(_, label) => setSpecialty(label)}
              searchPlaceholder={t('mh.sub.search')}
              emptyText={t('mh.sub.noResults')}
            />
          </div>

          {/* Last visit date */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.lastVisitLabel')}</label>
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
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Allergies edit dialog ──────────────────────────────────────────────────

function AllergiesEditDialog({
  patientId, initial, open, onClose, onSaved,
}: {
  patientId: string;
  initial:   string | undefined;
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const t = useTranslations('phoenix.patients');
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(initial ?? '');

  function handleSave() {
    startTransition(async () => {
      await updateMedicalHistory(patientId, { allergies: value.trim() || undefined });
      onSaved?.({ allergies: value.trim() || undefined });
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold text-text-1">{t('mh.allergies')}</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.noAllergies')}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5">
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={4}
            placeholder={t('mh.noAllergies')}
            className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-none"
            autoFocus
          />
        </div>
        <div className="px-6 pb-5 flex flex-col sm:flex-row gap-2 justify-end">
          <button onClick={onClose} disabled={isPending}
            className="w-full sm:w-auto px-4 py-2 rounded-md border border-border text-sm text-text-2 hover:bg-white/5 disabled:opacity-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={isPending}
            className="w-full sm:w-auto px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors">
            {isPending ? 'Guardando…' : 'Guardar'}
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
  const t = useTranslations('phoenix.patients');
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
          <DialogTitle className="text-base font-semibold text-text-1">{t('mh.sub.vaccinesTitle')}</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.vaccinesDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {items.map((val, i) => (
            <div key={i} className="space-y-1">
              <label className="text-xs text-text-muted">{t('mh.sub.vaccineN', { n: i + 1 })}</label>
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
            <Plus className="w-4 h-4" /> {t('mh.sub.addVaccine')}
          </button>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
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
  const t = useTranslations('phoenix.patients');
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
          <DialogTitle className="text-base font-semibold text-text-1">{t('mh.sub.cognitiveTitle')}</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.cognitiveDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {entries.map((entry, i) => (
            <div key={i} className="rounded-md border border-border/60 bg-bg-2/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-1">{t('mh.sub.entry', { n: i + 1 })}</span>
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
                  <label className="text-xs text-text-muted">{t('mh.sub.cognitiveNameLabel')}</label>
                  <input
                    value={entry.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    placeholder={t('mh.sub.cognitiveNamePlaceholder')}
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-muted">{t('mh.sub.status')}</label>
                  <input
                    value={entry.status}
                    onChange={e => update(i, 'status', e.target.value)}
                    placeholder={t('mh.sub.cognitiveStatusPlaceholder')}
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
            <Plus className="w-4 h-4" /> {t('mh.sub.addCognitiveEntry')}
          </button>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
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
  const t = useTranslations('phoenix.patients');
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
          <DialogTitle className="text-base font-semibold text-text-1">{t('mh.sub.functionalTitle')}</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.functionalDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {entries.map((entry, i) => (
            <div key={i} className="rounded-md border border-border/60 bg-bg-2/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-1">{t('mh.sub.entry', { n: i + 1 })}</span>
                <button type="button" onClick={() => removeEntry(i)} className="p-1 rounded text-text-muted hover:text-rose transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-text-muted">{t('mh.sub.functionalNameLabel')}</label>
                  <input
                    value={entry.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    placeholder={t('mh.sub.functionalNamePlaceholder')}
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-muted">{t('mh.sub.status')}</label>
                  <input
                    value={entry.status}
                    onChange={e => update(i, 'status', e.target.value)}
                    placeholder={t('mh.sub.functionalStatusPlaceholder')}
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>
          ))}

          <button type="button" onClick={addEntry} className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-2 text-sm text-text-2 hover:border-brand hover:text-brand transition-colors">
            <Plus className="w-4 h-4" /> {t('mh.sub.addFunctionalEntry')}
          </button>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={handleSave} disabled={isPending} className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors">
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
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
  const t = useTranslations('phoenix.patients');
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
          <DialogTitle className="text-base font-semibold text-text-1">{t('mh.sub.devicesTitle')}</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.devicesDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {items.map((val, i) => (
            <div key={i} className="space-y-1">
              <label className="text-xs text-text-muted">{t('mh.sub.deviceN', { n: i + 1 })}</label>
              <div className="flex items-center gap-2">
                <input
                  value={val}
                  onChange={e => updateRow(i, e.target.value)}
                  placeholder={t('mh.sub.devicePlaceholder')}
                  className="flex-1 bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                />
                <button type="button" onClick={() => removeRow(i)} className="p-1.5 rounded text-text-muted hover:text-rose transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addRow} className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-2 text-sm text-text-2 hover:border-brand hover:text-brand transition-colors">
            <Plus className="w-4 h-4" /> {t('mh.sub.addDevice')}
          </button>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={handleSave} disabled={isPending} className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors">
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
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
  const t = useTranslations('phoenix.patients');
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
          <DialogTitle className="text-base font-semibold text-text-1">{t('mh.sub.systemsTitle')}</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.systemsDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {items.map((val, i) => (
            <div key={i} className="space-y-1">
              <label className="text-xs text-text-muted">{t('mh.sub.systemReviewN', { n: i + 1 })}</label>
              <div className="flex items-center gap-2">
                <input
                  value={val}
                  onChange={e => updateRow(i, e.target.value)}
                  placeholder={t('mh.sub.systemReviewPlaceholder')}
                  className="flex-1 bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                />
                <button type="button" onClick={() => removeRow(i)} className="p-1.5 rounded text-text-muted hover:text-rose transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addRow} className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-2 text-sm text-text-2 hover:border-brand hover:text-brand transition-colors">
            <Plus className="w-4 h-4" /> {t('mh.sub.addSystemReview')}
          </button>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={handleSave} disabled={isPending} className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors">
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
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
  const t = useTranslations('phoenix.patients');
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
          <DialogTitle className="text-base font-semibold text-text-1">{t('mh.sub.healthExamsTitle')}</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.healthExamsDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          <div className="rounded-md border border-border/60 bg-bg-2/40 p-4 space-y-4">
            <p className="text-sm font-semibold text-text-1">{t('mh.sub.generalExams')}</p>

            <div className="grid grid-cols-2 gap-3">
              {/* Blood test date */}
              <div className="space-y-1.5">
                <label className="text-xs text-text-muted">{t('mh.sub.bloodTestDateLabel')}</label>
                <input
                  type="date"
                  value={bloodTestDate}
                  onChange={e => setBloodTestDate(e.target.value)}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
                />
              </div>

              {/* Normal results toggle */}
              <div className="flex items-end pb-1">
                <ToggleRow
                  label={t('mh.sub.normalResults')}
                  checked={normalResults}
                  onChange={setNormalResults}
                />
              </div>

              {/* Colonoscopy year */}
              <div className="space-y-1.5">
                <label className="text-xs text-text-muted">{t('mh.sub.colonoscopyYearLabel')}</label>
                <input
                  value={colonoscopyYear}
                  onChange={e => setColonoscopyYear(e.target.value)}
                  placeholder={t('mh.sub.colonoscopyYearPlaceholder')}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                />
              </div>

              {/* Abnormal toggle */}
              <div className="flex items-end pb-1">
                <ToggleRow
                  label={t('mh.sub.abnormal')}
                  checked={abnormal}
                  onChange={setAbnormal}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={handleSave} disabled={isPending} className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors">
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
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
  const t = useTranslations('phoenix.patients');
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
          <DialogTitle className="text-base font-semibold text-text-1">{t('mh.sub.addCommentTitle')}</DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.addCommentDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.commentLabel')}</label>
            <textarea
              autoFocus
              rows={5}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={t('mh.sub.commentPlaceholder')}
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
            {isPending ? t('mh.sub.saving') : t('mh.sub.addComment')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add family history dialog ──────────────────────────────────────────────

function AddFamilyHistoryDialog({
  patientId, existing, open, onClose, onSaved,
}: {
  patientId: string;
  existing:  MedicalHistoryData['familyHistory'];
  open:      boolean;
  onClose:   () => void;
  onSaved?:  (patch: Partial<MedicalHistoryData>) => void;
}) {
  const t = useTranslations('phoenix.patients');
  const FAMILY_MEMBERS = [
    t('mh.sub.family.father'), t('mh.sub.family.mother'), t('mh.sub.family.son'), t('mh.sub.family.daughter'),
    t('mh.sub.family.brother'), t('mh.sub.family.sister'),
    t('mh.sub.family.maternalGrandfather'), t('mh.sub.family.maternalGrandmother'),
    t('mh.sub.family.paternalGrandfather'), t('mh.sub.family.paternalGrandmother'),
    t('mh.sub.family.uncle'), t('mh.sub.family.aunt'), t('mh.sub.family.nephew'), t('mh.sub.family.niece'),
    t('mh.sub.family.cousin'), t('mh.sub.family.grandson'), t('mh.sub.family.granddaughter'),
    t('mh.sub.family.spousePartner'), t('mh.sub.family.stepParent'),
    t('mh.sub.family.halfSibling'), t('mh.sub.family.adoptiveParent'), t('mh.sub.family.other'),
  ];
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
            {t('mh.sub.addFamilyHistoryTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.addFamilyHistoryDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">

          {/* Family member — local filter */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.familyMemberLabel')}</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMemberOpen(o => !o)}
                className="w-full flex items-center justify-between bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-left focus:outline-none focus:border-brand"
              >
                <span className={relation ? 'text-text-1' : 'text-text-muted'}>
                  {relation || t('mh.sub.selectOption')}
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
                        placeholder={t('mh.sub.search')}
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

          {/* Condition — ICD search */}
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.condition')}</label>
            <SearchDropdown
              value={condition}
              placeholder={t('mh.sub.selectOption')}
              options={diagOptions}
              onSearch={q => searchDiagnoses(q).then(rows => setDiagOptions(rows.map(r => ({ id: r.id, label: r.label }))))}
              onSelect={(_, label) => setCondition(label)}
              searchPlaceholder={t('mh.sub.search')}
              emptyText={t('mh.sub.noResults')}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || !relation || !condition}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
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
  const t = useTranslations('phoenix.patients');
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
            {t('mh.sub.addProblemTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            {t('mh.sub.addProblemDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.condition')}</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropOpen(o => !o)}
                className="w-full flex items-center justify-between bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-left focus:outline-none focus:border-brand"
              >
                <span className={selected ? 'text-text-1' : 'text-text-muted'}>
                  {selected ? selected.label : t('mh.sub.selectCondition')}
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
                        placeholder={t('mh.sub.search')}
                        className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-muted focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {results.length === 0
                      ? <p className="px-3 py-3 text-xs text-text-muted text-center">{t('mh.sub.noResults')}</p>
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
            <p className="text-sm font-semibold text-text-1">{t('mh.sub.status')}</p>
            <div className="grid grid-cols-2 gap-3">
              <ToggleRow label={t('mh.sub.current')}  checked={isCurrent}  onChange={setIsCurrent} />
              <ToggleRow label={t('mh.sub.resolved')} checked={isResolved} onChange={setIsResolved} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-muted">{t('mh.sub.diagnosedAt')}</label>
              <input
                type="date"
                value={diagDate}
                onChange={e => setDiagDate(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-text-2">{t('mh.sub.comments')}</label>
            <textarea
              rows={3}
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder={t('mh.sub.additionalNotes')}
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
            {isPending ? t('mh.sub.saving') : t('mh.sub.saveChanges')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main content (reusable inline or inside dialog) ────────────────────────

export interface MedicalHistoryContentProps { patient: PatientRow }

export function MedicalHistoryContent({ patient }: MedicalHistoryContentProps) {
  const t = useTranslations('phoenix.patients');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editVisitInfo,  setEditVisitInfo]  = useState(false);
  const [editHealthInfo, setEditHealthInfo] = useState(false);
  const [addProblem,      setAddProblem]      = useState(false);
  const [addHistory,      setAddHistory]      = useState(false);
  const [addMedication,   setAddMedication]   = useState(false);
  const [addSurgery,       setAddSurgery]       = useState(false);
  const [addFamilyHistory, setAddFamilyHistory] = useState(false);
  const [addProvider,      setAddProvider]      = useState(false);
  const [editAllergies,    setEditAllergies]    = useState(false);
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
    MALE: t('mh.sexLabels.MALE'), FEMALE: t('mh.sexLabels.FEMALE'), NON_BINARY: t('mh.sexLabels.NON_BINARY'),
    OTHER: t('mh.sexLabels.OTHER'), PREFER_NOT_TO_SAY: t('mh.sexLabels.PREFER_NOT_TO_SAY'),
  };
  const MARITAL_LABEL: Record<string, string> = {
    SINGLE: t('mh.maritalLabels.SINGLE'), MARRIED: t('mh.maritalLabels.MARRIED'), DIVORCED: t('mh.maritalLabels.DIVORCED'),
    WIDOWED: t('mh.maritalLabels.WIDOWED'), SEPARATED: t('mh.maritalLabels.SEPARATED'), OTHER: t('mh.maritalLabels.OTHER'),
  };
  const LANG_LABEL: Record<string, string> = {
    es: t('mh.langLabels.es'), en: t('mh.langLabels.en'), fr: t('mh.langLabels.fr'),
    it: t('mh.langLabels.it'), pt: t('mh.langLabels.pt'), other: t('mh.langLabels.other'),
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
            {sidebarOpen ? t('mh.closePanel') : t('mh.openPanel')}
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
            <SideSection icon={<User className="w-3.5 h-3.5" />} title={t('mh.personalInfo')}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] text-text-muted">{t('mh.dob')}:</span>
                <span className="text-[11px] text-text-1">{dobStr}</span>
                {age !== null && (
                  <span className="bg-emerald/20 text-emerald text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {age} {t('mh.years')}
                  </span>
                )}
              </div>
              <SideRow na={t('mh.na')} label={t('mh.sex')}          value={patient.sex ? (SEX_LABEL[patient.sex] ?? patient.sex) : null} />
              <SideRow na={t('mh.na')} label={t('mh.maritalStatus')} value={patient.maritalStatus ? (MARITAL_LABEL[patient.maritalStatus] ?? patient.maritalStatus) : null} />
              <SideRow na={t('mh.na')} label={t('mh.language')}     value={patient.preferredLanguage ? (LANG_LABEL[patient.preferredLanguage] ?? patient.preferredLanguage) : null} />
            </SideSection>

            {/* Contact */}
            <SideSection icon={<Phone className="w-3.5 h-3.5" />} title={t('mh.contactInfo')}>
              <SideRow na={t('mh.na')} label={t('mh.phone')}    value={patient.phone} />
              <SideRow na={t('mh.na')} label={t('mh.cellPhone')} value={patient.phone2} />
              <SideRow na={t('mh.na')} label={t('mh.email')}    value={patient.email} />
            </SideSection>

            {/* Emergency + additional */}
            <SideSection icon={<AlertTriangle className="w-3.5 h-3.5" />} title={t('mh.emergencyAdditional')}>
              <SideRow na={t('mh.na')} label={t('mh.emergency')}  value={patient.emergencyContactName} />
              <SideRow na={t('mh.na')} label={t('mh.referredBy')} value={patient.referralSource} />
              <SideRow na={t('mh.na')} label={t('mh.pharmacy')}   value={patient.preferredPharmacy} />
              <SideRow na={t('mh.na')} label={t('mh.employer')}   value={patient.employer} />
              <SideRow na={t('mh.na')} label={t('mh.provider')}   value={mh.providers?.[0]?.name ?? null} />
            </SideSection>

            {/* Insurance */}
            <SideSection icon={<Shield className="w-3.5 h-3.5" />} title={t('mh.insuranceDetails')} defaultOpen={false}>
              {insurances && insurances.length > 0 ? (
                insurances.map((ins, i) => (
                  <div key={i} className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2 space-y-0.5 mb-2 last:mb-0">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                      {ins.insType === 'MEDICAL' ? t('mh.medicalInsurance') : t('mh.autoInsurance')}
                    </p>
                    <p className="text-[11px] text-text-1 font-medium">{ins.carrier || t('mh.noName')}</p>
                    {ins.policyId && <p className="text-[10px] text-text-muted">{t('mh.policy')} {ins.policyId}</p>}
                  </div>
                ))
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">{t('mh.primaryInsurance')}</p>
                  <EmptyState text={t('mh.noPrimaryInsurance')} />
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mt-2 mb-1">{t('mh.secondaryInsurance')}</p>
                  <EmptyState text={t('mh.noSecondaryInsurance')} />
                </>
              )}
            </SideSection>

            {/* Allergies */}
            <SideSection icon={<AlertTriangle className="w-3.5 h-3.5" />} title={t('mh.allergies')} editBtn onEdit={() => setEditAllergies(true)} defaultOpen={false}>
              <EmptyState text={mh.allergies ?? t('mh.noAllergies')} />
            </SideSection>

            {/* Problems list (sidebar) */}
            <SideSection icon={<Heart className="w-3.5 h-3.5" />} title={t('mh.problemList')} defaultOpen={false}>
              {(mh.problems?.length ?? 0) > 0
                ? mh.problems!.map(p => (
                    <div key={p.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{p.condition}</div>
                  ))
                : <EmptyState text={t('mh.noProblems')} />}
            </SideSection>

            {/* Active medications */}
            <SideSection icon={<Pill className="w-3.5 h-3.5" />} title={t('mh.activeMedications')} defaultOpen={false}>
              {(mh.medications?.length ?? 0) > 0
                ? mh.medications!.map(m => (
                    <div key={m.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{m.name}</div>
                  ))
                : <EmptyState text={t('mh.noMedications')} />}
            </SideSection>

            {/* Surgeries */}
            <SideSection icon={<Scissors className="w-3.5 h-3.5" />} title={t('mh.surgeriesProcedures')} defaultOpen={false}>
              {(mh.surgeries?.length ?? 0) > 0
                ? mh.surgeries!.map(s => (
                    <div key={s.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{s.procedure}</div>
                  ))
                : <EmptyState text={t('mh.noSurgeries')} />}
            </SideSection>

            {/* Family history */}
            <SideSection icon={<Users className="w-3.5 h-3.5" />} title={t('mh.familyHistory')} defaultOpen={false}>
              {(mh.familyHistory?.length ?? 0) > 0
                ? mh.familyHistory!.map(f => (
                    <div key={f.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{f.relation}: {f.condition}</div>
                  ))
                : <EmptyState text={t('mh.noFamilyHistory')} />}
            </SideSection>

            {/* Social history */}
            <SideSection icon={<MessageSquare className="w-3.5 h-3.5" />} title={t('mh.socialHistory')} editBtn defaultOpen={false}>
              <div className="space-y-2">
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">{t('mh.workAndFamily')}</p>
                  <SideRow na={t('mh.na')} label={t('mh.work')}     value={mh.socialHistory?.work} />
                  <SideRow na={t('mh.na')} label={t('mh.children')} value={mh.socialHistory?.children} />
                </div>
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Cigarette className="w-3 h-3 text-text-muted" />
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted">{t('mh.tobaccoUse')}</p>
                  </div>
                  <SideRow na={t('mh.na')} label={t('mh.status')} value={mh.socialHistory?.tobacco} />
                </div>
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wine className="w-3 h-3 text-text-muted" />
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted">{t('mh.alcoholUse')}</p>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-muted">{t('mh.status')}:</span>
                    {mh.socialHistory?.alcohol
                      ? <TagPill label={mh.socialHistory.alcohol} colorClass="bg-amber/10 text-amber border-amber/20" />
                      : <span className="text-text-muted">{t('mh.na')}</span>}
                  </div>
                </div>
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FlaskConical className="w-3 h-3 text-text-muted" />
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted">{t('mh.drugUse')}</p>
                  </div>
                  <SideRow na={t('mh.na')} label={t('mh.status')} value={mh.socialHistory?.drugs} />
                </div>
              </div>
            </SideSection>

          </div>

          {/* ════ Main content ════ */}
          <div className="flex-1 overflow-y-auto bg-bg-2/30 p-4 space-y-4">

            {/* Row 1: Visit info + Health info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Visit info */}
              <SectionCard
                icon={<User className="w-4 h-4" />}
                title={t('mh.visitInfo')}
                editBtn
                onEdit={() => setEditVisitInfo(true)}
              >
                <div className="space-y-2 text-[12.5px]">
                  <div className="flex justify-between">
                    <span className="text-text-muted">{t('mh.referredByLabel')}</span>
                    <span className="text-text-1">{mh.visitInfo?.referredBy || t('mh.na')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">{t('mh.mainReason')}</span>
                    <span className="text-text-1">{mh.visitInfo?.mainReason || t('mh.na')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">{t('mh.otherConcerns')}</span>
                    <span className="text-text-1">{mh.visitInfo?.otherConcerns || t('mh.na')}</span>
                  </div>
                </div>
              </SectionCard>

              {/* Health info */}
              <SectionCard
                icon={<Activity className="w-4 h-4" />}
                title={t('mh.healthInfo')}
                editBtn
                onEdit={() => setEditHealthInfo(true)}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border/60 bg-bg-2/40 p-3">
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">{t('mh.healthGoals')}</p>
                    <p className="text-[11px] text-text-2">{mh.healthInfo?.goals || t('mh.noGoals')}</p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-bg-2/40 p-3">
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">{t('mh.selfRating')}</p>
                    <p className="text-[11px] text-text-2">
                      {mh.healthInfo?.selfRating != null ? `${mh.healthInfo.selfRating}/5` : t('mh.notRated')}
                    </p>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* Problem list */}
            <SectionCard
              icon={<Heart className="w-4 h-4" />}
              title={t('mh.problemList')}
              count={mh.problems?.length ?? 0}
              onAdd={() => setAddProblem(true)}
              addLabel={t('mh.add')}
            >
              <TableShell
                headers={[t('mh.condition'), t('mh.diagnosedOn'), t('mh.status'), t('mh.comments'), t('mh.actions')]}
                totalLabel={t('mh.totalRecords')}
                rows={(mh.problems ?? []).map(p => [
                  p.condition,
                  p.diagnosedAt ?? '—',
                  p.status ? <TagPill label={p.status} colorClass="bg-cyan/10 text-cyan border-cyan/20" /> : '—',
                  p.comments ?? '—',
                  <button key="del" className="text-text-muted hover:text-rose transition-colors text-[10px]">{t('mh.delete')}</button>,
                ])}
                emptyText={t('mh.noData')}
              />
            </SectionCard>

            {/* Medical history */}
            <SectionCard
              icon={<ClipboardList className="w-4 h-4" />}
              title={t('mh.medicalHistory')}
              count={mh.history?.length ?? 0}
              onAdd={() => setAddHistory(true)}
              addLabel={t('mh.add')}
            >
              <TableShell
                headers={[t('mh.condition'), t('mh.actions')]}
                totalLabel={t('mh.totalRecords')}
                rows={(mh.history ?? []).map(h => [
                  h.condition,
                  <button key="del" className="text-text-muted hover:text-rose transition-colors text-[10px]">{t('mh.delete')}</button>,
                ])}
                emptyText={t('mh.noData')}
              />
            </SectionCard>

            {/* Medications */}
            <SectionCard
              icon={<Pill className="w-4 h-4" />}
              title={t('mh.medications')}
              count={mh.medications?.length ?? 0}
              onAdd={() => setAddMedication(true)}
              addLabel={t('mh.add')}
            >
              <TableShell
                headers={[t('mh.medName'), t('mh.medDose'), t('mh.medInstructions'), t('mh.medPrescribedBy'), t('mh.actions')]}
                totalLabel={t('mh.totalRecords')}
                rows={(mh.medications ?? []).map(m => [
                  m.name,
                  m.dose ?? '—',
                  m.instructions ?? '—',
                  m.prescribedBy ?? '—',
                  <button key="del" className="text-text-muted hover:text-rose transition-colors text-[10px]">{t('mh.delete')}</button>,
                ])}
                emptyText={t('mh.noData')}
              />
            </SectionCard>

            {/* Row: Surgeries + Family history */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Scissors className="w-4 h-4" />} title={t('mh.surgeriesProcedures')} count={mh.surgeries?.length ?? 0} onAdd={() => setAddSurgery(true)} addLabel={t('mh.add')}>
                {(mh.surgeries?.length ?? 0) === 0
                  ? <EmptyState text={t('mh.noSurgeries')} />
                  : mh.surgeries!.map(s => (
                      <div key={s.id} className="text-[11px] text-text-2 border-b border-border/40 py-1.5 last:border-0">{s.procedure}</div>
                    ))}
              </SectionCard>

              <SectionCard icon={<Users className="w-4 h-4" />} title={t('mh.familyHistory')} count={mh.familyHistory?.length ?? 0} onAdd={() => setAddFamilyHistory(true)} addLabel={t('mh.add')}>
                {(mh.familyHistory?.length ?? 0) === 0
                  ? <EmptyState text={t('mh.noFamilyHistory')} />
                  : mh.familyHistory!.map(f => (
                      <div key={f.id} className="text-[11px] text-text-2 border-b border-border/40 py-1.5 last:border-0">
                        <span className="text-text-muted">{f.relation}:</span> {f.condition}
                      </div>
                    ))}
              </SectionCard>
            </div>

            {/* Row: Provider history + Vaccines */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Briefcase className="w-4 h-4" />} title={t('mh.providerHistory')} count={mh.providers?.length ?? 0} onAdd={() => setAddProvider(true)} addLabel={t('mh.add')}>
                {(mh.providers?.length ?? 0) === 0
                  ? <EmptyState text={t('mh.noProviders')} />
                  : mh.providers!.map(p => (
                      <div key={p.id} className="text-[11px] text-text-2 border-b border-border/40 py-1.5 last:border-0">{p.name}</div>
                    ))}
              </SectionCard>

              <SectionCard icon={<Shield className="w-4 h-4" />} title={t('mh.vaccines')} editBtn onEdit={() => setEditVaccines(true)}>
                {(mh.vaccines?.length ?? 0) === 0
                  ? <EmptyState text={t('mh.noVaccines')} />
                  : <div className="space-y-1">
                      {mh.vaccines!.map((v, i) => (
                        <div key={i} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{v}</div>
                      ))}
                    </div>
                }
              </SectionCard>
            </div>

            {/* Row: Cognitive status + Functional status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Brain className="w-4 h-4" />} title={t('mh.cognitiveStatus')} editBtn onEdit={() => setEditCognitive(true)}>
                {(mh.cognitiveStatus?.length ?? 0) === 0
                  ? <EmptyState text={t('mh.noCognitive')} />
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

              <SectionCard icon={<Activity className="w-4 h-4" />} title={t('mh.functionalStatus')} editBtn onEdit={() => setEditFunctional(true)}>
                {(mh.functionalStatus?.length ?? 0) === 0
                  ? <EmptyState text={t('mh.noFunctional')} />
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

            {/* Row: Implanted devices + Systems review */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Stethoscope className="w-4 h-4" />} title={t('mh.implantedDevices')} editBtn onEdit={() => setEditDevices(true)}>
                {(mh.implantedDevices?.length ?? 0) === 0
                  ? <EmptyState text={t('mh.noDevices')} />
                  : <div className="space-y-1">
                      {mh.implantedDevices!.map((d, i) => (
                        <div key={i} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{d}</div>
                      ))}
                    </div>
                }
              </SectionCard>

              <SectionCard icon={<ClipboardList className="w-4 h-4" />} title={t('mh.systemsReview')} editBtn onEdit={() => setEditSystems(true)}>
                {(mh.systemsReview?.length ?? 0) === 0
                  ? <EmptyState text={t('mh.noSystems')} />
                  : <div className="space-y-1">
                      {mh.systemsReview!.map((s, i) => (
                        <div key={i} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{s}</div>
                      ))}
                    </div>
                }
              </SectionCard>
            </div>

            {/* Row: Health exams + Comments history */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Activity className="w-4 h-4" />} title={t('mh.healthExams')} editBtn onEdit={() => setEditExams(true)}>
                {!mh.healthExams
                  ? <EmptyState text={t('mh.noHealthExams')} />
                  : <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {mh.healthExams.bloodTestDate && <div className="flex justify-between col-span-2"><span className="text-text-muted">{t('mh.bloodTest')}</span><span className="text-text-2">{mh.healthExams.bloodTestDate}</span></div>}
                      {mh.healthExams.colonoscopyYear && <div className="flex justify-between col-span-2"><span className="text-text-muted">{t('mh.colonoscopy')}</span><span className="text-text-2">{mh.healthExams.colonoscopyYear}</span></div>}
                      {mh.healthExams.normalResults && <div className="col-span-2 text-emerald">&#x2713; {t('mh.normalResults')}</div>}
                      {mh.healthExams.abnormal && <div className="col-span-2 text-amber">&#x26A0; {t('mh.abnormal')}</div>}
                    </div>
                }
              </SectionCard>

              <SectionCard
                icon={<MessageSquare className="w-4 h-4" />}
                title={t('mh.commentsHistory')}
                count={mh.comments?.length ?? 0}
                onAdd={() => setAddComment(true)}
                addLabel={t('mh.add')}
              >
                {(mh.comments?.length ?? 0) === 0
                  ? <EmptyState text={t('mh.noComments')} />
                  : mh.comments!.map(c => (
                      <div key={c.id} className="border-b border-border/40 py-2 last:border-0">
                        <div className="flex justify-between text-[10px] text-text-muted mb-0.5">
                          <span>{c.author ?? t('mh.system')}</span>
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
    {editAllergies && (
      <AllergiesEditDialog
        patientId={patient.id}
        initial={mh.allergies}
        open={editAllergies}
        onClose={() => setEditAllergies(false)}
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
  const t = useTranslations('phoenix.patients');
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
                {t('mh.historyTitle', { code: patient.patientCode ?? '' })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <MedicalHistoryContent patient={patient} />
      </DialogContent>
    </Dialog>
  );
}
