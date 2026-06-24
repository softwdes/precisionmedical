'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
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
  });

  function set(key: keyof typeof form) {
    return (v: string) => setForm(prev => ({ ...prev, [key]: v }));
  }

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Nombre y apellido son requeridos.');
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
          accidentType: form.accidentType || null,
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
                <FormField.Input label={t('fieldDob')} value={form.dateOfBirth} onChange={set('dateOfBirth')} type="date" />
                <FormField.Select label={t('fieldPreferredLanguage')} value={form.preferredLanguage} onChange={set('preferredLanguage')} options={LANG_OPTIONS} />
              </div>
              <FormField.Select label={t('fieldStatus')} value={form.status} onChange={set('status')} options={STATUS_OPTIONS} />
            </section>

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
