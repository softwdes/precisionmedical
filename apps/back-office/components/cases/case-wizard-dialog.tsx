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

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, ChevronRight, FileText, Shield, ClipboardList, Car, Stethoscope, ChevronDown, Search, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button,
} from '@precision/ui';
import { FormField } from '@/components/ui-phoenix';
import { SignaturePad } from '@/components/ui-phoenix/signature-pad';

// ─── Law firm selector ────────────────────────────────────────────────────────

interface LawFirm { id: string; label: string; }

function LawFirmSelect({
  value, firmId, onChange, placeholder,
}: {
  value: string;
  firmId: string | null;
  onChange: (label: string, id: string | null) => void;
  placeholder: string;
}) {
  const [open,    setOpen]    = useState(false);
  const [firms,   setFirms]   = useState<LawFirm[]>([]);
  const [loading, setLoading] = useState(false);
  const [query,   setQuery]   = useState('');
  const [rect,    setRect]    = useState<DOMRect | null>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/lawyers/autocomplete')
      .then(r => r.json())
      .then(j => setFirms(j.results ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openDropdown = useCallback(() => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setQuery('');
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClose(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node) &&
          btnRef.current  && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onScroll() { setOpen(false); }
    document.addEventListener('mousedown', onClose);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onClose);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const filtered = query.trim()
    ? firms.filter(f => f.label.toLowerCase().includes(query.toLowerCase()))
    : firms;

  // Position: prefer below, flip above if not enough space
  const PANEL_H = 280;
  const spaceBelow = rect ? window.innerHeight - rect.bottom - 8 : 999;
  const top = rect
    ? (spaceBelow >= PANEL_H ? rect.bottom + 4 : rect.top - PANEL_H - 4)
    : 0;
  const left  = rect?.left  ?? 0;
  const width = rect?.width ?? 300;

  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">
        Firma de abogados
      </label>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-md border bg-bg-2 text-sm text-left transition-colors focus:outline-none
          ${open ? 'border-brand ring-1 ring-brand/30' : 'border-border hover:border-brand/40'}`}
      >
        <span className={value ? 'text-text-1 truncate pr-2' : 'text-text-muted text-[12px]'}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onChange('', null)}
              onClick={e => { e.stopPropagation(); onChange('', null); }}
              className="text-text-muted hover:text-rose transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && rect && (
        <div
          ref={wrapRef}
          style={{ position: 'fixed', top, left, width, zIndex: 9999 }}
          className="rounded-md border border-border bg-bg-1 shadow-xl overflow-hidden"
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
            <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar firma..."
              className="flex-1 bg-transparent text-[12px] text-text-1 placeholder:text-text-muted/60 outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-text-muted hover:text-text-1">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[220px] overflow-y-auto">
            {/* Clear option */}
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-[11px] text-text-muted/70 italic hover:bg-white/[0.04] transition-colors border-b border-border/30"
              onClick={() => { onChange('', null); setOpen(false); }}
            >
              Sin firma asignada
            </button>

            {loading && (
              <p className="px-3 py-3 text-[11px] text-text-muted text-center">Cargando...</p>
            )}

            {!loading && filtered.length === 0 && (
              <p className="px-3 py-3 text-[11px] text-text-muted text-center">Sin resultados</p>
            )}

            {filtered.map(f => (
              <button
                key={f.id}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-white/[0.05] transition-colors
                  ${firmId === f.id ? 'text-brand font-medium bg-brand/[0.06]' : 'text-text-1'}`}
                onClick={() => { onChange(f.label, f.id); setOpen(false); }}
              >
                {firmId === f.id && <Check className="w-3 h-3 inline mr-1.5 mb-0.5" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
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
  open:        boolean;
  onOpenChange: (v: boolean) => void;
  patient:     Patient;
  onCreated?:  (caseId: string) => void;
}

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

export function CaseWizardDialog({ open, onOpenChange, patient, onCreated }: Props) {
  const t      = useTranslations('caseWizard');
  const router = useRouter();

  const [step,    setStep]    = useState<1 | 2 | 3>(1);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // Step 1 form
  const [caseType,     setCaseType]     = useState<'MVA' | 'GENERAL'>('MVA');
  const [accidentDate, setAccidentDate] = useState('');
  const [description,  setDescription]  = useState('');
  const [lawFirm,      setLawFirm]      = useState('');
  const [lawFirmId,    setLawFirmId]    = useState<string | null>(null);
  const [attorney,     setAttorney]     = useState('');
  const [chiropractor, setChiropractor] = useState('');

  // Step 2 consents
  const [consents, setConsents] = useState<ConsentState>(EMPTY_CONSENTS);

  function setConsent<K extends keyof ConsentState>(key: K, value: ConsentState[K]) {
    setConsents(prev => ({ ...prev, [key]: value }));
  }

  // Signature reset when dialog closes
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
      setError('');
    }
  }, [open]);

  // ── Validation ──────────────────────────────────────────────────────────────

  function canGoStep2() {
    return true; // Step 1 has no required fields beyond caseType (pre-selected)
  }

  function canGoStep3() {
    const allChecked = consents.hipaa && consents.assignedParties && consents.treatment && consents.financial && consents.medicalHistory;
    return allChecked && !!consents.signatureDataUrl;
  }

  function handleNext() {
    setError('');
    if (step === 1) { setStep(2); return; }
    if (step === 2) {
      if (!consents.hipaa || !consents.assignedParties || !consents.treatment || !consents.financial || !consents.medicalHistory) {
        setError('Debe aceptar todos los consentimientos para continuar.');
        return;
      }
      if (!consents.signatureDataUrl) {
        setError(t('signatureRequired'));
        return;
      }
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
            {t('title')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">{t('subtitle')}</DialogDescription>
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

              {/* Fecha + descripción */}
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

              {/* Legal */}
              <LawFirmSelect
                value={lawFirm}
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
                {/* Checkboxes específicos */}
                <div className="space-y-2 pt-1">
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
                <button
                  type="button"
                  className="text-[11px] text-brand hover:underline"
                >
                  {t('addResponsible')}
                </button>
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
                  [t('reviewAccidentDate'), accidentDate || t('reviewNoDate')],
                  [t('reviewLawFirm'),      lawFirm      || t('reviewNone')],
                  [t('reviewAttorney'),     attorney     || t('reviewNone')],
                  [t('reviewChiropractor'), chiropractor || t('reviewNone')],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 text-sm">
                    <span className="text-text-muted text-[11px] uppercase tracking-wider shrink-0">{label}</span>
                    <span className="text-text-1 text-right">{value}</span>
                  </div>
                ))}
              </div>

              {/* Consents summary */}
              <div className="rounded-lg border border-emerald/30 bg-emerald/5 p-4">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald" />
                  <span className="text-sm font-medium text-emerald">{t('reviewConsentsAll')}</span>
                </div>
                <p className="text-[11px] text-text-muted mt-1">5 consentimientos firmados · firma digital capturada</p>
              </div>

              {/* Signature preview */}
              {consents.signatureDataUrl && (
                <div className="rounded-lg border border-border bg-bg-1 p-3">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('signatureLabel')}</p>
                  <img
                    src={consents.signatureDataUrl}
                    alt="Firma digital"
                    className="max-h-20 rounded border border-border/40 bg-bg-2/30"
                  />
                </div>
              )}
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
                onClick={handleCreate}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                {saving ? t('creating') : t('createCase')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
