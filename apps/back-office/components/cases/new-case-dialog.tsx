'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  PhoneCall, User, Car, Scale, ShieldCheck, Check, AlertCircle, Search as SearchIcon,
  CalendarCheck, Send, Tablet, Pause, ArrowRight, Stethoscope, MessageCircle,
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
import { TagPill, PersonAvatar } from '@/components/ui-phoenix';

// B.2 — Contacto inicial del paciente · llamada + apertura caso + agendamiento
// (10-15 min · captura completa · paciente sale con cita confirmada + formulario enviado)
//
// Sigue el mockup B.2 del HTML completo: 6 secciones numeradas con bordes
// coloreados por importancia + citas para Recepción + agendamiento en
// la misma llamada.

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
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [callElapsed, setCallElapsed] = useState(0);

  useEffect(() => {
    if (!open) {
      setCallStartTime(null);
      setCallElapsed(0);
      return;
    }
    setCallStartTime(Date.now());
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

  // Auto-select first matching provider when specialty changes
  useEffect(() => {
    if (scheduleNow && displayProviders.length > 0 && !displayProviders.some((p) => p.id === providerId)) {
      setProviderId(displayProviders[0].id);
    }
  }, [specialtyId, displayProviders, providerId, scheduleNow]);

  // ─── Generate slots: próximos 3 días, 9:30 / 11:00 / 14:30 / 16:00 ──────
  const slotOptions = useMemo(() => {
    const out: Array<{ iso: string; label: string }> = [];
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
      const date = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      // Skip weekends (sábado=6, domingo=0)
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
            <div className="w-16 h-16 rounded-full bg-emerald/20 border-2 border-emerald flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald" />
            </div>
            <h2 className="text-xl font-bold text-text-1 mb-2">Caso creado · llamada finalizada</h2>
            <p className="text-text-2 text-sm mb-4">
              <code className="text-emerald font-mono font-bold">{success.caseCode}</code>
            </p>
            <div className="text-xs text-text-muted mb-6 space-y-1">
              <div><strong className="text-text-2">{firstName} {lastName}</strong></div>
              {success.appointmentScheduled && (
                <div>Cita confirmada · status <code className="text-emerald">CONFIRMED</code></div>
              )}
              {!success.appointmentScheduled && (
                <div>Sin cita aún · status <code className="text-rose">NEW_REFERRAL</code></div>
              )}
              {formDelivery === 'SEND_NOW' && <div>Formulario enviado por {phone.includes('@') ? 'email' : 'SMS'}</div>}
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
        {/* ─── Header con call status ──────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-border bg-gradient-to-br from-bg-1 via-bg-1 to-brand/5 shrink-0">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <PhoneCall className="w-5 h-5 text-emerald shrink-0" />
                  Llamada del paciente · {fullName}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Encargado de clínica · capturando información + agendando cita en la misma llamada · 10-15 min
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TagPill label="REFERRAL_RECEIVED" colorClass="bg-rose/15 text-rose border-rose/30" mono />
                <TagPill
                  label={<span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
                    🔴 En llamada · {elapsedLabel}
                  </span>}
                  colorClass="bg-emerald/15 text-emerald border-emerald/30"
                />
              </div>
            </div>
          </DialogHeader>

          {/* Patient hero card */}
          <div className="mt-3 rounded-lg border border-brand/25 bg-gradient-to-r from-brand/10 via-bg-1 to-cyan/5 px-4 py-3 flex items-center gap-4">
            <PersonAvatar firstName={firstName || '?'} lastName={lastName || ''} size={12} gradientClass="bg-gradient-brand" />
            <div className="flex-1 min-w-0">
              <div className="text-text-1 font-semibold text-sm truncate">{fullName}</div>
              <div className="text-text-2 text-[11px] mt-0.5 flex items-center gap-3 flex-wrap">
                {phone && <span className="font-mono">📞 {phone}</span>}
                <span>🌐 {language === 'es' ? 'Español' : 'English'}</span>
              </div>
              <div className="text-text-muted text-[10px] mt-1 truncate">
                Llamada entrante · {lawFirm ? `refiere bufete ${lawFirm.label}` : 'sin bufete identificado'}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-emerald text-[10px] font-semibold uppercase tracking-wider">📞 LLAMADA ACTIVA</div>
              <div className="text-text-muted text-[10px] mt-0.5 font-mono">{elapsedLabel} transcurrido</div>
            </div>
          </div>
        </div>

        {/* ─── Body scrollable ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 scroll-thin">
          <SectionTitle>🎙️ Información a capturar en esta llamada</SectionTitle>

          {/* ── Sección 1: Patient ─────────────────────────────────────── */}
          <NumberedSection number={1} title="Datos básicos del paciente" icon={User}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" required value={firstName} onChange={setFirstName} placeholder="Sandra" autoFocus />
              <Field label="Apellido" required value={lastName} onChange={setLastName} placeholder="López" />
              <Field label="Teléfono" required value={phone} onChange={setPhone} placeholder="(801) 555-0142" type="tel" />
              <Field label="Email" value={email} onChange={setEmail} placeholder="sandra@email.com" type="email" />
              <Field label="Fecha de nacimiento" value={dateOfBirth} onChange={setDateOfBirth} type="date" />
              <SelectField
                label="Idioma preferido"
                value={language}
                onChange={(v) => setLanguage(v as 'es' | 'en')}
                options={[
                  { value: 'es', label: '🇪🇸 Español' },
                  { value: 'en', label: '🇺🇸 English' },
                ]}
              />
              <div className="col-span-2">
                <SelectField
                  label="¿Quién lo refirió?"
                  value={referralSource}
                  onChange={(v) => setReferralSource(v as ReferralSource)}
                  options={[
                    { value: 'LAW_FIRM_REFERRAL', label: '⚖️ Bufete de abogados' },
                    { value: 'PATIENT_REFERRAL', label: '👥 Paciente existente' },
                    { value: 'PHONE_CALL', label: '📞 Llamada directa' },
                    { value: 'WALK_IN', label: '🚶 Walk-in (sin cita)' },
                    { value: 'WEB_FORM', label: '🌐 Formulario web' },
                    { value: 'OTHER', label: '📌 Otro' },
                  ]}
                />
              </div>
            </div>
            <Quote>"¿Me confirma su nombre completo y fecha de nacimiento? ¿Quién la refirió a Precision Medical?"</Quote>
          </NumberedSection>

          {/* ── Sección 2: Tipo de caso ──────────────────────────────────── */}
          <NumberedSection number={2} title="Tipo de caso" icon={Car}>
            <div className="grid grid-cols-2 gap-3">
              <CaseTypeCard
                selected={caseType === 'MVA'}
                onClick={() => setCaseType('MVA')}
                icon="🚗"
                title="MVA — Accidente de auto"
                description="Personal Injury con lien"
                quote='"¿Su visita es por un accidente de auto?"'
                color="rose"
              />
              <CaseTypeCard
                selected={caseType === 'GENERAL'}
                onClick={() => setCaseType('GENERAL')}
                icon="🩺"
                title="GM — Medicina general"
                description="Sin lien · facturación tradicional"
                quote="Otra razón médica"
                color="brand"
              />
            </div>
          </NumberedSection>

          {/* ── Sección 3: Accidente (solo para MVA) ────────────────────── */}
          {caseType === 'MVA' && (
            <NumberedSection number={3} title="Detalles del accidente" icon={Car}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha del accidente (DOL)" value={accidentDate} onChange={setAccidentDate} type="date" />
                <SelectField
                  label="Mecanismo"
                  value={accidentType}
                  onChange={setAccidentType}
                  options={[
                    { value: 'AUTO', label: '🚗 Auto' },
                    { value: 'MOTORCYCLE', label: '🏍️ Motorcycle' },
                    { value: 'PEDESTRIAN', label: '🚶 Pedestrian' },
                    { value: 'WORKPLACE', label: '🏭 Workplace' },
                    { value: 'OTHER', label: '📌 Other' },
                  ]}
                />
              </div>
              <div className="mt-3">
                <Field label="Ubicación" value={accidentLocation} onChange={setAccidentLocation} placeholder="I-15 Exit 285, Provo" />
              </div>
              <div className="mt-3">
                <TextareaField label="Notas breves" value={accidentNotes} onChange={setAccidentNotes}
                  placeholder="Choque trasero · 3 vehículos · paciente reportó dolor cervical" />
              </div>
              <Quote>"¿Cuándo ocurrió el accidente? ¿Cómo fue?"</Quote>
            </NumberedSection>
          )}

          {/* ── Sección 4: Abogado · OBLIGATORIO para MVA ─────────────── */}
          {caseType === 'MVA' && (
            <div className="rounded-lg border-2 border-rose/30 bg-gradient-to-br from-rose/10 to-rose/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-rose/20 border border-rose/40 text-rose flex items-center justify-center text-[10px] font-bold">4</div>
                <Scale className="w-4 h-4 text-rose" />
                <span className="text-rose text-xs font-bold uppercase tracking-wider">Abogado representante · OBLIGATORIO para MVA</span>
              </div>
              <Quote tone="rose">"¿Tiene abogado o bufete que lo represente en este caso?"</Quote>

              <div className="grid grid-cols-3 gap-2">
                <LawyerStatusCard
                  selected={lawyerStatus === 'HAS'}
                  onClick={() => setLawyerStatus('HAS')}
                  icon="✓"
                  label="Sí, tiene abogado"
                  tone="emerald"
                />
                <LawyerStatusCard
                  selected={lawyerStatus === 'SEEKING'}
                  onClick={() => setLawyerStatus('SEEKING')}
                  icon="🔍"
                  label="No tiene aún · buscar"
                  tone="amber"
                />
                <LawyerStatusCard
                  selected={lawyerStatus === 'DECLINED'}
                  onClick={() => setLawyerStatus('DECLINED')}
                  icon="✗"
                  label="No quiere abogado"
                  tone="muted"
                />
              </div>

              {lawyerStatus === 'HAS' && (
                <div className="space-y-3 pt-2">
                  <div>
                    <Label>Bufete de abogados <span className="text-text-muted text-[10px] ml-1">(autocomplete del catálogo)</span></Label>
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
                        <Label>Attorney específico <span className="text-text-muted text-[10px] ml-1">(opcional)</span></Label>
                        <Autocomplete
                          endpoint="/api/admin/lawyers/autocomplete"
                          extraParams={{ firmId: lawFirm.id }}
                          placeholder="Buscar attorney del bufete..."
                          selected={attorney}
                          onSelect={setAttorney}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Case manager / paralegal" value={caseManagerName} onChange={setCaseManagerName} placeholder="Bob Jones" />
                        <Field label="Email del case manager" value={caseManagerEmail} onChange={setCaseManagerEmail} placeholder="bob@firm.com" type="email" />
                      </div>
                      <div>
                        <Field label="Teléfono del bufete" value={firmPhone} onChange={setFirmPhone} placeholder="(801) 555-0987" type="tel" />
                      </div>
                    </>
                  )}
                  <Note tone="emerald">✓ Catálogo central de bufetes · si no aparece, opción "Agregar nuevo bufete" para creación rápida. Edson después verificará la representación con el abogado directamente.</Note>
                </div>
              )}

              {lawyerStatus === 'SEEKING' && (
                <Note tone="amber">El paciente no tiene abogado todavía. Edson revisará y puede sugerir bufetes que aceptan PI cases. El caso queda en pre-intake hasta confirmar representación.</Note>
              )}

              {lawyerStatus === 'DECLINED' && (
                <Note tone="rose">Sin abogado = sin lien. El paciente debe entender que el tratamiento se factura directo · cash o seguro propio. Confirmar antes de continuar.</Note>
              )}
            </div>
          )}

          {/* ── Sección 5: Seguro PIP ──────────────────────────────────── */}
          {caseType === 'MVA' && (
            <NumberedSection number={5} title="Seguro de auto (PIP)" icon={ShieldCheck}>
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
                <div className="mt-3">
                  <Field label="Número de reclamo PIP" value={policyNumber} onChange={setPolicyNumber} placeholder="PIP-2026-0142" />
                </div>
              )}
              <Quote>"¿Cuál es su aseguradora de auto? ¿Ya tiene número de reclamo PIP?"</Quote>
            </NumberedSection>
          )}

          {/* ── Sección 6: Agendar primera cita ────────────────────────── */}
          <div className="rounded-lg border-2 border-emerald/30 bg-gradient-to-br from-emerald/10 to-teal-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald/20 border border-emerald/40 text-emerald flex items-center justify-center text-[10px] font-bold">6</div>
                <CalendarCheck className="w-4 h-4 text-emerald" />
                <span className="text-emerald text-xs font-bold uppercase tracking-wider">Agendar primera cita · EN LA MISMA LLAMADA</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={scheduleNow} onChange={(e) => setScheduleNow(e.target.checked)} className="w-4 h-4 rounded accent-emerald" />
                <span className="text-text-2 text-xs">Agendar ahora</span>
              </label>
            </div>

            {scheduleNow ? (
              <>
                <Quote tone="emerald">"Voy a buscarle un horario disponible. ¿Le viene mejor mañana o esta semana?"</Quote>

                <div className="grid grid-cols-2 gap-3">
                  <SelectField
                    label="Clínica"
                    value={clinicId}
                    onChange={setClinicId}
                    options={clinics.map((c) => ({ value: c.id, label: `🏥 ${c.name}` }))}
                  />
                  <SelectField
                    label="Especialidad"
                    value={specialtyId}
                    onChange={setSpecialtyId}
                    options={specialties.map((s) => ({ value: s.id, label: s.name }))}
                  />
                </div>

                <div>
                  <Label>Slots disponibles · próximos 3 días</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1.5">
                    {slotOptions.map((s) => (
                      <button
                        key={s.iso}
                        type="button"
                        onClick={() => setSlotIso(s.iso)}
                        className={`px-2 py-2 rounded-md border text-[11px] font-medium transition-all capitalize ${
                          slotIso === s.iso
                            ? 'bg-emerald/20 border-emerald/50 text-emerald font-semibold ring-1 ring-emerald/30'
                            : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <SelectField
                    label="Doctor sugerido"
                    value={providerId}
                    onChange={setProviderId}
                    options={displayProviders.map((p) => ({
                      value: p.id,
                      label: `Dr. ${p.firstName} ${p.lastName} — ${p.specialty}`,
                    }))}
                  />
                  <SelectField
                    label="Duración"
                    value={String(duration)}
                    onChange={(v) => setDuration(parseInt(v, 10))}
                    options={[15, 30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} min` }))}
                  />
                </div>

                {slotIso && providerId && (
                  <div className="rounded-md bg-emerald/15 border border-emerald/30 p-3 text-xs">
                    <div className="text-emerald font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Cita propuesta
                    </div>
                    <div className="text-text-1 mt-1 capitalize">
                      <strong>{slotOptions.find((s) => s.iso === slotIso)?.label}</strong>
                      {' '}con{' '}
                      <strong>{(() => {
                        const p = displayProviders.find((x) => x.id === providerId);
                        return p ? `Dr. ${p.firstName} ${p.lastName}` : '—';
                      })()}</strong>
                      {' '}en{' '}
                      <strong>{clinics.find((c) => c.id === clinicId)?.name}</strong>
                    </div>
                    <div className="text-text-muted text-[10px] mt-1">"¿Le parece bien? Le confirmamos por SMS."</div>
                  </div>
                )}
              </>
            ) : (
              <Note tone="muted">Sin agendar en esta llamada. El caso queda en <code className="text-rose">NEW_REFERRAL</code> y necesitará agendarse después (botón Agendar en la cola).</Note>
            )}
          </div>

          {/* ── Form delivery ───────────────────────────────────────────── */}
          <div className="rounded-lg border border-amber/30 bg-gradient-to-br from-amber/10 to-amber/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-amber" />
              <span className="text-amber text-xs font-bold uppercase tracking-wider">📨 Entrega del formulario al paciente</span>
            </div>
            <div className="text-text-2 text-xs">El encargado puede elegir cuándo enviar el formulario público:</div>
            <div className="grid grid-cols-2 gap-2">
              <DeliveryCard
                selected={formDelivery === 'SEND_NOW'}
                onClick={() => setFormDelivery('SEND_NOW')}
                icon={Send}
                title="📨 Enviar enlace ahora"
                subtitle="SMS + email · paciente llena desde casa antes de la cita"
              />
              <DeliveryCard
                selected={formDelivery === 'TABLET_AT_CLINIC'}
                onClick={() => setFormDelivery('TABLET_AT_CLINIC')}
                icon={Tablet}
                title="📱 Llenar en tablet en clínica"
                subtitle="Le entregamos tablet al llegar"
              />
            </div>
          </div>

          {/* ── Checklist final · qué hace el sistema ──────────────────── */}
          <div className="rounded-lg border border-cyan/25 bg-gradient-to-br from-cyan/8 to-brand/5 p-4">
            <div className="text-text-1 font-semibold text-sm mb-2 flex items-center gap-2">
              <Check className="w-4 h-4 text-cyan" />
              Al finalizar la llamada, el sistema hace automáticamente:
            </div>
            <ul className="space-y-1.5 text-xs text-text-2 ml-4 list-none">
              {scheduleNow && slotIso && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>Caso pasa a status <code className="text-emerald">CONFIRMED</code> · cita confirmada</span>
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
                  <span>Formulario público enviado por SMS con enlace tokenizado (30 días)</span>
                </li>
              )}
              {caseType === 'MVA' && lawFirm && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>Edson recibe el caso en su bandeja para verificar con {lawFirm.label} en paralelo</span>
                </li>
              )}
              {scheduleNow && slotIso && providerId && (
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                  <span>Cita aparece en calendario del doctor · recordatorios automáticos 24h y 2h antes</span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <Check className="w-3 h-3 text-emerald mt-0.5 shrink-0" />
                <span>Resumen completo de la llamada queda registrado en el historial del caso (auditable · {formatElapsed(callElapsed)})</span>
              </li>
            </ul>
          </div>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* ─── Footer ──────────────────────────────────────────────────── */}
        <DialogFooter className="border-t border-border px-6 py-3 shrink-0 gap-2">
          <Button variant="outline" onClick={() => handleSubmit('pause')} disabled={saving || !firstName || !lastName || !phone}>
            <Pause className="w-3.5 h-3.5 mr-1" /> Pausar · guardar parcial
          </Button>
          <Button onClick={() => handleSubmit('finalize')} disabled={!canSubmit || saving}>
            {saving ? 'Procesando...' : (
              <>
                <Check className="w-3.5 h-3.5 mr-1" />
                Finalizar llamada · {scheduleNow && slotIso ? 'agendar cita' : 'crear caso'} {formDelivery === 'SEND_NOW' && '· enviar formulario'}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══ Atoms ═══════════════════════════════════════════════════════════════

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 pt-2">
      <MessageCircle className="w-3 h-3" />
      {children}
    </div>
  );
}

function NumberedSection({ number, title, icon: Icon, children }: {
  number: number;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-2/30 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-bg-1 border border-border text-text-muted flex items-center justify-center text-[10px] font-bold">{number}</div>
        <Icon className="w-4 h-4 text-brand" />
        <span className="text-text-1 font-semibold text-sm">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, value, onChange, placeholder, type = 'text', autoFocus }: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <Label>{label}{required && <span className="text-rose ml-0.5">*</span>}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} autoFocus={autoFocus} />
    </div>
  );
}

function TextareaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[50px]"
        placeholder={placeholder}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Quote({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'emerald' | 'rose' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald/80' : tone === 'rose' ? 'text-rose/80' : 'text-text-muted';
  return (
    <div className={`text-[11px] italic ${toneClass} mt-1`}>{children}</div>
  );
}

function Note({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'muted' }) {
  const toneClasses: Record<string, string> = {
    default: 'bg-bg-2/40 border-border text-text-2',
    emerald: 'bg-emerald/10 border-emerald/30 text-emerald',
    amber:   'bg-amber/10 border-amber/30 text-amber',
    rose:    'bg-rose/10 border-rose/30 text-rose',
    muted:   'bg-bg-2/50 border-border text-text-muted',
  };
  return (
    <div className={`rounded-md border px-3 py-2 text-[11px] ${toneClasses[tone]}`}>
      {children}
    </div>
  );
}

function CaseTypeCard({ selected, onClick, icon, title, description, quote, color }: {
  selected: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  description: string;
  quote: string;
  color: 'rose' | 'brand';
}) {
  const colorClasses = color === 'rose'
    ? (selected ? 'bg-rose/15 border-rose/40 text-text-1' : 'bg-bg-2 border-border text-text-muted hover:border-rose/30')
    : (selected ? 'bg-brand/15 border-brand/40 text-text-1' : 'bg-bg-2 border-border text-text-muted hover:border-brand/30');
  return (
    <button type="button" onClick={onClick} className={`text-left p-3 rounded-lg border-2 transition-all ${colorClasses}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xl">{icon}</div>
        {selected && <Check className={`w-4 h-4 ${color === 'rose' ? 'text-rose' : 'text-brand'}`} />}
      </div>
      <div className="font-semibold text-sm mt-1">{title}</div>
      <div className="text-text-muted text-[11px] mt-0.5">{description}</div>
      <div className="text-text-muted text-[10px] italic mt-1.5">{quote}</div>
    </button>
  );
}

function LawyerStatusCard({ selected, onClick, icon, label, tone }: {
  selected: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  tone: 'emerald' | 'amber' | 'muted';
}) {
  const toneClasses: Record<typeof tone, { sel: string; def: string }> = {
    emerald: { sel: 'bg-emerald/15 border-emerald/50 text-emerald', def: 'bg-bg-2 border-border text-text-muted hover:border-emerald/30' },
    amber:   { sel: 'bg-amber/15 border-amber/50 text-amber',       def: 'bg-bg-2 border-border text-text-muted hover:border-amber/30' },
    muted:   { sel: 'bg-bg-3 border-text-muted/40 text-text-1',     def: 'bg-bg-2 border-border text-text-muted hover:border-border-strong' },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2.5 rounded-md border-2 text-[11px] font-semibold transition-all ${selected ? toneClasses[tone].sel : toneClasses[tone].def}`}
    >
      <span className="mr-1">{icon}</span> {label}
    </button>
  );
}

function DeliveryCard({ selected, onClick, icon: Icon, title, subtitle }: {
  selected: boolean;
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-md border-2 transition-all ${
        selected ? 'bg-amber/15 border-amber/40 text-text-1' : 'bg-bg-2 border-border text-text-muted hover:border-amber/30'
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${selected ? 'text-amber' : 'text-text-muted'}`} />
        <div className="min-w-0">
          <div className="font-semibold text-xs">{title}</div>
          <div className="text-text-muted text-[10px] mt-0.5">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

// ─── Autocomplete (sin cambios respecto al original) ─────────────────────

function Autocomplete({
  endpoint,
  extraParams,
  placeholder,
  selected,
  onSelect,
  renderAvatar,
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
