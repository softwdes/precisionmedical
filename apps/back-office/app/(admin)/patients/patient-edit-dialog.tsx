'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Pencil, ShieldAlert } from 'lucide-react';
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

type PatientStatus = 'NEW' | 'ACTIVE' | 'COMPLETED' | 'DISCHARGED' | 'INACTIVE';
type AccidentType  = 'AUTO' | 'MOTORCYCLE' | 'PEDESTRIAN' | 'WORKPLACE' | 'OTHER';
type GuardianRelation = 'FATHER' | 'MOTHER' | 'LEGAL_GUARDIAN' | 'OTHER';

export interface EditablePatient {
  id:                    string;
  firstName:             string;
  lastName:              string;
  email:                 string | null;
  phone:                 string | null;
  dateOfBirth:           Date | null;
  status:                PatientStatus;
  preferredLanguage:     string | null;
  emergencyContactName:  string | null;
  emergencyContactPhone: string | null;
  accidentDate:          Date | null;
  accidentType:          AccidentType | null;
  insuranceCarrier:      string | null;
  policyNumber:          string | null;
  guardianName:          string | null;
  guardianPhone:         string | null;
  guardianRelation:      string | null;
}

interface Props {
  patient: EditablePatient;
  /** When true, the dialog is controlled externally (open immediately). */
  externalOpen?: boolean;
  /** Called when the dialog should close (save success or cancel). */
  onClose?: () => void;
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

export function PatientEditDialog({ patient, externalOpen, onClose }: Props) {
  const t      = useTranslations('phoenix.patients');
  const tc     = useTranslations('common');
  const router = useRouter();

  const [open,   setOpen]   = useState(externalOpen ?? false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const [form, setForm] = useState({
    firstName:             patient.firstName,
    lastName:              patient.lastName,
    email:                 patient.email                 ?? '',
    phone:                 patient.phone                 ?? '',
    dateOfBirth:           toDateInput(patient.dateOfBirth),
    status:                patient.status                as string,
    preferredLanguage:     patient.preferredLanguage     ?? '',
    emergencyContactName:  patient.emergencyContactName  ?? '',
    emergencyContactPhone: patient.emergencyContactPhone ?? '',
    accidentDate:          toDateInput(patient.accidentDate),
    accidentType:          patient.accidentType          ?? '',
    insuranceCarrier:      patient.insuranceCarrier      ?? '',
    policyNumber:          patient.policyNumber          ?? '',
    guardianName:          patient.guardianName          ?? '',
    guardianPhone:         patient.guardianPhone         ?? '',
    guardianRelation:      patient.guardianRelation      ?? '',
  });

  const age   = useMemo(() => calcAge(form.dateOfBirth), [form.dateOfBirth]);
  const isMinor = age !== null && age < 18;

  function set(key: keyof typeof form) {
    return (v: string) => setForm(prev => ({ ...prev, [key]: v }));
  }

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Nombre y apellido son requeridos.');
      return;
    }
    if (form.dateOfBirth) {
      const dobAge = calcAge(form.dateOfBirth);
      if (dobAge === null) {
        setError('Fecha de nacimiento inválida.');
        return;
      }
      if (dobAge < 0) {
        setError('La fecha de nacimiento no puede ser en el futuro.');
        return;
      }
      if (dobAge > 120) {
        setError('Fecha de nacimiento inválida — verifica el año.');
        return;
      }
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
          accidentType:    form.accidentType    || null,
          guardianRelation: form.guardianRelation || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? t('editError'));
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

  const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'NEW',        label: t('patientStatus.NEW') },
    { value: 'ACTIVE',     label: t('patientStatus.ACTIVE') },
    { value: 'COMPLETED',  label: t('patientStatus.COMPLETED') },
    { value: 'DISCHARGED', label: t('patientStatus.DISCHARGED') },
    { value: 'INACTIVE',   label: t('patientStatus.INACTIVE') },
  ];

  const LANG_OPTIONS: Array<{ value: string; label: string }> = [
    { value: '',   label: '—' },
    { value: 'es', label: t('langEs') },
    { value: 'en', label: t('langEn') },
  ];

  const ACCIDENT_OPTIONS: Array<{ value: string; label: string }> = [
    { value: '',           label: '—' },
    { value: 'AUTO',       label: t('accidentType.AUTO') },
    { value: 'MOTORCYCLE', label: t('accidentType.MOTORCYCLE') },
    { value: 'PEDESTRIAN', label: t('accidentType.PEDESTRIAN') },
    { value: 'WORKPLACE',  label: t('accidentType.WORKPLACE') },
    { value: 'OTHER',      label: t('accidentType.OTHER') },
  ];

  const GUARDIAN_RELATION_OPTIONS: Array<{ value: string; label: string }> = [
    { value: '',               label: '—' },
    { value: 'FATHER',         label: t('guardianRelation.FATHER') },
    { value: 'MOTHER',         label: t('guardianRelation.MOTHER') },
    { value: 'LEGAL_GUARDIAN', label: t('guardianRelation.LEGAL_GUARDIAN') },
    { value: 'OTHER',          label: t('guardianRelation.OTHER') },
  ];

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="shrink-0">
        <Pencil className="w-3.5 h-3.5 mr-1.5" />
        {t('actionEdit')}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && onClose) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle>{t('editDialogTitle')}</DialogTitle>
            <DialogDescription>{t('editDialogSubtitle')}</DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5 space-y-6">

            {/* Datos personales */}
            <section className="space-y-4">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {t('sectionPersonalData')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input label={t('fieldFirstName')} value={form.firstName} onChange={set('firstName')} placeholder="Nombre" />
                <FormField.Input label={t('fieldLastName')}  value={form.lastName}  onChange={set('lastName')}  placeholder="Apellido" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input label={t('fieldPhone')} value={form.phone} onChange={set('phone')} placeholder="+1 (305) 000-0000" type="tel" />
                <FormField.Input label={t('fieldEmail')} value={form.email} onChange={set('email')} placeholder="paciente@email.com" type="email" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <FormField.Input label={t('fieldDob')} value={form.dateOfBirth} onChange={set('dateOfBirth')} type="date" />
                  {age !== null && (
                    <p className={`text-[11px] ${isMinor ? 'text-amber font-semibold' : 'text-text-muted'}`}>
                      {age} {t('yearsOld')}{isMinor ? ` · ${t('minorLabel')}` : ''}
                    </p>
                  )}
                </div>
                <FormField.Select label={t('fieldPreferredLanguage')} value={form.preferredLanguage} onChange={set('preferredLanguage')} options={LANG_OPTIONS} />
              </div>
              <FormField.Select label={t('fieldStatus')} value={form.status} onChange={set('status')} options={STATUS_OPTIONS} />
            </section>

            {/* Responsable legal — solo si es menor */}
            {isMinor && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber" />
                  <h3 className="text-[10px] uppercase tracking-wider font-semibold text-amber">
                    {t('sectionGuardian')}
                  </h3>
                  <span className="text-[10px] text-amber/70 italic">{t('guardianRequired')}</span>
                </div>
                <div className="rounded-md border border-amber/30 bg-amber/5 px-3 py-2 text-[11px] text-amber">
                  {t('guardianNote')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField.Input
                    label={t('fieldGuardianName')}
                    required
                    value={form.guardianName}
                    onChange={set('guardianName')}
                    placeholder="Nombre completo"
                  />
                  <FormField.Select
                    label={t('fieldGuardianRelation')}
                    value={form.guardianRelation}
                    onChange={set('guardianRelation')}
                    options={GUARDIAN_RELATION_OPTIONS}
                  />
                </div>
                <FormField.Input
                  label={t('fieldGuardianPhone')}
                  value={form.guardianPhone}
                  onChange={set('guardianPhone')}
                  placeholder="+1 (801) 555-0100"
                  type="tel"
                />
              </section>
            )}

            {/* Contacto de emergencia */}
            <section className="space-y-4">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {t('sectionContactEmergency')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input label={t('fieldEmergencyName')}  value={form.emergencyContactName}  onChange={set('emergencyContactName')}  placeholder="Nombre contacto" />
                <FormField.Input label={t('fieldEmergencyPhone')} value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} placeholder="+1 (305) 000-0000" type="tel" />
              </div>
            </section>

            {/* Datos del accidente */}
            <section className="space-y-4">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {t('sectionAccidentInfo')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input  label={t('fieldAccidentDate')} value={form.accidentDate} onChange={set('accidentDate')} type="date" />
                <FormField.Select label={t('fieldAccidentType')} value={form.accidentType} onChange={set('accidentType')} options={ACCIDENT_OPTIONS} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input label={t('fieldInsuranceCarrier')} value={form.insuranceCarrier} onChange={set('insuranceCarrier')} placeholder="Ej. GEICO, Allstate..." />
                <FormField.Input label={t('fieldPolicyNumber')}     value={form.policyNumber}     onChange={set('policyNumber')}     placeholder="Número de póliza" />
              </div>
            </section>

            {error && (
              <p className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving} className="w-full sm:w-auto">
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
