'use client';

/**
 * CaseWizardDialog — wizard de 3 pasos para crear un caso desde la ficha del paciente.
 *
 * Paso 1: Información básica (tipo, fecha accidente, descripción, abogado, quiropráctico)
 * Paso 2: Consentimientos (5 formularios HIPAA + firma digital)
 * Paso 3: Revisión + Crear
 *
 * Distinto de new-case-dialog.tsx (front-office PreCall/timer).
 * HIPAA: consents guardados en Case.consentsData + consentSignaturePng.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, ChevronRight, FileText, Shield, ClipboardList, Car, Stethoscope, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button,
} from '@precision/ui';
import { FormField } from '@/components/ui-phoenix';
import { SignaturePad } from '@/components/ui-phoenix/signature-pad';

// ─── Law firm select nativo ───────────────────────────────────────────────────

interface LawFirmOption { id: string; label: string; }

function LawFirmSelect({
  firmId, onChange, placeholder,
}: {
  firmId: string | null;
  onChange: (label: string, id: string | null) => void;
  placeholder: string;
}) {
  const [firms, setFirms] = useState<LawFirmOption[]>([]);

  useEffect(() => {
    fetch('/api/admin/lawyers/autocomplete')
      .then(r => r.json())
      .then(j => setFirms(j.results ?? []))
      .catch(() => {});
  }, []);

  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">
        Firma de abogados
      </label>
      <select
        value={firmId ?? ''}
        onChange={e => {
          const selected = firms.find(f => f.id === e.target.value);
          onChange(selected?.label ?? '', selected?.id ?? null);
        }}
        className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 outline-none focus:border-brand transition-colors appearance-none"
      >
        <option value="">{placeholder}</option>
        {firms.map(f => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Patient {
  id:        string;
  firstName: string;
  lastName:  string;
}

interface Props {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  patient:      Patient;
  onCreated?:   (caseId: string) => void;
  // Edit mode — pass caseId to edit instead of create
  editCaseId?:  string;
  onSaved?:     () => void;
}

interface ResponsiblePerson {
  id:       string;
  name:     string;
  relation: string;
}

const RELATION_OPTIONS = [
  'Cónyuge',
  'Padre/Madre',
  'Hijo/Hija',
  'Hermano/a',
  'Persona responsable legal',
  'Otro',
];

interface ConsentState {
  hipaa:                 boolean;
  assignedParties:       boolean;
  assignedPartiesCheck1: boolean;
  assignedPartiesCheck2: boolean;
  assignedPartiesCheck3: boolean;
  treatment:             boolean;
  financial:             boolean;
  medicalHistory:        boolean;
  signatureDataUrl:      string | null;
}

const EMPTY_CONSENTS: ConsentState = {
  hipaa:                 false,
  assignedParties:       false,
  assignedPartiesCheck1: false,
  assignedPartiesCheck2: false,
  assignedPartiesCheck3: false,
  treatment:             false,
  financial:             false,
  medicalHistory:        false,
  signatureDataUrl:      null,
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, icon: FileText },
    { n: 2, icon: Shield },
    { n: 3, icon: ClipboardList },
  ];
  return (
    <div className="flex items-center justify-center gap-0 mb-1">
      {steps.map(({ n, icon: Icon }, idx) => {
        const done    = n < current;
        const active  = n === current;
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
              <div className={`w-16 h-0.5 ${n < current ? 'bg-brand' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Consent block ────────────────────────────────────────────────────────────

function ConsentBlock({
  icon: Icon,
  title, body, checked, onCheck, children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-brand shrink-0" />}
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-1">{title}</h4>
      </div>
      <div className="rounded-md bg-bg-2/50 border border-border/40 px-3 py-3 text-[11.5px] text-text-muted leading-relaxed max-h-36 overflow-y-auto">
        {body}
      </div>
      {children}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          className="mt-0.5 accent-brand"
        />
        <span className="text-[11px] text-text-1">Acepto todos los términos de este consentimiento.</span>
      </label>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CaseWizardDialog({ open, onOpenChange, patient, onCreated, editCaseId, onSaved }: Props) {
  const t      = useTranslations('caseWizard');
  const router = useRouter();

  const isEdit = !!editCaseId;

  const [step,    setStep]    = useState<1 | 2 | 3>(1);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // Step 1 form
  const [caseType,     setCaseType]     = useState<'MVA' | 'GENERAL'>('MVA');
  const isMVA = caseType === 'MVA';
  const [accidentDate, setAccidentDate] = useState('');
  const [description,  setDescription]  = useState('');
  const [lawFirm,      setLawFirm]      = useState('');
  const [lawFirmId,    setLawFirmId]    = useState<string | null>(null);
  const [attorney,     setAttorney]     = useState('');
  const [chiropractor, setChiropractor] = useState('');

  // Step 2 consents
  const [consents,     setConsents]     = useState<ConsentState>(EMPTY_CONSENTS);
  const [responsible,  setResponsible]  = useState<ResponsiblePerson[]>([]);

  function setConsent<K extends keyof ConsentState>(key: K, value: ConsentState[K]) {
    setConsents(prev => ({ ...prev, [key]: value }));
  }

  // Reset / pre-populate when dialog opens
  useEffect(() => {
    if (!open) {
      setStep(1);
      setCaseType('MVA');
      setAccidentDate('');
      setDescription('');
      setLawFirm('');
      setLawFirmId(null);
      setAttorney('');
      setChiropractor('');
      setConsents(EMPTY_CONSENTS);
      setResponsible([]);
      setError('');
      return;
    }
    // In edit mode, fetch existing data to pre-populate
    if (isEdit && editCaseId) {
      fetch(`/api/admin/cases/${editCaseId}`)
        .then(r => r.json())
        .then(j => {
          const c = j.case;
          if (!c) return;
          setCaseType(c.caseType === 'MVA' ? 'MVA' : 'GENERAL');
          // Convert ISO date to YYYY-MM-DD for the date input
          if (c.accidentDate) {
            setAccidentDate(c.accidentDate.slice(0, 10));
          }
          setDescription(c.accidentNotes ?? '');
          if (c.lawFirm) { setLawFirm(c.lawFirm.firmName); setLawFirmId(c.lawFirm.id); }
          const cd = (c.consentsData ?? {}) as Record<string, unknown>;
          setAttorney((cd.attorney as string | undefined) ?? '');
          setChiropractor((cd.chiropractor as string | undefined) ?? '');
          // Pre-populate consents if already signed
          setConsents({
            hipaa:                 !!(cd.hipaa),
            assignedParties:       !!(cd.assignedParties),
            assignedPartiesCheck1: !!(cd.assignedPartiesOpts && (cd.assignedPartiesOpts as Record<string,boolean>).check1),
            assignedPartiesCheck2: !!(cd.assignedPartiesOpts && (cd.assignedPartiesOpts as Record<string,boolean>).check2),
            assignedPartiesCheck3: !!(cd.assignedPartiesOpts && (cd.assignedPartiesOpts as Record<string,boolean>).check3),
            treatment:             !!(cd.treatment),
            financial:             !!(cd.financial),
            medicalHistory:        !!(cd.medicalHistory),
            signatureDataUrl:      (cd.signatureDataUrl as string | null) ?? null,
          });
        })
        .catch(() => {});
    }
  }, [open, isEdit, editCaseId]);

  // ── Validation ──────────────────────────────────────────────────────────────

  function canGoStep2() {
    return true; // Step 1 has no required fields beyond caseType (pre-selected)
  }

  function canGoStep3() {
    return true; // Flexible: se puede avanzar sin completar todos los consentimientos
  }

  function handleNext() {
    setError('');
    if (step === 1) { setStep(2); return; }
    if (step === 2) {
      setStep(3);
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/cases', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingPatientId: patient.id,
          patient: {
            firstName: patient.firstName,
            lastName:  patient.lastName,
            phone:     '0000000000',
          },
          accident: {
            date:  accidentDate ? new Date(accidentDate).toISOString() : null,
            type:  caseType === 'MVA' ? 'AUTO' : 'OTHER',
            notes: description || null,
          },
          legal: {
            lawyerStatus:    'HAS',
            lawFirmId:       lawFirmId ?? null,
            caseManagerName: attorney  || null,
          },
          insurance:   { primaryInsuranceId: null },
          caseType:    caseType === 'MVA' ? 'MVA' : 'GENERAL',
          source:      'WALK_IN',
          consents: {
            hipaa:                 consents.hipaa,
            assignedParties:       consents.assignedParties,
            assignedPartiesOpts: {
              check1: consents.assignedPartiesCheck1,
              check2: consents.assignedPartiesCheck2,
              check3: consents.assignedPartiesCheck3,
            },
            treatment:       consents.treatment,
            financial:       consents.financial,
            medicalHistory:  consents.medicalHistory,
            signatureDataUrl: consents.signatureDataUrl,
            lawFirm,
            chiropractor,
            responsiblePersons: responsible,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? json.error ?? 'Error al crear el caso.');
        return;
      }
      onOpenChange(false);
      if (onCreated) onCreated(json.case?.id ?? '');
      router.refresh();
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  // ── Save (edit mode) ────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/cases/${editCaseId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseType:    caseType === 'MVA' ? 'MVA' : 'GENERAL',
          accidentDate: accidentDate || null,
          accidentNotes: description || null,
          lawFirmId:   lawFirmId ?? null,
          lawFirmLabel: lawFirm || null,
          chiropractor: chiropractor || null,
          consents: {
            hipaa:               consents.hipaa,
            assignedParties:     consents.assignedParties,
            assignedPartiesOpts: {
              check1: consents.assignedPartiesCheck1,
              check2: consents.assignedPartiesCheck2,
              check3: consents.assignedPartiesCheck3,
            },
            treatment:        consents.treatment,
            financial:        consents.financial,
            medicalHistory:   consents.medicalHistory,
            signatureDataUrl: consents.signatureDataUrl,
            attorney,
          },
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

  // ── Step labels ─────────────────────────────────────────────────────────────

  const stepLabels: Record<1 | 2 | 3, { title: string; sub: string }> = {
    1: { title: t('step1Title'), sub: t('step1Sub') },
    2: { title: t('step2Title'), sub: t('step2Sub') },
    3: { title: t('step3Title'), sub: t('step3Sub') },
  };

  const tc = useTranslations('caseWizard');

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border sticky top-0 bg-bg-1 z-10">
          <DialogTitle className="flex items-center gap-2 text-text-1 text-base">
            <FileText className="w-4 h-4 text-brand" />
            {isEdit ? 'Formulario de caso médico' : t('title')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            {isEdit ? 'Complete toda la información requerida para el nuevo caso médico.' : t('subtitle')}
          </DialogDescription>
          <div className="pt-3">
            <StepIndicator current={step} />
            <div className="text-center mt-2">
              <p className="text-sm font-semibold text-text-1">{stepLabels[step].title}</p>
              <p className="text-[11px] text-text-muted">{stepLabels[step].sub}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">

          {/* ══ STEP 1: Info básica ══ */}
          {step === 1 && (
            <div className="space-y-4">

              {/* Tipo de caso */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-muted uppercase tracking-wider">{t('caseType')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([['MVA', 'MVA (Accidente de vehículo a motor)', Car], ['GENERAL', 'GM (Medicina general)', Stethoscope]] as const).map(([val, label, Icon]) => (
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
              </div>

              {/* Campos solo para MVA */}
              {isMVA && (
                <>
                  <FormField.Input
                    label={t('accidentDate')}
                    value={accidentDate}
                    onChange={setAccidentDate}
                    type="date"
                  />
                  <FormField.Textarea
                    label={t('accidentDescription')}
                    value={description}
                    onChange={setDescription}
                    placeholder={t('accidentDescriptionPlaceholder')}
                    rows={3}
                  />
                  <LawFirmSelect
                    firmId={lawFirmId}
                    onChange={(name, id) => { setLawFirm(name); setLawFirmId(id); }}
                    placeholder={t('lawFirmPlaceholder')}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField.Input
                      label={t('attorney')}
                      value={attorney}
                      onChange={setAttorney}
                      placeholder={t('attorneyPlaceholder')}
                    />
                    <FormField.Input
                      label={t('chiropractor')}
                      value={chiropractor}
                      onChange={setChiropractor}
                      placeholder={t('chiropractorPlaceholder')}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ STEP 2: Consentimientos ══ */}
          {step === 2 && (
            <div className="space-y-4">

              {/* 1. HIPAA */}
              <ConsentBlock
                icon={Shield}
                title={t('consents.hipaa.title')}
                body={t('consents.hipaa.body')}
                checked={consents.hipaa}
                onCheck={(v) => setConsent('hipaa', v)}
              />

              {/* 2. Partes cesionadas */}
              <ConsentBlock
                icon={Shield}
                title={t('consents.assignedParties.title')}
                body={t('consents.assignedParties.body')}
                checked={consents.assignedParties}
                onCheck={(v) => setConsent('assignedParties', v)}
              >
                {/* Personas responsables */}
                <div className="space-y-2 pt-1">
                  {responsible.map((p, i) => (
                    <div key={p.id} className="flex items-start gap-2 rounded-md border border-border/50 bg-bg-2/30 p-2.5">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-text-muted block mb-1">Nombre completo</label>
                          <input
                            type="text"
                            value={p.name}
                            placeholder="Nombre del responsable"
                            onChange={e => setResponsible(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                            className="w-full bg-bg-2 border border-border rounded px-2.5 py-1.5 text-[12px] text-text-1 placeholder:text-text-muted/50 outline-none focus:border-brand transition-colors"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-text-muted block mb-1">Relación</label>
                          <select
                            value={p.relation}
                            onChange={e => setResponsible(prev => prev.map((x, j) => j === i ? { ...x, relation: e.target.value } : x))}
                            className="w-full bg-bg-2 border border-border rounded px-2.5 py-1.5 text-[12px] text-text-1 outline-none focus:border-brand transition-colors appearance-none"
                          >
                            <option value="" disabled>Seleccione la relación</option>
                            {RELATION_OPTIONS.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setResponsible(prev => prev.filter((_, j) => j !== i))}
                        className="mt-5 p-1.5 rounded text-text-muted hover:text-rose hover:bg-rose/10 transition-colors shrink-0"
                        title="Eliminar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Botón agregar */}
                  <button
                    type="button"
                    onClick={() => setResponsible(prev => [...prev, { id: `r-${Date.now()}-${prev.length}`, name: '', relation: '' }])}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border/60 text-[12px] text-text-muted hover:border-brand/50 hover:text-brand transition-colors"
                  >
                    <span className="text-base leading-none">+</span>
                    {t('addResponsible')}
                  </button>
                </div>

                {/* Checkboxes específicos */}
                <div className="space-y-2 pt-2 border-t border-border/30">
                  {([
                    ['assignedPartiesCheck1', t('consents.assignedParties.check1')],
                    ['assignedPartiesCheck2', t('consents.assignedParties.check2')],
                    ['assignedPartiesCheck3', t('consents.assignedParties.check3')],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consents[key]}
                        onChange={(e) => setConsent(key, e.target.checked)}
                        className="mt-0.5 accent-brand"
                      />
                      <span className="text-[10.5px] text-text-muted leading-snug">{label}</span>
                    </label>
                  ))}
                </div>
              </ConsentBlock>

              {/* 3. Consentimiento para tratamiento */}
              <ConsentBlock
                icon={Shield}
                title={t('consents.treatment.title')}
                body={t('consents.treatment.body')}
                checked={consents.treatment}
                onCheck={(v) => setConsent('treatment', v)}
              />

              {/* 4. Política financiera + firma */}
              <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-brand shrink-0" />
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-1">
                    {t('consents.financial.title')}
                  </h4>
                </div>
                <div className="rounded-md bg-bg-2/50 border border-border/40 px-3 py-3 text-[11.5px] text-text-muted leading-relaxed max-h-36 overflow-y-auto">
                  {t('consents.financial.body')}
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consents.financial}
                    onChange={(e) => setConsent('financial', e.target.checked)}
                    className="mt-0.5 accent-brand"
                  />
                  <span className="text-[11px] text-text-1">Acepto todos los términos de este consentimiento</span>
                </label>

                {/* Firma digital — requerida */}
                <div className="space-y-1 pt-1">
                  <label className="text-xs font-medium text-text-muted">
                    {t('signatureLabel')} <span className="text-rose">*</span>
                  </label>
                  <SignaturePad
                    onChange={(dataUrl) => setConsent('signatureDataUrl', dataUrl)}
                    clearLabel={t('clear')}
                    hintLabel={t('signHere')}
                    height={140}
                  />
                  {!consents.signatureDataUrl && (
                    <p className="text-[10px] text-text-muted/60">La firma es obligatoria para crear el caso.</p>
                  )}
                </div>
              </div>

              {/* 5. Autoridad historial médico */}
              <ConsentBlock
                icon={Shield}
                title={t('consents.medicalHistory.title')}
                body={t('consents.medicalHistory.body')}
                checked={consents.medicalHistory}
                onCheck={(v) => setConsent('medicalHistory', v)}
              />
            </div>
          )}

          {/* ══ STEP 3: Revisión ══ */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-text-1 pb-1 border-b border-border/60">
                  Resumen del caso
                </h3>

                {([
                  [t('reviewPatient'),      `${patient.firstName} ${patient.lastName}`],
                  [t('reviewCaseType'),     caseType === 'MVA' ? t('caseTypeMVA') : t('caseTypeGM')],
                  ...(isMVA ? [
                    [t('reviewAccidentDate'), accidentDate || t('reviewNoDate')],
                    [t('reviewLawFirm'),      lawFirm      || t('reviewNone')],
                    [t('reviewAttorney'),     attorney     || t('reviewNone')],
                    [t('reviewChiropractor'), chiropractor || t('reviewNone')],
                  ] : []),
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 text-sm">
                    <span className="text-text-muted text-[11px] uppercase tracking-wider shrink-0">{label}</span>
                    <span className="text-text-1 text-right">{value}</span>
                  </div>
                ))}
              </div>

              {/* Consents summary */}
              {(() => {
                const items: { label: string; signed: boolean }[] = [
                  { label: t('consents.hipaa.title'),           signed: consents.hipaa },
                  { label: t('consents.assignedParties.title'), signed: consents.assignedParties },
                  { label: t('consents.treatment.title'),       signed: consents.treatment },
                  { label: t('consents.financial.title'),       signed: consents.financial },
                  { label: t('consents.medicalHistory.title'),  signed: consents.medicalHistory },
                ];
                const signedCount = items.filter(i => i.signed).length;
                const allSigned   = signedCount === items.length;
                return (
                  <div className={`rounded-lg border p-4 space-y-3 ${allSigned ? 'border-emerald/30 bg-emerald/5' : 'border-amber/30 bg-amber/5'}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${allSigned ? 'text-emerald' : 'text-amber'}`}>
                        Estado de consentimientos
                      </span>
                      <span className={`text-[11px] font-medium ${allSigned ? 'text-emerald' : 'text-amber'}`}>
                        {signedCount} / {items.length} firmados
                      </span>
                    </div>

                    {/* Items */}
                    <div className="space-y-1.5">
                      {items.map(item => (
                        <div key={item.label} className="flex items-center gap-2.5">
                          <span className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0 text-[11px] font-bold
                            ${item.signed ? 'bg-emerald/15 text-emerald' : 'bg-rose/15 text-rose'}`}>
                            {item.signed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          </span>
                          <span className={`text-[12px] ${item.signed ? 'text-text-1' : 'text-text-muted'}`}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Firma digital */}
                    <div className="flex items-center gap-2.5 pt-1 border-t border-border/30">
                      <span className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0
                        ${consents.signatureDataUrl ? 'bg-emerald/15 text-emerald' : 'bg-rose/15 text-rose'}`}>
                        {consents.signatureDataUrl ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      </span>
                      <span className={`text-[12px] ${consents.signatureDataUrl ? 'text-text-1' : 'text-text-muted'}`}>
                        Firma digital
                      </span>
                      {consents.signatureDataUrl && (
                        <img
                          src={consents.signatureDataUrl}
                          alt="Firma"
                          className="ml-auto h-8 rounded border border-border/30 bg-bg-2/30 px-2"
                        />
                      )}
                    </div>

                    {/* Personas responsables — siempre visible */}
                    <div className="pt-1 border-t border-border/30">
                      <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
                        Personas responsables autorizadas
                      </p>
                      {responsible.length === 0 ? (
                        <p className="text-[12px] text-text-muted/60 italic">0 persona(s) responsable(s) registrada(s)</p>
                      ) : (
                        <div className="space-y-1">
                          {responsible.map((p, i) => (
                            <div key={i} className="flex items-center gap-2 text-[12px] text-text-1">
                              <Check className="w-3 h-3 text-emerald shrink-0" />
                              <span>{p.name || '—'}</span>
                              {p.relation && <span className="text-text-muted">· {p.relation}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border flex-col sm:flex-row gap-2 sticky bottom-0 bg-bg-1">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {t('back')}
            </Button>
          )}
          {step < 3 && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="w-full sm:w-auto sm:mr-auto"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleNext}
                disabled={saving || (step === 2 && !canGoStep3())}
                className="w-full sm:w-auto flex items-center gap-1"
              >
                {t('next')} <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="w-full sm:w-auto sm:mr-auto"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={isEdit ? handleSave : handleCreate}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                {saving
                  ? (isEdit ? 'Guardando...' : t('creating'))
                  : (isEdit ? 'Guardar cambios' : t('createCase'))}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
