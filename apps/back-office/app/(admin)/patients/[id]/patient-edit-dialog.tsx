'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Pencil, ShieldAlert, User, Stethoscope, PhoneCall } from 'lucide-react';
import { LocationSelect } from '@/components/ui-phoenix/location-select';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { US_STATES, CITIES_BY_STATE, CITY_ZIP } from '@/lib/us-locations';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@precision/ui';
import { FormField } from '@/components/ui-phoenix';

type PatientStatus    = 'NEW' | 'ACTIVE' | 'COMPLETED' | 'DISCHARGED' | 'INACTIVE';
type GuardianRelation = 'FATHER' | 'MOTHER' | 'LEGAL_GUARDIAN' | 'OTHER';

export interface EditablePatient {
  id:                          string;
  firstName:                   string;
  lastName:                    string;
  email:                       string | null;
  phone:                       string | null;
  phone2?:                     string | null;
  dateOfBirth:                 Date | null;
  status:                      PatientStatus;
  preferredLanguage:           string | null;
  sex?:                        string | null;
  maritalStatus?:              string | null;
  employer?:                   string | null;
  preferredPharmacy?:          string | null;
  communicationPreference?:    string | null;
  referralSource?:             string | null;
  race?:                       string | null;
  ethnicity?:                  string | null;
  socialSecurityNumber?:       string | null;
  addressLine1?:               string | null;
  addressCity?:                string | null;
  addressState?:               string | null;
  addressZip?:                 string | null;
  emergencyContactName:        string | null;
  emergencyContactPhone:       string | null;
  emergencyContactRelation?:   string | null;
  emergency2Name?:             string | null;
  emergency2Phone?:            string | null;
  emergency2Relation?:         string | null;
  guardianName:                string | null;
  guardianPhone:               string | null;
  guardianRelation:            string | null;
}

interface Props {
  patient:       EditablePatient;
  externalOpen?: boolean;
  onClose?:      () => void;
}

function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function PatientEditDialog({ patient, externalOpen, onClose }: Props) {
  const t      = useTranslations('phoenix.patients');
  const tc     = useTranslations('common');
  const router = useRouter();

  const [open,         setOpen]         = useState(externalOpen ?? false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [confirmExit,  setConfirmExit]  = useState(false);
  const [emailError,   setEmailError]   = useState('');

  function validateEmail(v: string) {
    if (!v) { setEmailError(''); return true; }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    setEmailError(ok ? '' : 'Correo electrónico inválido');
    return ok;
  }

  const initialForm = {
    firstName:                 patient.firstName,
    lastName:                  patient.lastName,
    email:                     patient.email                    ?? '',
    phone:                     patient.phone                    ?? '',
    phone2:                    patient.phone2                   ?? '',
    dateOfBirth:               toDateInput(patient.dateOfBirth),
    status:                    patient.status                   as string,
    preferredLanguage:         patient.preferredLanguage        ?? '',
    sex:                       patient.sex                      ?? '',
    maritalStatus:             patient.maritalStatus            ?? '',
    employer:                  patient.employer                 ?? '',
    preferredPharmacy:         patient.preferredPharmacy        ?? '',
    communicationPreference:   patient.communicationPreference  ?? '',
    referralSource:            patient.referralSource           ?? '',
    race:                      patient.race                     ?? '',
    ethnicity:                 patient.ethnicity                ?? '',
    socialSecurityNumber:      patient.socialSecurityNumber     ?? '',
    addressLine1:              patient.addressLine1             ?? '',
    addressCity:               patient.addressCity              ?? '',
    addressState:              patient.addressState             ?? '',
    addressZip:                patient.addressZip               ?? '',
    emergencyContactName:      patient.emergencyContactName     ?? '',
    emergencyContactPhone:     patient.emergencyContactPhone    ?? '',
    emergencyContactRelation:  patient.emergencyContactRelation ?? '',
    emergency2Name:            patient.emergency2Name           ?? '',
    emergency2Phone:           patient.emergency2Phone          ?? '',
    emergency2Relation:        patient.emergency2Relation       ?? '',
    guardianName:              patient.guardianName             ?? '',
    guardianPhone:             patient.guardianPhone            ?? '',
    guardianRelation:          patient.guardianRelation         ?? '',
  };

  const [form, setForm] = useState(initialForm);

  const age     = useMemo(() => calcAge(form.dateOfBirth), [form.dateOfBirth]);
  const isMinor = age !== null && age < 18;

  const isDirty = Object.keys(initialForm).some(
    k => form[k as keyof typeof initialForm] !== initialForm[k as keyof typeof initialForm]
  );

  function set(key: keyof typeof initialForm) {
    return (v: string) => setForm(prev => ({ ...prev, [key]: v }));
  }

  function setPhone(key: keyof typeof initialForm) {
    return (v: string) => setForm(prev => ({ ...prev, [key]: formatPhone(v) }));
  }

  function handleClose(force = false) {
    if (!force && isDirty) { setConfirmExit(true); return; }
    setOpen(false);
    if (onClose) onClose();
  }

  function handleConfirmExit() {
    setConfirmExit(false);
    setOpen(false);
    if (onClose) onClose();
  }

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Nombre y apellido son requeridos.');
      return;
    }
    if (form.email && !validateEmail(form.email)) return;
    if (form.dateOfBirth) {
      const a = calcAge(form.dateOfBirth);
      if (a === null || a < 0) { setError('Fecha de nacimiento inválida.'); return; }
      if (a > 120) { setError('Verifica el año de nacimiento.'); return; }
    }
    if (isMinor && !form.guardianName.trim()) {
      setError('El paciente es menor de edad — se requiere nombre del responsable legal.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/patients/${patient.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...form,
          sex:                     form.sex                     || null,
          maritalStatus:           form.maritalStatus           || null,
          communicationPreference: form.communicationPreference || null,
          referralSource:          form.referralSource          || null,
          race:                    form.race                    || null,
          ethnicity:               form.ethnicity               || null,
          guardianRelation:        form.guardianRelation        || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.message ?? j.error ?? t('editError'));
        return;
      }
      setOpen(false);
      if (onClose) { onClose(); } else { router.refresh(); }
    } catch {
      setError(t('editError'));
    } finally {
      setSaving(false);
    }
  }

  const STATUS_OPTIONS = [
    { value: 'NEW',        label: t('patientStatus.NEW') },
    { value: 'ACTIVE',     label: t('patientStatus.ACTIVE') },
    { value: 'COMPLETED',  label: t('patientStatus.COMPLETED') },
    { value: 'DISCHARGED', label: t('patientStatus.DISCHARGED') },
    { value: 'INACTIVE',   label: t('patientStatus.INACTIVE') },
  ];

  const LANG_OPTIONS = [
    { value: '', label: '—' },
    { value: 'es',    label: 'Español' },
    { value: 'en',    label: 'Inglés' },
    { value: 'fr',    label: 'Francés' },
    { value: 'it',    label: 'Italiano' },
    { value: 'pt',    label: 'Portugués' },
    { value: 'other', label: 'Otro' },
  ];

  const SEX_OPTIONS = [
    { value: '', label: '—' },
    { value: 'MALE',              label: 'Masculino' },
    { value: 'FEMALE',            label: 'Femenino' },
    { value: 'NON_BINARY',        label: 'No binario' },
    { value: 'OTHER',             label: 'Otro' },
    { value: 'PREFER_NOT_TO_SAY', label: 'Prefiero no decir' },
  ];

  const MARITAL_OPTIONS = [
    { value: '', label: '—' },
    { value: 'SINGLE',    label: 'Soltero/a' },
    { value: 'MARRIED',   label: 'Casado/a' },
    { value: 'DIVORCED',  label: 'Divorciado/a' },
    { value: 'WIDOWED',   label: 'Viudo/a' },
    { value: 'SEPARATED', label: 'Separado/a' },
    { value: 'OTHER',     label: 'Otro' },
  ];

  const RACE_OPTIONS = [
    { value: '', label: '—' },
    { value: 'AFRICAN_AMERICAN',             label: 'Afroamericano' },
    { value: 'AMERICAN_INDIAN_ALASKA_NATIVE', label: 'Indio americano/Nativo de Alaska' },
    { value: 'ASIAN',                        label: 'Asiático' },
    { value: 'NATIVE_HAWAIIAN',              label: 'Nativo hawaiano u otro' },
    { value: 'PACIFIC_ISLANDER',             label: 'Isleño del Pacífico' },
    { value: 'WHITE',                        label: 'Blanco' },
    { value: 'OTHER',                        label: 'Otro' },
    { value: 'PREFER_NOT_TO_SAY',            label: 'Prefiero no responder' },
  ];

  const ETHNICITY_OPTIONS = [
    { value: '', label: '—' },
    { value: 'HISPANIC_LATINO',     label: 'Hispano/Latino' },
    { value: 'NOT_HISPANIC_LATINO', label: 'No hispano/Latino' },
    { value: 'PREFER_NOT_TO_SAY',   label: 'Prefiero no responder' },
  ];

  const COMM_OPTIONS = [
    { value: '', label: '—' },
    { value: 'PHONE', label: 'Teléfono' },
    { value: 'EMAIL', label: 'Email' },
    { value: 'TEXT',  label: 'Mensaje de texto' },
    { value: 'ANY',   label: 'Cualquiera' },
  ];

  const REFERRAL_OPTIONS = [
    { value: '', label: '—' },
    { value: 'LAW_FIRM',        label: 'Abogado / Bufete de abogados' },
    { value: 'WEB_SEARCH',      label: 'Búsqueda web' },
    { value: 'ACCIDENT_CENTER', label: 'Centro de accidentes Axcess' },
    { value: 'FACEBOOK',        label: 'Facebook' },
    { value: 'FAMILY',          label: 'Familia' },
    { value: 'GOOGLE',          label: 'Google' },
    { value: 'GOOGLE_MAPS',     label: 'Google Maps' },
    { value: 'INSTAGRAM',       label: 'Instagram' },
    { value: 'WEBSITE',         label: 'Página web' },
    { value: 'CLINIC_STAFF',    label: 'Personal de la clínica (membresía, etc.)' },
    { value: 'CHIROPRACTOR',    label: 'Quiropráctico (Cascade, Saratoga, etc.)' },
    { value: 'REFERRAL',        label: 'Recomendación' },
    { value: 'PATIENT_REFERRAL',label: 'Recomendación de un paciente de la clínica' },
    { value: 'INSURANCE',       label: 'Seguro' },
    { value: 'MEDICAL_INSURANCE',label: 'Seguro médico' },
    { value: 'TIKTOK',          label: 'TikTok' },
    { value: 'OTHER',           label: 'Otro' },
  ];

  const GUARDIAN_OPTIONS = [
    { value: '', label: '—' },
    { value: 'FATHER',         label: 'Padre' },
    { value: 'MOTHER',         label: 'Madre' },
    { value: 'LEGAL_GUARDIAN', label: 'Tutor legal' },
    { value: 'OTHER',          label: 'Otro' },
  ];

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="shrink-0">
        <Pencil className="w-3.5 h-3.5 mr-1.5" />
        {t('actionEdit')}
      </Button>

      <ConfirmDialog
        open={confirmExit}
        variant="warning"
        title="¿Cerrar sin guardar?"
        description="Tienes datos ingresados que se perderán si cierras ahora. ¿Deseas continuar?"
        confirmLabel="Sí, cerrar"
        cancelLabel="Seguir editando"
        onConfirm={handleConfirmExit}
        onCancel={() => setConfirmExit(false)}
      />

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent
          className="max-w-3xl max-h-[92vh] overflow-y-auto p-0"
          onInteractOutside={(e) => { e.preventDefault(); handleClose(); }}
        >
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border sticky top-0 bg-bg-1 z-10">
            <DialogTitle className="flex items-center gap-2 text-text-1 text-base">
              <Pencil className="w-4 h-4 text-brand" />
              {t('editDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-text-muted text-xs">
              {t('editDialogSubtitle')}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5 space-y-5">

            {/* ══ Información personal ══ */}
            <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <User className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-text-1">Información personal</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input label="Nombre *"   value={form.firstName} onChange={set('firstName')} placeholder="Nombre" />
                <FormField.Input label="Apellido *" value={form.lastName}  onChange={set('lastName')}  placeholder="Apellido" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input
                  label="Correo electrónico"
                  value={form.email}
                  onChange={(v) => { set('email')(v); if (emailError) validateEmail(v); }}
                  onBlur={() => validateEmail(form.email)}
                  placeholder="paciente@email.com"
                  type="email"
                  error={emailError}
                />
                <div className="space-y-1">
                  <FormField.Input label="Fecha de nacimiento" value={form.dateOfBirth} onChange={set('dateOfBirth')} type="date" />
                  {age !== null && (
                    <p className={`text-[11px] ${isMinor ? 'text-amber font-semibold' : 'text-text-muted'}`}>
                      {age} años{isMinor ? ' · Menor de edad' : ''}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input label="Teléfono" value={form.phone}  onChange={setPhone('phone')}  placeholder="(305) 000-0000" type="tel" />
                <FormField.Input label="Celular"  value={form.phone2} onChange={setPhone('phone2')} placeholder="(305) 000-0000" type="tel" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <LocationSelect
                  label="Estado"
                  value={form.addressState}
                  onChange={(v) => setForm(prev => ({ ...prev, addressState: v, addressCity: '' }))}
                  options={['Utah', ...US_STATES.filter(s => s.code !== 'UT').map(s => s.name)]}
                  placeholder="Seleccionar estado"
                />
                <LocationSelect
                  label="Ciudad"
                  value={form.addressCity}
                  onChange={(v) => setForm(prev => ({ ...prev, addressCity: v, addressZip: CITY_ZIP[v] ?? prev.addressZip }))}
                  options={form.addressState ? (CITIES_BY_STATE[US_STATES.find(s => s.name === form.addressState)?.code ?? ''] ?? []) : []}
                  placeholder={form.addressState ? 'Seleccionar ciudad' : 'Primero selecciona estado'}
                  disabled={!form.addressState}
                />
                <FormField.Input label="Código postal" value={form.addressZip} onChange={set('addressZip')} placeholder="ej. 90210" />
              </div>

              <FormField.Input label="Dirección" value={form.addressLine1} onChange={set('addressLine1')} placeholder="123 Main St, Apt 4B" />

              <FormField.Select label="¿Cómo se enteró de nosotros?" value={form.referralSource} onChange={set('referralSource')} options={REFERRAL_OPTIONS} />

              <FormField.Select label={t('fieldStatus')} value={form.status} onChange={set('status')} options={STATUS_OPTIONS} />
            </div>

            {/* ══ Información clínica ══ */}
            <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <Stethoscope className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-text-1">Información clínica del paciente</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input label="Empleador"          value={form.employer}          onChange={set('employer')}          placeholder="ej. Juan Perez" />
                <FormField.Input label="Farmacia preferida" value={form.preferredPharmacy} onChange={set('preferredPharmacy')} placeholder="Nombre de farmacia" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Select label="¿Cómo le gustaría que se comuniquen con usted?" value={form.communicationPreference} onChange={set('communicationPreference')} options={COMM_OPTIONS} />
                <FormField.Input  label="Seguro social" value={form.socialSecurityNumber} onChange={set('socialSecurityNumber')} placeholder="XXX-XX-XXXX" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Select label="Raza"      value={form.race}      onChange={set('race')}      options={RACE_OPTIONS} />
                <FormField.Select label="Etnicidad" value={form.ethnicity} onChange={set('ethnicity')} options={ETHNICITY_OPTIONS} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField.Select label="Sexo"             value={form.sex}               onChange={set('sex')}               options={SEX_OPTIONS} />
                <FormField.Select label="Idioma preferido" value={form.preferredLanguage} onChange={set('preferredLanguage')} options={LANG_OPTIONS} />
                <FormField.Select label="Estado civil"     value={form.maritalStatus}     onChange={set('maritalStatus')}     options={MARITAL_OPTIONS} />
              </div>
            </div>

            {/* ══ Responsable legal (solo si menor) ══ */}
            {isMinor && (
              <div className="rounded-lg border border-amber/30 bg-amber/5 p-5 space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-amber/20">
                  <ShieldAlert className="w-4 h-4 text-amber" />
                  <h3 className="text-sm font-semibold text-amber">{t('sectionGuardian')}</h3>
                  <span className="text-[10px] text-amber/70 italic">{t('guardianRequired')}</span>
                </div>
                <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
                  {t('guardianNote')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField.Input  label={`${t('fieldGuardianName')} *`} value={form.guardianName}     onChange={set('guardianName')}     placeholder="Nombre completo" />
                  <FormField.Select label={t('fieldGuardianRelation')}     value={form.guardianRelation} onChange={set('guardianRelation')} options={GUARDIAN_OPTIONS} />
                </div>
                <FormField.Input label={t('fieldGuardianPhone')} value={form.guardianPhone} onChange={setPhone('guardianPhone')} placeholder="(801) 555-0100" type="tel" />
              </div>
            )}

            {/* ══ Contactos de emergencia ══ */}
            <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <PhoneCall className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-text-1">Contactos de emergencia</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField.Input label="Nombre"   value={form.emergencyContactName}     onChange={set('emergencyContactName')}       placeholder="Nombre" />
                <FormField.Input label="Teléfono" value={form.emergencyContactPhone}    onChange={setPhone('emergencyContactPhone')} placeholder="(305) 000-0000" type="tel" />
                <FormField.Input label="Relación" value={form.emergencyContactRelation} onChange={set('emergencyContactRelation')}   placeholder="Ej. Esposo/a, Madre..." />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField.Input label="Nombre"   value={form.emergency2Name}     onChange={set('emergency2Name')}             placeholder="Nombre" />
                <FormField.Input label="Teléfono" value={form.emergency2Phone}    onChange={setPhone('emergency2Phone')}       placeholder="(305) 000-0000" type="tel" />
                <FormField.Input label="Relación" value={form.emergency2Relation} onChange={set('emergency2Relation')}         placeholder="Ej. Hermano/a..." />
              </div>
            </div>

            {error && (
              <p className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border flex-col sm:flex-row gap-2 sticky bottom-0 bg-bg-1">
            <Button variant="outline" onClick={() => handleClose()} disabled={saving} className="w-full sm:w-auto">
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? tc('saving') : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
