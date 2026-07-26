'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UserPlus, ShieldAlert, User, Stethoscope, PhoneCall } from 'lucide-react';
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

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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

// ─── ProviderSearch ────────────────────────────────────────────────────────────

interface ProviderOpt { id: string; label: string; }

function ProviderSearch({
  value, onChange, placeholder,
}: {
  value: string; onChange: (id: string, label: string) => void; placeholder?: string;
}) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<ProviderOpt[]>([]);
  const [open,    setOpen]    = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const tid = setTimeout(() => {
      fetch(`/api/admin/providers?q=${encodeURIComponent(q)}&limit=10`)
        .then(r => r.json())
        .then(j => setResults(
          (j.providers ?? j.data ?? []).map((p: { firstName?: string; lastName?: string; id: string }) => ({
            id: p.id,
            label: `Dr. ${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
          }))
        ))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(tid);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayName = value ? (results.find(r => r.id === value)?.label ?? query) : query;

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted/50 outline-none focus:border-brand transition-colors"
        value={displayName}
        placeholder={placeholder ?? 'Buscar doctor…'}
        onChange={e => { setQuery(e.target.value); if (!e.target.value) onChange('', ''); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-bg-1 shadow-lg overflow-hidden">
          {results.map(p => (
            <button
              key={p.id} type="button"
              className="w-full text-left px-3 py-2 text-sm text-text-1 hover:bg-bg-2"
              onClick={() => { onChange(p.id, p.label); setQuery(p.label); setOpen(false); setResults([]); }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Form ──────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  firstName: '', lastName: '', email: '', phone: '', phone2: '', dateOfBirth: '',
  preferredLanguage: '', sex: '', maritalStatus: '', employer: '',
  preferredPharmacy: '', communicationPreference: '', referralSource: '',
  addressLine1: '', addressCity: '', addressState: '', addressZip: '',
  race: '', ethnicity: '', socialSecurityNumber: '',
  emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '', emergencyContactRelationOther: '',
  emergency2Name: '', emergency2Phone: '', emergency2Relation: '', emergency2RelationOther: '',
  guardianName: '', guardianPhone: '', guardianRelation: '',
  providerReferrerId: '',
};

interface Props {
  onCreated?: (id: string) => void;
}

export function PatientCreateDialog({ onCreated }: Props) {
  const t      = useTranslations('phoenix.patients');
  const tc     = useTranslations('common');
  const router = useRouter();

  const [open,        setOpen]        = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [confirmExit, setConfirmExit] = useState(false);
  const [emailError,  setEmailError]  = useState('');

  function validateEmail(v: string) {
    if (!v) { setEmailError(''); return true; }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    setEmailError(ok ? '' : t('errorEmailInvalid'));
    return ok;
  }

  const age     = useMemo(() => calcAge(form.dateOfBirth), [form.dateOfBirth]);
  const isMinor = age !== null && age < 18;

  function set(key: keyof typeof EMPTY_FORM) {
    return (v: string) => setForm(prev => ({ ...prev, [key]: v }));
  }

  function setPhone(key: keyof typeof EMPTY_FORM) {
    return (v: string) => setForm(prev => ({ ...prev, [key]: formatPhone(v) }));
  }

  const isDirty = Object.keys(EMPTY_FORM).some(
    k => form[k as keyof typeof EMPTY_FORM] !== EMPTY_FORM[k as keyof typeof EMPTY_FORM]
  );

  function clearFieldError(field: string) {
    setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  function handleClose(force = false) {
    if (!force && isDirty) { setConfirmExit(true); return; }
    setOpen(false);
    setForm(EMPTY_FORM);
    setError('');
    setFieldErrors({});
  }

  function handleConfirmExit() {
    setConfirmExit(false);
    setOpen(false);
    setForm(EMPTY_FORM);
    setError('');
    setFieldErrors({});
  }

  async function handleCreate() {
    const errs: Record<string, string> = {};

    if (!form.firstName.trim()) errs.firstName = t('errorFirstNameRequired');
    if (!form.lastName.trim())  errs.lastName  = t('errorLastNameRequired');
    if (form.email && !validateEmail(form.email)) errs.email = t('errorEmailInvalid');
    if (form.dateOfBirth) {
      const a = calcAge(form.dateOfBirth);
      if (a === null || a < 0) errs.dateOfBirth = t('errorDOBInvalid');
      else if (a > 120)        errs.dateOfBirth = t('errorDOBYear');
    }
    if (form.addressZip && !/^\d{5}(-\d{4})?$/.test(form.addressZip.trim()))
      errs.addressZip = t('errorZipInvalid');
    if (isMinor && !form.guardianName.trim())
      errs.guardianName = t('errorGuardianRequired');

    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/patients', {
        method:  'POST',
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
          // When relation is OTHER, persist the free-text label instead of 'OTHER'
          emergencyContactRelation: form.emergencyContactRelation === 'OTHER' && form.emergencyContactRelationOther?.trim()
            ? form.emergencyContactRelationOther.trim()
            : (form.emergencyContactRelation || null),
          emergency2Relation: form.emergency2Relation === 'OTHER' && form.emergency2RelationOther?.trim()
            ? form.emergency2RelationOther.trim()
            : (form.emergency2Relation || null),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.error === 'INVALID_PAYLOAD' && json.details?.fieldErrors) {
          const fields = json.details.fieldErrors as Record<string, string[]>;
          const msgs = Object.entries(fields).flatMap(([p, e]) => e.map(m => `${p}: ${m}`));
          setError(msgs.length ? msgs.join(' · ') : (json.message ?? t('editError')));
        } else {
          setError(json.message ?? t('editError'));
        }
        return;
      }
      handleClose(true);
      if (onCreated) { onCreated(json.patient.id); }
      router.refresh();
    } catch {
      setError(t('editError'));
    } finally {
      setSaving(false);
    }
  }

  const LANG_OPTIONS = [
    { value: '', label: '—' },
    { value: 'es',    label: t('lang.es') },
    { value: 'en',    label: t('lang.en') },
    { value: 'fr',    label: t('lang.fr') },
    { value: 'it',    label: t('lang.it') },
    { value: 'pt',    label: t('lang.pt') },
    { value: 'other', label: t('lang.other') },
  ];
  const RACE_OPTIONS = [
    { value: '', label: '—' },
    { value: 'AFRICAN_AMERICAN',             label: t('race.AFRICAN_AMERICAN') },
    { value: 'AMERICAN_INDIAN_ALASKA_NATIVE', label: t('race.AMERICAN_INDIAN_ALASKA_NATIVE') },
    { value: 'ASIAN',                        label: t('race.ASIAN') },
    { value: 'NATIVE_HAWAIIAN',              label: t('race.NATIVE_HAWAIIAN') },
    { value: 'PACIFIC_ISLANDER',             label: t('race.PACIFIC_ISLANDER') },
    { value: 'WHITE',                        label: t('race.WHITE') },
    { value: 'OTHER',                        label: t('race.OTHER') },
    { value: 'PREFER_NOT_TO_SAY',            label: t('race.PREFER_NOT_TO_SAY') },
  ];
  const ETHNICITY_OPTIONS = [
    { value: '', label: '—' },
    { value: 'HISPANIC_LATINO',     label: t('ethnicity.HISPANIC_LATINO') },
    { value: 'NOT_HISPANIC_LATINO', label: t('ethnicity.NOT_HISPANIC_LATINO') },
    { value: 'PREFER_NOT_TO_SAY',   label: t('ethnicity.PREFER_NOT_TO_SAY') },
  ];
  const SEX_OPTIONS = [
    { value: '', label: '—' },
    { value: 'MALE',              label: t('sex.MALE') },
    { value: 'FEMALE',            label: t('sex.FEMALE') },
    { value: 'NON_BINARY',        label: t('sex.NON_BINARY') },
    { value: 'OTHER',             label: t('sex.OTHER') },
    { value: 'PREFER_NOT_TO_SAY', label: t('sex.PREFER_NOT_TO_SAY') },
  ];
  const MARITAL_OPTIONS = [
    { value: '', label: '—' },
    { value: 'SINGLE',    label: t('marital.SINGLE') },
    { value: 'MARRIED',   label: t('marital.MARRIED') },
    { value: 'DIVORCED',  label: t('marital.DIVORCED') },
    { value: 'WIDOWED',   label: t('marital.WIDOWED') },
    { value: 'SEPARATED', label: t('marital.SEPARATED') },
    { value: 'OTHER',     label: t('marital.OTHER') },
  ];
  const COMM_OPTIONS = [
    { value: '', label: '—' },
    { value: 'PHONE', label: t('comm.PHONE') },
    { value: 'EMAIL', label: t('comm.EMAIL') },
    { value: 'TEXT',  label: t('comm.TEXT') },
    { value: 'ANY',   label: t('comm.ANY') },
  ];
  const REFERRAL_OPTIONS = [
    { value: '', label: '—' },
    { value: 'LAW_FIRM',         label: t('referral.LAW_FIRM') },
    { value: 'WEB_SEARCH',       label: t('referral.WEB_SEARCH') },
    { value: 'ACCIDENT_CENTER',  label: t('referral.ACCIDENT_CENTER') },
    { value: 'FACEBOOK',         label: t('referral.FACEBOOK') },
    { value: 'FAMILY',           label: t('referral.FAMILY') },
    { value: 'GOOGLE',           label: t('referral.GOOGLE') },
    { value: 'GOOGLE_MAPS',      label: t('referral.GOOGLE_MAPS') },
    { value: 'INSTAGRAM',        label: t('referral.INSTAGRAM') },
    { value: 'WEBSITE',          label: t('referral.WEBSITE') },
    { value: 'CLINIC_STAFF',     label: t('referral.CLINIC_STAFF') },
    { value: 'CHIROPRACTOR',     label: t('referral.CHIROPRACTOR') },
    { value: 'REFERRAL',         label: t('referral.REFERRAL') },
    { value: 'PATIENT_REFERRAL', label: t('referral.PATIENT_REFERRAL') },
    { value: 'INSURANCE',        label: t('referral.INSURANCE') },
    { value: 'MEDICAL_INSURANCE',label: t('referral.MEDICAL_INSURANCE') },
    { value: 'TIKTOK',           label: t('referral.TIKTOK') },
    { value: 'OTHER',            label: t('referral.OTHER') },
  ];
  const GUARDIAN_OPTIONS = [
    { value: '', label: '—' },
    { value: 'FATHER',         label: t('guardianRelation.FATHER') },
    { value: 'MOTHER',         label: t('guardianRelation.MOTHER') },
    { value: 'LEGAL_GUARDIAN', label: t('guardianRelation.LEGAL_GUARDIAN') },
    { value: 'OTHER',          label: t('guardianRelation.OTHER') },
  ];
  const RELATION_OPTIONS = [
    { value: '',        label: '—' },
    { value: 'SPOUSE',  label: t('relation.SPOUSE') },
    { value: 'PARENT',  label: t('relation.PARENT') },
    { value: 'SIBLING', label: t('relation.SIBLING') },
    { value: 'CHILD',   label: t('relation.CHILD') },
    { value: 'FRIEND',  label: t('relation.FRIEND') },
    { value: 'OTHER',   label: t('relation.OTHER') },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-sm font-semibold hover:bg-brand/90 transition-colors shrink-0"
      >
        <UserPlus className="w-4 h-4" />
        {t('btnNewPatient')}
      </button>

      <ConfirmDialog
        open={confirmExit}
        variant="warning"
        title={t('confirmExitTitle')}
        description={t('confirmExitDesc')}
        confirmLabel={t('confirmExitYes')}
        cancelLabel={t('confirmExitCancel')}
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
              <UserPlus className="w-4 h-4 text-brand" />
              {t('btnNewPatient')}
            </DialogTitle>
            <DialogDescription className="text-text-muted text-xs">
              {t('createDialogSubtitle')}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5 space-y-5">

            {/* ══ Personal info ══ */}
            <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <User className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-text-1">{t('sectionPersonal')}</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input label={`${t('fieldFirstName')} *`} value={form.firstName} onChange={(v) => { set('firstName')(v); clearFieldError('firstName'); }} placeholder={t('fieldFirstName')} error={fieldErrors.firstName} />
                <FormField.Input label={`${t('fieldLastName')} *`}  value={form.lastName}  onChange={(v) => { set('lastName')(v);  clearFieldError('lastName');  }} placeholder={t('fieldLastName')}  error={fieldErrors.lastName} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input
                  label={t('fieldEmail')}
                  value={form.email}
                  onChange={(v) => { set('email')(v); clearFieldError('email'); if (emailError) validateEmail(v); }}
                  onBlur={() => validateEmail(form.email)}
                  placeholder="patient@email.com"
                  type="email"
                  error={fieldErrors.email || emailError}
                />
                <div className="space-y-1">
                  <FormField.Input label={t('fieldDOB')} value={form.dateOfBirth} onChange={(v) => { set('dateOfBirth')(v); clearFieldError('dateOfBirth'); }} type="date" error={fieldErrors.dateOfBirth} />
                  {age !== null && (
                    <p className={`text-[11px] ${isMinor ? 'text-amber font-semibold' : 'text-text-muted'}`}>
                      {isMinor ? t('ageMinor', { age }) : t('ageYears', { age })}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input label={t('fieldPhone')}  value={form.phone}  onChange={setPhone('phone')}  placeholder="(305) 000-0000" type="tel" />
                <FormField.Input label={t('fieldPhone2')} value={form.phone2} onChange={setPhone('phone2')} placeholder="(305) 000-0000" type="tel" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <LocationSelect
                  label={t('fieldState')}
                  value={form.addressState}
                  onChange={(v) => setForm(prev => ({ ...prev, addressState: v, addressCity: '' }))}
                  options={['Utah', ...US_STATES.filter(s => s.code !== 'UT').map(s => s.name)]}
                  placeholder={t('placeholderSelectState')}
                />
                <LocationSelect
                  label={t('fieldCity')}
                  value={form.addressCity}
                  onChange={(v) => setForm(prev => ({ ...prev, addressCity: v, addressZip: CITY_ZIP[v] ?? prev.addressZip }))}
                  options={form.addressState ? (CITIES_BY_STATE[US_STATES.find(s => s.name === form.addressState)?.code ?? ''] ?? []) : []}
                  placeholder={form.addressState ? t('placeholderSelectCity') : t('placeholderSelectStateFirst')}
                  disabled={!form.addressState}
                />
                <FormField.Input label={t('fieldZip')} value={form.addressZip} onChange={(v) => { set('addressZip')(v); clearFieldError('addressZip'); }} placeholder="e.g. 90210" error={fieldErrors.addressZip} />
              </div>

              <FormField.Input label={t('fieldAddress')} value={form.addressLine1} onChange={set('addressLine1')} placeholder="123 Main St, Apt 4B" />

              <FormField.Select label={t('fieldReferralSource')} value={form.referralSource} onChange={set('referralSource')} options={REFERRAL_OPTIONS} />
            </div>

            {/* ══ Clinical info ══ */}
            <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <Stethoscope className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-text-1">{t('sectionClinical')}</h3>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5 block">
                  {t('fieldAssignedDoctor')}
                </label>
                <ProviderSearch
                  value={form.providerReferrerId}
                  onChange={(id) => set('providerReferrerId')(id)}
                  placeholder={t('placeholderSearchDoctor')}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Input label={t('fieldEmployer')} value={form.employer}          onChange={set('employer')}          placeholder="e.g. Acme Corp" />
                <FormField.Input label={t('fieldPharmacy')} value={form.preferredPharmacy} onChange={set('preferredPharmacy')} placeholder={t('fieldPharmacy')} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Select label={t('fieldCommPref')} value={form.communicationPreference} onChange={set('communicationPreference')} options={COMM_OPTIONS} />
                <FormField.Input  label={t('fieldSSN')}      value={form.socialSecurityNumber}    onChange={set('socialSecurityNumber')}    placeholder="XXX-XX-XXXX" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField.Select label={t('fieldRace')}      value={form.race}      onChange={set('race')}      options={RACE_OPTIONS} />
                <FormField.Select label={t('fieldEthnicity')} value={form.ethnicity} onChange={set('ethnicity')} options={ETHNICITY_OPTIONS} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField.Select label={t('fieldSex')}     value={form.sex}               onChange={set('sex')}               options={SEX_OPTIONS} />
                <FormField.Select label={t('fieldLang')}    value={form.preferredLanguage} onChange={set('preferredLanguage')} options={LANG_OPTIONS} />
                <FormField.Select label={t('fieldMarital')} value={form.maritalStatus}     onChange={set('maritalStatus')}     options={MARITAL_OPTIONS} />
              </div>
            </div>

            {/* ══ Legal guardian (minors only) ══ */}
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
                  <FormField.Input  label={`${t('fieldGuardianName')} *`} value={form.guardianName}     onChange={(v) => { set('guardianName')(v); clearFieldError('guardianName'); }}     placeholder={t('fieldGuardianName')} error={fieldErrors.guardianName} />
                  <FormField.Select label={t('fieldGuardianRelation')}     value={form.guardianRelation} onChange={set('guardianRelation')} options={GUARDIAN_OPTIONS} />
                </div>
                <FormField.Input label={t('fieldGuardianPhone')} value={form.guardianPhone} onChange={setPhone('guardianPhone')} placeholder="(801) 555-0100" type="tel" />
              </div>
            )}

            {/* ══ Emergency contacts ══ */}
            <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <PhoneCall className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-text-1">{t('sectionEmergencyContacts')}</h3>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-3">{t('emergencyContact1')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField.Input  label={t('fieldName')}     value={form.emergencyContactName}     onChange={set('emergencyContactName')}       placeholder={t('fieldName')} />
                  <FormField.Input  label={t('fieldPhone')}    value={form.emergencyContactPhone}    onChange={setPhone('emergencyContactPhone')} placeholder="(305) 000-0000" type="tel" />
                  <FormField.Select label={t('fieldRelation')} value={form.emergencyContactRelation} onChange={set('emergencyContactRelation')}  options={RELATION_OPTIONS} />
                </div>
                {form.emergencyContactRelation === 'OTHER' && (
                  <div className="mt-2">
                    <FormField.Input label={t('fieldRelationOther')} value={form.emergencyContactRelationOther ?? ''} onChange={set('emergencyContactRelationOther')} placeholder={t('placeholderRelationOther')} />
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-3">{t('emergencyContact2')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField.Input  label={t('fieldName')}     value={form.emergency2Name}     onChange={set('emergency2Name')}       placeholder={t('fieldName')} />
                  <FormField.Input  label={t('fieldPhone')}    value={form.emergency2Phone}    onChange={setPhone('emergency2Phone')} placeholder="(305) 000-0000" type="tel" />
                  <FormField.Select label={t('fieldRelation')} value={form.emergency2Relation} onChange={set('emergency2Relation')}  options={RELATION_OPTIONS} />
                </div>
                {form.emergency2Relation === 'OTHER' && (
                  <div className="mt-2">
                    <FormField.Input label={t('fieldRelationOther')} value={form.emergency2RelationOther ?? ''} onChange={set('emergency2RelationOther')} placeholder={t('placeholderRelationOther')} />
                  </div>
                )}
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
            <Button onClick={handleCreate} disabled={saving} className="w-full sm:w-auto">
              {saving ? t('btnCreating') : t('btnNewPatient')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
