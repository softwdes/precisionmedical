'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import {
  PhoneCall, User, Car, Scale, ShieldCheck, Check, AlertCircle, Search as SearchIcon,
  CalendarCheck, Send, Pause, ArrowRight, ArrowLeft, Phone, ClipboardList,
  Copy, Download, ChevronRight,
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
//   PASO 0 (PreCallStep): ¿cómo empezamos? (search · incoming · outgoing)
//   PASO 1 — Paciente       (datos personales)
//   PASO 2 — Caso           (tipo + accidente + abogado + seguro)
//   PASO 3 — Primera cita   (clínica → doctor → horario disponible)
//   PASO 4 — Formulario     (envío + QR + confirmación final)
//
// Estilo: estricto al sistema (ver apps/back-office/CLAUDE.md regla #0).

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
  providers: Array<{ id: string; firstName: string; lastName: string; specialty: string; specialtyCatalogIds?: string[] }>;
  initialState?: NewCaseInitialState | null;
}

interface AutoResult {
  id: string;
  label: string;
  subtitle?: string;
  shortCode?: string;
  color?: string;
}

type CaseType    = 'MVA' | 'GENERAL';
type LawyerStatus = 'HAS' | 'SEEKING' | 'DECLINED';
type ReferralSource =
  | 'PHONE_CALL' | 'LAW_FIRM_REFERRAL' | 'PATIENT_REFERRAL' | 'WALK_IN' | 'WEB_FORM' | 'OTHER';
type FormDelivery = 'SEND_NOW' | 'TABLET_AT_CLINIC';
type WizardStep  = 1 | 2 | 3 | 4;

// Mapa local de especialidad → enum de Provider (fallback cuando specialtyCatalogIds no está disponible)
const SPECIALTY_ENUM_MAP: Record<string, string[]> = {
  'chiropractic':    ['CHIROPRACTIC'],
  'physical therapy':['PHYSICAL_THERAPY'],
  'pain management': ['PAIN_MANAGEMENT'],
  'orthopedics':     ['ORTHOPEDICS'],
  'neurology':       ['NEUROLOGY'],
  'radiology':       ['RADIOLOGY'],
  'psychology':      ['PSYCHOLOGY'],
  'auto accidents':  ['CHIROPRACTIC', 'PAIN_MANAGEMENT', 'ORTHOPEDICS', 'PHYSICAL_THERAPY', 'NEUROLOGY'],
  'family practice': ['GENERAL'],
  'urgent care':     ['GENERAL', 'OTHER'],
};

export function NewCaseDialog({ open, onOpenChange, specialties, clinics, providers, initialState }: NewCaseDialogProps) {
  const router = useRouter();
  const t = useTranslations('phoenix.frontOffice.newCase');

  // ─── Step state ────────────────────────────────────────────────────────
  const [step, setStep] = useState<'precall' | 'capturing'>('precall');
  const [precallInitialMode, setPrecallInitialMode] = useState<PreCallMode | undefined>(undefined);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [callMode, setCallMode] = useState<PreCallMode | null>(null);
  const [existingPatientId, setExistingPatientId] = useState<string | null>(null);

  // ─── Call timer ────────────────────────────────────────────────────────
  const [callElapsed, setCallElapsed] = useState(0);
  useEffect(() => {
    if (!open) { setCallElapsed(0); setStep('precall'); setCallMode(null); setExistingPatientId(null); return; }
    if (step !== 'capturing' || callMode === 'manual' || callMode === 'search') return;
    const id = setInterval(() => setCallElapsed((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, [open, step, callMode]);

  // ─── Section 1: Patient ────────────────────────────────────────────────
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [email, setEmail]         = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [language, setLanguage]   = useState<'es' | 'en'>('es');
  const [referralSource, setReferralSource] = useState<ReferralSource>('LAW_FIRM_REFERRAL');

  // ─── Section 2: Case type + accident + lawyer + insurance ─────────────
  const [caseType, setCaseType] = useState<CaseType>('MVA');
  const [accidentDate, setAccidentDate] = useState('');
  const [accidentType, setAccidentType] = useState('AUTO');
  const [accidentLocation, setAccidentLocation] = useState('');
  const [accidentNotes, setAccidentNotes] = useState('');
  const [lawyerStatus, setLawyerStatus] = useState<LawyerStatus>('HAS');
  const [lawFirm, setLawFirm]           = useState<AutoResult | null>(null);
  const [attorney, setAttorney]         = useState<AutoResult | null>(null);
  const [caseManagerName, setCaseManagerName]   = useState('');
  const [caseManagerEmail, setCaseManagerEmail] = useState('');
  const [firmPhone, setFirmPhone]               = useState('');
  const [chiropractor, setChiropractor]         = useState('');
  const [insurance, setInsurance]   = useState<AutoResult | null>(null);
  const [policyNumber, setPolicyNumber] = useState('');

  // ─── Section 3: Schedule appointment ──────────────────────────────────
  const [specialtyId, setSpecialtyId] = useState('');
  const [scheduleNow, setScheduleNow] = useState(true);
  const [clinicId, setClinicId]       = useState(clinics[0]?.id ?? '');
  const [providerId, setProviderId]   = useState('');
  const [slotIso, setSlotIso]         = useState<string | null>(null);
  const [duration, setDuration]       = useState(45);
  const [appointmentNotes, setAppointmentNotes] = useState('');
  const [showAllProviders, setShowAllProviders] = useState(false);

  // ─── Section 4: Form delivery ──────────────────────────────────────────
  const [formDelivery, setFormDelivery] = useState<FormDelivery>('SEND_NOW');

  // ─── Submit + success state ────────────────────────────────────────────
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    caseCode: string;
    caseId: string;
    appointmentScheduled: boolean;
    portalUrl: string | null;
    qrDataUrl: string | null;
  } | null>(null);
  const [copied, setCopied]   = useState(false);

  // ─── Exit confirm ──────────────────────────────────────────────────────
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const hasData = step === 'capturing' && (firstName.trim() !== '' || lastName.trim() !== '' || phone.trim() !== '');
  function tryClose() {
    if (hasData && !success) { setShowExitConfirm(true); } else { onOpenChange(false); }
  }

  // ─── Reset on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setWizardStep(1);
    setCaseType('MVA');
    setAccidentDate(''); setAccidentType('AUTO'); setAccidentLocation(''); setAccidentNotes('');
    setLawyerStatus('HAS'); setLawFirm(null); setAttorney(null); setCaseManagerName(''); setCaseManagerEmail(''); setFirmPhone(''); setChiropractor('');
    setInsurance(null); setPolicyNumber('');
    setSpecialtyId(specialties[0]?.id ?? ''); setScheduleNow(true); setClinicId(clinics[0]?.id ?? '');
    setProviderId(''); setSlotIso(null); setDuration(45); setAppointmentNotes(''); setShowAllProviders(false);
    setFormDelivery('SEND_NOW');
    setSaving(false); setError(null); setSuccess(null); setCopied(false); setDuplicateId(null);

    if (initialState) {
      setFirstName(initialState.firstName); setLastName(initialState.lastName);
      setPhone(initialState.phone); setEmail(initialState.email ?? '');
      setDateOfBirth(''); setLanguage('es'); setReferralSource('PHONE_CALL');
      setCallMode(initialState.mode);
      setExistingPatientId(initialState.existingPatientId ?? null);
      setCallElapsed(0); setStep('capturing');
    } else {
      setFirstName(''); setLastName(''); setPhone(''); setEmail('');
      setDateOfBirth(''); setLanguage('es'); setReferralSource('LAW_FIRM_REFERRAL');
      setStep('precall'); setCallMode(null); setExistingPatientId(null);
    }
  }, [open, specialties, clinics, initialState]);

  // ─── PreCall handler ───────────────────────────────────────────────────
  const handleStartCall = (result: PreCallResult) => {
    setFirstName(result.firstName); setLastName(result.lastName); setPhone(result.phone);
    if (result.existingPatient) {
      setExistingPatientId(result.existingPatient.id);
      setEmail(result.existingPatient.email ?? '');
    }
    if (result.mode === 'manual') setReferralSource('LAW_FIRM_REFERRAL');
    setCallMode(result.mode); setCallElapsed(0); setStep('capturing');
    setPrecallInitialMode(undefined);
  };

  const handleChangePatient = () => {
    setStep('precall');
    setPrecallInitialMode('search');
    setFirstName(''); setLastName(''); setPhone(''); setEmail('');
    setExistingPatientId(null); setCallMode(null); setCallElapsed(0);
    setWizardStep(1);
  };

  // ─── Provider filtering ────────────────────────────────────────────────
  const selectedSpecialtyName = specialties.find((s) => s.id === specialtyId)?.name.toLowerCase() ?? '';
  const filteredProviders = useMemo(() => {
    if (showAllProviders) return providers;
    // Si los providers tienen specialtyCatalogIds (versión enriquecida del API), úsalos
    const hasEnriched = providers.some((p) => p.specialtyCatalogIds !== undefined);
    if (hasEnriched) {
      const matches = providers.filter((p) => p.specialtyCatalogIds?.includes(specialtyId));
      return matches.length > 0 ? matches : providers;
    }
    // Fallback: enum map local
    const enumTypes = SPECIALTY_ENUM_MAP[selectedSpecialtyName] ?? [];
    const matches = providers.filter((p) => enumTypes.includes(p.specialty));
    return matches.length > 0 ? matches : providers;
  }, [providers, specialtyId, selectedSpecialtyName, showAllProviders]);

  const hasFilteredProviders = useMemo(() => {
    const hasEnriched = providers.some((p) => p.specialtyCatalogIds !== undefined);
    if (hasEnriched) return providers.some((p) => p.specialtyCatalogIds?.includes(specialtyId));
    const enumTypes = SPECIALTY_ENUM_MAP[selectedSpecialtyName] ?? [];
    return providers.some((p) => enumTypes.includes(p.specialty));
  }, [providers, specialtyId, selectedSpecialtyName]);

  // Auto-select first provider when specialty changes
  useEffect(() => {
    if (scheduleNow && filteredProviders.length > 0 && !filteredProviders.some((p) => p.id === providerId)) {
      setProviderId(filteredProviders[0].id);
    }
  }, [specialtyId, filteredProviders, providerId, scheduleNow]);

  // ─── Slots ─────────────────────────────────────────────────────────────
  const [slotOptions, setSlotOptions]   = useState<Array<{ iso: string; label: string; dayLabel: string }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    if (!providerId || !clinicId || !scheduleNow) { setSlotOptions([]); setSlotIso(null); return; }
    const controller = new AbortController();
    setSlotsLoading(true); setSlotIso(null);
    const fromDate = new Date().toISOString();
    const toDate   = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const params   = new URLSearchParams({ clinicId, providerId, fromDate, toDate, durationMinutes: String(duration), limit: '16' });
    fetch(`/api/appointments/available-slots?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) return;
        setSlotOptions(
          (data.slots as Array<{ startAt: string }>).map((s) => {
            const d = new Date(s.startAt);
            return {
              iso: s.startAt,
              label: d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' }),
              dayLabel: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' }),
            };
          }),
        );
      })
      .catch(() => {})
      .finally(() => setSlotsLoading(false));
    return () => controller.abort();
  }, [providerId, clinicId, duration, scheduleNow]);

  // Group slots by day
  const slotsByDay = useMemo(() => {
    const map = new Map<string, typeof slotOptions>();
    for (const s of slotOptions) {
      const day = s.dayLabel;
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    return Array.from(map.entries());
  }, [slotOptions]);

  // ─── Step validation ───────────────────────────────────────────────────
  const canGoToStep2 = firstName.trim() !== '' && lastName.trim() !== '';
  const canGoToStep3 = canGoToStep2 && (caseType !== 'MVA' || lawyerStatus !== 'HAS' || !!lawFirm);
  const canGoToStep4 = canGoToStep3 && (!scheduleNow || (!!clinicId && !!providerId && !!slotIso));
  const canSubmit = canGoToStep4;

  function nextStep() {
    if (wizardStep < 4) setWizardStep((s) => (s + 1) as WizardStep);
  }
  function prevStep() {
    if (wizardStep > 1) setWizardStep((s) => (s - 1) as WizardStep);
  }

  // ─── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (action: 'finalize' | 'pause') => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: {
            firstName: firstName.trim(), lastName: lastName.trim(),
            phone: phone.trim() || '0000000000',
            email: email.trim() || null,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth + 'T12:00:00Z').toISOString() : null,
            preferredLanguage: language,
          },
          accident: {
            date: accidentDate ? new Date(accidentDate + 'T12:00:00Z').toISOString() : null,
            type: accidentType, location: accidentLocation.trim() || null, notes: accidentNotes.trim() || null,
          },
          legal: {
            lawyerStatus,
            lawFirmId: lawyerStatus === 'HAS' ? (lawFirm?.id ?? null) : null,
            attorneyId: lawyerStatus === 'HAS' ? (attorney?.id ?? null) : null,
            caseManagerName: lawyerStatus === 'HAS' ? (caseManagerName.trim() || null) : null,
            caseManagerEmail: lawyerStatus === 'HAS' ? (caseManagerEmail.trim() || null) : null,
            firmPhone: lawyerStatus === 'HAS' ? (firmPhone.trim() || null) : null,
            chiropractor: chiropractor.trim() || null,
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
            clinicId, providerId,
            scheduledFor: slotIso,
            durationMinutes: duration,
            type: caseType === 'MVA' ? 'AUTO_ACCIDENT' : 'FAMILY_PRACTICE',
            notes: appointmentNotes.trim() || null,
          } : null,
          formDelivery: action === 'finalize' ? formDelivery : null,
          callDurationSeconds: callElapsed,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if ((data.error === 'DUPLICATE_PATIENT' || data.error === 'EMAIL_TAKEN') && data.existingPatientId) {
          setDuplicateId(data.existingPatientId);
        }
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const caseId = data.case.id;

      // Generate portal token + QR
      let portalUrl: string | null = null;
      let qrDataUrl: string | null = null;
      try {
        const tokenRes = await fetch(`/api/admin/cases/${caseId}/generate-portal-token`, { method: 'POST' });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          portalUrl = tokenData.portalUrl ?? null;
          if (portalUrl) {
            qrDataUrl = await QRCode.toDataURL(portalUrl, {
              width: 200, margin: 1,
              color: { dark: '#e2e8f0', light: '#12141f' },
            });
          }
        }
      } catch { /* no interrumpir el flujo si falla el QR */ }

      setSuccess({ caseCode: data.case.caseCode, caseId, appointmentScheduled: !!data.appointment, portalUrl, qrDataUrl });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear caso');
    } finally {
      setSaving(false);
    }
  };

  const isManual = callMode === 'manual';
  const isSearch = callMode === 'search';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Paciente';

  // ─── Copy link ─────────────────────────────────────────────────────────
  async function copyLink() {
    if (!success?.portalUrl) return;
    await navigator.clipboard.writeText(success.portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── Download QR ───────────────────────────────────────────────────────
  function downloadQr() {
    if (!success?.qrDataUrl) return;
    const a = document.createElement('a');
    a.href = success.qrDataUrl;
    a.download = `formulario-${success.caseCode}.png`;
    a.click();
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER · PreCall step
  // ══════════════════════════════════════════════════════════════════════
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
            <PreCallStep onConfirm={handleStartCall} onCancel={() => onOpenChange(false)} initialMode={precallInitialMode} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER · Success panel (dentro del mismo dialog)
  // ══════════════════════════════════════════════════════════════════════
  if (success) {
    const selectedSlot = slotOptions.find((s) => s.iso === slotIso);
    const selectedProvider = providers.find((p) => p.id === providerId);
    const selectedClinic   = clinics.find((c) => c.id === clinicId);

    return (
      <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald/15 border border-emerald/30 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-emerald" />
              </div>
              <div>
                <div className="text-text-1 font-semibold text-sm">
                  {isManual ? t('successTitleManual') : t('successTitleCall')}
                </div>
                <div className="text-text-muted text-[11px] mt-0.5">
                  {firstName} {lastName} · <code className="text-emerald font-mono font-bold">{success.caseCode}</code>
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 scroll-thin">

            {/* Resumen de lo creado */}
            <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">Resumen del caso</div>
              <div className="space-y-1.5 text-xs text-text-2">
                <div className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>Caso <strong className="text-text-1 font-mono">{success.caseCode}</strong> creado · {caseType}</span>
                </div>
                {success.appointmentScheduled && selectedSlot && (
                  <div className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                    <span>
                      Cita agendada: <strong className="text-text-1">{selectedSlot.dayLabel} · {selectedSlot.label}</strong>
                      {selectedProvider && <> · Dr. {selectedProvider.firstName} {selectedProvider.lastName}</>}
                      {selectedClinic && <> · {selectedClinic.name}</>}
                    </span>
                  </div>
                )}
                {formDelivery === 'SEND_NOW' && (
                  <div className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                    <span>Formulario enviado por {email ? 'email + SMS' : 'SMS'}</span>
                  </div>
                )}
                {caseType === 'MVA' && lawFirm && (
                  <div className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                    <span>Vinculado a bufete: <strong className="text-text-1">{lawFirm.label}</strong></span>
                  </div>
                )}
              </div>
            </div>

            {/* QR + link · compartir por otros medios */}
            {success.portalUrl && (
              <div className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">
                  Enlace del formulario · compartir por otros medios
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  {/* QR code */}
                  {success.qrDataUrl && (
                    <div className="shrink-0 rounded-lg overflow-hidden border border-border">
                      <img src={success.qrDataUrl} alt="QR formulario" className="w-[140px] h-[140px] block" />
                    </div>
                  )}
                  {/* Link + botones */}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="rounded-md bg-bg-2/40 border border-border/40 px-3 py-2">
                      <div className="text-[10px] text-text-muted mb-1">URL del formulario</div>
                      <div className="text-xs text-text-2 font-mono truncate">{success.portalUrl}</div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={copyLink}
                      >
                        {copied
                          ? <><Check className="w-3.5 h-3.5 text-emerald" /> ¡Copiado!</>
                          : <><Copy className="w-3.5 h-3.5" /> Copiar enlace</>}
                      </Button>
                      {success.qrDataUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2"
                          onClick={downloadQr}
                        >
                          <Download className="w-3.5 h-3.5" /> Descargar QR
                        </Button>
                      )}
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Hola ${firstName}, aquí está el enlace para completar tu formulario médico: ${success.portalUrl}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 transition-colors"
                      >
                        <span className="text-base leading-none">💬</span> Enviar por WhatsApp
                      </a>
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-text-muted italic">
                  El enlace es único para este caso y expira cuando el paciente complete el formulario.
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <DialogFooter className="border-t border-border px-4 sm:px-6 py-3 shrink-0 gap-2 flex-col-reverse sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Cerrar
            </Button>
            <Button onClick={() => {
              onOpenChange(false);
              router.push(`/front-office/${success.caseId}`);
            }} className="w-full sm:w-auto">
              Ver caso <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER · Wizard capturing (4 pasos)
  // ══════════════════════════════════════════════════════════════════════
  const elapsedLabel = formatElapsed(callElapsed);
  const callModeLabel = callMode === 'search' ? t('modeExisting')
    : callMode === 'incoming' ? t('modeIncoming')
    : callMode === 'manual' ? t('modeManual')
    : t('modeOutbound');

  const STEPS = [
    { n: 1 as WizardStep, label: 'Paciente',  labelShort: '1', icon: User },
    { n: 2 as WizardStep, label: 'Caso',      labelShort: '2', icon: Car },
    { n: 3 as WizardStep, label: 'Cita',      labelShort: '3', icon: CalendarCheck },
    { n: 4 as WizardStep, label: 'Formulario',labelShort: '4', icon: Send },
  ];

  const stepCanProceed = [true, canGoToStep2, canGoToStep3, canGoToStep4];
  const canNext = wizardStep < 4 && stepCanProceed[wizardStep];

  return (
    <>
    <Dialog open={open} onOpenChange={(val) => { if (!val) tryClose(); }}>
      <DialogContent
        className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0"
        onPointerDownOutside={(e) => { if (hasData && !success) { e.preventDefault(); setShowExitConfirm(true); } }}
        onEscapeKeyDown={(e) => { if (hasData && !success) { e.preventDefault(); setShowExitConfirm(true); } }}
      >
        {/* ─── Header ──────────────────────────────────────────────────── */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-text-1 text-sm sm:text-base">
                  {isManual || isSearch
                    ? <ClipboardList className="w-4 h-4 text-brand shrink-0" />
                    : <PhoneCall className="w-4 h-4 text-emerald shrink-0" />}
                  <span className="truncate">
                    {isManual ? t('titleManual', { name: fullName }) : isSearch ? t('titleSearch', { name: fullName }) : t('titleCall', { name: fullName })}
                  </span>
                </DialogTitle>
                <DialogDescription className="mt-1 text-[11px] sm:text-xs flex items-center gap-1.5 flex-wrap">
                  <span>{callModeLabel}</span>
                  {existingPatientId && <span>· <code className="text-cyan font-mono">{t('modeKnown')}</code></span>}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                {isManual
                  ? <TagPill label={t('badgeNoCall')} colorClass="bg-amber/15 text-amber border-amber/30" mono />
                  : isSearch
                  ? <TagPill label={t('badgeSearch')} colorClass="bg-brand/15 text-brand border-brand/30" mono />
                  : <TagPill
                      label={<><span className="w-1.5 h-1.5 rounded-full bg-emerald inline-block mr-1 animate-pulse" />{elapsedLabel}</>}
                      colorClass="bg-emerald/15 text-emerald border-emerald/30"
                    />}
              </div>
            </div>
          </DialogHeader>

          {/* Patient hero */}
          <div className="mt-3 rounded-lg border border-border bg-bg-1 px-3 sm:px-4 py-2.5 flex items-center gap-3">
            <PersonAvatar firstName={firstName || '?'} lastName={lastName || ''} size={10} gradientClass="bg-gradient-brand" />
            <div className="flex-1 min-w-0">
              <div className="text-text-1 font-semibold text-sm truncate">{fullName}</div>
              <div className="text-text-muted text-[11px] mt-0.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
                {phone && <span className="font-mono flex items-center gap-1"><Phone className="w-3 h-3" />{phone}</span>}
                <span>{language === 'es' ? t('langEs') : t('langEn')}</span>
                {lawFirm && <span className="truncate max-w-full">⚖ {lawFirm.label}</span>}
              </div>
            </div>
            {isSearch && (
              <button
                type="button"
                onClick={handleChangePatient}
                title={t('changePatientHint')}
                className="shrink-0 flex items-center gap-1 text-[11px] text-text-muted hover:text-brand transition-colors border border-border/60 hover:border-brand/40 rounded-md px-2 py-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span className="hidden sm:inline">{t('changePatient')}</span>
              </button>
            )}
          </div>

          {/* Step progress breadcrumb */}
          <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-0.5">
            {STEPS.map((s, i) => {
              const isActive   = wizardStep === s.n;
              const isDone     = wizardStep > s.n;
              const isReachable = isDone;
              return (
                <div key={s.n} className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => isReachable && setWizardStep(s.n)}
                    disabled={!isReachable && !isActive}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      isActive
                        ? 'bg-brand/15 text-brand border border-brand/30'
                        : isDone
                        ? 'text-emerald hover:bg-emerald/10 cursor-pointer'
                        : 'text-text-muted cursor-default'
                    }`}
                  >
                    {isDone
                      ? <Check className="w-3 h-3 shrink-0" />
                      : <s.icon className="w-3 h-3 shrink-0" />}
                    <span className="hidden sm:inline">{s.label}</span>
                    <span className="sm:hidden">{s.labelShort}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Body scrollable ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4 scroll-thin">

          {/* ══ STEP 1 — PACIENTE ════════════════════════════════════════ */}
          {wizardStep === 1 && (
            <InfoCard title={t('sectionPatient')} icon={User} number={1}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField.Input label={t('firstName')} required value={firstName} onChange={setFirstName} autoFocus />
                <FormField.Input label={t('lastName')}  required value={lastName}  onChange={setLastName} />
                <FormField.Phone label={t('phone')}     value={phone}    onChange={(v) => setPhone(v)} />
                <FormField.Input label={t('email')}     value={email}    onChange={setEmail} type="email" />
                <FormField.Input label={t('dob')}       value={dateOfBirth} onChange={setDateOfBirth} type="date" />
                <FormField.Select label={t('language')} value={language} onChange={(v) => setLanguage(v as 'es' | 'en')}
                  options={[{ value: 'es', label: t('langEs') }, { value: 'en', label: t('langEn') }]} />
              </div>
              <FormField.Select label={t('referralSource')} value={referralSource} onChange={(v) => setReferralSource(v as ReferralSource)}
                options={[
                  { value: 'LAW_FIRM_REFERRAL', label: t('sourceFirearm') },
                  { value: 'PATIENT_REFERRAL',  label: t('sourcePatient') },
                  { value: 'PHONE_CALL',         label: t('sourcePhone') },
                  { value: 'WALK_IN',            label: t('sourceWalkin') },
                  { value: 'WEB_FORM',           label: t('sourceWeb') },
                  { value: 'OTHER',              label: t('sourceOther') },
                ]}
                hint={t('patientHint')}
              />
              {!canGoToStep2 && (
                <Note tone="amber">Nombre y apellido son requeridos para continuar.</Note>
              )}
            </InfoCard>
          )}

          {/* ══ STEP 2 — CASO ════════════════════════════════════════════ */}
          {wizardStep === 2 && (
            <>
              {/* Tipo de caso */}
              <InfoCard title={t('sectionCaseType')} icon={Car} number={1}>
                <div className="grid grid-cols-2 gap-2">
                  <SelectableCard selected={caseType === 'MVA'} onClick={() => setCaseType('MVA')}
                    icon="🚗" title={t('caseMVA')} subtitle={t('caseMVADesc')} />
                  <SelectableCard selected={caseType === 'GENERAL'} onClick={() => setCaseType('GENERAL')}
                    icon="🩺" title={t('caseGM')} subtitle={t('caseGMDesc')} />
                </div>
              </InfoCard>

              {/* Accidente */}
              {caseType === 'MVA' && (
                <InfoCard title={t('sectionAccident')} icon={Car} number={2}>
                  <FormField.Input label={t('accidentDate')} value={accidentDate} onChange={setAccidentDate} type="date" />
                  <FormField.Input label={t('accidentLocation')} value={accidentLocation} onChange={setAccidentLocation} />
                  <FormField.Textarea label={t('accidentNotes')} value={accidentNotes} onChange={setAccidentNotes}
                    placeholder={t('accidentNotesPlaceholder')} hint={t('accidentHint')} />
                </InfoCard>
              )}

              {/* Abogado */}
              {caseType === 'MVA' && (
                <InfoCard
                  title={t('sectionLawyer')} icon={Scale} number={3} tone="rose"
                  rightSlot={<TagPill label={t('lawyerRequired')} colorClass="bg-rose/15 text-rose border-rose/30" />}
                >
                  <div className="text-text-muted text-[11px] italic">{t('lawyerHint')}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <SegmentedOption selected={lawyerStatus === 'HAS'} onClick={() => setLawyerStatus('HAS')} icon="✓" label={t('lawyerHas')} />
                    <SegmentedOption selected={lawyerStatus === 'SEEKING'} onClick={() => setLawyerStatus('SEEKING')} icon="🔍" label={t('lawyerSeeking')} />
                    <SegmentedOption selected={lawyerStatus === 'DECLINED'} onClick={() => setLawyerStatus('DECLINED')} icon="✗" label={t('lawyerDeclined')} />
                  </div>
                  {lawyerStatus === 'HAS' && (
                    <div className="space-y-3">
                      <div>
                        <Label>{t('lawFirmLabel')} <span className="text-text-muted text-[10px] ml-1 font-normal">{t('lawFirmAutocomplete')}</span></Label>
                        <Autocomplete endpoint="/api/admin/lawyers/autocomplete" placeholder={t('lawFirmPlaceholder')}
                          selected={lawFirm} onSelect={(r) => { setLawFirm(r); setAttorney(null); }} />
                      </div>
                      {lawFirm && (
                        <>
                          <div>
                            <Label>{t('attorneyLabel')} <span className="text-text-muted text-[10px] ml-1 font-normal">{t('attorneyOptional')}</span></Label>
                            <Autocomplete endpoint="/api/admin/lawyers/autocomplete" extraParams={{ firmId: lawFirm.id }}
                              placeholder={t('attorneyPlaceholder')} selected={attorney} onSelect={setAttorney} />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField.Input label={t('caseManagerLabel')} value={caseManagerName} onChange={setCaseManagerName} />
                            <FormField.Input label={t('caseManagerEmail')} value={caseManagerEmail} onChange={setCaseManagerEmail} type="email" />
                          </div>
                          <FormField.Phone label={t('firmPhone')} value={firmPhone} onChange={(v) => setFirmPhone(v)} />
                        </>
                      )}
                      <Note tone="emerald">{t('lawyerNoteHas')}</Note>
                    </div>
                  )}
                  {lawyerStatus === 'SEEKING'  && <Note tone="amber">{t('lawyerNoteSeeking')}</Note>}
                  {lawyerStatus === 'DECLINED' && <Note tone="rose">{t('lawyerNoteDeclined')}</Note>}
                  <FormField.Input label={t('chiropractorLabel')} value={chiropractor} onChange={setChiropractor}
                    placeholder={t('chiropractorPlaceholder')} />
                </InfoCard>
              )}

              {/* Seguro */}
              {caseType === 'MVA' && (
                <InfoCard title={t('sectionInsurance')} icon={ShieldCheck} number={4} tone="cyan">
                  <div>
                    <Label>{t('insuranceLabel')}</Label>
                    <Autocomplete endpoint="/api/admin/insurances/autocomplete" placeholder={t('insurancePlaceholder')}
                      selected={insurance} onSelect={setInsurance}
                      renderAvatar={(r) => r.color && r.shortCode ? (
                        <div className="w-7 h-7 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: r.color }}>
                          {r.shortCode}
                        </div>
                      ) : null}
                    />
                  </div>
                  {insurance && (
                    <FormField.Input label={t('policyNumber')} value={policyNumber} onChange={setPolicyNumber}
                      placeholder="PIP-2026-0142" hint={t('policyHint')} />
                  )}
                </InfoCard>
              )}

              {!canGoToStep3 && caseType === 'MVA' && lawyerStatus === 'HAS' && !lawFirm && (
                <Note tone="amber">Selecciona el bufete de abogados para continuar.</Note>
              )}
            </>
          )}

          {/* ══ STEP 3 — PRIMERA CITA ════════════════════════════════════ */}
          {wizardStep === 3 && (
            <InfoCard
              title={t('sectionAppointment')} icon={CalendarCheck} number={1} tone="emerald"
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

                  {/* Clínica + Especialidad */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField.Select label={t('clinic')} value={clinicId} onChange={setClinicId}
                      options={clinics.map((c) => ({ value: c.id, label: c.name }))} />
                    <FormField.Select label={t('specialty')} value={specialtyId} onChange={(v) => { setSpecialtyId(v); setShowAllProviders(false); }}
                      options={[{ value: '', label: 'Sin especialidad' }, ...specialties.map((s) => ({ value: s.id, label: s.name }))]} />
                  </div>

                  {/* Doctor */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label>Doctor</Label>
                      {!hasFilteredProviders && providers.length > 0 && (
                        <button type="button" onClick={() => setShowAllProviders((v) => !v)}
                          className="text-[10px] text-brand hover:underline">
                          {showAllProviders ? 'Ver solo esta especialidad' : 'Ver todos los doctores'}
                        </button>
                      )}
                      {hasFilteredProviders && filteredProviders.length < providers.length && (
                        <button type="button" onClick={() => setShowAllProviders((v) => !v)}
                          className="text-[10px] text-text-muted hover:text-brand">
                          {showAllProviders ? `Mostrar solo especialidad (${filteredProviders.length})` : `Ver todos (${providers.length})`}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {filteredProviders.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setProviderId(p.id)}
                          className={`text-left p-2.5 rounded-md border text-xs transition-colors flex items-center gap-2 ${
                            providerId === p.id
                              ? 'bg-emerald/10 border-emerald/40 text-text-1'
                              : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                          }`}
                        >
                          <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={8} gradientClass="bg-gradient-brand" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">Dr. {p.firstName} {p.lastName}</div>
                            <div className="text-[10px] text-text-muted capitalize">{p.specialty.toLowerCase().replace('_', ' ')}</div>
                          </div>
                          {providerId === p.id && <Check className="w-3.5 h-3.5 text-emerald shrink-0" />}
                        </button>
                      ))}
                      {filteredProviders.length === 0 && (
                        <div className="col-span-2 text-[11px] text-text-muted italic p-2">
                          No hay doctores para esta especialidad.{' '}
                          <button type="button" onClick={() => setShowAllProviders(true)} className="text-brand hover:underline">
                            Ver todos
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Duración */}
                  <FormField.Select label={t('duration')} value={String(duration)} onChange={(v) => setDuration(parseInt(v, 10))}
                    options={[15, 30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: t('durationMin', { m }) }))} />

                  {/* Slots agrupados por día */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Label>
                        {t('slotsLabel')}
                        {slotsLoading && (
                          <span className="ml-2 text-[10px] text-text-muted font-normal animate-pulse">{t('slotsLoading')}</span>
                        )}
                      </Label>
                      {!slotsLoading && slotOptions.length > 0 && (
                        <span className="text-[10px] text-text-muted">8 días hábiles</span>
                      )}
                    </div>

                    {!providerId || !clinicId ? (
                      <p className="text-[11px] text-text-muted italic">{t('slotsSelectFirst')}</p>
                    ) : slotsLoading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className="h-9 rounded-md border border-border bg-bg-2 animate-pulse" />
                        ))}
                      </div>
                    ) : slotsByDay.length === 0 ? (
                      <Note tone="amber">{t('slotsNone')}</Note>
                    ) : (
                      <div className="space-y-3">
                        {slotsByDay.map(([day, daySlots]) => (
                          <div key={day}>
                            <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">{day}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {daySlots.map((s) => (
                                <button
                                  key={s.iso}
                                  type="button"
                                  onClick={() => setSlotIso(s.iso)}
                                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
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
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Confirmación del slot */}
                  {slotIso && providerId && (
                    <Note tone="emerald">
                      <span className="font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> {t('appointmentPreview')}
                      </span>
                      <div className="text-text-1 mt-1 text-xs">
                        {(() => {
                          const s = slotOptions.find((x) => x.iso === slotIso);
                          const p = providers.find((x) => x.id === providerId);
                          const c = clinics.find((x) => x.id === clinicId);
                          return <><strong>{s?.dayLabel} · {s?.label}</strong> · Dr. <strong>{p?.firstName} {p?.lastName}</strong> · {c?.name}</>;
                        })()}
                      </div>
                      <div className="text-text-muted text-[10px] mt-1 not-italic">{t('confirmBySMS')}</div>
                    </Note>
                  )}

                  {/* Notas para el doctor */}
                  <FormField.Textarea
                    label="Notas para el doctor"
                    value={appointmentNotes}
                    onChange={setAppointmentNotes}
                    placeholder="Ej: paciente reporta dolor lumbar desde el accidente…"
                    hint="Opcional · visible solo para el doctor asignado"
                  />

                  {scheduleNow && !slotIso && (
                    <Note tone="amber">Selecciona un horario disponible para continuar.</Note>
                  )}
                </>
              ) : (
                <Note tone="muted">{t('noScheduleNote')}</Note>
              )}
            </InfoCard>
          )}

          {/* ══ STEP 4 — FORMULARIO ══════════════════════════════════════ */}
          {wizardStep === 4 && (
            <>
              {/* Delivery options */}
              <InfoCard title={t('sectionFormDelivery')} icon={Send} tone="emerald">
                <div className="text-text-2 text-xs">{t('formDeliveryDesc')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <SelectableCard selected={formDelivery === 'SEND_NOW'} onClick={() => setFormDelivery('SEND_NOW')}
                    icon="📨" title={t('sendNowTitle')} subtitle={t('sendNowDesc')} />
                  <SelectableCard selected={formDelivery === 'TABLET_AT_CLINIC'} onClick={() => setFormDelivery('TABLET_AT_CLINIC')}
                    icon="📱" title={t('tabletTitle')} subtitle={t('tabletDesc')} />
                </div>
              </InfoCard>

              {/* Resumen final */}
              <InfoCard title={t('summaryTitle')} icon={Check} tone="cyan">
                <ul className="space-y-1.5 text-xs text-text-2 list-none m-0 p-0">
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                    <span>Paciente: <strong className="text-text-1">{firstName} {lastName}</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                    <span>Caso tipo: <strong className="text-text-1">{caseType}</strong>
                      {caseType === 'MVA' && lawFirm && <> · {lawFirm.label}</>}
                    </span>
                  </li>
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

              {duplicateId && (
                <div className="text-amber text-sm bg-amber/10 border border-amber/30 rounded-md px-3 py-2 flex flex-col gap-2">
                  <p className="font-medium">¿Deseas crear el caso para el paciente existente en lugar de registrar uno nuevo?</p>
                  <Button size="sm" variant="outline" className="self-start border-amber/50 text-amber hover:bg-amber/10"
                    onClick={() => { setExistingPatientId(duplicateId); setDuplicateId(null); setError(null); }}>
                    Usar paciente existente
                  </Button>
                </div>
              )}
            </>
          )}

        </div>

        {/* ─── Footer ──────────────────────────────────────────────────── */}
        <DialogFooter className="border-t border-border px-4 sm:px-6 py-3 shrink-0 gap-2 flex-col-reverse sm:flex-row items-stretch sm:items-center">
          {/* Left side: Back + Pause */}
          <div className="flex gap-2 w-full sm:w-auto">
            {wizardStep > 1 && (
              <Button variant="outline" onClick={prevStep} className="flex-1 sm:flex-none sm:w-auto gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Atrás</span>
              </Button>
            )}
            {wizardStep === 4 && (
              <Button variant="outline" onClick={() => handleSubmit('pause')}
                disabled={saving || !firstName || !lastName}
                className="flex-1 sm:flex-none sm:w-auto gap-1">
                <Pause className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('btnPause')}</span>
              </Button>
            )}
          </div>

          {/* Right side: Next or Finalize */}
          {wizardStep < 4 ? (
            <Button onClick={nextStep} disabled={!canNext} className="w-full sm:w-auto gap-1">
              Siguiente
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button onClick={() => handleSubmit('finalize')} disabled={!canSubmit || saving} className="w-full sm:w-auto gap-1">
              {saving ? 'Creando caso…' : (
                <><Check className="w-3.5 h-3.5" /> {t('btnFinalize')} <ArrowRight className="w-3.5 h-3.5" /></>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ─── Confirm exit ─────────────────────────────────────────────────── */}
    <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-text-1">¿Salir del formulario?</DialogTitle>
          <DialogDescription className="text-text-2 text-sm mt-1">
            Tienes datos ingresados que se perderán si sales ahora.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-4">
          <Button variant="destructive" className="w-full" onClick={() => { setShowExitConfirm(false); onOpenChange(false); }}>
            Salir y perder datos
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setShowExitConfirm(false)}>
            Quedarme · seguir llenando
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ═══ Domain-specific atoms ═════════════════════════════════════════════════

function SelectableCard({ selected, onClick, icon, title, subtitle }: {
  selected: boolean; onClick: () => void; icon: string; title: string; subtitle: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-colors flex items-start gap-3 ${
        selected ? 'bg-brand/10 border-brand/40' : 'bg-bg-2 border-border hover:border-border-strong'
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

function SegmentedOption({ selected, onClick, icon, label }: {
  selected: boolean; onClick: () => void; icon: string; label: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-2 rounded-md border text-[11px] font-medium transition-colors ${
        selected ? 'bg-brand/10 border-brand/40 text-brand font-semibold' : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
      }`}
    >
      <span className="mr-1">{icon}</span> {label}
    </button>
  );
}

function Note({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'muted' }) {
  const toneClasses: Record<string, string> = {
    default: 'bg-bg-2/40 border-border text-text-2',
    emerald: 'bg-emerald/10 border-emerald/30 text-emerald',
    amber:   'bg-amber/10 border-amber/30 text-amber',
    rose:    'bg-rose/10 border-rose/30 text-rose',
    muted:   'bg-bg-2/40 border-border text-text-muted',
  };
  return (
    <div className={`rounded-md border px-3 py-2 text-[11px] ${toneClasses[tone]}`}>{children}</div>
  );
}

function Autocomplete({
  endpoint, extraParams, placeholder, selected, onSelect, renderAvatar,
}: {
  endpoint: string; extraParams?: Record<string, string>; placeholder: string;
  selected: AutoResult | null; onSelect: (result: AutoResult | null) => void;
  renderAvatar?: (r: AutoResult) => React.ReactNode;
}) {
  const t = useTranslations('phoenix.frontOffice.newCase');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AutoResult[]>([]);
  const [open, setOpen] = useState(false);
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
          {t('autocompleteChange')}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} placeholder={placeholder} className="pl-9" />
      </div>
      {open && (results.length > 0 || loading) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-1 border border-border-strong rounded-md shadow-xl max-h-60 overflow-y-auto">
          {loading && results.length === 0 ? (
            <div className="px-3 py-2 text-text-muted text-xs">{t('autocompleteSearching')}</div>
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

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
