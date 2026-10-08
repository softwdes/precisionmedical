'use client';

/**
 * Health History — el cuestionario "Comprehensive Adult New Patient Health
 * History" de la clínica, en pantalla.
 *
 * Abre pre-llenado con lo que ya hay del paciente (ficha + Historial Médico +
 * intake). Lo que falta queda habilitado para completarlo en la clínica. Lo que
 * se edita se GUARDA EN EL HISTORIAL MÉDICO (`updateMedicalHistory`) — no hay un
 * segundo registro, así "Medical history" y este formulario no se desfasan.
 * "Guardar y ver PDF" abre el visor con el formato exacto del cuestionario.
 *
 * La traducción dato ⇄ formulario vive en `lib/health-history-form.ts`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, X, Printer, Download, ArrowLeft, Save, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@precision/ui';
import { TagPill, useToast } from '@/components/ui-phoenix';
import { updateMedicalHistory } from './actions';
import type { MedicalHistoryData } from './medical-history-dialog';
import {
  CONDICIONES, SINTOMAS, VACUNAS, TIPOS_TABACO, TIPOS_ALCOHOL, ANTICONCEPTIVOS, HIJOS,
  armarPatch, nuevoId, type FormView, type Rating, type Tamizaje,
} from '@/lib/health-history-form';
import type { PatientRow } from './patients-client';

type Carga = { view: FormView; mh: MedicalHistoryData; sex: string | null; isMinor: boolean };

const SECCIONES = ['visit', 'meds', 'screening', 'conditions', 'history', 'review', 'social'] as const;
type Seccion = (typeof SECCIONES)[number];

const INP = 'w-full bg-bg-2 border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand';
const borde = (lleno: boolean) => (lleno ? 'border-emerald/40' : 'border-border');

// ── Piezas de formulario ─────────────────────────────────────────────────────

function Campo({ label, tag, children, className }: { label: string; tag?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{label}</span>
        {tag}
      </div>
      {children}
    </div>
  );
}

function Texto({ value, onChange, placeholder, multiline, max = 120, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; max?: number; className?: string;
}) {
  const cls = `${INP} ${borde(!!value.trim())} ${className ?? ''}`;
  return multiline
    ? <textarea rows={2} maxLength={max} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className={cls} />
    : <input maxLength={max} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className={cls} />;
}

function Fecha({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={value}
      onChange={e => onChange(e.target.value)} className={`${INP} ${borde(!!value)}`} />
  );
}

function Casilla({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-text-2 cursor-pointer select-none">
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-[var(--brand,#6366f1)]" />
      {label}
    </label>
  );
}

function Opciones<T extends string>({ value, options, onChange }: {
  value: T | ''; options: { v: T; label: string }[]; onChange: (v: T | '') => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(value === o.v ? '' : o.v)}
          className={`px-3 py-1.5 rounded-md text-[12.5px] transition-colors ${value === o.v ? 'bg-brand/20 text-brand-text' : 'bg-bg-2 text-text-2 hover:text-text-1'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SiNo({ value, onChange, yes, no }: { value: boolean | null; onChange: (v: boolean | null) => void; yes: string; no: string }) {
  return <Opciones<'Y' | 'N'> value={value === null ? '' : value ? 'Y' : 'N'} onChange={v => onChange(v === '' ? null : v === 'Y')}
    options={[{ v: 'Y', label: yes }, { v: 'N', label: no }]} />;
}

function Multi({ value, options, onChange }: { value: string[]; options: readonly string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {options.map(o => <Casilla key={o} on={value.includes(o)} label={o}
        onChange={on => onChange(on ? [...value, o] : value.filter(x => x !== o))} />)}
    </div>
  );
}

const Rejilla = ({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) => (
  <div className={`grid grid-cols-1 gap-3 ${cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{children}</div>
);
const Bloque = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div className="rounded-md bg-bg-2/40 p-3 space-y-3">
    <p className="text-[10px] uppercase tracking-wider font-semibold text-brand-text">{titulo}</p>
    {children}
  </div>
);

// ── El diálogo ───────────────────────────────────────────────────────────────

export function HealthHistoryDialog({ patient, open, onClose }: {
  patient: PatientRow; open: boolean; onClose: () => void;
}) {
  const t = useTranslations('phoenix.patients');
  const L = (k: string, vars?: Record<string, string | number>) => t(`hh.${k}`, vars);
  const toast = useToast();
  const es = useLocale().startsWith('es');
  const nombre = (d: { en: string; es: string }) => (es ? d.es : d.en);

  const [carga, setCarga] = useState<Carga | null>(null);
  const [view, setView] = useState<FormView | null>(null);
  const [error, setError] = useState(false);
  const [sec, setSec] = useState<Seccion>('visit');
  const [guardando, setGuardando] = useState(false);
  const [visor, setVisor] = useState<string | null>(null);
  const [confirmarCierre, setConfirmarCierre] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      const r = await fetch(`/api/admin/patients/${patient.id}/health-history`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as Carga;
      setCarga(d); setView(d.view);
    } catch { setError(true); }
  }, [patient.id]);

  useEffect(() => { if (open) void cargar(); }, [open, cargar]);

  const patch = useMemo(() => (view && carga ? armarPatch(view, carga.mh) : {}), [view, carga]);
  const sucio = Object.keys(patch).length > 0;
  const esMujer = carga?.sex === 'FEMALE';

  const set = useCallback(<K extends keyof FormView>(k: K, v: FormView[K]) => setView(p => (p ? { ...p, [k]: v } : p)), []);
  const setIn = <K extends 'visit' | 'exams' | 'social' | 'women' | 'screenings'>(k: K, parte: Partial<FormView[K]>) =>
    setView(p => (p ? { ...p, [k]: { ...p[k], ...parte } } : p));

  /** Guarda lo editado en el Historial Médico. Devuelve true si quedó guardado. */
  async function guardar(): Promise<boolean> {
    if (!carga) return false;
    if (!sucio) return true;
    setGuardando(true);
    try {
      const r = await updateMedicalHistory(patient.id, patch);
      if (!r.ok) { toast.error(r.code ? t(`mh.err.${r.code}`, { max: r.max ?? 0 }) : t('mh.err.inesperado')); return false; }
      await cargar();
      toast.success(L('saved'));
      return true;
    } finally { setGuardando(false); }
  }

  async function verPdf() {
    if (await guardar()) setVisor(`/api/admin/patients/${patient.id}/health-history/pdf?t=${Date.now()}`);
  }

  function intentarCerrar() { if (sucio) setConfirmarCierre(true); else onClose(); }

  // ── Secciones ──────────────────────────────────────────────────────────────
  function filaMed() { return { id: nuevoId(), name: '', dose: '', timesDaily: '', refills: '', patientReported: true }; }

  function render(v: FormView): React.ReactNode {
    const intake = <TagPill label={L('fromIntake')} colorClass="bg-cyan/10 text-cyan border-cyan/30" compact />;
    switch (sec) {
      case 'visit': return (
        <div className="space-y-3">
          <Campo label={L('referredBy')}><Texto value={v.visit.referredBy} onChange={x => setIn('visit', { referredBy: x })} /></Campo>
          <Campo label={L('mainReason')}><Texto multiline max={2000} value={v.visit.mainReason} onChange={x => setIn('visit', { mainReason: x })} /></Campo>
          <Campo label={L('otherConcerns')}><Texto multiline max={2000} value={v.visit.otherConcerns} onChange={x => setIn('visit', { otherConcerns: x })} /></Campo>
          <Campo label={L('goals')}><Texto multiline max={2000} value={v.visit.goals} onChange={x => setIn('visit', { goals: x })} /></Campo>
          <Campo label={L('rating')} tag={v.fromIntake.rating && v.visit.rating ? intake : undefined}>
            <Opciones<Rating> value={v.visit.rating ?? ''} onChange={x => setIn('visit', { rating: x || null })}
              options={[{ v: 'EXCELLENT', label: L('excellent') }, { v: 'GOOD', label: L('good') }, { v: 'FAIR', label: L('fair') }, { v: 'POOR', label: L('poor') }]} />
          </Campo>
        </div>
      );

      case 'meds': return (
        <div className="space-y-4">
          <Bloque titulo={L('medications')}>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Casilla on={v.meds.none} label={L('noMeds')}
                onChange={on => setView(p => p && ({ ...p, meds: { ...p.meds, none: on, rows: on ? [] : p.meds.rows } }))} />
              <Casilla on={v.meds.brought} label={L('broughtList')} onChange={on => setView(p => p && ({ ...p, meds: { ...p.meds, brought: on } }))} />
            </div>
            {v.fromIntake.meds && <div>{intake}</div>}
            {!v.meds.none && (
              <div className="space-y-2">
                {v.meds.rows.map((r, i) => (
                  <div key={r.id} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                    <Texto className="col-span-2 sm:col-span-1" placeholder={L('medication')} value={r.name} onChange={x => setView(p => p && ({ ...p, meds: { ...p.meds, rows: p.meds.rows.map((m, j) => j === i ? { ...m, name: x } : m) } }))} />
                    <Texto placeholder={L('dose')} value={r.dose} onChange={x => setView(p => p && ({ ...p, meds: { ...p.meds, rows: p.meds.rows.map((m, j) => j === i ? { ...m, dose: x } : m) } }))} />
                    <Texto placeholder={L('timesDaily')} value={r.timesDaily} onChange={x => setView(p => p && ({ ...p, meds: { ...p.meds, rows: p.meds.rows.map((m, j) => j === i ? { ...m, timesDaily: x } : m) } }))} />
                    <Texto placeholder={L('needRefills')} value={r.refills} onChange={x => setView(p => p && ({ ...p, meds: { ...p.meds, rows: p.meds.rows.map((m, j) => j === i ? { ...m, refills: x } : m) } }))} />
                    <button type="button" aria-label={L('remove')} onClick={() => setView(p => p && ({ ...p, meds: { ...p.meds, rows: p.meds.rows.filter((_, j) => j !== i) } }))}
                      className="p-1.5 rounded text-text-muted hover:text-rose transition-colors justify-self-end"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setView(p => p && ({ ...p, meds: { ...p.meds, rows: [...p.meds.rows, filaMed()] } }))}
                  className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-2 text-sm text-text-2 hover:border-brand hover:text-brand-text transition-colors">
                  <Plus className="w-4 h-4" /> {L('addMed')}
                </button>
              </div>
            )}
          </Bloque>
          <Bloque titulo={L('allergies')}>
            {v.fromIntake.allergies && <div>{intake}</div>}
            <Casilla on={v.allergies.none} label={L('noAllergies')}
              onChange={on => setView(p => p && ({ ...p, allergies: { text: on ? '' : p.allergies.text, none: on } }))} />
            {!v.allergies.none && (
              <Texto multiline max={2000} placeholder={L('allergiesHint')} value={v.allergies.text}
                onChange={x => setView(p => p && ({ ...p, allergies: { ...p.allergies, text: x } }))} />
            )}
          </Bloque>
        </div>
      );

      case 'screening': {
        const tam = (k: 'mammogram' | 'pap' | 'boneDensity', label: string) => {
          const x = v.screenings[k];
          const up = (parte: Partial<Tamizaje>) => setIn('screenings', { [k]: { ...x, ...parte } } as Partial<FormView['screenings']>);
          return (
            <div key={k} className="space-y-2">
              <p className="text-sm text-text-1">{label}</p>
              <Rejilla cols={3}>
                <Campo label={L('date')}><Fecha value={x.date} onChange={d => up({ date: d })} /></Campo>
                <Campo label={L('location')}><Texto value={x.location} onChange={d => up({ location: d })} /></Campo>
                <Campo label={L('abnormal')}><SiNo value={x.abnormal} onChange={d => up({ abnormal: d })} yes={L('yes')} no={L('no')} /></Campo>
              </Rejilla>
            </div>
          );
        };
        return (
          <div className="space-y-4">
            <Bloque titulo={L('immunizations')}>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {VACUNAS.map(d => <Casilla key={d.key} on={v.vaccines[d.key]} label={d.label}
                  onChange={on => setView(p => p && ({ ...p, vaccines: { ...p.vaccines, [d.key]: on } }))} />)}
              </div>
            </Bloque>
            <Bloque titulo={L('bloodWork')}>
              <Rejilla>
                <Campo label={L('date')}><Fecha value={v.exams.bloodDate} onChange={d => setIn('exams', { bloodDate: d })} /></Campo>
                <Campo label={L('resultsAvailable')}><SiNo value={v.exams.bloodResults} onChange={d => setIn('exams', { bloodResults: d })} yes={L('yes')} no={L('no')} /></Campo>
              </Rejilla>
            </Bloque>
            <Bloque titulo={L('colonoscopy')}>
              <Rejilla cols={3}>
                <Campo label={L('year')}><Texto max={4} value={v.exams.colonYear} onChange={d => setIn('exams', { colonYear: d.replace(/\D/g, '') })} /></Campo>
                <Campo label={L('location')}><Texto value={v.exams.colonLocation} onChange={d => setIn('exams', { colonLocation: d })} /></Campo>
                <Campo label={L('abnormal')}><SiNo value={v.exams.colonAbnormal} onChange={d => setIn('exams', { colonAbnormal: d })} yes={L('yes')} no={L('no')} /></Campo>
              </Rejilla>
            </Bloque>
            {esMujer && (
              <Bloque titulo={L('womenOnly')}>
                {tam('mammogram', L('mammogram'))}{tam('pap', L('pap'))}{tam('boneDensity', L('boneDensity'))}
              </Bloque>
            )}
          </div>
        );
      }

      case 'conditions': return (
        <div className="space-y-3">
          <Casilla on={v.noSignificant} label={L('noSignificant')} onChange={on => set('noSignificant', on)} />
          <div className="rounded-md bg-bg-2/40">
            <div className="hidden sm:grid grid-cols-[1.4fr_70px_70px_1.4fr] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-text-muted">
              <span>{L('condition')}</span><span>{L('current')}</span><span>{L('resolved')}</span><span>{L('comments')}</span>
            </div>
            {CONDICIONES.map(d => {
              const st = v.conditions[d.key];
              const poner = (parte: Partial<typeof st>) => setView(p => p && ({ ...p, conditions: { ...p.conditions, [d.key]: { ...p.conditions[d.key], ...parte } } }));
              return (
                <div key={d.key} className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1.4fr_70px_70px_1.4fr] gap-x-2 gap-y-1 items-center px-3 py-2 border-t border-row-sep">
                  <span className="text-[13px] text-text-1 col-span-3 sm:col-span-1">{nombre(d)}</span>
                  <Casilla on={st.state === 'CURRENT'} label={L('current')} onChange={on => poner({ state: on ? 'CURRENT' : null })} />
                  <Casilla on={st.state === 'RESOLVED'} label={L('resolved')} onChange={on => poner({ state: on ? 'RESOLVED' : null })} />
                  <input maxLength={2000} disabled={!st.state} value={st.comment} placeholder={st.state ? L('comments') : L('pickFirst')}
                    onChange={e => poner({ comment: e.target.value })}
                    className={`${INP} ${borde(!!st.comment)} col-span-3 sm:col-span-1 disabled:opacity-40`} />
                </div>
              );
            })}
            <div className="px-3 py-2 border-t border-row-sep space-y-2">
              <p className="text-[13px] text-text-1">{L('other')}</p>
              {v.otherConditions.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2 flex-wrap">
                  <input maxLength={120} value={o.text} onChange={e => set('otherConditions', v.otherConditions.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                    className={`${INP} ${borde(!!o.text)} flex-1 min-w-[160px]`} />
                  <Casilla on={o.resolved} label={L('resolved')} onChange={on => set('otherConditions', v.otherConditions.map((x, j) => j === i ? { ...x, resolved: on } : x))} />
                  <button type="button" aria-label={L('remove')} onClick={() => set('otherConditions', v.otherConditions.filter((_, j) => j !== i))}
                    className="p-1.5 rounded text-text-muted hover:text-rose transition-colors"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => set('otherConditions', [...v.otherConditions, { id: nuevoId(), text: '', resolved: false }])}
                className="flex items-center gap-2 text-sm text-text-2 hover:text-brand-text transition-colors"><Plus className="w-4 h-4" /> {L('addOther')}</button>
            </div>
          </div>
        </div>
      );

      case 'history': return (
        <div className="space-y-4">
          {v.fromIntake.surgeries && <div>{intake}</div>}
          <Lista titulo={L('surgeries')} addLabel={L('add')} removeLabel={L('remove')}
            rows={v.surgeries} onChange={r => set('surgeries', r)} nuevo={() => ({ id: nuevoId(), procedure: '', year: '', notes: '' })}
            cols={[['procedure', L('procedure'), '2fr'], ['year', L('year'), '90px'], ['notes', L('comments'), '2fr']]} />
          <Lista titulo={L('familyHistory')} addLabel={L('add')} removeLabel={L('remove')}
            rows={v.family} onChange={r => set('family', r)} nuevo={() => ({ id: nuevoId(), relation: '', condition: '' })}
            cols={[['relation', L('familyMember'), '1fr'], ['condition', L('condition'), '2fr']]} />
          <Lista titulo={L('providers')} addLabel={L('add')} removeLabel={L('remove')}
            rows={v.providers} onChange={r => set('providers', r)} nuevo={() => ({ id: nuevoId(), name: '', specialty: '', lastVisit: '' })}
            cols={[['name', L('providerName'), '2fr'], ['specialty', L('specialty'), '1fr'], ['lastVisit', L('lastVisit'), '1fr']]} />
        </div>
      );

      case 'review': return (
        <div className="space-y-3">
          <p className="text-[12px] text-text-muted">{L('reviewHint')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1">
            {SINTOMAS.map((col, ci) => (
              <div key={ci} className="space-y-1.5">
                {col.map((sy, i) => (
                  <div key={sy.en} className="flex items-center gap-2 flex-wrap">
                    <Casilla on={v.symptoms.includes(sy.en)} label={nombre(sy)}
                      onChange={on => set('symptoms', on ? [...v.symptoms, sy.en] : v.symptoms.filter(x => x !== sy.en))} />
                    {ci === 0 && i === 0 && (
                      <input maxLength={12} placeholder="lbs" value={v.weightLbs} onChange={e => set('weightLbs', e.target.value)}
                        className={`${INP} ${borde(!!v.weightLbs)} !w-20 !py-1`} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {v.otherSymptoms.length > 0 && (
            <p className="text-[11px] text-text-muted">{L('otherSymptoms', { list: v.otherSymptoms.join(', ') })}</p>
          )}
        </div>
      );

      case 'social': {
        const so = v.social; const w = v.women;
        const nuncaFormerActual = [{ v: 'NEVER' as const, label: L('never') }, { v: 'FORMER' as const, label: L('former') }, { v: 'CURRENT' as const, label: L('currentNow') }];
        const opcionesHijos = (HIJOS as readonly string[]).includes(so.children) || !so.children ? HIJOS : ([so.children, ...HIJOS] as readonly string[]);
        return (
          <div className="space-y-4">
            <Bloque titulo={L('socialHistory')}>
              <Rejilla>
                <Campo label={L('doYouWork')}>
                  <Opciones value={so.workStatus} onChange={x => setIn('social', { workStatus: x })}
                    options={[{ v: 'NO', label: L('no') }, { v: 'FULL', label: L('fullTime') }, { v: 'PART', label: L('partTime') }]} />
                </Campo>
                <Campo label={L('workType')}><Texto value={so.workType} onChange={x => setIn('social', { workType: x })} /></Campo>
                <Campo label={L('children')}>
                  <Opciones value={so.children} onChange={x => setIn('social', { children: x })} options={opcionesHijos.map(h => ({ v: h, label: h }))} />
                </Campo>
                <Campo label={L('marital')}>
                  <p className="text-sm text-text-1 py-2">{v.patient.marital || <span className="text-text-muted">{L('maritalHint')}</span>}</p>
                </Campo>
              </Rejilla>
            </Bloque>
            <Bloque titulo={L('tobacco')}>
              <Opciones value={so.tobacco} onChange={x => setIn('social', { tobacco: x })} options={nuncaFormerActual} />
              {(so.tobacco === 'CURRENT' || so.tobacco === 'FORMER') && (
                <div className="space-y-3">
                  <Campo label={L('type')}><Multi value={so.tobaccoTypes} options={TIPOS_TABACO} onChange={x => setIn('social', { tobaccoTypes: x })} /></Campo>
                  <Rejilla cols={3}>
                    <Campo label={L('packsDay')}><Texto max={12} value={so.packsPerDay} onChange={x => setIn('social', { packsPerDay: x })} /></Campo>
                    <Campo label={L('years')}><Texto max={12} value={so.tobaccoYears} onChange={x => setIn('social', { tobaccoYears: x })} /></Campo>
                    <Campo label={L('quitDate')}><Fecha value={so.quitDate} onChange={x => setIn('social', { quitDate: x })} /></Campo>
                  </Rejilla>
                </div>
              )}
              <Rejilla>
                <Campo label={L('secondhand')}><SiNo value={so.secondhand} onChange={x => setIn('social', { secondhand: x })} yes={L('yes')} no={L('no')} /></Campo>
                <Campo label={L('readyToQuit')}><SiNo value={so.readyToQuit} onChange={x => setIn('social', { readyToQuit: x })} yes={L('yes')} no={L('no')} /></Campo>
              </Rejilla>
            </Bloque>
            <Bloque titulo={L('alcohol')}>
              <Opciones value={so.alcohol} onChange={x => setIn('social', { alcohol: x })} options={nuncaFormerActual} />
              {so.alcohol === 'CURRENT' && (
                <Rejilla>
                  <Campo label={L('drinksWeek')}><Texto max={12} value={so.drinksPerWeek} onChange={x => setIn('social', { drinksPerWeek: x })} /></Campo>
                  <Campo label={L('type')}><Multi value={so.alcoholTypes} options={TIPOS_ALCOHOL} onChange={x => setIn('social', { alcoholTypes: x })} /></Campo>
                </Rejilla>
              )}
            </Bloque>
            <Bloque titulo={L('drugs')}>
              <Opciones value={so.drugs} onChange={x => setIn('social', { drugs: x })} options={nuncaFormerActual} />
              {(so.drugs === 'CURRENT' || so.drugs === 'FORMER') && (
                <Campo label={L('type')}><Texto value={so.drugType} onChange={x => setIn('social', { drugType: x })} /></Campo>
              )}
            </Bloque>
            <Bloque titulo={L('sexualHealth')}>
              <Rejilla>
                <Campo label={L('sexual')}>
                  <Opciones value={so.sexual} onChange={x => setIn('social', { sexual: x })}
                    options={[{ v: 'CURRENT', label: L('currentNow') }, { v: 'NOT_CURRENT', label: L('notCurrently') }, { v: 'NEVER', label: L('never') }]} />
                </Campo>
                <Campo label={L('with')}>
                  <Opciones value={so.sexualWith} onChange={x => setIn('social', { sexualWith: x })}
                    options={[{ v: 'MALE', label: L('male') }, { v: 'FEMALE', label: L('female') }, { v: 'BOTH', label: L('both') }]} />
                </Campo>
              </Rejilla>
              <Campo label={L('birthControl')}>
                <div className="space-y-2">
                  <Multi value={so.birthControl} options={ANTICONCEPTIVOS} onChange={x => setIn('social', { birthControl: x })} />
                  {so.birthControl.includes('Other') && <Texto value={so.birthControlOther} onChange={x => setIn('social', { birthControlOther: x })} />}
                </div>
              </Campo>
              <Rejilla>
                <Campo label={L('military')}><SiNo value={so.military} onChange={x => setIn('social', { military: x })} yes={L('yes')} no={L('no')} /></Campo>
                <Campo label={L('school')}><SiNo value={so.school} onChange={x => setIn('social', { school: x })} yes={L('yes')} no={L('no')} /></Campo>
              </Rejilla>
            </Bloque>
            {esMujer ? (
              <Bloque titulo={L('womensHealth')}>
                <Rejilla cols={3}>
                  <Campo label={L('pregnancies')}><Texto max={6} value={w.pregnancies} onChange={x => setIn('women', { pregnancies: x })} /></Campo>
                  <Campo label={L('births')}><Texto max={6} value={w.births} onChange={x => setIn('women', { births: x })} /></Campo>
                  <Campo label={L('miscarriages')}><Texto max={6} value={w.miscarriages} onChange={x => setIn('women', { miscarriages: x })} /></Campo>
                  <Campo label={L('menarche')}><Texto max={6} value={w.menarcheAge} onChange={x => setIn('women', { menarcheAge: x })} /></Campo>
                  <Campo label={L('menopause')}><Texto max={6} value={w.menopauseAge} onChange={x => setIn('women', { menopauseAge: x })} /></Campo>
                  <div className="flex items-end pb-2"><Casilla on={w.notApplicable} label={L('notApplicable')} onChange={x => setIn('women', { notApplicable: x })} /></div>
                </Rejilla>
                <Campo label={L('periodConcerns')}><SiNo value={w.periodConcerns} onChange={x => setIn('women', { periodConcerns: x })} yes={L('yes')} no={L('no')} /></Campo>
                <Rejilla cols={3}>
                  <Campo label={L('periodEvery')}><Texto max={6} value={w.periodEveryDays} onChange={x => setIn('women', { periodEveryDays: x })} /></Campo>
                  <Campo label={L('periodLast')}><Texto max={6} value={w.periodLastDays} onChange={x => setIn('women', { periodLastDays: x })} /></Campo>
                  <Campo label={L('flow')}>
                    <Opciones value={w.periodFlow} onChange={x => setIn('women', { periodFlow: x })}
                      options={[{ v: 'LIGHT', label: L('light') }, { v: 'NORMAL', label: L('normal') }, { v: 'HEAVY', label: L('heavy') }]} />
                  </Campo>
                </Rejilla>
                <Rejilla>
                  <Campo label={L('irregular')}><SiNo value={w.periodIrregular} onChange={x => setIn('women', { periodIrregular: x })} yes={L('yes')} no={L('no')} /></Campo>
                  {w.periodIrregular && <Campo label={L('pattern')}><Texto value={w.periodPattern} onChange={x => setIn('women', { periodPattern: x })} /></Campo>}
                </Rejilla>
              </Bloque>
            ) : (
              <p className="text-[11px] text-text-muted">{L('womenHidden')}</p>
            )}
          </div>
        );
      }
    }
  }

  /** Puntito verde: la sección ya tiene algo cargado. */
  function conDatos(s: Seccion, v: FormView): boolean {
    switch (s) {
      case 'visit': return !!(v.visit.referredBy || v.visit.mainReason || v.visit.otherConcerns || v.visit.goals || v.visit.rating);
      case 'meds': return v.meds.none || v.meds.rows.length > 0 || !!v.allergies.text || v.allergies.none;
      case 'screening': return Object.values(v.vaccines).some(Boolean) || !!(v.exams.bloodDate || v.exams.colonYear);
      case 'conditions': return v.noSignificant || v.otherConditions.length > 0 || Object.values(v.conditions).some(c => c.state);
      case 'history': return v.surgeries.length + v.family.length + v.providers.length > 0;
      case 'review': return v.symptoms.length > 0;
      case 'social': return !!(v.social.tobacco || v.social.alcohol || v.social.drugs || v.social.workStatus || v.social.children);
    }
  }

  return (
    <>
      <Dialog open={open && !visor} onOpenChange={x => { if (!x) intentarCerrar(); }}>
        <DialogContent className="max-w-5xl w-[96vw] p-0 overflow-hidden flex flex-col max-h-[92vh]">
          <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
            <DialogTitle className="text-base font-semibold text-text-1 flex items-center gap-2 flex-wrap">
              <FileText className="w-4 h-4 text-brand" /> {L('title', { name: `${patient.firstName} ${patient.lastName}` })}
            </DialogTitle>
            <DialogDescription className="text-xs text-text-muted">{L('subtitle')}</DialogDescription>
          </DialogHeader>

          {!view ? (
            <div className="flex-1 grid place-items-center py-24 text-sm text-text-muted">
              {error
                ? <div className="text-center space-y-3"><p className="text-rose">{L('loadError')}</p>
                    <button onClick={() => void cargar()} className="px-3 py-1.5 rounded-md bg-bg-2 text-text-1 text-sm">{L('retry')}</button></div>
                : L('loading')}
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
              <nav className="sm:w-52 shrink-0 sm:border-r border-b sm:border-b-0 border-border p-2 flex sm:flex-col gap-1 overflow-x-auto">
                {SECCIONES.map((s, i) => (
                  <button key={s} onClick={() => setSec(s)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md text-[12.5px] text-left whitespace-nowrap transition-colors ${sec === s ? 'bg-brand/20 text-text-1' : 'text-text-muted hover:text-text-1 hover:bg-white/[0.02]'}`}>
                    <span>{i + 1} · {L(`s.${s}`)}</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${conDatos(s, view) ? 'bg-emerald' : 'bg-amber/70'}`} />
                  </button>
                ))}
              </nav>
              <div className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
                {carga?.isMinor && <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">{L('minorWarn')}</div>}
                {render(view)}
              </div>
            </div>
          )}

          <div className="px-4 sm:px-6 py-3 border-t border-border shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-[11px] text-text-muted">{sucio ? L('unsaved') : L('savedInRecord')}</span>
            <div className="flex flex-col sm:flex-row gap-2">
              <a href={`/api/admin/patients/${patient.id}/health-history/pdf?blank=1`} target="_blank" rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-bg-2 text-text-2 text-sm hover:text-text-1 transition-colors">
                <Printer className="w-3.5 h-3.5" /> {L('printBlank')}
              </a>
              <button onClick={() => void guardar()} disabled={!view || guardando || !sucio}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-bg-2 text-text-1 text-sm disabled:opacity-50 transition-colors">
                <Save className="w-3.5 h-3.5" /> {guardando ? L('saving') : L('save')}
              </button>
              <button onClick={() => void verPdf()} disabled={!view || guardando}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 disabled:opacity-60 transition-colors">
                <FileText className="w-3.5 h-3.5" /> {L('saveAndView')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visor: el PDF real, con el formato exacto del cuestionario. */}
      <Dialog open={!!visor} onOpenChange={x => { if (!x) setVisor(null); }}>
        <DialogContent className="max-w-4xl w-[96vw] p-0 overflow-hidden flex flex-col h-[92vh]">
          <DialogHeader className="px-4 sm:px-5 py-3 shrink-0 border-b border-border">
            <DialogTitle className="text-[14px] flex items-center gap-2 flex-wrap">
              <Printer className="w-4 h-4 text-brand" /> {L('viewerTitle')}
              <span className="ml-auto flex gap-2">
                <button onClick={() => setVisor(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-bg-2 text-text-2 text-[12.5px] hover:text-text-1">
                  <ArrowLeft className="w-3.5 h-3.5" /> {L('backToEdit')}
                </button>
                {visor && (
                  <a href={`${visor}&download=1`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-bg-2 text-text-2 text-[12.5px] hover:text-text-1">
                    <Download className="w-3.5 h-3.5" /> {L('download')}
                  </a>
                )}
              </span>
            </DialogTitle>
          </DialogHeader>
          {visor && <iframe src={visor} title={L('viewerTitle')} className="w-full flex-1 border-0 bg-white" />}
        </DialogContent>
      </Dialog>

      {/* Cerrar con cambios sin guardar. */}
      <Dialog open={confirmarCierre} onOpenChange={x => { if (!x) setConfirmarCierre(false); }}>
        <DialogContent className="max-w-sm p-5 space-y-4">
          <DialogHeader><DialogTitle className="text-base text-text-1">{L('discardTitle')}</DialogTitle>
            <DialogDescription className="text-xs text-text-muted">{L('discardBody')}</DialogDescription></DialogHeader>
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button onClick={() => setConfirmarCierre(false)} className="px-3 py-2 rounded-md bg-bg-2 text-text-1 text-sm">{L('keepEditing')}</button>
            <button onClick={() => { setConfirmarCierre(false); onClose(); }} className="px-3 py-2 rounded-md bg-rose/15 text-rose text-sm">{L('discard')}</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Lista editable de filas con columnas de texto (cirugías, familia, proveedores). */
function Lista<R extends { id: string }>({ titulo, rows, onChange, nuevo, cols, addLabel, removeLabel }: {
  titulo: string; rows: R[]; onChange: (r: R[]) => void; nuevo: () => R;
  cols: [keyof R & string, string, string][]; addLabel: string; removeLabel: string;
}) {
  const plantilla = cols.map(c => c[2]).join(' ');
  return (
    <Bloque titulo={titulo}>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="grid gap-2 items-center grid-cols-1 sm:[grid-template-columns:var(--cols)_auto]" style={{ ['--cols' as string]: plantilla }}>
            {cols.map(([k, ph]) => (
              <input key={k} maxLength={k === 'notes' ? 2000 : 120} placeholder={ph} value={String(r[k] ?? '')}
                onChange={e => onChange(rows.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))}
                className={`${INP} ${borde(!!r[k])}`} />
            ))}
            <button type="button" aria-label={removeLabel} onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="p-1.5 rounded text-text-muted hover:text-rose transition-colors justify-self-end"><X className="w-4 h-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...rows, nuevo()])}
          className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-2 text-sm text-text-2 hover:border-brand hover:text-brand-text transition-colors">
          <Plus className="w-4 h-4" /> {addLabel}
        </button>
      </div>
    </Bloque>
  );
}
