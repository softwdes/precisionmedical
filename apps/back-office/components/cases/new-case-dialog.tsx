'use client';
import { localeApp } from '@/lib/fechas';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { TwilioCallStatus } from '@/lib/use-twilio-device';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import {
  PhoneCall, PhoneOff, User, Car, Scale, ShieldCheck, Check, AlertCircle,
  CalendarCheck, Send, Pause, ArrowRight, ArrowLeft, Phone, ClipboardList,
  Copy, Download, ChevronRight, Shield, X, RefreshCw, Mail, MessageSquare, Tablet,
  Users, Link as LinkIcon,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
} from '@precision/ui';
import { TagPill, PersonAvatar, InfoCard, FormField, Autocomplete, type AutoResult } from '@/components/ui-phoenix';
import { DoctorCombobox } from '@/components/ui-phoenix/doctor-combobox';
import { SignaturePad } from '@/components/ui-phoenix/signature-pad';
import { PreCallStep, type PreCallResult, type PreCallMode } from './precall-step';
// Subpath, no el barrel: el barrel instancia PrismaClient y esto es client-side
import { calcAge, isMinor } from '@precision-medical/database/age';
import { ActiveCallBar } from './active-call-bar';
import { useTwilioDevice } from '@/lib/use-twilio-device';

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
  agentName?: string;
}

/** Mismos valores que el enum del schema y que patient-create-dialog. */
const GUARDIAN_RELATION_OPTIONS = ['MOTHER', 'FATHER', 'LEGAL_GUARDIAN', 'OTHER'] as const;

type CaseType    = 'MVA' | 'GENERAL';
type LawyerStatus = 'HAS' | 'SEEKING' | 'DECLINED';
type ReferralSource =
  | 'LAW_FIRM' | 'PATIENT_REFERRAL' | 'CHIROPRACTOR' | 'REFERRAL' | 'PHONE_CALL' | 'WALK_IN'
  | 'ACCIDENT_CENTER' | 'WEB_SEARCH' | 'GOOGLE' | 'GOOGLE_MAPS' | 'FACEBOOK' | 'INSTAGRAM'
  | 'TIKTOK' | 'WEBSITE' | 'CLINIC_STAFF' | 'INSURANCE' | 'MEDICAL_INSURANCE' | 'FAMILY' | 'OTHER';
type FormDelivery = { email: boolean; sms: boolean; tablet: boolean };
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

export function NewCaseDialog({ open, onOpenChange, specialties, clinics, providers, initialState, agentName }: NewCaseDialogProps) {
  const router = useRouter();
  const t  = useTranslations('phoenix.frontOffice.newCase');
  const tp = useTranslations('phoenix.patients');
  const tc = useTranslations('caseWizard');
  // Navegación de semana del selector de horarios. Las claves ya existían en
  // `phoenix.calendar` (prevWeek/nextWeek) pero acá estaban escritas a mano en
  // español, así que "Sem. ant." / "Sem. sig." salían igual con la UI en inglés.
  const tcal = useTranslations('phoenix.calendar');

  // ─── Twilio Voice ──────────────────────────────────────────────────────
  const twilio = useTwilioDevice();
  const [callHungUp, setCallHungUp] = useState(false);

  // ─── Step state ────────────────────────────────────────────────────────
  const [step, setStep] = useState<'precall' | 'calling' | 'noanswer' | 'capturing'>('precall');
  const [precallInitialMode, setPrecallInitialMode] = useState<PreCallMode | undefined>(undefined);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  // Tracks whether the reset effect already ran for the current open cycle,
  // preventing re-runs caused by new array references for specialties/clinics.
  const didResetRef = useRef(false);
  const [callMode, setCallMode] = useState<PreCallMode | null>(null);
  const [existingPatientId, setExistingPatientId] = useState<string | null>(null);

  // ─── Call timer ────────────────────────────────────────────────────────
  const [callElapsed, setCallElapsed] = useState(0);
  useEffect(() => {
    if (!open) {
      setCallElapsed(0); setStep('precall'); setCallMode(null);
      setExistingPatientId(null); setCallHungUp(false);
      return;
    }
    if (step !== 'capturing' || callMode === 'manual' || callMode === 'search') return;
    if (callHungUp) return;
    const id = setInterval(() => setCallElapsed((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, [open, step, callMode, callHungUp]);

  // Auto-conectar Twilio cuando entramos en la pantalla 'calling'
  useEffect(() => {
    if (step !== 'calling' || callMode !== 'outgoing' || !phone) return;
    twilio.connect(phone, agentName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, callMode]);

  // NOTA: el evento 'accept' del SDK de Twilio se dispara cuando el navegador conecta
  // con Twilio (WebRTC), NO cuando el destinatario contesta. Por eso NO transitamos
  // automáticamente a 'capturing' en 'in-call'. El agente hace clic en "Contestó"
  // cuando confirma que el paciente levantó el teléfono.

  // Twilio desconectó (no contestó, ocupado, o error) → pantalla de no contestó
  useEffect(() => {
    if (step !== 'calling') return;
    if (twilio.callStatus === 'ready' || twilio.callStatus === 'error') {
      setStep('noanswer');
    }
  }, [twilio.callStatus, step]);

  // Detener timer cuando Twilio desconecta mientras el agente está en el wizard
  useEffect(() => {
    if (callMode === 'outgoing' && step === 'capturing' && twilio.callStatus === 'ready') {
      setCallHungUp(true);
    }
  }, [twilio.callStatus, callMode, step]);

  // ─── Section 1: Patient ────────────────────────────────────────────────
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [email, setEmail]         = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [language, setLanguage]   = useState<'es' | 'en'>('es');
  const [referralSource, setReferralSource] = useState<ReferralSource>('LAW_FIRM');

  // ─── Section 1b: Padre / apoderado (solo si el paciente es menor) ───────
  // Si `guardianLinked` tiene valor, el apoderado ya existe como paciente y se
  // linkea; si es null, los campos de abajo crean uno nuevo (sin caso).
  const [guardianLinked, setGuardianLinked] = useState<AutoResult | null>(null);
  const [gFirstName, setGFirstName] = useState('');
  const [gLastName,  setGLastName]  = useState('');
  const [gEmail,     setGEmail]     = useState('');
  const [gPhone,     setGPhone]     = useState('');
  const [gDob,       setGDob]       = useState('');
  const [gRelation,  setGRelation]  = useState('MOTHER');

  // ─── Section 2: Case type + accident + lawyer + insurance ─────────────
  const [caseType, setCaseType] = useState<CaseType>('MVA');
  const [accidentDate, setAccidentDate] = useState('');
  const [accidentType, setAccidentType] = useState('AUTO');
  const [accidentLocation, setAccidentLocation] = useState('');
  const [accidentNotes, setAccidentNotes] = useState('');
  const [lawyerStatus, setLawyerStatus] = useState<LawyerStatus>('HAS');
  const [lawFirm, setLawFirm]           = useState<AutoResult | null>(null);
  const [attorney, setAttorney]         = useState<AutoResult | null>(null);
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
  const [showAllProviders, setShowAllProviders] = useState(false);
  const [weekStart, setWeekStart]     = useState<Date>(() => getMondayOf(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // ─── Section 3: Form delivery ──────────────────────────────────────────
  const [formDelivery, setFormDelivery] = useState<FormDelivery>({ email: true, sms: true, tablet: false });

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
    if (!open) { didResetRef.current = false; return; }
    if (didResetRef.current) return;
    didResetRef.current = true;
    setWizardStep(1);
    setGuardianLinked(null);
    setGFirstName(''); setGLastName(''); setGEmail(''); setGPhone(''); setGDob(''); setGRelation('MOTHER');
    setCaseType('MVA');
    setAccidentDate(''); setAccidentType('AUTO'); setAccidentLocation(''); setAccidentNotes('');
    setLawyerStatus('HAS'); setLawFirm(null); setAttorney(null); setChiropractor('');
    setInsurance(null); setPolicyNumber('');
    setSpecialtyId(''); setScheduleNow(true); setClinicId(clinics[0]?.id ?? '');
    setProviderId(''); setSlotIso(null); setDuration(45); setShowAllProviders(false);
    setWeekStart(getMondayOf(new Date())); setSelectedDay(null);
    setFormDelivery({ email: true, sms: true, tablet: false });
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
      setDateOfBirth(''); setLanguage('es'); setReferralSource('LAW_FIRM');
      setStep('precall'); setCallMode(null); setExistingPatientId(null);
    }
  }, [open, specialties, clinics, initialState]);

  // ─── PreCall handler ───────────────────────────────────────────────────
  const handleStartCall = (result: PreCallResult) => {
    setFirstName(result.firstName); setLastName(result.lastName); setPhone(result.phone);
    if (result.existingPatient) {
      setExistingPatientId(result.existingPatient.id);
      setEmail(result.existingPatient.email ?? '');
      setDateOfBirth(result.existingPatient.dateOfBirth ?? '');
    }
    if (result.mode === 'manual') setReferralSource('LAW_FIRM');
    setCallMode(result.mode); setCallElapsed(0);
    // Outgoing: pantalla de llamando primero; el resto va directo al wizard
    setStep(result.mode === 'outgoing' ? 'calling' : 'capturing');
    setPrecallInitialMode(undefined);
  };

  const handleChangePatient = () => {
    setStep('precall');
    setPrecallInitialMode('search');
    setFirstName(''); setLastName(''); setPhone(''); setEmail('');
    setExistingPatientId(null); setCallMode(null); setCallElapsed(0);
    setWizardStep(1);
  };

  const handleRetryCall = () => {
    setCallHungUp(false);
    setStep('calling');
  };

  const handleGoBack = () => {
    twilio.hangUp();
    setStep('precall');
    // Si había paciente existente → volver a búsqueda; si no → volver a outgoing
    setPrecallInitialMode(existingPatientId ? 'search' : 'outgoing');
    setCallMode(null); setCallElapsed(0); setCallHungUp(false);
  };

  const handleContinueWithoutCall = () => {
    setCallMode('search');
    setStep('capturing');
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

  // Al cambiar especialidad, limpiar selección de doctor si ya no está en la lista filtrada
  useEffect(() => {
    if (providerId && !filteredProviders.some((p) => p.id === providerId)) {
      setProviderId('');
    }
  }, [specialtyId, filteredProviders, providerId]);

  // ─── Slots ─────────────────────────────────────────────────────────────
  const [slotOptions, setSlotOptions]   = useState<Array<{ iso: string; label: string; dayLabel: string }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    if (!providerId || !clinicId || !scheduleNow) {
      setSlotOptions([]); setSlotIso(null); setSelectedDay(null); return;
    }
    const controller = new AbortController();
    setSlotsLoading(true); setSlotIso(null); setSelectedDay(null);
    const fromDate = weekStart.toISOString();
    const toDate   = addDays(weekStart, 5).toISOString();
    const params   = new URLSearchParams({ clinicId, providerId, fromDate, toDate, durationMinutes: String(duration), limit: '100' });
    fetch(`/api/appointments/available-slots?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) return;
        setSlotOptions(
          (data.slots as Array<{ startAt: string }>).map((s) => {
            const d = new Date(s.startAt);
            return {
              iso: s.startAt,
              label: d.toLocaleString(localeApp(), { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' }),
              dayLabel: d.toLocaleDateString(localeApp(), { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' }),
            };
          }),
        );
      })
      .catch(() => {})
      .finally(() => setSlotsLoading(false));
    return () => controller.abort();
  }, [providerId, clinicId, duration, scheduleNow, weekStart]);

  // Group slots by Denver-date key (YYYY-MM-DD)
  const slotsByDayIso = useMemo(() => {
    const map = new Map<string, typeof slotOptions>();
    for (const s of slotOptions) {
      const key = toDenverDate(new Date(s.iso));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [slotOptions]);

  // Week scaffold: always 5 weekday columns Mon–Fri
  const todayDenver  = useMemo(() => toDenverDate(new Date()), []); // YYYY-MM-DD, computed once on mount
  const minWeekStart = useMemo(() => getMondayOf(new Date()).getTime(), []);

  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d   = addDays(weekStart, i);
    const iso = toDenverDate(d);
    return {
      iso,
      isPast:   iso < todayDenver,
      slots:    slotsByDayIso.get(iso) ?? [],
      dayName:  d.toLocaleDateString(localeApp(), { weekday: 'short', timeZone: 'America/Denver' }),
      dayNum:   d.toLocaleDateString(localeApp(), { day: 'numeric', timeZone: 'America/Denver' }),
      monthShort: d.toLocaleDateString(localeApp(), { month: 'short', timeZone: 'America/Denver' }),
    };
  }), [weekStart, slotsByDayIso, todayDenver]);

  const selectedDaySlots = useMemo(() =>
    selectedDay ? (slotsByDayIso.get(selectedDay) ?? []) : [],
    [selectedDay, slotsByDayIso],
  );

  const isPrevWeekDisabled = weekStart.getTime() <= minWeekStart;
  const isNextWeekDisabled = weekStart.getTime() >= minWeekStart + 28 * 24 * 60 * 60 * 1000;

  // ─── Menor de edad → requiere apoderado ────────────────────────────────
  // La fecha de nacimiento es obligatoria justamente para poder decidir esto:
  // si el paciente es menor, el formulario va al apoderado y es él quien firma
  // los consentimientos.
  const patientAge     = calcAge(dateOfBirth);
  const patientIsMinor = isMinor(dateOfBirth);

  // Con apoderado vinculado los datos salen de su ficha; si no, hay que
  // cargarlos a mano y se crea como paciente nuevo (sin caso).
  //
  // Solo se exige nombre y apellido: sin eso no hay ficha que crear. Email,
  // teléfono y fecha de nacimiento quedaron OPCIONALES — ningún dato de
  // contacto bloquea (decisión de negocio 2026-07-29). Si el apoderado no deja
  // contacto, el formulario se llena en la tablet de la clínica.
  //
  // La fecha sigue sirviendo para el chequeo de mayoría de edad, pero solo si
  // la cargan: sin fecha no se puede afirmar que sea menor, así que no se bloquea.
  const guardianComplete = guardianLinked
    ? true
    : gFirstName.trim() !== '' && gLastName.trim() !== ''
      && !(gDob.trim() !== '' && isMinor(gDob));

  // ─── Step validation ───────────────────────────────────────────────────
  const canGoToStep2 =
    firstName.trim() !== ''
    && lastName.trim() !== ''
    && dateOfBirth.trim() !== ''
    && patientAge !== null
    && (!patientIsMinor || guardianComplete);
  // ─── Canales de envío realmente disponibles ─────────────────────────────
  // El estado de los toggles arranca en `true`, y los botones se deshabilitan
  // si no hay email/teléfono — pero se seguían VIENDO encendidos y ese `true`
  // viajaba al envío y al resumen. Resultado: el resumen prometía "Formulario
  // enviado por email y SMS", send-portal-link respondía 400 NO_EMAIL/NO_PHONE,
  // nadie leía esa respuesta, y recepción quedaba creyendo que el paciente
  // recibió el link. Peor que un bloqueo, porque era invisible.
  //
  // Ahora todo el paso 4 usa estos flags derivados: un canal está activo solo
  // si QUIEN VA A RECIBIR EL LINK tiene con qué recibirlo.
  //
  // Para un menor ese destinatario es el apoderado, no el menor: así lo resuelve
  // send-portal-link. Mirando los datos del menor la UI se equivocaba en las dos
  // direcciones — apagaba el email cuando el menor no tenía correo aunque el
  // apoderado sí (envío legítimo bloqueado), y lo dejaba encendido cuando el
  // menor tenía correo y el apoderado no (400 NO_EMAIL que nadie leía).
  const contactEmail = patientIsMinor ? (guardianLinked?.email ?? gEmail) : email;
  const contactPhone = patientIsMinor ? (guardianLinked?.phone ?? gPhone) : phone;
  const canEmail = !!contactEmail.trim();
  const canSms   = !!contactPhone.trim();
  const emailOn  = formDelivery.email && canEmail && !formDelivery.tablet;
  const smsOn    = formDelivery.sms   && canSms   && !formDelivery.tablet;
  const noChannel = !emailOn && !smsOn && !formDelivery.tablet;

  const accidentDateIsValid = !accidentDate || accidentDate <= todayDenver;
  const canGoToStep3 = canGoToStep2 && (caseType !== 'MVA' || lawyerStatus !== 'HAS' || !!lawFirm) && accidentDateIsValid;
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
            // Vacío se manda vacío. Antes caía a '0000000000' como placeholder,
            // y eso rompía el formulario del paciente: forms valida NANP y un
            // área code que empieza en 0 es inválido, así que el paciente
            // quedaba trabado en el step 2 sin poder avanzar ni entender por
            // qué. Un teléfono en blanco pasa la validación sin problema.
            phone: phone.trim(),
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
            lawFirmId:    lawyerStatus === 'HAS' ? (lawFirm?.id ?? null)  : null,
            attorneyId:   lawyerStatus === 'HAS' ? (attorney?.id ?? null) : null,
            chiropractor: chiropractor.trim() || null,
          },
          insurance: {
            primaryInsuranceId: insurance?.id ?? null,
            primaryPolicyNumber: policyNumber.trim() || null,
          },
          existingPatientId: existingPatientId ?? null,
          // Solo se manda si el paciente es menor. `patientId` presente = linkear
          // a un paciente existente; ausente = crear uno nuevo con estos datos.
          guardian: patientIsMinor ? {
            patientId: guardianLinked?.id ?? null,
            firstName: guardianLinked?.firstName ?? gFirstName.trim(),
            lastName:  guardianLinked?.lastName  ?? gLastName.trim(),
            email:     guardianLinked?.email     ?? gEmail.trim(),
            phone:     guardianLinked?.phone     ?? gPhone.trim(),
            dateOfBirth: (guardianLinked?.dateOfBirth ?? gDob) || null,
            relation:  gRelation,
          } : null,
          specialtyId: specialtyId || null,
          caseType,
          source: (['PHONE_CALL','WALK_IN','LAW_FIRM_REFERRAL','PATIENT_REFERRAL','WEB_FORM','AI_AGENT'] as const).includes(referralSource as never)
            ? referralSource
            : referralSource === 'LAW_FIRM' ? 'LAW_FIRM_REFERRAL' : 'OTHER',
          appointment: scheduleNow && slotIso ? {
            clinicId,
            providerId,
            scheduledFor: slotIso,
            durationMinutes: duration,
            type: caseType === 'MVA' ? 'AUTO_ACCIDENT' : 'FAMILY_PRACTICE',
            // El alta ya no pide notas de la cita — se escriben una sola vez en
            // las notas del caso. `Appointment.notes` se completa después desde
            // el panel de detalle de la cita, si hace falta.
            notes: null,
          } : null,
          formDelivery: action === 'finalize'
            ? { sendEmail: emailOn, sendSms: smsOn }
            : null,
          callDurationSeconds: callElapsed,
          twilioCallSid: twilio.callSid ?? null,
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

      // Generate portal token + QR.
      // If the user selected email or SMS channels, use send-portal-link (which
      // also saves the token and triggers the real send in Phase 2). Otherwise
      // just generate-portal-token for display only.
      let portalUrl: string | null = null;
      let qrDataUrl: string | null = null;
      try {
        const channels: Array<'EMAIL' | 'SMS'> = [
          ...(emailOn ? ['EMAIL' as const] : []),
          ...(smsOn   ? ['SMS'   as const] : []),
        ];

        if (channels.length > 0) {
          // Send via each selected channel. Use first response for the portal URL.
          const results = await Promise.all(
            channels.map((via) =>
              fetch(`/api/admin/cases/${caseId}/send-portal-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ via, language }),
              }).then((r) => r.json()),
            ),
          );
          portalUrl = results[0]?.sent?.portalUrl ?? null;
        } else {
          // Tablet or no delivery — just generate the token for display.
          const tokenRes = await fetch(`/api/admin/cases/${caseId}/generate-portal-token`, { method: 'POST' });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            portalUrl = tokenData.portalUrl ?? null;
          }
        }

        if (portalUrl) {
          qrDataUrl = await QRCode.toDataURL(portalUrl, {
            width: 200, margin: 1,
            color: { dark: '#e2e8f0', light: '#12141f' },
          });
        }
      } catch (e) { console.error('[NewCase] token error:', e); }

      console.log('[NewCase] setSuccess →', { caseCode: data.case.caseCode, portalUrl, hasQr: !!qrDataUrl });
      setSuccess({ caseCode: data.case.caseCode, caseId, appointmentScheduled: !!data.appointment, portalUrl, qrDataUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating case');
    } finally {
      setSaving(false);
    }
  };

  const isManual = callMode === 'manual';
  const isSearch = callMode === 'search';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Patient';

  // Derived values for success panel
  const successSlot     = success ? slotOptions.find((s) => s.iso === slotIso) : null;
  const successProvider = success ? providers.find((p) => p.id === providerId) : null;
  const successClinic   = success ? clinics.find((c) => c.id === clinicId) : null;

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
  // RENDER · Llamando (ringing animation)
  // ══════════════════════════════════════════════════════════════════════
  if (step === 'calling') {
    const initials = [firstName, lastName].filter(Boolean).map((n) => n[0]).join('').toUpperCase() || '?';
    return (
      <Dialog open={open} onOpenChange={() => { twilio.hangUp(); onOpenChange(false); }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogTitle className="sr-only">Llamando</DialogTitle>
          <div className="flex flex-col items-center px-6 py-8 gap-5">
            {/* Avatar con anillos animados */}
            <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
              <span className="absolute w-32 h-32 rounded-full border-2 border-amber/30 animate-ping" style={{ animationDuration: '2s', animationDelay: '0s' }} />
              <span className="absolute w-24 h-24 rounded-full border-2 border-amber/40 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
              <span className="absolute w-16 h-16 rounded-full border-2 border-amber/50 animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }} />
              <div className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-br from-amber-600 to-amber flex items-center justify-center text-white font-bold text-xl shadow-[0_8px_24px_rgba(245,158,11,.4)]">
                {initials}
              </div>
            </div>

            <div className="text-center space-y-1">
              <div className="text-text-1 font-bold text-lg">{[firstName, lastName].filter(Boolean).join(' ') || phone}</div>
              <div className="text-text-muted font-mono text-sm">{phone}</div>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
                <span className="text-amber text-[11px] font-semibold uppercase tracking-widest">
                  {twilio.callStatus === 'in-call' ? 'Timbrado…' : 'Llamando…'}
                </span>
              </div>
            </div>

            {/* Contestó → abre el wizard */}
            {twilio.callStatus === 'in-call' && (
              <button
                type="button"
                onClick={() => { twilio.stopRingback(); setStep('capturing'); }}
                className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 bg-emerald/15 border border-emerald/30 text-emerald hover:bg-emerald/25 transition-colors text-sm font-semibold"
              >
                <PhoneCall className="w-4 h-4 flex-shrink-0" />
                Contestó — abrir formulario
              </button>
            )}

            {/* Cancelar */}
            <button
              type="button"
              onClick={() => { twilio.hangUp(); setStep('noanswer'); }}
              className="flex items-center gap-2 rounded-full px-5 py-3 bg-rose/15 border border-rose/30 text-rose hover:bg-rose/25 transition-colors shadow-[0_4px_16px_rgba(244,63,94,.2)] text-sm font-semibold"
            >
              <PhoneOff className="w-4 h-4 flex-shrink-0" />
              <span>Cancelar llamada</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER · No contestó
  // ══════════════════════════════════════════════════════════════════════
  if (step === 'noanswer') {
    const initials = [firstName, lastName].filter(Boolean).map((n) => n[0]).join('').toUpperCase() || '?';
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogTitle className="sr-only">Sin respuesta</DialogTitle>
          <div className="flex flex-col items-center px-6 py-8 gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-700 to-rose flex items-center justify-center text-white font-bold text-xl shadow-[0_8px_24px_rgba(244,63,94,.35)]">
              {initials}
            </div>

            <div className="text-center space-y-1">
              <div className="text-text-1 font-bold text-lg">{[firstName, lastName].filter(Boolean).join(' ') || phone}</div>
              <div className="text-text-muted font-mono text-sm">{phone}</div>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <X className="w-3.5 h-3.5 text-rose" />
                <span className="text-rose text-[11px] font-semibold uppercase tracking-widest">{t('noAnswerTitle')}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col w-full gap-2 mt-2">
              <button
                type="button"
                onClick={handleRetryCall}
                className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 bg-brand text-white font-semibold text-sm hover:bg-brand/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {t('noAnswerRetry')}
              </button>

              <button
                type="button"
                onClick={handleContinueWithoutCall}
                className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 border border-border bg-bg-2 text-text-1 font-semibold text-sm hover:bg-white/5 transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                {t('noAnswerContinue')}
              </button>

              <button
                type="button"
                onClick={handleGoBack}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-text-muted text-sm hover:text-text-1 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('noAnswerBack')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
    { n: 1 as WizardStep, label: 'Patient',     labelShort: '1', icon: User },
    { n: 2 as WizardStep, label: 'Case',        labelShort: '2', icon: Car },
    { n: 3 as WizardStep, label: 'Appointment', labelShort: '3', icon: CalendarCheck },
    { n: 4 as WizardStep, label: 'Form',        labelShort: '4', icon: Send },
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
            <div className="flex items-start justify-between gap-2 flex-wrap pr-8">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-text-1 text-sm sm:text-base">
                  {isManual || isSearch
                    ? <ClipboardList className="w-4 h-4 text-brand-text shrink-0" />
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
                  ? <TagPill label={t('badgeSearch')} colorClass="bg-brand/15 text-brand-text border-brand/30" mono />
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
                className="shrink-0 flex items-center gap-1 text-[11px] text-text-muted hover:text-brand-text transition-colors border border-border/60 hover:border-brand/40 rounded-md px-2 py-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span className="hidden sm:inline">{t('changePatient')}</span>
              </button>
            )}
          </div>

          {/* Barra de llamada activa — solo modo outgoing con Twilio */}
          {callMode === 'outgoing' && !callHungUp && (
            twilio.callStatus === 'connecting' || twilio.callStatus === 'in-call'
          ) && (
            <div className="mt-3">
              <ActiveCallBar
                status={twilio.callStatus as 'connecting' | 'in-call'}
                patientName={[firstName, lastName].filter(Boolean).join(' ') || phone}
                phone={phone}
                elapsed={callElapsed}
                muted={twilio.muted}
                onMuteToggle={twilio.toggleMute}
                onHangUp={() => { twilio.hangUp(); setCallHungUp(true); }}
              />
            </div>
          )}

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
                        ? 'bg-brand/15 text-brand-text border border-brand/30'
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

            {/* Back to mode selection — only on step 1, manual/search */}
            {wizardStep === 1 && (isManual || isSearch) && (
              <button
                type="button"
                onClick={() => setStep('precall')}
                className="ml-auto flex items-center gap-1 text-[10px] text-text-muted hover:text-text-2 transition-colors shrink-0"
              >
                <ArrowLeft className="w-3 h-3" />
                Cambiar opción
              </button>
            )}
          </div>
        </div>

        {/* ─── Body scrollable ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4 scroll-thin">

          {/* ══ ÉXITO — reemplaza todo el body cuando success está seteado ═ */}
          {success ? (
            <div className="space-y-4">
              {/* Confirmación */}
              <div className="rounded-lg border border-emerald/30 bg-emerald/10 p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald/20 border border-emerald/30 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-emerald" />
                </div>
                <div className="min-w-0">
                  <div className="text-text-1 font-semibold text-sm">
                    {t('successCaseCode', { caseCode: success.caseCode })}
                  </div>
                  <div className="text-text-muted text-[11px] mt-1 space-y-0.5">
                    {success.appointmentScheduled && successSlot && (
                      <div className="flex items-center gap-1.5">
                        <Check className="w-2.5 h-2.5 text-emerald shrink-0" />
                        <span>{t('successApptLabel')} <strong className="text-text-2">{successSlot.dayLabel} · {successSlot.label}</strong>
                          {successProvider && <> · Dr. {successProvider.firstName} {successProvider.lastName}</>}
                          {successClinic && <> · {successClinic.name}</>}
                        </span>
                      </div>
                    )}
                    {caseType === 'MVA' && lawFirm && (
                      <div className="flex items-center gap-1.5">
                        <Check className="w-2.5 h-2.5 text-emerald shrink-0" />
                        <span>{t('successLawFirmLabel')} <strong className="text-text-2">{lawFirm.label}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* QR + Link */}
              {success.portalUrl ? (
                <div className="rounded-lg border border-border bg-bg-1 p-4">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">
                    {t('successFormsLinkTitle')}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    {success.qrDataUrl && (
                      <div className="shrink-0 rounded-lg overflow-hidden border border-border mx-auto sm:mx-0">
                        <img src={success.qrDataUrl} alt="QR forms" className="w-[160px] h-[160px] block" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="rounded-md bg-bg-2/40 border border-border/40 px-3 py-2">
                        <div className="text-[10px] text-text-muted mb-1">{t('successFormsUrlLabel')}</div>
                        <div className="text-xs text-text-2 font-mono truncate">{success.portalUrl}</div>
                      </div>
                      <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={copyLink}>
                        {copied ? <><Check className="w-3.5 h-3.5 text-emerald" /> {t('successCopied')}</> : <><Copy className="w-3.5 h-3.5" /> {t('successCopyLink')}</>}
                      </Button>
                      {success.qrDataUrl && (
                        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={downloadQr}>
                          <Download className="w-3.5 h-3.5" /> {t('successDownloadQr')}
                        </Button>
                      )}
                      <a
                        href={phone.trim()
                          ? `https://wa.me/${phone.trim().replace(/\D/g, '')}?text=${encodeURIComponent(t('successWhatsAppMessage', { name: firstName, url: success.portalUrl }))}`
                          : `https://wa.me/?text=${encodeURIComponent(t('successWhatsAppMessage', { name: firstName, url: success.portalUrl }))}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 transition-colors"
                      >
                        <span className="text-base leading-none">💬</span> {t('successSendWhatsApp')}
                      </a>
                      <div className="text-[10px] text-text-muted italic pt-1">
                        {t('successLinkExpires')}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Note tone="amber">{t('successNoFormsLink')}</Note>
              )}
            </div>
          ) : (<>

          {/* ══ STEP 1 — PACIENTE ════════════════════════════════════════ */}
          {wizardStep === 1 && (
            <InfoCard title={t('sectionPatient')} icon={User} number={1}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField.Input label={t('firstName')} required value={firstName} onChange={setFirstName} autoFocus />
                <FormField.Input label={t('lastName')}  required value={lastName}  onChange={setLastName} />
                <FormField.Phone label={t('phone')}     value={phone}    onChange={(v) => setPhone(v)} />
                <FormField.Input label={t('email')}     value={email}    onChange={setEmail} type="email" />
                <div className="space-y-1">
                  <FormField.Input label={t('dob')} required value={dateOfBirth} onChange={setDateOfBirth} type="date" />
                  {patientAge !== null && (
                    <p className={`text-[11px] ${patientIsMinor ? 'text-amber font-semibold' : 'text-text-muted'}`}>
                      {patientIsMinor ? t('ageMinor', { age: patientAge }) : t('ageYears', { age: patientAge })}
                    </p>
                  )}
                </div>
                <FormField.Select label={t('language')} value={language} onChange={(v) => setLanguage(v as 'es' | 'en')}
                  options={[{ value: 'es', label: t('langEs') }, { value: 'en', label: t('langEn') }]} />
              </div>
              <FormField.Select label={t('referralSource')} value={referralSource} onChange={(v) => setReferralSource(v as ReferralSource)}
                options={[
                  { value: 'LAW_FIRM',          label: tp('referral.LAW_FIRM') },
                  { value: 'PATIENT_REFERRAL',  label: tp('referral.PATIENT_REFERRAL') },
                  { value: 'CHIROPRACTOR',       label: tp('referral.CHIROPRACTOR') },
                  { value: 'REFERRAL',           label: tp('referral.REFERRAL') },
                  { value: 'PHONE_CALL',         label: tp('referral.PHONE_CALL') },
                  { value: 'WALK_IN',            label: tp('referral.WALK_IN') },
                  { value: 'ACCIDENT_CENTER',    label: tp('referral.ACCIDENT_CENTER') },
                  { value: 'WEB_SEARCH',         label: tp('referral.WEB_SEARCH') },
                  { value: 'GOOGLE',             label: tp('referral.GOOGLE') },
                  { value: 'GOOGLE_MAPS',        label: tp('referral.GOOGLE_MAPS') },
                  { value: 'FACEBOOK',           label: tp('referral.FACEBOOK') },
                  { value: 'INSTAGRAM',          label: tp('referral.INSTAGRAM') },
                  { value: 'TIKTOK',             label: tp('referral.TIKTOK') },
                  { value: 'WEBSITE',            label: tp('referral.WEBSITE') },
                  { value: 'CLINIC_STAFF',       label: tp('referral.CLINIC_STAFF') },
                  { value: 'INSURANCE',          label: tp('referral.INSURANCE') },
                  { value: 'MEDICAL_INSURANCE',  label: tp('referral.MEDICAL_INSURANCE') },
                  { value: 'FAMILY',             label: tp('referral.FAMILY') },
                  { value: 'OTHER',              label: tp('referral.OTHER') },
                ]}
                hint={t('patientHint')}
              />
              {!canGoToStep2 && (
                <Note tone="amber">{t('requiredToContinue')}</Note>
              )}
            </InfoCard>
          )}

          {/* ══ STEP 1b — PADRE / APODERADO (solo si el paciente es menor) ══ */}
          {wizardStep === 1 && patientIsMinor && (
            <div className="mt-3">
              <InfoCard
                title={t('guardianSection')}
                icon={Users}
                number={2}
                tone={guardianLinked ? 'emerald' : 'amber'}
              >
                {!guardianLinked && (
                  <Note tone="amber">{t('guardianWhy')}</Note>
                )}

                {guardianLinked ? (
                  <>
                    {/* Vinculado a un paciente existente — sus datos salen de su
                        ficha, así que se muestran en lectura para no editarla
                        sin querer desde acá. */}
                    <div className="flex items-center gap-3 flex-wrap rounded-md border border-emerald/30 bg-emerald/[0.06] px-3 py-2.5">
                      <LinkIcon className="w-4 h-4 text-emerald shrink-0" />
                      <span className="text-[12.5px] text-text-2 flex-1 min-w-[180px]">
                        {t('guardianLinkedTo')}{' '}
                        <strong className="text-emerald">{guardianLinked.label}</strong>
                        {guardianLinked.patientCode && (
                          <span className="ml-1 font-mono text-[11px] text-emerald">· {guardianLinked.patientCode}</span>
                        )}
                      </span>
                      <button type="button" onClick={() => setGuardianLinked(null)}
                        className="shrink-0 text-[11.5px] text-text-muted hover:text-rose border border-border-strong rounded-md px-2.5 py-1 transition-colors">
                        {t('guardianUnlink')}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField.Input label={t('guardianFirstName')} value={guardianLinked.firstName ?? ''} onChange={() => {}} disabled />
                      <FormField.Input label={t('guardianLastName')}  value={guardianLinked.lastName ?? ''}  onChange={() => {}} disabled />
                      <FormField.Input label={t('email')}             value={guardianLinked.email ?? ''}     onChange={() => {}} disabled />
                      <FormField.Input label={t('phone')}             value={guardianLinked.phone ?? ''}     onChange={() => {}} disabled />
                      <FormField.Input label={t('dob')}               value={guardianLinked.dateOfBirth ?? ''} onChange={() => {}} type="date" disabled />
                      {/* La relación sí es editable: es un dato DE ESTA relación,
                          no de la ficha del apoderado. */}
                      <FormField.Select label={t('guardianRelation')} required value={gRelation} onChange={setGRelation}
                        options={GUARDIAN_RELATION_OPTIONS.map(o => ({ value: o, label: t(`guardianRelationOpt.${o}`) }))} />
                    </div>

                    <Note tone="emerald">
                      {t('guardianNoDuplicate', { email: guardianLinked.email || '—' })}
                    </Note>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label>{t('guardianSearchLabel')}</Label>
                      <Autocomplete
                        endpoint="/api/admin/patients/autocomplete"
                        {...(existingPatientId ? { extraParams: { excludeId: existingPatientId } } : {})}
                        placeholder={t('guardianSearchPlaceholder')}
                        selected={null}
                        showAge
                        blockMinors
                        emptyHint={t('guardianSearchEmpty')}
                        onSelect={(r) => {
                          if (!r) return;
                          setGuardianLinked(r);
                          // Espejar en los campos sueltos por si después se desvincula
                          setGFirstName(r.firstName ?? '');
                          setGLastName(r.lastName ?? '');
                          setGEmail(r.email ?? '');
                          setGPhone(r.phone ?? '');
                          setGDob(r.dateOfBirth ?? '');
                        }}
                      />
                      <p className="text-[11px] text-text-muted italic">{t('guardianSearchHint')}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField.Input label={t('guardianFirstName')} required value={gFirstName} onChange={setGFirstName} />
                      <FormField.Input label={t('guardianLastName')}  required value={gLastName}  onChange={setGLastName} />
                      {/* Sin `required`: ningún dato de contacto bloquea */}
                      <FormField.Input label={t('email')} value={gEmail} onChange={setGEmail} type="email" />
                      <FormField.Phone label={t('phone')} value={gPhone} onChange={(v) => setGPhone(v)} />
                      <div className="space-y-1">
                        <FormField.Input label={t('dob')} value={gDob} onChange={setGDob} type="date" />
                        {(() => {
                          const gAge = calcAge(gDob);
                          if (gAge === null) return null;
                          const gMinor = gAge < 18;
                          return (
                            <p className={`text-[11px] ${gMinor ? 'text-rose font-semibold' : 'text-text-muted'}`}>
                              {gMinor ? t('guardianMustBeAdult', { age: gAge }) : t('ageYears', { age: gAge })}
                            </p>
                          );
                        })()}
                      </div>
                      <FormField.Select label={t('guardianRelation')} required value={gRelation} onChange={setGRelation}
                        options={GUARDIAN_RELATION_OPTIONS.map(o => ({ value: o, label: t(`guardianRelationOpt.${o}`) }))} />
                    </div>

                    <Note tone="cyan">{t('guardianWillBeCreated')}</Note>
                  </>
                )}
              </InfoCard>
            </div>
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
                  {/*
                    El hint no describe el campo: es la lista de preguntas que
                    recepción tiene que hacerle al paciente mientras agenda la
                    cita. Antes decía "¿Cuándo ocurrió el accidente? ¿Cómo
                    sucedió?" — el "cuándo" ya lo pide el campo de arriba, así
                    que la mitad del texto no servía de nada.
                    Van apiladas y no en una línea porque a 10px cuatro
                    preguntas seguidas no se leen; así se recorren como lista
                    mientras se está al teléfono.
                  */}
                  <FormField.Textarea label={t('accidentNotes')} value={accidentNotes} onChange={setAccidentNotes}
                    placeholder={t('accidentNotesPlaceholder')}
                    hint={
                      <>
                        <div className="font-semibold">{t('accidentQuestionsTitle')}</div>
                        {/*
                          Objeto y no array: next-intl tipa los mensajes como
                          `AbstractIntlMessages`, que solo admite strings u
                          objetos anidados — un array no compila. Las claves
                          (how/er/imaging/provider) dan además un lugar estable
                          donde agregar o sacar una pregunta sin renumerar.
                        */}
                        <ul className="mt-0.5 space-y-0.5">
                          {Object.values(t.raw('accidentQuestions') as Record<string, string>).map(q => (
                            <li key={q}>· {q}</li>
                          ))}
                        </ul>
                      </>
                    } />
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
                          selected={lawFirm} onSelect={(r) => { setLawFirm(r); setAttorney(null); }}
                          renderAvatar={(r) => (
                            <div className="w-7 h-7 rounded flex items-center justify-center text-brand-fg text-[10px] font-bold shrink-0 bg-brand/20 border border-brand/30">
                              {r.label.slice(0, 2).toUpperCase()}
                            </div>
                          )} />
                      </div>
                      {lawFirm && (
                        <div>
                          <Label>{t('attorneyLabel')} <span className="text-text-muted text-[10px] ml-1 font-normal">{t('attorneyOptional')}</span></Label>
                          <Autocomplete endpoint="/api/admin/lawyers/autocomplete" extraParams={{ firmId: lawFirm.id }}
                            placeholder={t('attorneyPlaceholder')} selected={attorney} onSelect={setAttorney}
                            renderAvatar={(r) => (
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-cyan/20 border border-cyan/30 text-cyan">
                                {r.label.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()}
                              </div>
                            )} />
                        </div>
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
                    <FormField.Input label={t('policyNumber')} value={policyNumber}
                      onChange={(v) => setPolicyNumber(v.replace(/[^A-Za-z0-9\-]/g, '').toUpperCase())}
                      placeholder="PIP-2026-0142" hint={t('policyHint')} maxLength={40} />
                  )}
                </InfoCard>
              )}

              {!canGoToStep3 && caseType === 'MVA' && lawyerStatus === 'HAS' && !lawFirm && (
                <Note tone="amber">Select the law firm to continue.</Note>
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
                      options={[{ value: '', label: 'No specialty' }, ...specialties.map((s) => ({ value: s.id, label: s.name }))]} />
                  </div>

                  {/* Doctor */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label>Doctor</Label>
                      {hasFilteredProviders && filteredProviders.length < providers.length && (
                        <button type="button" onClick={() => setShowAllProviders((v) => !v)}
                          className="text-[10px] text-text-muted hover:text-brand-text">
                          {showAllProviders ? `Solo especialidad (${filteredProviders.length})` : `Ver todos (${providers.length})`}
                        </button>
                      )}
                      {!hasFilteredProviders && providers.length > 0 && (
                        <button type="button" onClick={() => setShowAllProviders((v) => !v)}
                          className="text-[10px] text-brand-text hover:underline">
                          {showAllProviders ? 'Ver solo especialidad' : 'Ver todos los doctores'}
                        </button>
                      )}
                    </div>
                    <DoctorCombobox
                      providers={filteredProviders}
                      allProviders={providers}
                      value={providerId}
                      onChange={setProviderId}
                    />
                  </div>

                  {/* Duración */}
                  <FormField.Select label={t('duration')} value={String(duration)} onChange={(v) => setDuration(parseInt(v, 10))}
                    options={[15, 30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: t('durationMin', { m }) }))} />

                  {/* Selector semanal de horarios */}
                  <div>
                    <Label className="mb-2 block">
                      {t('slotsLabel')}
                      {slotsLoading && (
                        <span className="ml-2 text-[10px] text-text-muted font-normal animate-pulse">{t('slotsLoading')}</span>
                      )}
                    </Label>

                    {!providerId || !clinicId ? (
                      <p className="text-[11px] text-text-muted italic">{t('slotsSelectFirst')}</p>
                    ) : (
                      <>
                        {/* ── Navegación de semana ── */}
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <button
                            type="button"
                            disabled={isPrevWeekDisabled}
                            onClick={() => { setWeekStart(addDays(weekStart, -7)); setSelectedDay(null); }}
                            className="px-2 py-1 rounded-md border border-border text-[11px] text-text-muted hover:text-text-1 hover:border-border-strong disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                          >
                            <ArrowLeft className="w-3 h-3" />
                            <span className="hidden sm:inline">{tcal('prevWeek')}</span>
                          </button>
                          <span className="text-[11px] text-text-muted font-medium text-center">
                            {weekDays[0]
                              ? `${weekDays[0].dayNum} ${weekDays[0].monthShort} – ${weekDays[4].dayNum} ${weekDays[4].monthShort}`
                              : ''}
                          </span>
                          <button
                            type="button"
                            disabled={isNextWeekDisabled}
                            onClick={() => { setWeekStart(addDays(weekStart, 7)); setSelectedDay(null); }}
                            className="px-2 py-1 rounded-md border border-border text-[11px] text-text-muted hover:text-text-1 hover:border-border-strong disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                          >
                            <span className="hidden sm:inline">{tcal('nextWeek')}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>

                        {/* ── 5 columnas día ── */}
                        <div className="grid grid-cols-5 gap-1 sm:gap-1.5 mb-3">
                          {weekDays.map((wd) => {
                            const isSelected = selectedDay === wd.iso;
                            const hasSlots   = wd.slots.length > 0;
                            return (
                              <button
                                key={wd.iso}
                                type="button"
                                disabled={slotsLoading || (!hasSlots && !wd.isPast)}
                                onClick={() => !wd.isPast && hasSlots && setSelectedDay(isSelected ? null : wd.iso)}
                                className={`flex flex-col items-center py-1.5 sm:py-2 px-0.5 sm:px-1 rounded-lg border text-[10px] font-medium transition-colors ${
                                  isSelected
                                    ? 'bg-emerald/15 border-emerald/50 text-emerald'
                                    : wd.isPast
                                    ? 'bg-bg-2/30 border-border/40 text-text-muted opacity-50 cursor-not-allowed'
                                    : hasSlots
                                    ? 'bg-bg-2 border-border text-text-2 hover:border-emerald/40 hover:bg-emerald/5 cursor-pointer'
                                    : 'bg-bg-2/30 border-border/40 text-text-muted cursor-not-allowed'
                                }`}
                              >
                                <span className="uppercase tracking-wide font-semibold text-[9px] sm:text-[10px]">{wd.dayName}</span>
                                <span className="text-xs sm:text-sm font-bold mt-0.5">{wd.dayNum}</span>
                                {slotsLoading ? (
                                  <div className="mt-1 w-4 sm:w-6 h-2 rounded bg-border animate-pulse" />
                                ) : hasSlots ? (
                                  <span className={`mt-1 text-[8px] sm:text-[9px] ${isSelected ? 'text-emerald' : 'text-text-muted'}`}>
                                    {wd.slots.length} hr{wd.slots.length !== 1 ? 's' : ''}
                                  </span>
                                ) : (
                                  <span className="mt-1 text-[8px] sm:text-[9px] text-text-muted">—</span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* ── Slots del día seleccionado ── */}
                        {selectedDay && selectedDaySlots.length > 0 && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">
                              {weekDays.find((d) => d.iso === selectedDay)?.dayName ?? ''} {weekDays.find((d) => d.iso === selectedDay)?.dayNum} · selecciona hora
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedDaySlots.map((s) => (
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
                        )}

                        {!selectedDay && !slotsLoading && (
                          <p className="text-[11px] text-text-muted italic">
                            Select a day to see available time slots.
                          </p>
                        )}
                      </>
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

                  {/*
                    Acá había una segunda caja "Notes for the doctor". Se quitó
                    por pedido de Erick: al dar de alta el caso ya se escriben
                    las notas del accidente un paso antes, y llenar dos cajas de
                    texto en el mismo alta es trabajo duplicado.

                    El campo `Appointment.notes` NO desapareció: se sigue viendo
                    y editando desde el panel de detalle de la cita
                    (`appointment-detail-panel.tsx`, sección 📝 con su botón de
                    editar), que es el mismo panel que usan el calendario, la
                    consulta del doctor y Day Admission. O sea que se saca del
                    formulario de alta, no del sistema.
                  */}
                  {scheduleNow && !slotIso && (
                    <Note tone="amber">{t('selectSlotToContinue')}</Note>
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
                <p className="text-text-2 text-xs mb-3">Elige cómo el paciente recibe el enlace al formulario. Puedes activar uno o ambos canales.</p>

                {/* Remote channels */}
                <div className={`space-y-2 ${formDelivery.tablet ? 'opacity-40 pointer-events-none' : ''}`}>
                  {/* Email toggle */}
                  <button
                    type="button"
                    disabled={!canEmail}
                    onClick={() => setFormDelivery((d) => ({ ...d, email: !d.email, tablet: false }))}
                    className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                      emailOn
                        ? 'border-emerald/50 bg-emerald/10'
                        : 'border-border bg-bg-2/40 hover:border-border-strong'
                    } ${!canEmail ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      emailOn ? 'bg-emerald/20' : 'bg-bg-2'
                    }`}>
                      <Mail className={`w-4 h-4 ${emailOn ? 'text-emerald' : 'text-text-muted'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${emailOn ? 'text-emerald' : 'text-text-1'}`}>
                        Email
                      </div>
                      {/* Se muestra el correo del DESTINATARIO real: en un menor
                          el link va al apoderado, y ver el correo del menor acá
                          hacía creer que llegaba a otro lado. */}
                      <div className="text-[11px] text-text-muted truncate">
                        {contactEmail.trim() ? contactEmail.trim() : 'Sin email registrado'}
                        {patientIsMinor && contactEmail.trim() && (
                          <span className="text-amber"> · {t('deliveryToGuardian')}</span>
                        )}
                      </div>
                    </div>
                    {/* Toggle pill */}
                    <div className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      emailOn ? 'bg-emerald' : 'bg-bg-0 border border-border'
                    }`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        emailOn ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </div>
                  </button>

                  {/* SMS toggle */}
                  <button
                    type="button"
                    disabled={!canSms}
                    onClick={() => setFormDelivery((d) => ({ ...d, sms: !d.sms, tablet: false }))}
                    className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                      smsOn
                        ? 'border-cyan/50 bg-cyan/10'
                        : 'border-border bg-bg-2/40 hover:border-border-strong'
                    } ${!canSms ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      smsOn ? 'bg-cyan/20' : 'bg-bg-2'
                    }`}>
                      <MessageSquare className={`w-4 h-4 ${smsOn ? 'text-cyan' : 'text-text-muted'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${smsOn ? 'text-cyan' : 'text-text-1'}`}>
                        SMS
                      </div>
                      <div className="text-[11px] text-text-muted truncate">
                        {contactPhone.trim() ? contactPhone.trim() : 'Sin teléfono registrado'}
                        {patientIsMinor && contactPhone.trim() && (
                          <span className="text-amber"> · {t('deliveryToGuardian')}</span>
                        )}
                      </div>
                    </div>
                    <div className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      smsOn ? 'bg-cyan' : 'bg-bg-0 border border-border'
                    }`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        smsOn ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </div>
                  </button>
                </div>

                {/* Divider */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/40" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-bg-1 px-2 text-[10px] uppercase tracking-wider text-text-muted">o bien</span>
                  </div>
                </div>

                {/* Tablet option */}
                <button
                  type="button"
                  onClick={() => setFormDelivery((d) => ({ email: false, sms: false, tablet: !d.tablet }))}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                    formDelivery.tablet
                      ? 'border-amber/50 bg-amber/10'
                      : 'border-border bg-bg-2/40 hover:border-border-strong'
                  }`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    formDelivery.tablet ? 'bg-amber/20' : 'bg-bg-2'
                  }`}>
                    <Tablet className={`w-4 h-4 ${formDelivery.tablet ? 'text-amber' : 'text-text-muted'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${formDelivery.tablet ? 'text-amber' : 'text-text-1'}`}>
                      Tablet en clínica
                    </div>
                    <div className="text-[11px] text-text-muted">El paciente llena el formulario al llegar</div>
                  </div>
                  <div className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    formDelivery.tablet ? 'bg-amber' : 'bg-bg-0 border border-border'
                  }`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      formDelivery.tablet ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </div>
                </button>

                {/* Sin canal utilizable. Es un AVISO, no un bloqueo: el caso se
                    guarda igual y el formulario se llena en la tablet. */}
                {noChannel && (
                  <div className="mt-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      {!canEmail && !canSms
                        ? (patientIsMinor ? t('deliveryNoContactGuardian') : t('deliveryNoContact'))
                        : t('deliveryNoChannel')}
                    </span>
                  </div>
                )}
              </InfoCard>


              {/* Resumen final */}
              <InfoCard title={isManual || isSearch ? t('summaryTitle') : t('summaryTitleCall')} icon={Check} tone="cyan">
                <ul className="space-y-1.5 text-xs text-text-2 list-none m-0 p-0">
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                    <span>Patient: <strong className="text-text-1">{firstName} {lastName}</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                    <span>Case type: <strong className="text-text-1">{caseType}</strong>
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
                  {(emailOn || smsOn) && (
                    <li className="flex items-start gap-2">
                      <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                      <span>
                        {t('summaryFormSentBy', {
                          channels: emailOn && smsOn ? t('channelEmailAndSms') : emailOn ? t('channelEmail') : t('channelSms'),
                        })}
                      </span>
                    </li>
                  )}
                  {/* Sin canal: se dice explícitamente que NO se envía, en vez de
                      omitir la línea y dejar la duda */}
                  {noChannel && (
                    <li className="flex items-start gap-2">
                      <AlertCircle className="w-3 h-3 text-amber mt-0.5 shrink-0" />
                      <span className="text-amber">{t('summaryFormNotSent')}</span>
                    </li>
                  )}
                  {formDelivery.tablet && (
                    <li className="flex items-start gap-2">
                      <Check className="w-3 h-3 text-amber mt-0.5 shrink-0" />
                      <span>Formulario en tablet al llegar a la clínica</span>
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
                    <span>
                      {isManual || isSearch
                        ? 'Full summary recorded in case history'
                        : t('summaryAudit', { elapsed: formatElapsed(callElapsed) })}
                    </span>
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
                  <p className="font-medium">Would you like to create the case for the existing patient instead of registering a new one?</p>
                  <Button size="sm" variant="outline" className="self-start border-amber/50 text-amber hover:bg-amber/10"
                    onClick={() => { setExistingPatientId(duplicateId); setDuplicateId(null); setError(null); }}>
                    Use existing patient
                  </Button>
                </div>
              )}
            </>
          )}

          </>)}

        </div>

        {/* ─── Footer ──────────────────────────────────────────────────── */}
        <DialogFooter className="border-t border-border px-4 sm:px-6 py-3 shrink-0 gap-2 flex-col-reverse sm:flex-row items-stretch sm:items-center">
          {success ? (
            <>
              <Button variant="outline" onClick={() => { router.refresh(); onOpenChange(false); }} className="w-full sm:w-auto">
                Close
              </Button>
              <Button onClick={() => { router.refresh(); onOpenChange(false); router.push(`/front-office/${success.caseId}`); }} className="w-full sm:w-auto gap-1">
                View case <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : (
            <>
              {/* Left side: Back + Pause */}
              <div className="flex gap-2 w-full sm:w-auto">
                {wizardStep > 1 && (
                  <Button variant="outline" onClick={prevStep} className="flex-1 sm:flex-none sm:w-auto gap-1">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Back</span>
                  </Button>
                )}
                {wizardStep === 4 && !isManual && !isSearch && (
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
                  Next
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button onClick={() => handleSubmit('finalize')} disabled={!canSubmit || saving} className="w-full sm:w-auto gap-1">
                  {saving ? 'Saving…' : (
                    <><Check className="w-3.5 h-3.5" /> {isManual || isSearch ? t('btnSave') : t('btnFinalize')} <ArrowRight className="w-3.5 h-3.5" /></>
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ─── Confirm exit ─────────────────────────────────────────────────── */}
    <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-text-1">{t('exitTitle')}</DialogTitle>
          <DialogDescription className="text-text-2 text-sm mt-1">
            {t('exitDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-4">
          <Button variant="destructive" className="w-full" onClick={() => { setShowExitConfirm(false); onOpenChange(false); }}>
            {t('exitLeave')}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setShowExitConfirm(false)}>
            {t('exitStay')}
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
      {selected && <Check className="w-4 h-4 text-brand-text shrink-0 mt-0.5" />}
    </button>
  );
}

function SegmentedOption({ selected, onClick, icon, label }: {
  selected: boolean; onClick: () => void; icon: string; label: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-2 rounded-md border text-[11px] font-medium transition-colors ${
        selected ? 'bg-brand/10 border-brand/40 text-brand-text font-semibold' : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
      }`}
    >
      <span className="mr-1">{icon}</span> {label}
    </button>
  );
}

function Note({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'muted' }) {
  const toneClasses: Record<string, string> = {
    default: 'bg-bg-2/40 border-border text-text-2',
    emerald: 'bg-emerald/10 border-emerald/30 text-emerald',
    amber:   'bg-amber/10 border-amber/30 text-amber',
    rose:    'bg-rose/10 border-rose/30 text-rose',
    cyan:    'bg-cyan/10 border-cyan/30 text-cyan',
    muted:   'bg-bg-2/40 border-border text-text-muted',
  };
  return (
    <div className={`rounded-md border px-3 py-2 text-[11px] ${toneClasses[tone]}`}>{children}</div>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Returns Monday of the week containing `now` (in Denver timezone), at noon UTC.
 *  Noon UTC = 6 AM MDT = same calendar day in Denver → toDenverDate() is stable.
 *  Weekend (Sat/Sun) → advances to NEXT Monday. */
function getMondayOf(now: Date): Date {
  // Step 1: find today's calendar date in Denver
  const [y, m, d] = now.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    .split('-').map(Number) as [number, number, number];
  // Step 2: build a noon-UTC Date for that day (noon UTC is always the same Denver date)
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = noonUtc.getUTCDay(); // 0=Sun 1=Mon … 6=Sat
  // Step 3: offset to Monday; weekend → next Monday
  const diff = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  return new Date(Date.UTC(y, m - 1, d + diff, 12, 0, 0));
}

/** Add n calendar days to a Date that is stored at noon UTC. */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function toDenverDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}
