'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  PhoneCall, User, Car, Scale, ShieldCheck, Check, AlertCircle, Search as SearchIcon,
  CalendarCheck, Send, Tablet, Pause, ArrowRight, MessageCircle, Phone, ClipboardList,
} from 'lucide-react';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
} from '@precision/ui';
import { TagPill, PersonAvatar, InfoCard, FormField } from '@/components/ui-phoenix';
import { PreCallStep, type PreCallResult, type PreCallMode } from './precall-step';

// B.2 — Contacto inicial del paciente · llamada + apertura caso + agendamiento
//
// Flujo:
//   PASO 1 (PreCallStep): ¿cómo empezamos? (search · incoming · outgoing)
//                          El timer NO arranca todavía
//   PASO 2 (este modal):  Captura completa con timer corriendo
//                          Datos básicos pre-llenados desde el paso 1
//
// Estilo: estricto al sistema (ver apps/back-office/CLAUDE.md regla #0).

/**
 * NewCaseInitialState — para abrir el modal directamente en capturing,
 * saltando el PreCall step. Usado por:
 *   - IncomingCallSimulator (DEV · phase 1A)
 *   - Weave WebSocket handler (phase 2)
 *   - Botón "+ Nuevo caso" en /patients/[id] (phase 2 · paciente conocido)
 */
export interface NewCaseInitialState {
  mode: PreCallMode;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  existingPatientId?: string | null;
}

interface NewCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specialties: Array<{ id: string; name: string; color: string }>;
  clinics: Array<{ id: string; name: string; address: string | null }>;
  providers: Array<{ id: string; firstName: string; lastName: string; specialty: string }>;
  /** Si se pasa, el modal arranca directo en capturing pre-llenado · saltando PreCall */
  initialState?: NewCaseInitialState | null;
}

interface AutoResult {
  id: string;
  label: string;
  subtitle?: string;
  shortCode?: string;
  color?: string;
}

type CaseType = 'MVA' | 'GENERAL';
type LawyerStatus = 'HAS' | 'SEEKING' | 'DECLINED';
type ReferralSource =
  | 'PHONE_CALL' | 'LAW_FIRM_REFERRAL' | 'PATIENT_REFERRAL' | 'WALK_IN' | 'WEB_FORM' | 'OTHER';
type FormDelivery = 'SEND_NOW' | 'TABLET_AT_CLINIC';

export function NewCaseDialog({ open, onOpenChange, specialties, clinics, providers, initialState }: NewCaseDialogProps) {
  const router = useRouter();
  const t = useTranslations('phoenix.frontOffice.newCase');

  // ─── Step state (precall vs capturing) ────────────────────────────────
  const [step, setStep] = useState<'precall' | 'capturing'>('precall');
  const [callMode, setCallMode] = useState<PreCallMode | null>(null);
  const [existingPatientId, setExistingPatientId] = useState<string | null>(null);

  // ─── Call timer · solo arranca en step=capturing y modo NO manual ─────
  const [callElapsed, setCallElapsed] = useState(0);

  useEffect(() => {
    if (!open) {
      setCallElapsed(0);
      setStep('precall');
      setCallMode(null);
      setExistingPatientId(null);
      return;
    }
    // El timer NO corre en modo manual (ingreso sin llamada)
    if (step !== 'capturing' || callMode === 'manual') return;
    const interval = setInterval(() => {
      setCallElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [open, step, callMode]);

  // ─── Section 1: Patient ───────────────────────────────────────────────
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [email, setEmail]         = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [language, setLanguage]   = useState<'es' | 'en'>('es');
  const [referralSource, setReferralSource] = useState<ReferralSource>('LAW_FIRM_REFERRAL');

  // ─── Section 2: Case type ─────────────────────────────────────────────
  const [caseType, setCaseType] = useState<CaseType>('MVA');

  // ─── Section 3: Accident ──────────────────────────────────────────────
  const [accidentDate, setAccidentDate] = useState('');
  const [accidentType, setAccidentType] = useState('AUTO');
  const [accidentLocation, setAccidentLocation] = useState('');
  const [accidentNotes, setAccidentNotes] = useState('');

  // ─── Section 4: Lawyer ────────────────────────────────────────────────
  const [lawyerStatus, setLawyerStatus] = useState<LawyerStatus>('HAS');
  const [lawFirm, setLawFirm]           = useState<AutoResult | null>(null);
  const [attorney, setAttorney]         = useState<AutoResult | null>(null);
  const [caseManagerName, setCaseManagerName]   = useState('');
  const [caseManagerEmail, setCaseManagerEmail] = useState('');
  const [firmPhone, setFirmPhone]               = useState('');

  // ─── Section 5: Insurance ─────────────────────────────────────────────
  const [insurance, setInsurance]   = useState<AutoResult | null>(null);
  const [policyNumber, setPolicyNumber] = useState('');

  // ─── Section 6: Schedule appointment in call ──────────────────────────
  const [specialtyId, setSpecialtyId] = useState(specialties[0]?.id ?? '');
  const [scheduleNow, setScheduleNow] = useState(true);
  const [clinicId, setClinicId]       = useState(clinics[0]?.id ?? '');
  const [providerId, setProviderId]   = useState('');
  const [slotIso, setSlotIso]         = useState<string | null>(null);
  const [duration, setDuration]       = useState(45);

  // ─── Form delivery ────────────────────────────────────────────────────
  const [formDelivery, setFormDelivery] = useState<FormDelivery>('SEND_NOW');

  // ─── Submit state ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<{ caseCode: string; caseId: string; appointmentScheduled: boolean } | null>(null);

  // ─── Confirm-exit dialog ──────────────────────────────────────────────
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Hay datos si el usuario llenó al menos nombre o apellido en step=capturing
  const hasData = step === 'capturing' && (firstName.trim() !== '' || lastName.trim() !== '' || phone.trim() !== '');

  function tryClose() {
    if (hasData && !success) {
      setShowExitConfirm(true);
    } else {
      onOpenChange(false);
    }
  }

  function confirmExit() {
    setShowExitConfirm(false);
    onOpenChange(false);
  }

  // Reset on open · si hay initialState, salta PreCall directo a capturing
  useEffect(() => {
    if (!open) return;
    setCaseType('MVA');
    setAccidentDate(''); setAccidentType('AUTO'); setAccidentLocation(''); setAccidentNotes('');
    setLawyerStatus('HAS'); setLawFirm(null); setAttorney(null); setCaseManagerName(''); setCaseManagerEmail(''); setFirmPhone('');
    setInsurance(null); setPolicyNumber('');
    setSpecialtyId(specialties[0]?.id ?? ''); setScheduleNow(true); setClinicId(clinics[0]?.id ?? '');
    setProviderId(''); setSlotIso(null); setDuration(45);
    setFormDelivery('SEND_NOW');
    setSaving(false); setError(null); setSuccess(null);

    if (initialState) {
      // Skip PreCall · prellenar datos + arrancar timer
      setFirstName(initialState.firstName);
      setLastName(initialState.lastName);
      setPhone(initialState.phone);
      setEmail(initialState.email ?? '');
      setDateOfBirth('');
      setLanguage('es');
      setReferralSource('PHONE_CALL');
      setCallMode(initialState.mode);
      setExistingPatientId(initialState.existingPatientId ?? null);
      setCallElapsed(0);
      setStep('capturing');
    } else {
      // Flujo normal: arrancar en PreCall
      setFirstName(''); setLastName(''); setPhone(''); setEmail('');
      setDateOfBirth(''); setLanguage('es'); setReferralSource('LAW_FIRM_REFERRAL');
      setStep('precall');
      setCallMode(null);
      setExistingPatientId(null);
    }
  }, [open, specialties, clinics, initialState]);

  // ─── Handler · cuando PreCallStep confirma, prellenamos y arrancamos timer ──
  const handleStartCall = (result: PreCallResult) => {
    setFirstName(result.firstName);
    setLastName(result.lastName);
    setPhone(result.phone);
    if (result.existingPatient) {
      setExistingPatientId(result.existingPatient.id);
      setEmail(result.existingPatient.email ?? '');
    }
    if (result.mode === 'manual') {
      setReferralSource('LAW_FIRM_REFERRAL');
    }
    setCallMode(result.mode);
    setCallElapsed(0);
    setStep('capturing');
  };

  // ─── Provider auto-suggest según especialidad ──────────────────────────
  const specialtyToProviderMap: Record<string, string[]> = {
    'chiropractic': ['CHIROPRACTIC'],
    'physical therapy': ['PHYSICAL_THERAPY'],
    'pain management': ['PAIN_MANAGEMENT'],
    'orthopedics': ['ORTHOPEDICS'],
    'auto accidents': ['CHIROPRACTIC', 'PAIN_MANAGEMENT', 'ORTHOPEDICS'],
  };
  const selectedSpecialtyName = specialties.find((s) => s.id === specialtyId)?.name.toLowerCase() ?? '';
  const matchingProviderTypes = specialtyToProviderMap[selectedSpecialtyName] ?? [];
  const suggestedProviders = providers.filter((p) => matchingProviderTypes.includes(p.specialty));
  const displayProviders = suggestedProviders.length > 0 ? suggestedProviders : providers;

  useEffect(() => {
    if (scheduleNow && displayProviders.length > 0 && !displayProviders.some((p) => p.id === providerId)) {
      setProviderId(displayProviders[0].id);
    }
  }, [specialtyId, displayProviders, providerId, scheduleNow]);

  // ─── Generate slots: próximos 3 días hábiles ───────────────────────────
  const slotOptions = useMemo(() => {
    const out: Array<{ iso: string; label: string }> = [];
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    for (let dayOffset = 1; dayOffset <= 5 && out.length < 12; dayOffset++) {
      const date = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      for (const [h, m] of [[9, 30], [11, 0], [14, 30], [16, 0]] as const) {
        const slot = new Date(date);
        slot.setHours(h, m, 0, 0);
        out.push({
          iso: slot.toISOString(),
          label: slot.toLocaleString('es-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
        });
      }
    }
    return out;
  }, []);

  // ─── Validation ────────────────────────────────────────────────────────
  const canSubmit = useMemo(() => {
    if (!firstName.trim() || !lastName.trim()) return false;
    if (!phone.trim()) return false;
    if (caseType === 'MVA' && lawyerStatus === 'HAS' && !lawFirm) return false;
    if (scheduleNow && (!clinicId || !providerId || !slotIso)) return false;
    return true;
  }, [firstName, lastName, phone, caseType, lawyerStatus, lawFirm, scheduleNow, clinicId, providerId, slotIso]);

  // ─── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (action: 'finalize' | 'pause') => {
    setError(null);
    if (action === 'finalize' && !canSubmit) {
      return setError(t('errorRequired'));
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth + 'T12:00:00Z').toISOString() : null,
            preferredLanguage: language,
          },
          accident: {
            date: accidentDate ? new Date(accidentDate + 'T12:00:00Z').toISOString() : null,
            type: accidentType,
            location: accidentLocation.trim() || null,
            notes: accidentNotes.trim() || null,
          },
          legal: {
            lawyerStatus,
            lawFirmId: lawyerStatus === 'HAS' ? (lawFirm?.id ?? null) : null,
            attorneyId: lawyerStatus === 'HAS' ? (attorney?.id ?? null) : null,
            caseManagerName: lawyerStatus === 'HAS' ? (caseManagerName.trim() || null) : null,
            caseManagerEmail: lawyerStatus === 'HAS' ? (caseManagerEmail.trim() || null) : null,
            firmPhone: lawyerStatus === 'HAS' ? (firmPhone.trim() || null) : null,
          },
          insurance: {
            primaryInsuranceId: insurance?.id ?? null,
            primaryPolicyNumber: policyNumber.trim() || null,
          },
          existingPatientId: existingPatientId ?? null,
          specialtyId: specialtyId || null,
          caseType,
          source: referralSource,
          appointment: scheduleNow && slotIso ? {
            clinicId,
            providerId,
            scheduledFor: slotIso,
            durationMinutes: duration,
            type: caseType === 'MVA' ? 'AUTO_ACCIDENT' : 'FAMILY_PRACTICE',
          } : null,
          formDelivery: action === 'finalize' ? formDelivery : null,
          callDurationSeconds: callElapsed,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSuccess({
        caseCode: data.case.caseCode,
        caseId: data.case.id,
        appointmentScheduled: !!data.appointment,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear caso');
    } finally {
      setSaving(false);
    }
  };

  const isManual = callMode === 'manual';

  // ─── Success state ─────────────────────────────────────────────────────
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald/15 border border-emerald/30 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald" />
            </div>
            <h2 className="text-xl font-bold text-text-1 mb-2">
              {isManual ? t('successTitleManual') : t('successTitleCall')}
            </h2>
            <p className="text-text-2 text-sm mb-4">
              <code className="text-emerald font-mono font-bold">{success.caseCode}</code>
            </p>
            <div className="text-xs text-text-muted mb-6 space-y-1">
              <div><strong className="text-text-2">{firstName} {lastName}</strong></div>
              {success.appointmentScheduled
                ? <div>{t('successAppointment')}</div>
                : <div>{t('successNoAppointment')}</div>}
              {formDelivery === 'SEND_NOW' && (
                <div>{t('successFormSent', { channel: email ? 'email' : 'SMS' })}</div>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('btnClose')}</Button>
              <Button onClick={() => {
                onOpenChange(false);
                router.push(`/front-office/${success.caseId}`);
              }}>
                {t('btnViewCase')} <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Step 1: PreCall (¿cómo empezamos la llamada?) ────────────────────
  if (step === 'precall') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2 text-text-1 text-sm sm:text-base">
              <PhoneCall className="w-4 h-4 text-emerald" />
              {t('dialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-[11px] sm:text-xs mt-1">
              {t('dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto scroll-thin">
            <PreCallStep
              onConfirm={handleStartCall}
              onCancel={() => onOpenChange(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Step 2: Capturing (timer corriendo) ──────────────────────────────
  const elapsedLabel = formatElapsed(callElapsed);
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Paciente';
  const callModeLabel = callMode === 'search' ? t('modeExisting')
    : callMode === 'incoming' ? t('modeIncoming')
    : callMode === 'manual' ? t('modeManual')
    : t('modeOutbound');

  return (
    <>
    <Dialog open={open} onOpenChange={(val) => { if (!val) tryClose(); }}>
      <DialogContent
        className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0"
        onPointerDownOutside={(e) => { e.preventDefault(); if (hasData && !success) setShowExitConfirm(true); }}
        onEscapeKeyDown={(e) => { e.preventDefault(); if (hasData && !success) setShowExitConfirm(true); }}
      >
        {/* ─── Header · mobile-friendly ─────────────────────────────────── */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-text-1 text-sm sm:text-base">
                  {isManual
                    ? <ClipboardList className="w-4 h-4 text-amber shrink-0" />
                    : <PhoneCall className="w-4 h-4 text-emerald shrink-0" />}
                  <span className="truncate">
                    {isManual ? t('titleManual', { name: fullName }) : t('titleCall', { name: fullName })}
                  </span>
                </DialogTitle>
                <DialogDescription className="mt-1 text-[11px] sm:text-xs flex items-center gap-1.5 flex-wrap">
                  <span>{callModeLabel}</span>
                  {existingPatientId && <span>· <code className="text-cyan font-mono">{t('modeKnown')}</code></span>}
                  <span className="hidden sm:inline">{isManual ? t('subtitleManual') : t('subtitleCall')}</span>
                </DialogDescription>
              </div>
              {/* Pills: en manual mostramos badge amber; en llamada mostramos timer */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                {existingPatientId && (
                  <TagPill
                    label={t('modeKnown')}
                    colorClass="bg-cyan/15 text-cyan border-cyan/30 hidden sm:inline-flex"
                    mono
                  />
                )}
                {isManual
                  ? <TagPill label={t('badgeNoCall')} colorClass="bg-amber/15 text-amber border-amber/30" mono />
                  : <TagPill
                      label={<><span className="w-1.5 h-1.5 rounded-full bg-emerald inline-block mr-1 animate-pulse" />{elapsedLabel}</>}
                      colorClass="bg-emerald/15 text-emerald border-emerald/30"
                    />}
              </div>
            </div>
          </DialogHeader>

          {/* Patient hero card */}
          <div className="mt-3 rounded-lg border border-border bg-bg-1 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-3">
            <PersonAvatar firstName={firstName || '?'} lastName={lastName || ''} size={10} gradientClass="bg-gradient-brand" />
            <div className="flex-1 min-w-0">
              <div className="text-text-1 font-semibold text-sm truncate">{fullName}</div>
              <div className="text-text-muted text-[11px] mt-0.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
                {phone && <span className="font-mono flex items-center gap-1"><Phone className="w-3 h-3" />{phone}</span>}
                <span>{language === 'es' ? t('langEs') : t('langEn')}</span>
                {lawFirm && <span className="truncate max-w-full">⚖ {lawFirm.label}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Body scrollable ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4 scroll-thin">
          <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <MessageCircle className="w-3 h-3" />
            {t('captureTitle')}
          </div>

          {/* ── Sección 1: Patient ─────────────────────────────────────── */}
          <InfoCard title={t('sectionPatient')} icon={User} number={1}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField.Input label={t('firstName')} required value={firstName} onChange={setFirstName} placeholder="Sandra" autoFocus />
              <FormField.Input label={t('lastName')} required value={lastName} onChange={setLastName} placeholder="López" />
              <FormField.Phone label={t('phone')} required value={phone} onChange={(v) => setPhone(v)} />
              <FormField.Input label={t('email')} value={email} onChange={setEmail} placeholder="sandra@email.com" type="email" />
              <FormField.Input label={t('dob')} value={dateOfBirth} onChange={setDateOfBirth} type="date" />
              <FormField.Select label={t('language')} value={language} onChange={(v) => setLanguage(v as 'es' | 'en')}
                options={[{ value: 'es', label: t('langEs') }, { value: 'en', label: t('langEn') }]} />
            </div>
            <FormField.Select label={t('referralSource')} value={referralSource} onChange={(v) => setReferralSource(v as ReferralSource)}
              options={[
                { value: 'LAW_FIRM_REFERRAL', label: t('sourceFirearm') },
                { value: 'PATIENT_REFERRAL', label: t('sourcePatient') },
                { value: 'PHONE_CALL', label: t('sourcePhone') },
                { value: 'WALK_IN', label: t('sourceWalkin') },
                { value: 'WEB_FORM', label: t('sourceWeb') },
                { value: 'OTHER', label: t('sourceOther') },
              ]}
              hint={t('patientHint')}
            />
          </InfoCard>

          {/* ── Sección 2: Tipo de caso ──────────────────────────────────── */}
          <InfoCard title={t('sectionCaseType')} icon={Car} number={2}>
            <div className="grid grid-cols-2 gap-2">
              <SelectableCard
                selected={caseType === 'MVA'}
                onClick={() => setCaseType('MVA')}
                icon="🚗"
                title={t('caseMVA')}
                subtitle={t('caseMVADesc')}
              />
              <SelectableCard
                selected={caseType === 'GENERAL'}
                onClick={() => setCaseType('GENERAL')}
                icon="🩺"
                title={t('caseGM')}
                subtitle={t('caseGMDesc')}
              />
            </div>
          </InfoCard>

          {/* ── Sección 3: Accidente (solo para MVA) ────────────────────── */}
          {caseType === 'MVA' && (
            <InfoCard title={t('sectionAccident')} icon={Car} number={3}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField.Input label={t('accidentDate')} value={accidentDate} onChange={setAccidentDate} type="date" />
                <FormField.Select label={t('accidentType')} value={accidentType} onChange={setAccidentType}
                  options={[
                    { value: 'AUTO', label: t('accAuto') },
                    { value: 'MOTORCYCLE', label: t('accMoto') },
                    { value: 'PEDESTRIAN', label: t('accPed') },
                    { value: 'WORKPLACE', label: t('accWork') },
                    { value: 'OTHER', label: t('accOther') },
                  ]} />
              </div>
              <FormField.Input label={t('accidentLocation')} value={accidentLocation} onChange={setAccidentLocation} placeholder={t('accidentLocationPlaceholder')} />
              <FormField.Textarea label={t('accidentNotes')} value={accidentNotes} onChange={setAccidentNotes}
                placeholder={t('accidentNotesPlaceholder')}
                hint={t('accidentHint')} />
            </InfoCard>
          )}

          {/* ── Sección 4: Abogado · OBLIGATORIO para MVA ─────────────── */}
          {caseType === 'MVA' && (
            <InfoCard
              title={t('sectionLawyer')}
              icon={Scale}
              number={4}
              tone="rose"
              rightSlot={<TagPill label={t('lawyerRequired')} colorClass="bg-rose/15 text-rose border-rose/30" />}
            >
              <div className="text-text-muted text-[11px] italic">{t('lawyerHint')}</div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <SegmentedOption
                  selected={lawyerStatus === 'HAS'} onClick={() => setLawyerStatus('HAS')}
                  icon="✓" label={t('lawyerHas')}
                />
                <SegmentedOption
                  selected={lawyerStatus === 'SEEKING'} onClick={() => setLawyerStatus('SEEKING')}
                  icon="🔍" label={t('lawyerSeeking')}
                />
                <SegmentedOption
                  selected={lawyerStatus === 'DECLINED'} onClick={() => setLawyerStatus('DECLINED')}
                  icon="✗" label={t('lawyerDeclined')}
                />
              </div>

              {lawyerStatus === 'HAS' && (
                <div className="space-y-3">
                  <div>
                    <Label>{t('lawFirmLabel')} <span className="text-text-muted text-[10px] ml-1 font-normal">{t('lawFirmAutocomplete')}</span></Label>
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
                        <Label>{t('attorneyLabel')} <span className="text-text-muted text-[10px] ml-1 font-normal">{t('attorneyOptional')}</span></Label>
                        <Autocomplete
                          endpoint="/api/admin/lawyers/autocomplete"
                          extraParams={{ firmId: lawFirm.id }}
                          placeholder={t('attorneyPlaceholder')}
                          selected={attorney}
                          onSelect={setAttorney}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField.Input label={t('caseManagerLabel')} value={caseManagerName} onChange={setCaseManagerName} placeholder="Bob Jones" />
                        <FormField.Input label={t('caseManagerEmail')} value={caseManagerEmail} onChange={setCaseManagerEmail} placeholder="bob@firm.com" type="email" />
                      </div>
                      <FormField.Phone label={t('firmPhone')} value={firmPhone} onChange={(v) => setFirmPhone(v)} />
                    </>
                  )}
                  <Note tone="emerald">{t('lawyerNoteHas')}</Note>
                </div>
              )}

              {lawyerStatus === 'SEEKING' && (
                <Note tone="amber">{t('lawyerNoteSeeking')}</Note>
              )}
              {lawyerStatus === 'DECLINED' && (
                <Note tone="rose">{t('lawyerNoteDeclined')}</Note>
              )}
            </InfoCard>
          )}

          {/* ── Sección 5: Seguro PIP ──────────────────────────────────── */}
          {caseType === 'MVA' && (
            <InfoCard title={t('sectionInsurance')} icon={ShieldCheck} number={5} tone="cyan">
              <div>
                <Label>{t('insuranceLabel')}</Label>
                <Autocomplete
                  endpoint="/api/admin/insurances/autocomplete"
                  placeholder={t('insurancePlaceholder')}
                  selected={insurance}
                  onSelect={setInsurance}
                  renderAvatar={(r) => r.color && r.shortCode ? (
                    <div className="w-7 h-7 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: r.color }}>
                      {r.shortCode}
                    </div>
                  ) : null}
                />
              </div>
              {insurance && (
                <FormField.Input label={t('policyNumber')} value={policyNumber} onChange={setPolicyNumber} placeholder="PIP-2026-0142"
                  hint={t('policyHint')} />
              )}
            </InfoCard>
          )}

          {/* ── Sección 6: Agendar primera cita ────────────────────────── */}
          <InfoCard
            title={t('sectionAppointment')}
            icon={CalendarCheck}
            number={6}
            tone="emerald"
            rightSlot={
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={scheduleNow} onChange={(e) => setScheduleNow(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-emerald" />
                <span className="text-text-2 text-[11px]">{t('scheduleNow')}</span>
              </label>
            }
          >
            {scheduleNow ? (
              <>
                <div className="text-text-muted text-[11px] italic">{t('scheduleHint')}</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField.Select label={t('clinic')} value={clinicId} onChange={setClinicId}
                    options={clinics.map((c) => ({ value: c.id, label: c.name }))} />
                  <FormField.Select label={t('specialty')} value={specialtyId} onChange={setSpecialtyId}
                    options={specialties.map((s) => ({ value: s.id, label: s.name }))} />
                </div>

                <div>
                  <Label>{t('slotsLabel')}</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1.5">
                    {slotOptions.map((s) => (
                      <button
                        key={s.iso}
                        type="button"
                        onClick={() => setSlotIso(s.iso)}
                        className={`px-2 py-2 rounded-md border text-[11px] font-medium transition-colors capitalize ${
                          slotIso === s.iso
                            ? 'bg-emerald/15 border-emerald/40 text-emerald font-semibold'
                            : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField.Select label={t('providerLabel')} value={providerId} onChange={setProviderId}
                    options={displayProviders.map((p) => ({
                      value: p.id, label: `Dr. ${p.firstName} ${p.lastName} — ${p.specialty}`,
                    }))} />
                  <FormField.Select label={t('duration')} value={String(duration)} onChange={(v) => setDuration(parseInt(v, 10))}
                    options={[15, 30, 45, 60, 90].map((m) => ({ value: String(m), label: t('durationMin', { m }) }))} />
                </div>

                {slotIso && providerId && (
                  <Note tone="emerald">
                    <span className="font-semibold flex items-center gap-1"><Check className="w-3 h-3" /> {t('appointmentPreview')}</span>
                    <div className="text-text-1 mt-1 capitalize text-xs">
                      <strong>{slotOptions.find((s) => s.iso === slotIso)?.label}</strong>
                      {' '}con{' '}
                      <strong>{(() => {
                        const p = displayProviders.find((x) => x.id === providerId);
                        return p ? `Dr. ${p.firstName} ${p.lastName}` : '—';
                      })()}</strong>
                      {' '}en{' '}
                      <strong>{clinics.find((c) => c.id === clinicId)?.name}</strong>
                    </div>
                    <div className="text-text-muted text-[10px] mt-1 not-italic">{t('confirmBySMS')}</div>
                  </Note>
                )}
              </>
            ) : (
              <Note tone="muted">{t('noScheduleNote')}</Note>
            )}
          </InfoCard>

          {/* ── Form delivery ───────────────────────────────────────────── */}
          <InfoCard title={t('sectionFormDelivery')} icon={Send} tone="emerald">
            <div className="text-text-2 text-xs">{t('formDeliveryDesc')}</div>
            <div className="grid grid-cols-2 gap-2">
              <SelectableCard
                selected={formDelivery === 'SEND_NOW'}
                onClick={() => setFormDelivery('SEND_NOW')}
                icon="📨"
                title={t('sendNowTitle')}
                subtitle={t('sendNowDesc')}
              />
              <SelectableCard
                selected={formDelivery === 'TABLET_AT_CLINIC'}
                onClick={() => setFormDelivery('TABLET_AT_CLINIC')}
                icon="📱"
                title={t('tabletTitle')}
                subtitle={t('tabletDesc')}
              />
            </div>
          </InfoCard>

          {/* ── Checklist final · qué hace el sistema ──────────────────── */}
          <InfoCard title={t('summaryTitle')} icon={Check} tone="cyan">
            <ul className="space-y-1.5 text-xs text-text-2 list-none m-0 p-0">
              {scheduleNow && slotIso && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>{t('summaryConfirmed')}</span>
                </li>
              )}
              {scheduleNow && slotIso && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>{t('summaryAppointmentSMS')}</span>
                </li>
              )}
              {formDelivery === 'SEND_NOW' && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>{t('summaryForm')}</span>
                </li>
              )}
              {caseType === 'MVA' && lawFirm && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>{t('summaryEdson', { firm: lawFirm.label })}</span>
                </li>
              )}
              {scheduleNow && slotIso && providerId && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>{t('summaryCal')}</span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                <span>{t('summaryAudit', { elapsed: formatElapsed(callElapsed) })}</span>
              </li>
            </ul>
          </InfoCard>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* ─── Footer · stack en mobile · row en sm+ ───────────────────── */}
        <DialogFooter className="border-t border-border px-4 sm:px-6 py-3 shrink-0 gap-2 flex-col-reverse sm:flex-row">
          <Button
            variant="outline"
            onClick={() => handleSubmit('pause')}
            disabled={saving || !firstName || !lastName || !phone}
            className="w-full sm:w-auto"
          >
            <Pause className="w-3.5 h-3.5 mr-1" />
            <span className="sm:inline">{t('btnPause')}</span>
            <span className="hidden sm:inline">&nbsp;· {t('btnPauseSub')}</span>
          </Button>
          <Button
            onClick={() => handleSubmit('finalize')}
            disabled={!canSubmit || saving}
            className="w-full sm:w-auto"
          >
            {saving ? t('btnFinalizing') : (
              <>
                <Check className="w-3.5 h-3.5 mr-1" />
                {t('btnFinalize')}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ─── Confirm exit overlay ──────────────────────────────────────────── */}
    <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-text-1">¿Salir del formulario?</DialogTitle>
          <DialogDescription className="text-text-2 text-sm mt-1">
            Tienes datos ingresados que se perderán si sales ahora.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 mt-4">
          <Button
            variant="destructive"
            className="w-full"
            onClick={confirmExit}
          >
            Salir y perder datos
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowExitConfirm(false)}
          >
            Quedarme · seguir llenando
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ═══ Domain-specific atoms (mínimos · solo lo único de B.2) ════════════

/** SelectableCard — card con icono + title + subtitle clickable.
 *  Sin border-2 · solo border simple del sistema con accent en el activo. */
function SelectableCard({ selected, onClick, icon, title, subtitle }: {
  selected: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-colors flex items-start gap-3 ${
        selected
          ? 'bg-brand/10 border-brand/40'
          : 'bg-bg-2 border-border hover:border-border-strong'
      }`}
    >
      <div className="text-xl shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-sm ${selected ? 'text-text-1' : 'text-text-2'}`}>{title}</div>
        <div className="text-text-muted text-[11px] mt-0.5">{subtitle}</div>
      </div>
      {selected && <Check className="w-4 h-4 text-brand shrink-0 mt-0.5" />}
    </button>
  );
}

/** SegmentedOption — opción de un segmented control (HAS/SEEKING/DECLINED).
 *  Una sola línea, compacto, sin border-2. */
function SegmentedOption({ selected, onClick, icon, label }: {
  selected: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-md border text-[11px] font-medium transition-colors ${
        selected
          ? 'bg-brand/10 border-brand/40 text-brand font-semibold'
          : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
      }`}
    >
      <span className="mr-1">{icon}</span> {label}
    </button>
  );
}

/** Note — bloque con tono + texto pequeño. */
function Note({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'muted' }) {
  const toneClasses: Record<string, string> = {
    default: 'bg-bg-2/40 border-border text-text-2',
    emerald: 'bg-emerald/10 border-emerald/30 text-emerald',
    amber:   'bg-amber/10 border-amber/30 text-amber',
    rose:    'bg-rose/10 border-rose/30 text-rose',
    muted:   'bg-bg-2/40 border-border text-text-muted',
  };
  return (
    <div className={`rounded-md border px-3 py-2 text-[11px] ${toneClasses[tone]}`}>
      {children}
    </div>
  );
}

// ─── Autocomplete ─────────────────────────────────────────────────────────

function Autocomplete({
  endpoint, extraParams, placeholder, selected, onSelect, renderAvatar,
}: {
  endpoint: string;
  extraParams?: Record<string, string>;
  placeholder: string;
  selected: AutoResult | null;
  onSelect: (result: AutoResult | null) => void;
  renderAvatar?: (r: AutoResult) => React.ReactNode;
}) {
  const t = useTranslations('phoenix.frontOffice.newCase');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AutoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected) {
      setQuery('');
      setOpen(false);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, ...(extraParams ?? {}) });
        const res = await fetch(`${endpoint}?${params}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
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
          {t('autocompleteChange')}
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
            <div className="px-3 py-2 text-text-muted text-xs">{t('autocompleteSearching')}</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onSelect(r); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left text-sm transition-colors"
              >
                {renderAvatar?.(r)}
                <div className="flex-1 min-w-0">
                  <div className="text-text-1 truncate">{r.label}</div>
                  {r.subtitle && <div className="text-text-muted text-xs truncate">{r.subtitle}</div>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
