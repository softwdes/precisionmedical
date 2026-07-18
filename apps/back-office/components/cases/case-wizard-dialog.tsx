'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Check, ChevronRight, FileText, Car, Stethoscope, Scale, ShieldCheck, Send,
  Search as SearchIcon, ArrowLeft,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Input, Label,
} from '@precision/ui';
import { FormField, InfoCard, TagPill } from '@/components/ui-phoenix';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutoResult { id: string; label: string; subtitle?: string; shortCode?: string; color?: string; }
type CaseType    = 'MVA' | 'GENERAL';
type LawyerStatus = 'HAS' | 'SEEKING' | 'DECLINED';
type FormDelivery = 'SEND_NOW' | 'TABLET_AT_CLINIC';

interface Patient {
  id:        string;
  firstName: string;
  lastName:  string;
  email?:    string | null;
  phone?:    string | null;
}

interface Props {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  patient:      Patient;
  onCreated?:   (caseId: string) => void;
  editCaseId?:  string;
  onSaved?:     () => void;
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────

function Autocomplete({
  endpoint, extraParams, placeholder, selected, onSelect, renderAvatar,
}: {
  endpoint: string;
  extraParams?: Record<string, string>;
  placeholder: string;
  selected: AutoResult | null;
  onSelect: (r: AutoResult | null) => void;
  renderAvatar?: (r: AutoResult) => React.ReactNode;
}) {
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState<AutoResult[]>([]);
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected) { setQuery(''); setOpen(false); return; }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, ...(extraParams ?? {}) });
        const res = await fetch(`${endpoint}?${params}`);
        if (res.ok) { const data = await res.json(); setResults(data.results ?? []); }
      } catch { setResults([]); } finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, endpoint, extraParams, selected]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-brand/10 border border-brand/30">
        {renderAvatar?.(selected)}
        <div className="flex-1 min-w-0">
          <div className="text-text-1 text-sm font-medium truncate">{selected.label}</div>
          {selected.subtitle && <div className="text-text-muted text-xs truncate">{selected.subtitle}</div>}
        </div>
        <button type="button" onClick={() => onSelect(null)} className="text-text-muted hover:text-rose text-xs shrink-0">
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      {open && (results.length > 0 || loading) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-1 border border-border-strong rounded-md shadow-xl max-h-60 overflow-y-auto">
          {loading && results.length === 0 ? (
            <div className="px-3 py-2 text-text-muted text-xs">Buscando…</div>
          ) : results.map((r) => (
            <button key={r.id} type="button" onClick={() => { onSelect(r); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left text-sm transition-colors">
              {renderAvatar?.(r)}
              <div className="flex-1 min-w-0">
                <div className="text-text-1 truncate">{r.label}</div>
                {r.subtitle && <div className="text-text-muted text-xs truncate">{r.subtitle}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Segmented option ─────────────────────────────────────────────────────────

function SegmentedOption({ selected, onClick, icon, label }: {
  selected: boolean; onClick: () => void; icon: string; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-all
        ${selected
          ? 'border-brand bg-brand/10 text-brand font-medium'
          : 'border-border bg-bg-2/40 text-text-muted hover:border-brand/40'}`}
    >
      <span>{icon}</span>
      <span className="truncate">{label}</span>
      {selected && <Check className="w-3 h-3 ml-auto shrink-0" />}
    </button>
  );
}

// ─── Note ─────────────────────────────────────────────────────────────────────

function Note({ tone, children }: { tone: 'amber' | 'emerald' | 'rose' | 'cyan'; children: React.ReactNode }) {
  const cls = {
    amber:   'border-amber/30 bg-amber/10 text-amber',
    emerald: 'border-emerald/30 bg-emerald/10 text-emerald',
    rose:    'border-rose/30 bg-rose/10 text-rose',
    cyan:    'border-cyan/30 bg-cyan/10 text-cyan',
  }[tone];
  return <p className={`rounded-md border px-3 py-2 text-[11px] ${cls}`}>{children}</p>;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 }) {
  const steps = [{ n: 1, icon: FileText }, { n: 2, icon: Send }];
  return (
    <div className="flex items-center justify-center gap-0 mb-1">
      {steps.map(({ n, icon: Icon }, idx) => {
        const done   = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center">
            <div className={`
              flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all
              ${done   ? 'bg-brand border-brand text-white' : ''}
              ${active ? 'bg-bg-1 border-brand text-brand' : ''}
              ${!done && !active ? 'bg-bg-2 border-border text-text-muted' : ''}
            `}>
              {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-20 h-0.5 ${n < current ? 'bg-brand' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CaseWizardDialog({ open, onOpenChange, patient, onCreated, editCaseId, onSaved }: Props) {
  const t      = useTranslations('caseWizard');
  const router = useRouter();

  const isEdit = !!editCaseId;

  const [step,   setStep]   = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // ── Step 1 fields ──────────────────────────────────────────────────────────
  const [caseType,      setCaseType]      = useState<CaseType>('MVA');
  const isMVA = caseType === 'MVA';
  const [accidentDate,  setAccidentDate]  = useState('');
  const [accidentType,  setAccidentType]  = useState('AUTO');
  const [accidentLocation, setAccidentLocation] = useState('');
  const [description,   setDescription]   = useState('');

  const [lawyerStatus,   setLawyerStatus]   = useState<LawyerStatus>('HAS');
  const [lawFirm,        setLawFirm]        = useState<AutoResult | null>(null);
  const [attorney,       setAttorney]       = useState<AutoResult | null>(null);
  const [caseManagerName,  setCaseManagerName]  = useState('');
  const [caseManagerEmail, setCaseManagerEmail] = useState('');
  const [firmPhone,      setFirmPhone]      = useState('');
  const [chiropractor,   setChiropractor]   = useState('');

  const [insurance,    setInsurance]    = useState<AutoResult | null>(null);
  const [policyNumber, setPolicyNumber] = useState('');

  // ── Step 2 fields ──────────────────────────────────────────────────────────
  const [formDelivery, setFormDelivery] = useState<FormDelivery>('SEND_NOW');

  // ── Reset on close ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setStep(1); setCaseType('MVA'); setAccidentDate(''); setAccidentType('AUTO');
      setAccidentLocation(''); setDescription('');
      setLawyerStatus('HAS'); setLawFirm(null); setAttorney(null);
      setCaseManagerName(''); setCaseManagerEmail(''); setFirmPhone(''); setChiropractor('');
      setInsurance(null); setPolicyNumber('');
      setFormDelivery('SEND_NOW'); setError('');
      return;
    }
    // Edit: pre-populate
    if (isEdit && editCaseId) {
      fetch(`/api/admin/cases/${editCaseId}`)
        .then(r => r.json())
        .then(j => {
          const c = j.case;
          if (!c) return;
          setCaseType(c.caseType === 'MVA' ? 'MVA' : 'GENERAL');
          if (c.accidentDate) setAccidentDate(c.accidentDate.slice(0, 10));
          setDescription(c.accidentNotes ?? '');
          if (c.lawFirm) { setLawFirm({ id: c.lawFirm.id, label: c.lawFirm.firmName }); }
          const cd = (c.consentsData ?? {}) as Record<string, unknown>;
          setCaseManagerName((cd.attorney as string | undefined) ?? '');
          setChiropractor((cd.chiropractor as string | undefined) ?? '');
        })
        .catch(() => {});
    }
  }, [open, isEdit, editCaseId]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const canGoStep2 = !isMVA || lawyerStatus !== 'HAS' || !!lawFirm;

  // ── Submit (create) ────────────────────────────────────────────────────────
  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/cases', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingPatientId: patient.id,
          accident: {
            date:     accidentDate ? new Date(accidentDate + 'T12:00:00Z').toISOString() : null,
            type:     accidentType,
            location: accidentLocation.trim() || null,
            notes:    description.trim() || null,
          },
          legal: {
            lawyerStatus,
            lawFirmId:       lawyerStatus === 'HAS' ? (lawFirm?.id ?? null)  : null,
            attorneyId:      lawyerStatus === 'HAS' ? (attorney?.id ?? null)  : null,
            caseManagerName: lawyerStatus === 'HAS' ? (caseManagerName.trim() || null) : null,
            caseManagerEmail: lawyerStatus === 'HAS' ? (caseManagerEmail.trim() || null) : null,
            firmPhone:       lawyerStatus === 'HAS' ? (firmPhone.trim() || null) : null,
            chiropractor:    chiropractor.trim() || null,
          },
          insurance: {
            primaryInsuranceId:  insurance?.id ?? null,
            primaryPolicyNumber: policyNumber.trim() || null,
          },
          caseType,
          source:      'WALK_IN',
          formDelivery,
          consents: {},
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.message ?? json.error ?? 'Error al crear el caso.'); return; }
      onOpenChange(false);
      if (onCreated) onCreated(json.case?.id ?? '');
      router.refresh();
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  // ── Save (edit) ────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/cases/${editCaseId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseType,
          accidentDate:  accidentDate || null,
          accidentNotes: description  || null,
          lawFirmId:     lawFirm?.id  ?? null,
          lawFirmLabel:  lawFirm?.label ?? null,
          chiropractor:  chiropractor  || null,
          lawyerStatus,
          caseManagerName:  caseManagerName  || null,
          caseManagerEmail: caseManagerEmail || null,
          firmPhone:        firmPhone        || null,
          primaryInsuranceId:  insurance?.id ?? null,
          primaryPolicyNumber: policyNumber  || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.message ?? json.error ?? 'Error al guardar.'); return; }
      onOpenChange(false);
      if (onSaved) onSaved();
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  // ── Step labels ────────────────────────────────────────────────────────────
  const stepLabels: Record<1 | 2, { title: string; sub: string }> = {
    1: { title: t('step1Title'), sub: t('step1Sub') },
    2: { title: t('step2Title'), sub: t('step2Sub') },
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">

        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-4 border-b border-border sticky top-0 bg-bg-1 z-10">
          <DialogTitle className="flex items-center gap-2 text-text-1 text-base">
            <FileText className="w-4 h-4 text-brand" />
            {isEdit ? t('titleEdit') : t('title')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            {patient.firstName} {patient.lastName}
          </DialogDescription>
          {!isEdit && (
            <div className="pt-3">
              <StepIndicator current={step} />
              <div className="text-center mt-2">
                <p className="text-sm font-semibold text-text-1">{stepLabels[step].title}</p>
                <p className="text-[11px] text-text-muted">{stepLabels[step].sub}</p>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="px-4 sm:px-6 py-5 space-y-4">

          {/* ══ STEP 1: Caso + Abogado + Seguro ══ */}
          {(step === 1 || isEdit) && (
            <>
              {/* Tipo de caso */}
              <InfoCard title={t('caseType')} icon={FileText} tone="brand">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([['MVA', t('caseTypeMVA'), Car], ['GENERAL', t('caseTypeGM'), Stethoscope]] as const).map(([val, label, Icon]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCaseType(val)}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg border text-sm text-left transition-all
                        ${caseType === val
                          ? 'border-brand bg-brand/10 text-brand font-medium'
                          : 'border-border bg-bg-2/40 text-text-muted hover:border-brand/40'}
                      `}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {label}
                      {caseType === val && <Check className="w-3.5 h-3.5 ml-auto text-brand" />}
                    </button>
                  ))}
                </div>
              </InfoCard>

              {/* Datos del accidente — solo MVA */}
              {isMVA && (
                <InfoCard title={t('accidentSection')} icon={Car} tone="rose">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField.Input label={t('accidentDate')} value={accidentDate} onChange={setAccidentDate} type="date" />
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">
                        {t('accidentType')}
                      </label>
                      <select
                        value={accidentType}
                        onChange={e => setAccidentType(e.target.value)}
                        className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 outline-none focus:border-brand transition-colors appearance-none"
                      >
                        <option value="AUTO">{t('accidentTypeAuto')}</option>
                        <option value="MOTORCYCLE">{t('accidentTypeMotorcycle')}</option>
                        <option value="TRUCK">{t('accidentTypeTruck')}</option>
                        <option value="PEDESTRIAN">{t('accidentTypePedestrian')}</option>
                        <option value="OTHER">{t('accidentTypeOther')}</option>
                      </select>
                    </div>
                  </div>
                  <FormField.Input
                    label={t('accidentLocation')}
                    value={accidentLocation}
                    onChange={setAccidentLocation}
                    placeholder={t('accidentLocationPlaceholder')}
                  />
                  <FormField.Textarea
                    label={t('accidentDescription')}
                    value={description}
                    onChange={setDescription}
                    placeholder={t('accidentDescriptionPlaceholder')}
                    rows={2}
                  />
                </InfoCard>
              )}

              {/* Notas para MG */}
              {!isMVA && (
                <FormField.Textarea
                  label={t('accidentDescription')}
                  value={description}
                  onChange={setDescription}
                  placeholder={t('accidentDescriptionPlaceholder')}
                  rows={3}
                />
              )}

              {/* Abogado — solo MVA */}
              {isMVA && (
                <InfoCard
                  title={t('lawyerSection')}
                  icon={Scale}
                  tone="rose"
                  rightSlot={<TagPill label={t('lawyerRequired')} colorClass="bg-rose/15 text-rose border-rose/30" />}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <SegmentedOption selected={lawyerStatus === 'HAS'}     onClick={() => setLawyerStatus('HAS')}     icon="✓" label={t('lawyerHas')} />
                    <SegmentedOption selected={lawyerStatus === 'SEEKING'} onClick={() => setLawyerStatus('SEEKING')} icon="🔍" label={t('lawyerSeeking')} />
                    <SegmentedOption selected={lawyerStatus === 'DECLINED'} onClick={() => setLawyerStatus('DECLINED')} icon="✗" label={t('lawyerDeclined')} />
                  </div>

                  {lawyerStatus === 'HAS' && (
                    <div className="space-y-3">
                      <div>
                        <Label>{t('lawFirmLabel')}</Label>
                        <Autocomplete
                          endpoint="/api/admin/lawyers/autocomplete"
                          placeholder={t('lawFirmPlaceholder')}
                          selected={lawFirm}
                          onSelect={(r) => { setLawFirm(r); setAttorney(null); }}
                        />
                      </div>
                      {lawFirm && (
                        <>
                          <div>
                            <Label>{t('attorneyLabel')}</Label>
                            <Autocomplete
                              endpoint="/api/admin/lawyers/autocomplete"
                              extraParams={{ firmId: lawFirm.id }}
                              placeholder={t('attorneyPlaceholder')}
                              selected={attorney}
                              onSelect={setAttorney}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField.Input label={t('caseManagerLabel')} value={caseManagerName} onChange={setCaseManagerName} />
                            <FormField.Input label={t('caseManagerEmail')} value={caseManagerEmail} onChange={setCaseManagerEmail} type="email" />
                          </div>
                          <FormField.Phone label={t('firmPhone')} value={firmPhone} onChange={setFirmPhone} />
                        </>
                      )}
                      <Note tone="emerald">{t('lawyerNoteHas')}</Note>
                    </div>
                  )}
                  {lawyerStatus === 'SEEKING'  && <Note tone="amber">{t('lawyerNoteSeeking')}</Note>}
                  {lawyerStatus === 'DECLINED' && <Note tone="rose">{t('lawyerNoteDeclined')}</Note>}

                  <FormField.Input
                    label={t('chiropractorLabel')}
                    value={chiropractor}
                    onChange={setChiropractor}
                    placeholder={t('chiropractorPlaceholder')}
                  />
                </InfoCard>
              )}

              {/* Seguro — solo MVA */}
              {isMVA && (
                <InfoCard title={t('insuranceSection')} icon={ShieldCheck} tone="cyan">
                  <div>
                    <Label>{t('insuranceLabel')}</Label>
                    <Autocomplete
                      endpoint="/api/admin/insurances/autocomplete"
                      placeholder={t('insurancePlaceholder')}
                      selected={insurance}
                      onSelect={setInsurance}
                      renderAvatar={(r) => r.color && r.shortCode ? (
                        <div
                          className="w-7 h-7 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                          style={{ background: r.color }}
                        >
                          {r.shortCode}
                        </div>
                      ) : null}
                    />
                  </div>
                  {insurance && (
                    <FormField.Input
                      label={t('policyNumber')}
                      value={policyNumber}
                      onChange={setPolicyNumber}
                      placeholder="PIP-2026-0142"
                      hint={t('policyHint')}
                    />
                  )}
                </InfoCard>
              )}

              {!canGoStep2 && isMVA && (
                <Note tone="amber">{t('lawFirmRequired')}</Note>
              )}
            </>
          )}

          {/* ══ STEP 2: Enviar formulario ══ */}
          {step === 2 && !isEdit && (
            <>
              <InfoCard title={t('formDeliveryTitle')} icon={Send} tone="emerald">
                <div className="text-text-2 text-xs">{t('formDeliveryDesc')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormDelivery('SEND_NOW')}
                    className={`
                      flex flex-col gap-1 px-4 py-3 rounded-lg border text-left transition-all
                      ${formDelivery === 'SEND_NOW'
                        ? 'border-emerald bg-emerald/10 text-emerald'
                        : 'border-border bg-bg-2/40 text-text-muted hover:border-emerald/40'}
                    `}
                  >
                    <span className="text-lg">📨</span>
                    <span className="font-medium text-sm">{t('sendNowTitle')}</span>
                    <span className="text-[11px] opacity-80">{t('sendNowDesc')}</span>
                    {formDelivery === 'SEND_NOW' && <Check className="w-3.5 h-3.5 mt-1 text-emerald" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormDelivery('TABLET_AT_CLINIC')}
                    className={`
                      flex flex-col gap-1 px-4 py-3 rounded-lg border text-left transition-all
                      ${formDelivery === 'TABLET_AT_CLINIC'
                        ? 'border-emerald bg-emerald/10 text-emerald'
                        : 'border-border bg-bg-2/40 text-text-muted hover:border-emerald/40'}
                    `}
                  >
                    <span className="text-lg">📱</span>
                    <span className="font-medium text-sm">{t('tabletTitle')}</span>
                    <span className="text-[11px] opacity-80">{t('tabletDesc')}</span>
                    {formDelivery === 'TABLET_AT_CLINIC' && <Check className="w-3.5 h-3.5 mt-1 text-emerald" />}
                  </button>
                </div>
              </InfoCard>

              {/* Resumen */}
              <InfoCard title={t('summaryTitle')} icon={Check} tone="cyan">
                <ul className="space-y-1.5 text-xs text-text-2 list-none m-0 p-0">
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                    <span>{t('summaryPatient')}: <strong className="text-text-1">{patient.firstName} {patient.lastName}</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                    <span>{t('summaryCaseType')}: <strong className="text-text-1">{caseType}</strong>
                      {isMVA && lawFirm && <> · {lawFirm.label}</>}
                    </span>
                  </li>
                  {insurance && (
                    <li className="flex items-start gap-2">
                      <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                      <span>{t('summaryInsurance')}: <strong className="text-text-1">{insurance.label}</strong></span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                    <span>{formDelivery === 'SEND_NOW' ? t('summaryFormSend') : t('summaryFormTablet')}</span>
                  </li>
                </ul>
              </InfoCard>
            </>
          )}

          {/* Error */}
          {error && (
            <p className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-4 sm:px-6 py-4 border-t border-border flex-col sm:flex-row gap-2 sticky bottom-0 bg-bg-1">
          {step > 1 && !isEdit && (
            <Button variant="outline" onClick={() => setStep(1)} disabled={saving} className="w-full sm:w-auto gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('back')}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto sm:mr-auto">
            {t('cancel')}
          </Button>
          {(step === 1 && !isEdit) && (
            <Button onClick={() => setStep(2)} disabled={!canGoStep2} className="w-full sm:w-auto gap-1">
              {t('next')} <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          )}
          {(step === 2 && !isEdit) && (
            <Button onClick={handleCreate} disabled={saving} className="w-full sm:w-auto">
              {saving ? t('creating') : t('createCase')}
            </Button>
          )}
          {isEdit && (
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? t('saving') : t('saveChanges')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
