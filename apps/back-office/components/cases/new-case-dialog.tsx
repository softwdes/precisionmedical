'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  PhoneCall, User, Car, Scale, ShieldCheck, Check, AlertCircle, Search as SearchIcon,
  CalendarCheck, Send, Tablet, Pause, ArrowRight, MessageCircle, Phone,
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

// B.2 — Contacto inicial del paciente · llamada + apertura caso + agendamiento
// (10-15 min · captura completa · paciente sale con cita confirmada + formulario enviado)
//
// Estilo: estricto al sistema (ver apps/back-office/CLAUDE.md regla #0).
// Usa primitivos de ui-phoenix · sin border-2 · sin gradients en cards.

interface NewCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specialties: Array<{ id: string; name: string; color: string }>;
  clinics: Array<{ id: string; name: string; address: string | null }>;
  providers: Array<{ id: string; firstName: string; lastName: string; specialty: string }>;
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

export function NewCaseDialog({ open, onOpenChange, specialties, clinics, providers }: NewCaseDialogProps) {
  const router = useRouter();

  // ─── Call timer ────────────────────────────────────────────────────────
  const [callElapsed, setCallElapsed] = useState(0);

  useEffect(() => {
    if (!open) {
      setCallElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setCallElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

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

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setDateOfBirth(''); setLanguage('es'); setReferralSource('LAW_FIRM_REFERRAL');
    setCaseType('MVA');
    setAccidentDate(''); setAccidentType('AUTO'); setAccidentLocation(''); setAccidentNotes('');
    setLawyerStatus('HAS'); setLawFirm(null); setAttorney(null); setCaseManagerName(''); setCaseManagerEmail(''); setFirmPhone('');
    setInsurance(null); setPolicyNumber('');
    setSpecialtyId(specialties[0]?.id ?? ''); setScheduleNow(true); setClinicId(clinics[0]?.id ?? '');
    setProviderId(''); setSlotIso(null); setDuration(45);
    setFormDelivery('SEND_NOW');
    setSaving(false); setError(null); setSuccess(null);
  }, [open, specialties, clinics]);

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
      return setError('Completá los campos obligatorios marcados con *');
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

  // ─── Success state ─────────────────────────────────────────────────────
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald/15 border border-emerald/30 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald" />
            </div>
            <h2 className="text-xl font-bold text-text-1 mb-2">Caso creado · llamada finalizada</h2>
            <p className="text-text-2 text-sm mb-4">
              <code className="text-emerald font-mono font-bold">{success.caseCode}</code>
            </p>
            <div className="text-xs text-text-muted mb-6 space-y-1">
              <div><strong className="text-text-2">{firstName} {lastName}</strong></div>
              {success.appointmentScheduled
                ? <div>Cita confirmada · status <code className="text-emerald">CONFIRMED</code></div>
                : <div>Sin cita aún · status <code className="text-rose">NEW_REFERRAL</code></div>}
              {formDelivery === 'SEND_NOW' && <div>Formulario enviado por {email ? 'email' : 'SMS'}</div>}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
              <Button onClick={() => {
                onOpenChange(false);
                router.push(`/front-office/${success.caseId}`);
              }}>
                Ver caso <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Main dialog ───────────────────────────────────────────────────────
  const elapsedLabel = formatElapsed(callElapsed);
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Paciente';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        {/* ─── Header · mobile-friendly ─────────────────────────────────── */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-text-1 text-sm sm:text-base">
                  <PhoneCall className="w-4 h-4 text-emerald shrink-0" />
                  <span className="truncate">Llamada · {fullName}</span>
                </DialogTitle>
                <DialogDescription className="mt-1 text-[11px] sm:text-xs">
                  Front Office · captura + agenda · 10–15 min típico
                </DialogDescription>
              </div>
              {/* Pills compactos: en mobile solo el timer · en sm+ ambos */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <TagPill
                  label="REFERRAL_RECEIVED"
                  colorClass="bg-rose/15 text-rose border-rose/30 hidden sm:inline-flex"
                  mono
                />
                <TagPill
                  label={<><span className="w-1.5 h-1.5 rounded-full bg-emerald inline-block mr-1 animate-pulse" />{elapsedLabel}</>}
                  colorClass="bg-emerald/15 text-emerald border-emerald/30"
                />
              </div>
            </div>
          </DialogHeader>

          {/* Patient hero card · sin truncar lawFirm en mobile (stack si hace falta) */}
          <div className="mt-3 rounded-lg border border-border bg-bg-1 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-3">
            <PersonAvatar firstName={firstName || '?'} lastName={lastName || ''} size={10} gradientClass="bg-gradient-brand" />
            <div className="flex-1 min-w-0">
              <div className="text-text-1 font-semibold text-sm truncate">{fullName}</div>
              <div className="text-text-muted text-[11px] mt-0.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
                {phone && <span className="font-mono flex items-center gap-1"><Phone className="w-3 h-3" />{phone}</span>}
                <span>{language === 'es' ? '🇪🇸 Español' : '🇺🇸 English'}</span>
                {lawFirm && <span className="truncate max-w-full">⚖ {lawFirm.label}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Body scrollable ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4 scroll-thin">
          <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <MessageCircle className="w-3 h-3" />
            Información a capturar en esta llamada
          </div>

          {/* ── Sección 1: Patient ─────────────────────────────────────── */}
          <InfoCard title="Datos básicos del paciente" icon={User} number={1}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField.Input label="Nombre" required value={firstName} onChange={setFirstName} placeholder="Sandra" autoFocus />
              <FormField.Input label="Apellido" required value={lastName} onChange={setLastName} placeholder="López" />
              <FormField.Input label="Teléfono" required value={phone} onChange={setPhone} placeholder="(801) 555-0142" type="tel" />
              <FormField.Input label="Email" value={email} onChange={setEmail} placeholder="sandra@email.com" type="email" />
              <FormField.Input label="Fecha de nacimiento" value={dateOfBirth} onChange={setDateOfBirth} type="date" />
              <FormField.Select label="Idioma preferido" value={language} onChange={(v) => setLanguage(v as 'es' | 'en')}
                options={[{ value: 'es', label: '🇪🇸 Español' }, { value: 'en', label: '🇺🇸 English' }]} />
            </div>
            <FormField.Select label="¿Quién lo refirió?" value={referralSource} onChange={(v) => setReferralSource(v as ReferralSource)}
              options={[
                { value: 'LAW_FIRM_REFERRAL', label: '⚖ Bufete de abogados' },
                { value: 'PATIENT_REFERRAL', label: '👥 Paciente existente' },
                { value: 'PHONE_CALL', label: '📞 Llamada directa' },
                { value: 'WALK_IN', label: '🚶 Walk-in (sin cita)' },
                { value: 'WEB_FORM', label: '🌐 Formulario web' },
                { value: 'OTHER', label: '📌 Otro' },
              ]}
              hint='"¿Me confirma su nombre completo y fecha de nacimiento? ¿Quién la refirió a Precision Medical?"'
            />
          </InfoCard>

          {/* ── Sección 2: Tipo de caso ──────────────────────────────────── */}
          <InfoCard title="Tipo de caso" icon={Car} number={2}>
            <div className="grid grid-cols-2 gap-2">
              <SelectableCard
                selected={caseType === 'MVA'}
                onClick={() => setCaseType('MVA')}
                icon="🚗"
                title="MVA"
                subtitle="Accidente de auto · PI con lien"
              />
              <SelectableCard
                selected={caseType === 'GENERAL'}
                onClick={() => setCaseType('GENERAL')}
                icon="🩺"
                title="GM"
                subtitle="Medicina general · sin lien"
              />
            </div>
          </InfoCard>

          {/* ── Sección 3: Accidente (solo para MVA) ────────────────────── */}
          {caseType === 'MVA' && (
            <InfoCard title="Detalles del accidente" icon={Car} number={3}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField.Input label="Fecha del accidente (DOL)" value={accidentDate} onChange={setAccidentDate} type="date" />
                <FormField.Select label="Mecanismo" value={accidentType} onChange={setAccidentType}
                  options={[
                    { value: 'AUTO', label: '🚗 Auto' },
                    { value: 'MOTORCYCLE', label: '🏍 Motorcycle' },
                    { value: 'PEDESTRIAN', label: '🚶 Pedestrian' },
                    { value: 'WORKPLACE', label: '🏭 Workplace' },
                    { value: 'OTHER', label: '📌 Other' },
                  ]} />
              </div>
              <FormField.Input label="Ubicación" value={accidentLocation} onChange={setAccidentLocation} placeholder="I-15 Exit 285, Provo" />
              <FormField.Textarea label="Notas breves" value={accidentNotes} onChange={setAccidentNotes}
                placeholder="Choque trasero · 3 vehículos · paciente reportó dolor cervical"
                hint='"¿Cuándo ocurrió el accidente? ¿Cómo fue?"' />
            </InfoCard>
          )}

          {/* ── Sección 4: Abogado · OBLIGATORIO para MVA ─────────────── */}
          {caseType === 'MVA' && (
            <InfoCard
              title="Abogado representante"
              icon={Scale}
              number={4}
              tone="rose"
              rightSlot={<TagPill label="OBLIGATORIO MVA" colorClass="bg-rose/15 text-rose border-rose/30" />}
            >
              <div className="text-text-muted text-[11px] italic">"¿Tiene abogado o bufete que lo represente en este caso?"</div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <SegmentedOption
                  selected={lawyerStatus === 'HAS'} onClick={() => setLawyerStatus('HAS')}
                  icon="✓" label="Sí, tiene abogado"
                />
                <SegmentedOption
                  selected={lawyerStatus === 'SEEKING'} onClick={() => setLawyerStatus('SEEKING')}
                  icon="🔍" label="No tiene aún · buscar"
                />
                <SegmentedOption
                  selected={lawyerStatus === 'DECLINED'} onClick={() => setLawyerStatus('DECLINED')}
                  icon="✗" label="No quiere abogado"
                />
              </div>

              {lawyerStatus === 'HAS' && (
                <div className="space-y-3">
                  <div>
                    <Label>Bufete de abogados <span className="text-text-muted text-[10px] ml-1 font-normal">(autocomplete del catálogo)</span></Label>
                    <Autocomplete
                      endpoint="/api/admin/lawyers/autocomplete"
                      placeholder="Buscar bufete (Smith & Johnson, Brown...)"
                      selected={lawFirm}
                      onSelect={(r) => { setLawFirm(r); setAttorney(null); }}
                    />
                  </div>
                  {lawFirm && (
                    <>
                      <div>
                        <Label>Attorney específico <span className="text-text-muted text-[10px] ml-1 font-normal">(opcional)</span></Label>
                        <Autocomplete
                          endpoint="/api/admin/lawyers/autocomplete"
                          extraParams={{ firmId: lawFirm.id }}
                          placeholder="Buscar attorney del bufete..."
                          selected={attorney}
                          onSelect={setAttorney}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField.Input label="Case manager / paralegal" value={caseManagerName} onChange={setCaseManagerName} placeholder="Bob Jones" />
                        <FormField.Input label="Email del case manager" value={caseManagerEmail} onChange={setCaseManagerEmail} placeholder="bob@firm.com" type="email" />
                      </div>
                      <FormField.Input label="Teléfono del bufete" value={firmPhone} onChange={setFirmPhone} placeholder="(801) 555-0987" type="tel" />
                    </>
                  )}
                  <Note tone="emerald">Catálogo central de bufetes · si no aparece, opción "Agregar nuevo bufete" para creación rápida. Edson después verificará la representación con el abogado.</Note>
                </div>
              )}

              {lawyerStatus === 'SEEKING' && (
                <Note tone="amber">El paciente no tiene abogado todavía. Edson revisará y puede sugerir bufetes que aceptan PI cases. El caso queda en pre-intake hasta confirmar representación.</Note>
              )}
              {lawyerStatus === 'DECLINED' && (
                <Note tone="rose">Sin abogado = sin lien. El paciente debe entender que el tratamiento se factura directo (cash o seguro propio). Confirmar antes de continuar.</Note>
              )}
            </InfoCard>
          )}

          {/* ── Sección 5: Seguro PIP ──────────────────────────────────── */}
          {caseType === 'MVA' && (
            <InfoCard title="Seguro de auto (PIP)" icon={ShieldCheck} number={5}>
              <div>
                <Label>Aseguradora PIP</Label>
                <Autocomplete
                  endpoint="/api/admin/insurances/autocomplete"
                  placeholder="Buscar aseguradora (GEICO, State Farm...)"
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
                <FormField.Input label="Número de reclamo PIP" value={policyNumber} onChange={setPolicyNumber} placeholder="PIP-2026-0142"
                  hint='"¿Ya tiene número de reclamo PIP?"' />
              )}
            </InfoCard>
          )}

          {/* ── Sección 6: Agendar primera cita ────────────────────────── */}
          <InfoCard
            title="Agendar primera cita"
            icon={CalendarCheck}
            number={6}
            tone="emerald"
            rightSlot={
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={scheduleNow} onChange={(e) => setScheduleNow(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-emerald" />
                <span className="text-text-2 text-[11px]">en esta llamada</span>
              </label>
            }
          >
            {scheduleNow ? (
              <>
                <div className="text-text-muted text-[11px] italic">"Voy a buscarle un horario disponible. ¿Le viene mejor mañana o esta semana?"</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField.Select label="Clínica" value={clinicId} onChange={setClinicId}
                    options={clinics.map((c) => ({ value: c.id, label: c.name }))} />
                  <FormField.Select label="Especialidad" value={specialtyId} onChange={setSpecialtyId}
                    options={specialties.map((s) => ({ value: s.id, label: s.name }))} />
                </div>

                <div>
                  <Label>Slots disponibles · próximos 3-5 días hábiles</Label>
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
                  <FormField.Select label="Doctor sugerido" value={providerId} onChange={setProviderId}
                    options={displayProviders.map((p) => ({
                      value: p.id, label: `Dr. ${p.firstName} ${p.lastName} — ${p.specialty}`,
                    }))} />
                  <FormField.Select label="Duración" value={String(duration)} onChange={(v) => setDuration(parseInt(v, 10))}
                    options={[15, 30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} min` }))} />
                </div>

                {slotIso && providerId && (
                  <Note tone="emerald">
                    <span className="font-semibold flex items-center gap-1"><Check className="w-3 h-3" /> Cita propuesta</span>
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
                    <div className="text-text-muted text-[10px] mt-1 not-italic">"¿Le parece bien? Le confirmamos por SMS."</div>
                  </Note>
                )}
              </>
            ) : (
              <Note tone="muted">Sin agendar en esta llamada. El caso queda en <code className="text-rose font-mono">NEW_REFERRAL</code> y necesitará agendarse después (botón "Agendar" en la cola).</Note>
            )}
          </InfoCard>

          {/* ── Form delivery ───────────────────────────────────────────── */}
          <InfoCard title="Entrega del formulario al paciente" icon={Send} tone="amber">
            <div className="text-text-2 text-xs">El encargado puede elegir cuándo enviar el formulario público:</div>
            <div className="grid grid-cols-2 gap-2">
              <SelectableCard
                selected={formDelivery === 'SEND_NOW'}
                onClick={() => setFormDelivery('SEND_NOW')}
                icon="📨"
                title="Enviar enlace ahora"
                subtitle="SMS + email · paciente llena desde casa"
              />
              <SelectableCard
                selected={formDelivery === 'TABLET_AT_CLINIC'}
                onClick={() => setFormDelivery('TABLET_AT_CLINIC')}
                icon="📱"
                title="Llenar en tablet en clínica"
                subtitle="Le entregamos tablet al llegar"
              />
            </div>
          </InfoCard>

          {/* ── Checklist final · qué hace el sistema ──────────────────── */}
          <InfoCard title="Al finalizar la llamada, el sistema hace" icon={Check} tone="cyan">
            <ul className="space-y-1.5 text-xs text-text-2 list-none m-0 p-0">
              {scheduleNow && slotIso && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>Caso pasa a status <code className="text-emerald font-mono">CONFIRMED</code> · cita confirmada</span>
                </li>
              )}
              {scheduleNow && slotIso && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>Confirmación de cita enviada al paciente por SMS + email</span>
                </li>
              )}
              {formDelivery === 'SEND_NOW' && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>Formulario público enviado con enlace tokenizado (30 días)</span>
                </li>
              )}
              {caseType === 'MVA' && lawFirm && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>Edson recibe el caso para verificar con {lawFirm.label}</span>
                </li>
              )}
              {scheduleNow && slotIso && providerId && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>Cita aparece en calendario del doctor · recordatorios 24h y 2h antes</span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                <span>Resumen completo registrado en historial del caso ({formatElapsed(callElapsed)})</span>
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
            <span className="sm:inline">Pausar</span>
            <span className="hidden sm:inline">&nbsp;· guardar parcial</span>
          </Button>
          <Button
            onClick={() => handleSubmit('finalize')}
            disabled={!canSubmit || saving}
            className="w-full sm:w-auto"
          >
            {saving ? 'Procesando...' : (
              <>
                <Check className="w-3.5 h-3.5 mr-1" />
                Finalizar llamada
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

/** Note — bloque con tono + texto pequeño. Equivalente al "callout" del mockup
 *  pero usando los tokens del sistema (border /30 + bg /10). */
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
            <div className="px-3 py-2 text-text-muted text-xs">Buscando...</div>
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
