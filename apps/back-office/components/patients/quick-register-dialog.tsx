'use client';

/**
 * QuickRegisterDialog — registro rápido de paciente + caso desde la página Pacientes.
 * Crea el paciente y el caso en una sola transacción via POST /api/admin/cases.
 * Campos mínimos requeridos: nombre, apellido, fecha de nacimiento, tipo de caso.
 * Tres acciones: guardar y salir · guardar y enviar formulario · guardar y generar QR.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Car, Stethoscope, AlertCircle, QrCode, Send, Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button,
} from '@precision/ui';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}{required && <span className="text-rose ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT = 'w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted/50 outline-none focus:border-brand transition-colors';
const SELECT = `${INPUT} appearance-none`;

const REFERRAL_OPTIONS = [
  { value: 'WALK_IN',           label: 'Presentó en clínica' },
  { value: 'PHONE_CALL',        label: 'Llamada telefónica' },
  { value: 'LAW_FIRM',          label: 'Bufete de abogados' },
  { value: 'PATIENT_REFERRAL',  label: 'Referido por paciente' },
  { value: 'GOOGLE',            label: 'Google' },
  { value: 'GOOGLE_MAPS',       label: 'Google Maps' },
  { value: 'FACEBOOK',          label: 'Facebook' },
  { value: 'INSTAGRAM',         label: 'Instagram' },
  { value: 'TIKTOK',            label: 'TikTok' },
  { value: 'FAMILY',            label: 'Familiar' },
  { value: 'CHIROPRACTOR',      label: 'Quiropráctica' },
  { value: 'INSURANCE',         label: 'Seguro médico' },
  { value: 'OTHER',             label: 'Otro' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type SaveMode = 'exit' | 'form' | 'qr';

export function QuickRegisterDialog({ open, onOpenChange }: Props) {
  const router = useRouter();

  // Patient basics
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [dob,         setDob]         = useState('');
  const [phone,       setPhone]       = useState('');
  const [email,       setEmail]       = useState('');
  const [language,    setLanguage]    = useState('es');
  const [howFound,    setHowFound]    = useState('');
  const [referredBy,  setReferredBy]  = useState('');

  // Case info
  const [caseType,    setCaseType]    = useState<'MVA' | 'GENERAL'>('MVA');
  const [accidentDate, setAccidentDate] = useState('');
  const [lawFirm,     setLawFirm]     = useState('');
  const [attorney,    setAttorney]    = useState('');
  const [chiropractor,setChiropractor]= useState('');
  const [description, setDescription] = useState('');

  // UI
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function reset() {
    setFirstName(''); setLastName(''); setDob(''); setPhone('');
    setEmail(''); setLanguage('es'); setHowFound(''); setReferredBy('');
    setCaseType('MVA'); setAccidentDate(''); setLawFirm('');
    setAttorney(''); setChiropractor(''); setDescription('');
    setError('');
  }

  function validate() {
    if (!firstName.trim()) return 'El nombre es obligatorio.';
    if (!lastName.trim())  return 'El apellido es obligatorio.';
    if (!dob)              return 'La fecha de nacimiento es obligatoria.';
    return null;
  }

  async function handleSave(mode: SaveMode) {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError('');

    try {
      const dobIso = dob ? new Date(dob).toISOString() : null;
      const accIso = accidentDate ? new Date(accidentDate).toISOString() : null;

      const body = {
        patient: {
          firstName:         firstName.trim(),
          lastName:          lastName.trim(),
          phone:             phone.trim() || '0000000000',
          email:             email.trim() || null,
          dateOfBirth:       dobIso,
          preferredLanguage: language as 'es' | 'en',
        },
        accident: {
          date:  accIso,
          type:  caseType === 'MVA' ? 'AUTO' : 'OTHER',
          notes: description.trim() || null,
        },
        legal: {
          lawyerStatus:    'HAS' as const,
          lawFirmId:       null,
          caseManagerName: attorney.trim()    || null,
          firmPhone:       null,
        },
        insurance: { primaryInsuranceId: null },
        caseType:  caseType === 'MVA' ? 'MVA' : 'GENERAL',
        source:    (howFound || 'WALK_IN') as 'WALK_IN',
        formDelivery: mode === 'form' ? 'SEND_NOW' : null,
        consents: {
          hipaa: false, assignedParties: false,
          treatment: false, financial: false, medicalHistory: false,
          lawFirm: lawFirm.trim() || null,
          chiropractor: chiropractor.trim() || null,
        },
      };

      const res  = await fetch('/api/admin/cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.message ?? json.error ?? 'Error al crear el registro.');
        return;
      }

      reset();
      onOpenChange(false);
      router.refresh();

      if (mode === 'qr' && json.case?.id) {
        router.push(`/patients?qr=${json.case.id}`);
      }
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl p-0 max-h-[92vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-brand" />
            <DialogTitle className="text-base font-semibold text-text-1">
              Registro rápido de paciente
            </DialogTitle>
          </div>
          <DialogDescription className="text-[12px] text-text-muted mt-0.5">
            Crea el paciente y el caso con solo los datos que recepción necesita ahora.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Notice */}
          <div className="flex items-start gap-2.5 rounded-md border border-amber/30 bg-amber/8 px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-amber leading-snug">
              <strong>Campos obligatorios:</strong> nombre, apellido, fecha de nacimiento y tipo de caso.
              Todo lo demás se puede completar desde el formulario QR.
            </p>
          </div>

          {/* ── Sección 1: Datos básicos ────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-brand" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-1">
                Datos básicos del paciente
              </h3>
            </div>
            <p className="text-[11px] text-text-muted -mt-2">
              Datos demográficos usados con más frecuencia en recepción.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nombre" required>
                <input className={INPUT} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nombre del paciente" />
              </Field>
              <Field label="Apellido" required>
                <input className={INPUT} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Apellido del paciente" />
              </Field>
              <Field label="Fecha de nacimiento" required>
                <input type="date" className={INPUT} value={dob} onChange={e => setDob(e.target.value)} />
              </Field>
              <Field label="Teléfono">
                <input className={INPUT} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(000) 000-0000" />
              </Field>
              <Field label="Correo electrónico">
                <input type="email" className={INPUT} value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
              </Field>
              <Field label="Idioma preferido">
                <select className={SELECT} value={language} onChange={e => setLanguage(e.target.value)}>
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label="¿Cómo se enteró de nosotros?">
                <select className={SELECT} value={howFound} onChange={e => setHowFound(e.target.value)}>
                  <option value="">Seleccionar opción</option>
                  {REFERRAL_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="¿Quién lo refirió?">
                <input className={INPUT} value={referredBy} onChange={e => setReferredBy(e.target.value)} placeholder="Nombre de quien refirió" />
              </Field>
            </div>
          </div>

          {/* ── Sección 2: Información del caso ─────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-brand" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-1">
                Información del caso
              </h3>
            </div>
            <p className="text-[11px] text-text-muted -mt-2">
              GM solo necesita el tipo de caso. Los detalles de MVA son opcionales y pueden completarse después.
            </p>

            {/* Tipo de caso */}
            <div className="grid grid-cols-2 gap-3">
              {(['MVA', 'GENERAL'] as const).map(t => {
                const active = caseType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCaseType(t)}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm font-medium transition-all
                      ${active
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-border bg-bg-2 text-text-muted hover:border-brand/40'
                      }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0
                      ${active ? 'border-brand' : 'border-text-muted/40'}`}>
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-brand block" />}
                    </span>
                    {t === 'MVA'
                      ? <><Car className="w-3.5 h-3.5 shrink-0" /> MVA</>
                      : <><Stethoscope className="w-3.5 h-3.5 shrink-0" /> GM</>
                    }
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {caseType === 'MVA' && (
                <Field label="Fecha de accidente">
                  <input type="date" className={INPUT} value={accidentDate} onChange={e => setAccidentDate(e.target.value)} />
                </Field>
              )}
              <Field label="Bufete / fuente de referido">
                <input className={INPUT} value={lawFirm} onChange={e => setLawFirm(e.target.value)} placeholder="Nombre del bufete" />
              </Field>
              <Field label="Abogado preferido">
                <input className={INPUT} value={attorney} onChange={e => setAttorney(e.target.value)} placeholder="Nombre del abogado" />
              </Field>
              <Field label="Quiropráctica">
                <input className={INPUT} value={chiropractor} onChange={e => setChiropractor(e.target.value)} placeholder="Nombre del quiropráctica" />
              </Field>
            </div>

            <Field label="Descripción del caso">
              <textarea
                rows={3}
                className={INPUT}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe brevemente los síntomas y el accidente."
              />
            </Field>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-rose/30 bg-rose/10 px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-rose shrink-0" />
              <p className="text-[11.5px] text-rose">{error}</p>
            </div>
          )}
        </div>

        {/* Footer — 3 acciones */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Button
            variant="outline"
            onClick={() => { reset(); onOpenChange(false); }}
            disabled={saving}
            className="w-full sm:w-auto sm:mr-auto"
          >
            Cancelar
          </Button>

          <Button
            variant="outline"
            onClick={() => handleSave('exit')}
            disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Guardar y salir
          </Button>

          <Button
            variant="outline"
            onClick={() => handleSave('form')}
            disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Guardar y enviar formulario
          </Button>

          <Button
            onClick={() => handleSave('qr')}
            disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-cyan hover:bg-cyan/90 text-white border-cyan"
          >
            <QrCode className="w-3.5 h-3.5" />
            {saving ? 'Guardando...' : 'Guardar y generar QR'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
