'use client';

/**
 * LabOrderDialog — nueva orden de laboratorio / imagen / cardiología (B.20 · L3).
 *
 * Mismos campos que el formulario del v2 (médico, fecha de muestra, tipo de
 * facturación, estudios, diagnósticos) más lo que faltaba para que sirva
 * clínicamente: urgencia, indicación clínica y dónde se toma la muestra.
 *
 * El médico NO se elige: es el doctor de la sesión.
 * Los diagnósticos vienen pre-cargados de la nota — el doctor ya los eligió ahí.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Button,
} from '@precision/ui';
import { Search, X, Plus, Loader2, FlaskConical, Scan, HeartPulse, AlertTriangle } from 'lucide-react';
import { DatePicker } from '@/components/ui-phoenix/date-picker';
import { DiagnosisPicker, type DiagnosisRow } from '@/app/doctor/templates/diagnosis-picker';

export type LabCategory = 'LABORATORY' | 'IMAGING' | 'CARDIOLOGY';

export interface CatalogStudy {
  id: number;
  code: string;
  name: string;
  category: string;
}

export interface SelectedStudy {
  code: string;
  name: string;
  category: LabCategory;
  loinc?: string | null;
}

export interface NoteDiagnosisSeed {
  icd10Code: string | null;
  icd10Label: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  /** Diagnósticos de la nota — se pre-cargan como justificación de la orden */
  seedDiagnoses: NoteDiagnosisSeed[];
  onCreate: (payload: {
    studies: SelectedStudy[];
    clinicalIndication: string;
    urgency: 'STAT' | 'URGENT' | 'ROUTINE';
    billingType: string | null;
    collectionSite: 'IN_HOUSE' | 'EXTERNAL';
    sampleDate: string | null;
    preferredCenter: string | null;
    icd10Codes: string[];
  }) => Promise<void>;
}

const CATEGORIES: Array<{ id: LabCategory; icon: React.ElementType }> = [
  { id: 'LABORATORY', icon: FlaskConical },
  { id: 'IMAGING', icon: Scan },
  { id: 'CARDIOLOGY', icon: HeartPulse },
];

const BILLING_TYPES = ['CLIENT', 'PATIENT', 'PRIVATE', 'MEDICAID', 'MEDICARE', 'WORKERS_COMP'] as const;
const URGENCIES = ['ROUTINE', 'URGENT', 'STAT'] as const;

const todayKey = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

export function LabOrderDialog({ open, onClose, userId, seedDiagnoses, onCreate }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  const [category, setCategory] = React.useState<LabCategory>('LABORATORY');
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<CatalogStudy[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [studies, setStudies] = React.useState<SelectedStudy[]>([]);

  const [indication, setIndication] = React.useState('');
  const [urgency, setUrgency] = React.useState<'STAT' | 'URGENT' | 'ROUTINE'>('ROUTINE');
  const [billingType, setBillingType] = React.useState('');
  const [collectionSite, setCollectionSite] = React.useState<'IN_HOUSE' | 'EXTERNAL'>('EXTERNAL');
  const [sampleDate, setSampleDate] = React.useState(todayKey);
  const [center, setCenter] = React.useState('');
  const [dx, setDx] = React.useState<string[]>([]);
  const [dxOpen, setDxOpen] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Al abrir: estado limpio + diagnósticos de la nota como justificación
  React.useEffect(() => {
    if (!open) return;
    setCategory('LABORATORY');
    setQ(''); setResults([]); setStudies([]);
    setIndication(''); setUrgency('ROUTINE'); setBillingType('');
    setCollectionSite('EXTERNAL'); setSampleDate(todayKey()); setCenter('');
    setDx(seedDiagnoses
      .filter((d) => d.icd10Code)
      .map((d) => `${d.icd10Code} - ${d.icd10Label ?? ''}`.trim()));
    setError(null);
  }, [open, seedDiagnoses]);

  // Búsqueda en el catálogo (96 estudios migrados del v2), debounced
  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const id = setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({ category, limit: '30' });
      if (q.trim()) params.set('q', q.trim());
      fetch(`/api/admin/lab-catalog/search?${params}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d: { results?: CatalogStudy[] }) => setResults(d.results ?? []))
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, 250);
    return () => { clearTimeout(id); controller.abort(); };
  }, [open, q, category]);

  const addStudy = (s: CatalogStudy): void => {
    if (studies.some((x) => x.code === s.code)) return;
    setStudies((prev) => [...prev, { code: s.code, name: s.name, category: s.category as LabCategory }]);
  };

  const handleSave = async (): Promise<void> => {
    if (studies.length === 0) { setError(t('labErrNoStudies')); return; }
    setSaving(true); setError(null);
    try {
      await onCreate({
        studies,
        clinicalIndication: indication.trim(),
        urgency,
        billingType: billingType || null,
        collectionSite,
        sampleDate: sampleDate || null,
        preferredCenter: collectionSite === 'EXTERNAL' ? (center.trim() || null) : null,
        icd10Codes: dx,
      });
      onClose();
    } catch {
      setError(t('labErrSave'));
    } finally {
      setSaving(false);
    }
  };

  const pillBase = 'px-3 h-8 rounded-md text-[12px] font-semibold border transition-colors';

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-3xl p-0 max-h-[92vh] flex flex-col">
          <DialogHeader className="px-4 sm:px-5 py-3 border-b border-border shrink-0">
            <DialogTitle className="text-sm font-semibold text-text-1 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-violet" /> {t('labNewTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="px-4 sm:px-5 py-4 space-y-4 overflow-y-auto">

            {/* Categoría */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {CATEGORIES.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setCategory(id); setQ(''); }}
                  className={`${pillBase} flex items-center gap-1.5 ${
                    category === id
                      ? 'border-violet/50 bg-violet/10 text-violet'
                      : 'border-border text-text-muted hover:text-text-1'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t(`labCat_${id}`)}
                </button>
              ))}
            </div>

            {/* Buscador del catálogo + resultados */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                {t('labStudies')}
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('labSearchPlaceholder')}
                  className="w-full h-9 rounded-md bg-bg-2 border border-border pl-9 pr-3 text-sm text-text-1 outline-none focus:border-violet/60"
                />
              </div>

              <div className="mt-2 rounded-md border border-border/60 bg-bg-2/30 max-h-52 overflow-y-auto divide-y divide-border/40">
                {searching && results.length === 0 && (
                  <div className="px-3 py-3 text-[12px] text-text-muted flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('labSearching')}
                  </div>
                )}
                {!searching && results.length === 0 && (
                  <div className="px-3 py-3 text-[12px] text-text-muted">{t('labNoResults')}</div>
                )}
                {results.map((r) => {
                  const picked = studies.some((s) => s.code === r.code);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => addStudy(r)}
                      disabled={picked}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12.5px] transition-colors ${
                        picked ? 'opacity-40 cursor-default' : 'hover:bg-violet/[0.06]'
                      }`}
                    >
                      <span className="font-mono text-[11px] text-cyan shrink-0 w-[68px]">{r.code}</span>
                      <span className="text-text-1 flex-1 min-w-0 truncate">{r.name}</span>
                      {!picked && <Plus className="w-3.5 h-3.5 text-violet shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Seleccionados */}
              {studies.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {studies.map((s) => (
                    <span
                      key={s.code}
                      className="inline-flex items-center gap-1.5 rounded-md border border-violet/30 bg-violet/10 px-2 py-1 text-[11.5px] text-text-1 max-w-full"
                    >
                      <span className="font-mono text-[10px] text-violet">{s.code}</span>
                      <span className="truncate">{s.name}</span>
                      <button
                        type="button"
                        onClick={() => setStudies((prev) => prev.filter((x) => x.code !== s.code))}
                        className="text-text-muted hover:text-rose shrink-0"
                        aria-label={t('labRemoveStudy')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Urgencia + dónde se toma la muestra */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('labUrgency')}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {URGENCIES.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUrgency(u)}
                      className={`${pillBase} ${
                        urgency === u
                          ? u === 'STAT'
                            ? 'border-rose/50 bg-rose/10 text-rose'
                            : u === 'URGENT'
                              ? 'border-amber/50 bg-amber/10 text-amber'
                              : 'border-violet/50 bg-violet/10 text-violet'
                          : 'border-border text-text-muted hover:text-text-1'
                      }`}
                    >
                      {t(`labUrgency_${u}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('labCollection')}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {(['IN_HOUSE', 'EXTERNAL'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCollectionSite(c)}
                      className={`${pillBase} ${
                        collectionSite === c
                          ? 'border-violet/50 bg-violet/10 text-violet'
                          : 'border-border text-text-muted hover:text-text-1'
                      }`}
                    >
                      {t(`labCollection_${c}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Fecha + facturación */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {category === 'LABORATORY' ? t('labSampleDate') : t('labStudyDate')}
                </label>
                <DatePicker
                  value={sampleDate}
                  onChange={setSampleDate}
                  accent="violet"
                  size="sm"
                  todayKey={todayKey()}
                  todayLabel={t('dayToday')}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('labBillingType')}
                </label>
                <select
                  value={billingType}
                  onChange={(e) => setBillingType(e.target.value)}
                  className="w-full h-9 rounded-md bg-bg-2 border border-border px-3 text-sm text-text-1 outline-none focus:border-violet/60"
                >
                  <option value="">{t('labBillingPlaceholder')}</option>
                  {BILLING_TYPES.map((b) => (
                    <option key={b} value={b}>{t(`labBilling_${b}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Centro preferido — solo si el paciente va afuera */}
            {collectionSite === 'EXTERNAL' && (
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('labCenter')}
                </label>
                <input
                  value={center}
                  onChange={(e) => setCenter(e.target.value)}
                  placeholder={t('labCenterPlaceholder')}
                  className="w-full h-9 rounded-md bg-bg-2 border border-border px-3 text-sm text-text-1 outline-none focus:border-violet/60"
                />
              </div>
            )}

            {/* Diagnósticos que justifican la orden */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                  {t('labDiagnoses')}
                </label>
                <button
                  type="button"
                  onClick={() => setDxOpen(true)}
                  className="text-[11px] font-semibold text-violet hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> {t('dxAddIcd')}
                </button>
              </div>
              {dx.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-[11.5px] text-text-muted">
                  {t('labNoDiagnoses')}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {dx.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1.5 rounded-md border border-cyan/30 bg-cyan/10 px-2 py-1 text-[11.5px] text-text-1 max-w-full"
                    >
                      <span className="truncate">{d}</span>
                      <button
                        type="button"
                        onClick={() => setDx((prev) => prev.filter((x) => x !== d))}
                        className="text-text-muted hover:text-rose shrink-0"
                        aria-label={t('dxRemove')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Indicación clínica */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                {t('labIndication')}
              </label>
              <textarea
                value={indication}
                onChange={(e) => setIndication(e.target.value)}
                rows={3}
                placeholder={t('labIndicationPlaceholder')}
                className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none focus:border-violet/60 resize-y"
              />
              <div className="text-[10.5px] text-text-muted mt-1">{t('labIndicationHint')}</div>
            </div>

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </div>
            )}
          </div>

          <DialogFooter className="px-4 sm:px-5 py-3 border-t border-border flex-col sm:flex-row gap-2 shrink-0">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">{t('tplCancel')}</Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="w-full sm:w-auto gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {t('labCreate', { count: studies.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiagnosisPicker
        open={dxOpen}
        onClose={() => setDxOpen(false)}
        mode="ICD10"
        userId={userId}
        onPick={(row: DiagnosisRow) => {
          const label = `${row.icd10Code} - ${row.icd10Description}`;
          setDx((prev) => (prev.includes(label) ? prev : [...prev, label]));
          setDxOpen(false);
        }}
      />
    </>
  );
}
