'use client';

/**
 * QuickRegisterDialog — registro rápido de paciente + caso desde la página Pacientes.
 * Crea el paciente y el caso en una sola transacción via POST /api/admin/cases.
 * Campos mínimos requeridos: nombre, apellido, fecha de nacimiento, tipo de caso.
 * Tres acciones: guardar y salir · guardar y enviar formulario · guardar y generar QR.
 * GM oculta campos específicos de MVA (accidente, bufete, abogado, quiropráctica).
 * QR: muestra panel de éxito con código del caso y link del portal inline (sin cerrar).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  UserPlus, Car, Stethoscope, AlertCircle, QrCode, Send, Save,
  Check, Copy, ExternalLink, RotateCcw,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button,
} from '@precision/ui';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}{required && <span className="text-rose ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT  = 'w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted/50 outline-none focus:border-brand transition-colors';
const SELECT = `${INPUT} appearance-none`;

const REFERRAL_OPTIONS = [
  { value: 'WALK_IN',          label: 'Presentó en clínica' },
  { value: 'PHONE_CALL',       label: 'Llamada telefónica' },
  { value: 'LAW_FIRM',         label: 'Bufete de abogados' },
  { value: 'PATIENT_REFERRAL', label: 'Referido por paciente' },
  { value: 'GOOGLE',           label: 'Google' },
  { value: 'GOOGLE_MAPS',      label: 'Google Maps' },
  { value: 'FACEBOOK',         label: 'Facebook' },
  { value: 'INSTAGRAM',        label: 'Instagram' },
  { value: 'TIKTOK',           label: 'TikTok' },
  { value: 'FAMILY',           label: 'Familiar' },
  { value: 'CHIROPRACTOR',     label: 'Quiropráctica' },
  { value: 'INSURANCE',        label: 'Seguro médico' },
  { value: 'OTHER',            label: 'Otro' },
];

// ─── ReferredBy Select — lista de firmas cargada desde DB ────────────────────

function ReferredBySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [firms, setFirms] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/admin/lawyers/autocomplete')
      .then(r => r.json())
      .then(j => setFirms((j.results ?? []).map((f: { label: string }) => f.label)))
      .catch(() => {});
  }, []);

  return (
    <select
      className={SELECT}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">Seleccionar opción</option>
      {firms.map(f => (
        <option key={f} value={f}>{f}</option>
      ))}
      <option value="__otro__">Otro…</option>
    </select>
  );
}

// ─── QR Success panel ─────────────────────────────────────────────────────────

interface SuccessInfo {
  caseCode:    string;
  patientCode: string;
  patientName: string;
  caseId:      string;
  patientId:   string;
  portalUrl:   string;
}

function QrSuccessPanel({ info, onNewPatient, onClose }: {
  info: SuccessInfo;
  onNewPatient: () => void;
  onClose: () => void;
}) {
  const [copied,    setCopied]    = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(info.portalUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#e2e8f0', light: '#12141f' },
    }).then(setQrDataUrl).catch(() => {});
  }, [info.portalUrl]);

  function copyLink() {
    navigator.clipboard.writeText(info.portalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-caso-${info.caseCode}.png`;
    a.click();
  }

  return (
    <div className="flex flex-col items-center gap-5 py-6 px-4">
      {/* Success badge */}
      <div className="flex items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-4 py-1.5">
        <Check className="w-3.5 h-3.5 text-emerald" />
        <span className="text-[12px] font-medium text-emerald">Paciente registrado exitosamente</span>
      </div>

      {/* Info row */}
      <div className="flex gap-6 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Paciente</p>
          <p className="text-sm font-semibold text-text-1">{info.patientName}</p>
          <p className="text-[11px] text-brand font-mono">{info.patientCode}</p>
        </div>
        <div className="w-px bg-border" />
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Código del caso</p>
          <p className="text-sm font-semibold text-text-1 font-mono">{info.caseCode}</p>
        </div>
      </div>

      {/* QR real */}
      <div className="rounded-xl border border-border p-3 bg-[#12141f] flex flex-col items-center gap-2">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="QR del portal" width={188} height={188} className="rounded-lg" />
          : <div className="w-[188px] h-[188px] rounded-lg bg-bg-2 animate-pulse" />
        }
        <p className="text-[10px] text-text-muted text-center">Escanea para completar el formulario</p>
      </div>

      {/* Portal link + copiar */}
      <div className="w-full max-w-sm space-y-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-bg-2 px-3 py-2">
          <span className="flex-1 text-[11px] text-text-muted truncate font-mono">{info.portalUrl}</span>
          <button
            type="button"
            onClick={copyLink}
            className="text-text-muted hover:text-brand transition-colors shrink-0"
            title="Copiar link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <button
          type="button"
          onClick={downloadQr}
          disabled={!qrDataUrl}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-border bg-bg-2 px-3 py-2 text-[12px] text-text-2 hover:border-border-strong transition-colors disabled:opacity-40"
        >
          <QrCode className="w-3.5 h-3.5" />
          Descargar QR
        </button>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 w-full max-w-sm">
        <Button variant="outline" onClick={onNewPatient} className="flex-1 flex items-center justify-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" />
          Nuevo registro
        </Button>
        <Button
          onClick={() => window.open(`/patients/${info.patientId}`, '_blank')}
          className="flex-1 flex items-center justify-center gap-1.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Ver paciente
        </Button>
      </div>
      <button type="button" onClick={onClose} className="text-[12px] text-text-muted hover:text-text-1 transition-colors">
        Cerrar
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type SaveMode = 'exit' | 'form' | 'qr';

export function QuickRegisterDialog({ open, onOpenChange }: Props) {
  const router = useRouter();

  // Patient basics
  const [firstName,  setFirstName]  = useState('');
  const [lastName,   setLastName]   = useState('');
  const [dob,        setDob]        = useState('');
  const [phone,      setPhone]      = useState('');
  const [email,      setEmail]      = useState('');
  const [language,   setLanguage]   = useState('es');
  const [howFound,   setHowFound]   = useState('');
  const [referredBy, setReferredBy] = useState('');

  // Case info
  const [caseType,     setCaseType]     = useState<'MVA' | 'GENERAL'>('MVA');
  const [accidentDate, setAccidentDate] = useState('');
  const [lawFirm,      setLawFirm]      = useState('');
  const [attorney,     setAttorney]     = useState('');
  const [chiropractor, setChiropractor] = useState('');
  const [description,  setDescription]  = useState('');

  // UI state
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);

  const isMVA = caseType === 'MVA';

  function reset() {
    setFirstName(''); setLastName(''); setDob(''); setPhone('');
    setEmail(''); setLanguage('es'); setHowFound(''); setReferredBy('');
    setCaseType('MVA'); setAccidentDate(''); setLawFirm('');
    setAttorney(''); setChiropractor(''); setDescription('');
    setError(''); setSuccessInfo(null);
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
      const dobIso = dob ? new Date(dob + 'T12:00:00').toISOString() : null;
      const accIso = accidentDate ? new Date(accidentDate + 'T12:00:00').toISOString() : null;

      const res = await fetch('/api/admin/cases', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: {
            firstName:         firstName.trim(),
            lastName:          lastName.trim(),
            phone:             phone.trim() || '0000000000',
            email:             email.trim() || null,
            dateOfBirth:       dobIso,
            preferredLanguage: language as 'es' | 'en',
          },
          accident: {
            date:  isMVA ? accIso : null,
            type:  isMVA ? 'AUTO' : 'OTHER',
            notes: description.trim() || null,
          },
          legal: {
            lawyerStatus:    'HAS',
            lawFirmId:       null,
            caseManagerName: isMVA ? (attorney.trim() || null) : null,
            firmPhone:       null,
          },
          insurance:    { primaryInsuranceId: null },
          caseType:     isMVA ? 'MVA' : 'GENERAL',
          source:       (howFound || 'WALK_IN') as 'WALK_IN',
          formDelivery: mode === 'form' ? 'SEND_NOW' : null,
          consents: {
            hipaa: false, assignedParties: false,
            treatment: false, financial: false, medicalHistory: false,
            lawFirm:      isMVA ? (lawFirm.trim() || null) : null,
            chiropractor: isMVA ? (chiropractor.trim() || null) : null,
          },
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? json.error ?? 'Error al crear el registro.');
        return;
      }

      if (mode === 'qr') {
        // Generar token del portal y construir URL real
        const caseId = json.case?.id ?? '';
        let portalUrl = `/portal?case=${caseId}`;
        if (caseId) {
          const tokenRes = await fetch(`/api/admin/cases/${caseId}/generate-portal-token`, { method: 'POST' });
          const tokenJson = await tokenRes.json().catch(() => ({}));
          if (tokenJson.portalUrl) portalUrl = tokenJson.portalUrl;
        }
        setSuccessInfo({
          caseCode:    json.case?.caseCode       ?? '—',
          patientCode: json.patient?.patientCode ?? '—',
          patientName: `${firstName.trim()} ${lastName.trim()}`,
          caseId,
          patientId:   json.patient?.id          ?? '',
          portalUrl,
        });
      } else {
        // Refresh + cierre solo para guardar y salir / enviar formulario
        router.refresh();
        reset();
        onOpenChange(false);
      }
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl p-0 max-h-[92vh] flex flex-col">

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

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── QR Success Panel ─────────────────────────────────────────── */}
          {successInfo ? (
            <QrSuccessPanel
              info={successInfo}
              onNewPatient={reset}
              onClose={() => { router.refresh(); reset(); onOpenChange(false); }}
            />
          ) : (

            <div className="px-6 py-4 space-y-6">

              {/* Notice */}
              <div className="flex items-start gap-2.5 rounded-md border border-amber/30 bg-amber/[0.08] px-3 py-2.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-amber leading-snug">
                  <strong>Campos obligatorios:</strong> nombre, apellido, fecha de nacimiento y tipo de caso.
                  Todo lo demás se puede completar desde el formulario QR.
                </p>
              </div>

              {/* ── Sección 1: Datos básicos ─────────────────────────────── */}
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
                    <ReferredBySelect value={referredBy} onChange={setReferredBy} />
                    {referredBy === '__otro__' && (
                      <input
                        className={`${INPUT} mt-1.5`}
                        placeholder="Escribe el nombre..."
                        onChange={e => setReferredBy(e.target.value)}
                        autoFocus
                      />
                    )}
                  </Field>
                </div>
              </div>

              {/* ── Sección 2: Información del caso ──────────────────────── */}
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
                <Field label="Tipo de caso" required>
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
                </Field>

                {/* Campos solo MVA */}
                {isMVA && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Fecha de accidente">
                      <input type="date" className={INPUT} value={accidentDate} onChange={e => setAccidentDate(e.target.value)} />
                    </Field>
                    <Field label="Bufete / fuente de referido">
                      <input className={INPUT} value={lawFirm} onChange={e => setLawFirm(e.target.value)} placeholder="Nombre del bufete" />
                    </Field>
                    <Field label="Abogado preferido">
                      <input className={INPUT} value={attorney} onChange={e => setAttorney(e.target.value)} placeholder="Nombre del abogado" />
                    </Field>
                    <Field label="Quiropráctica">
                      <input className={INPUT} value={chiropractor} onChange={e => setChiropractor(e.target.value)} placeholder="Nombre del quiropráctico" />
                    </Field>
                  </div>
                )}

                <Field label="Descripción del caso">
                  <textarea
                    rows={3}
                    className={INPUT}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe brevemente los síntomas y el motivo de consulta."
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
          )}
        </div>

        {/* Footer — solo visible cuando no está en modo QR success */}
        {!successInfo && (
          <div className="px-4 sm:px-6 py-3 border-t border-border shrink-0 flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => { reset(); onOpenChange(false); }}
              disabled={saving}
              className="shrink-0"
            >
              Cancelar
            </Button>

            <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
              <Button
                variant="outline"
                onClick={() => handleSave('exit')}
                disabled={saving}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Guardar y </span>salir
              </Button>

              <Button
                variant="outline"
                onClick={() => handleSave('form')}
                disabled={saving}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Guardar y enviar </span>formulario
              </Button>

              <Button
                onClick={() => handleSave('qr')}
                disabled={saving}
                className="flex items-center gap-1.5 whitespace-nowrap bg-cyan hover:bg-cyan/90 text-white border-cyan"
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                {saving ? 'Guardando...' : <><span className="hidden sm:inline">Guardar y generar </span>QR</>}
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
