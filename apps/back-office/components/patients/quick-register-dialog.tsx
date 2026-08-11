'use client';

/**
 * QuickRegisterDialog — registro rápido de paciente + caso desde la página Pacientes.
 * Crea el paciente y el caso en una sola transacción via POST /api/admin/cases.
 * Campos mínimos requeridos: nombre, apellido, fecha de nacimiento, tipo de caso.
 * Tres acciones: guardar y salir · guardar y enviar formulario · guardar y generar QR.
 * GM oculta campos específicos de MVA (accidente, bufete, abogado, quiropráctica).
 * QR: muestra panel de éxito con código del caso y link del portal inline (sin cerrar).
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}{required && <span className="text-rose ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-rose mt-0.5">{error}</p>}
    </div>
  );
}

const INPUT  = 'w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand transition-colors';
const SELECT = `${INPUT} appearance-none`;

// ─── ReferredBy Select — lista de firmas cargada desde DB ────────────────────

function ReferredBySelect({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
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
      <option value="">{placeholder}</option>
      {firms.map(f => (
        <option key={f} value={f}>{f}</option>
      ))}
      <option value="__otro__">Otro…</option>
    </select>
  );
}

// ─── LawFirmAutocomplete ──────────────────────────────────────────────────────

interface FirmOption { id: string; label: string; subtitle: string; }

function LawFirmAutocomplete({
  firmId, firmName, onSelect, searchPlaceholder, addLabel, createLabel,
}: {
  firmId: string; firmName: string;
  onSelect: (id: string, name: string) => void;
  searchPlaceholder: string;
  addLabel: string;
  createLabel: string;
}) {
  const [query,    setQuery]    = useState(firmName);
  const [results,  setResults]  = useState<FirmOption[]>([]);
  const [open,     setOpen]     = useState(false);
  const [adding,   setAdding]   = useState(false);
  const [newName,  setNewName]  = useState('');
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(firmName); }, [firmName]);

  useEffect(() => {
    const q = query.trim();
    if (!q || firmId) { setResults([]); return; }
    const id = setTimeout(() => {
      fetch(`/api/admin/lawyers/autocomplete?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(j => setResults(j.results ?? []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(id);
  }, [query, firmId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function clear() { setQuery(''); onSelect('', ''); setResults([]); setAdding(false); }

  async function createFirm() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/lawyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'FIRM', firmName: newName.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.firm?.id) {
        onSelect(json.firm.id, newName.trim());
        setQuery(newName.trim());
        setAdding(false); setNewName(''); setOpen(false); setResults([]);
      }
    } catch { /* ignore */ } finally { setCreating(false); }
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          className={`${INPUT} pr-7`}
          value={query}
          placeholder={firmId ? '' : searchPlaceholder}
          readOnly={!!firmId}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (!firmId) setOpen(true); }}
        />
        {firmId && (
          <button type="button" onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-1 text-xs">✕</button>
        )}
      </div>
      {open && !firmId && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-bg-1 shadow-lg overflow-hidden">
          {results.map(f => (
            <button
              key={f.id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-bg-2 flex flex-col"
              onClick={() => { onSelect(f.id, f.label); setQuery(f.label); setOpen(false); setResults([]); }}
            >
              <span className="text-text-1">{f.label}</span>
              {f.subtitle && <span className="text-[11px] text-text-muted">{f.subtitle}</span>}
            </button>
          ))}
          {!adding && (
            <button type="button" className="w-full text-left px-3 py-2 text-[11px] text-brand-text hover:bg-bg-2 border-t border-border"
              onClick={() => setAdding(true)}>
              {addLabel}
            </button>
          )}
          {adding && (
            <div className="px-3 py-2 border-t border-border flex gap-2 items-center">
              <input
                autoFocus
                className={`${INPUT} flex-1 text-sm`}
                placeholder={searchPlaceholder}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createFirm(); if (e.key === 'Escape') setAdding(false); }}
              />
              <button type="button" disabled={creating} onClick={createFirm}
                className="shrink-0 text-[11px] bg-brand text-white px-2 py-1 rounded-md disabled:opacity-50">
                {creating ? '…' : createLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AttorneySelect — miembros del firm seleccionado ─────────────────────────

interface MemberOption { id: string; label: string; subtitle: string; }

function AttorneySelect({
  firmId, value, onChange, placeholder, selectPlaceholder,
}: {
  firmId: string; value: string; onChange: (v: string) => void;
  placeholder: string; selectPlaceholder: string;
}) {
  const [members, setMembers] = useState<MemberOption[]>([]);

  useEffect(() => {
    if (!firmId) { setMembers([]); return; }
    fetch(`/api/admin/lawyers/autocomplete?firmId=${firmId}`)
      .then(r => r.json())
      .then(j => setMembers(j.results ?? []))
      .catch(() => {});
  }, [firmId]);

  if (!firmId) {
    return (
      <input
        className={INPUT}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <select className={SELECT} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{selectPlaceholder}</option>
      {members.map(m => (
        <option key={m.id} value={m.label}>{m.label}{m.subtitle ? ` — ${m.subtitle}` : ''}</option>
      ))}
      <option value="__otro__">Otro…</option>
    </select>
  );
}

// ─── ProviderAutocomplete — buscar quiroprácticos / proveedores ───────────────

interface ProviderOption { id: string; label: string; }

function ProviderAutocomplete({
  value, onChange, placeholder,
}: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const [query,   setQuery]   = useState(value);
  const [results, setResults] = useState<ProviderOption[]>([]);
  const [open,    setOpen]    = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const id = setTimeout(() => {
      fetch(`/api/admin/providers?q=${encodeURIComponent(q)}&limit=10`)
        .then(r => r.json())
        .then(j => setResults((j.providers ?? j.data ?? []).map((p: { firstName?: string; lastName?: string; id: string }) => ({
          id: p.id,
          label: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
        }))))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        className={INPUT}
        value={query}
        placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-bg-1 shadow-lg overflow-hidden">
          {results.map(p => (
            <button
              key={p.id} type="button"
              className="w-full text-left px-3 py-2 text-sm text-text-1 hover:bg-bg-2"
              onClick={() => { onChange(p.label); setQuery(p.label); setOpen(false); setResults([]); }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const t = useTranslations('quickRegister');
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
    <div className="flex flex-col sm:flex-row gap-0 min-h-[420px]">

      {/* ── Columna izquierda: QR ─────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center gap-4 px-8 py-8 sm:w-72 shrink-0 bg-bg-2/40 border-b sm:border-b-0 sm:border-r border-border">
        <div className="flex items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-3 py-1">
          <Check className="w-3 h-3 text-emerald" />
          <span className="text-[11px] font-medium text-emerald">{t('qrRegistered')}</span>
        </div>

        <div className="rounded-xl border border-border p-3 bg-[#12141f] flex flex-col items-center gap-2">
          {qrDataUrl
            ? <img src={qrDataUrl} alt="QR" width={200} height={200} className="rounded-lg" />
            : <div className="w-[200px] h-[200px] rounded-lg bg-bg-1 animate-pulse" />
          }
          <p className="text-[10px] text-text-muted text-center">{t('qrScanHint')}</p>
        </div>

        <button
          type="button"
          onClick={downloadQr}
          disabled={!qrDataUrl}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-border bg-bg-1 px-3 py-1.5 text-[11px] text-text-2 hover:border-brand/40 hover:text-brand-text transition-colors disabled:opacity-40"
        >
          <QrCode className="w-3.5 h-3.5" />
          {t('qrDownload')}
        </button>
      </div>

      {/* ── Columna derecha: info + acciones ──────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-5 px-6 py-8">

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{t('qrPatient')}</p>
              <p className="text-base font-bold text-text-1">{info.patientName}</p>
              <p className="text-[11px] text-brand-text font-mono mt-0.5">{info.patientCode}</p>
            </div>
            <div className="h-px bg-border" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{t('qrCaseCode')}</p>
              <p className="text-lg font-bold text-text-1 font-mono tracking-wide">{info.caseCode}</p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('qrPortalLink')}</p>
          <div className="flex items-center gap-2 min-w-0 rounded-md border border-border bg-bg-2 px-3 py-2">
            <span className="flex-1 min-w-0 text-[11px] text-text-muted truncate font-mono">{info.portalUrl}</span>
            <button
              type="button"
              onClick={copyLink}
              className="text-text-muted hover:text-brand-text transition-colors shrink-0"
              title={t('qrCopyLink')}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          {copied && <p className="text-[10px] text-emerald">{t('qrCopied')}</p>}
        </div>

        <div className="flex-1" />

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onNewPatient} className="flex items-center justify-center gap-1.5 text-xs">
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              {t('qrNewRecord')}
            </Button>
            <Button
              onClick={() => window.open(`/patients/${info.patientId}`, '_blank')}
              className="flex items-center justify-center gap-1.5 text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              {t('qrViewPatient')}
            </Button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full text-[11px] text-text-muted hover:text-text-1 transition-colors py-1"
          >
            {t('qrClose')}
          </button>
        </div>

      </div>
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
  const t      = useTranslations('quickRegister');
  const router = useRouter();

  const REFERRAL_OPTIONS = [
    { value: 'WALK_IN',          label: t('referralWalkIn') },
    { value: 'PHONE_CALL',       label: t('referralPhone') },
    { value: 'LAW_FIRM',         label: t('referralLawFirm') },
    { value: 'PATIENT_REFERRAL', label: t('referralPatient') },
    { value: 'GOOGLE',           label: t('referralGoogle') },
    { value: 'GOOGLE_MAPS',      label: t('referralGoogleMaps') },
    { value: 'FACEBOOK',         label: t('referralFacebook') },
    { value: 'INSTAGRAM',        label: t('referralInstagram') },
    { value: 'TIKTOK',           label: t('referralTikTok') },
    { value: 'FAMILY',           label: t('referralFamily') },
    { value: 'CHIROPRACTOR',     label: t('referralChiro') },
    { value: 'INSURANCE',        label: t('referralInsurance') },
    { value: 'OTHER',            label: t('referralOther') },
  ];

  // Patient basics
  const [firstName,  setFirstName]  = useState('');
  const [lastName,   setLastName]   = useState('');
  const [dob,        setDob]        = useState('');
  const [phone,      setPhone]      = useState('');
  const [email,      setEmail]      = useState('');
  const [language,   setLanguage]   = useState('es');
  const [howFound,         setHowFound]         = useState('');
  const [howFoundOther,    setHowFoundOther]    = useState('');
  const [referredBy,       setReferredBy]       = useState('');
  const [referredByFreeText, setReferredByFreeText] = useState('');

  // Case info
  const [caseType,     setCaseType]     = useState<'MVA' | 'GENERAL'>('MVA');
  const [accidentDate, setAccidentDate] = useState('');
  const [lawFirmId,    setLawFirmId]    = useState('');
  const [lawFirm,      setLawFirm]      = useState('');
  const [attorney,     setAttorney]     = useState('');
  const [chiropractor, setChiropractor] = useState('');
  const [description,  setDescription]  = useState('');

  // UI state
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);

  const isMVA = caseType === 'MVA';

  function reset() {
    setFirstName(''); setLastName(''); setDob(''); setPhone('');
    setEmail(''); setLanguage('es'); setHowFound(''); setHowFoundOther(''); setReferredBy(''); setReferredByFreeText('');
    setCaseType('MVA'); setAccidentDate(''); setLawFirmId(''); setLawFirm('');
    setAttorney(''); setChiropractor(''); setDescription('');
    setError(''); setFieldErrors({}); setSuccessInfo(null);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    const today = new Date().toISOString().slice(0, 10);
    const minDOB = `${new Date().getFullYear() - 120}-01-01`;

    if (!firstName.trim()) errs.firstName = t('errFirstName');
    if (!lastName.trim())  errs.lastName  = t('errLastName');
    if (!dob) {
      errs.dob = t('errDob');
    } else if (dob > today) {
      errs.dob = t('errDobFuture');
    } else if (dob < minDOB) {
      errs.dob = t('errDobOld');
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = t('errEmail');
    if (phone.trim() && phone.replace(/\D/g, '').length < 10)
      errs.phone = t('errPhone');
    if (accidentDate && accidentDate > today)
      errs.accidentDate = t('errAccidentFuture');

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function clearFieldError(field: string) {
    setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  async function handleSave(mode: SaveMode) {
    if (!validate()) return;
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
            phone:             phone.replace(/\D/g, '') || null,
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
            lawFirmId:       isMVA ? (lawFirmId || null) : null,
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
            attorney:     isMVA ? (attorney.trim() || null) : null,
            chiropractor: isMVA ? (chiropractor.trim() || null) : null,
          },
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.error === 'INVALID_PAYLOAD' && json.details?.fieldErrors) {
          const fields = json.details.fieldErrors as Record<string, string[]>;
          const msgs = Object.entries(fields)
            .flatMap(([path, errs]) => errs.map(e => `${path}: ${e}`));
          setError(msgs.length ? msgs.join(' · ') : (json.message ?? 'Please check all required fields.'));
        } else {
          setError(json.message ?? 'An error occurred. Please try again.');
        }
        return;
      }

      if (mode === 'qr') {
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
        router.refresh();
        reset();
        onOpenChange(false);
      }
    } catch {
      setError('Network error. Please try again.');
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
            <UserPlus className="w-4 h-4 text-brand-text" />
            <DialogTitle className="text-base font-semibold text-text-1">
              {t('title')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[12px] text-text-muted mt-0.5">
            {t('subtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

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
                  {t('requiredNotice')}
                </p>
              </div>

              {/* ── Sección 1: Datos básicos ─────────────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-brand-text" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-1">
                    {t('sectionPatient')}
                  </h3>
                </div>
                <p className="text-[11px] text-text-muted -mt-2">
                  {t('sectionPatientSub')}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t('firstName')} required error={fieldErrors.firstName}>
                    <input
                      className={`${INPUT} ${fieldErrors.firstName ? 'border-rose' : ''}`}
                      value={firstName}
                      onChange={e => { setFirstName(e.target.value); clearFieldError('firstName'); }}
                      placeholder={t('firstName')}
                    />
                  </Field>
                  <Field label={t('lastName')} required error={fieldErrors.lastName}>
                    <input
                      className={`${INPUT} ${fieldErrors.lastName ? 'border-rose' : ''}`}
                      value={lastName}
                      onChange={e => { setLastName(e.target.value); clearFieldError('lastName'); }}
                      placeholder={t('lastName')}
                    />
                  </Field>
                  <Field label={t('dob')} required error={fieldErrors.dob}>
                    <input
                      type="date"
                      className={`${INPUT} [color-scheme:dark] ${fieldErrors.dob ? 'border-rose' : ''}`}
                      value={dob}
                      max={new Date().toISOString().split('T')[0]}
                      min={`${new Date().getFullYear() - 120}-01-01`}
                      onChange={e => { setDob(e.target.value); clearFieldError('dob'); }}
                    />
                  </Field>
                  <Field label={t('phone')} error={fieldErrors.phone}>
                    <input
                      className={`${INPUT} ${fieldErrors.phone ? 'border-rose' : ''}`}
                      value={phone}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        let fmt = digits;
                        if (digits.length > 6) fmt = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
                        else if (digits.length > 3) fmt = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
                        else if (digits.length > 0) fmt = `(${digits}`;
                        setPhone(fmt);
                        clearFieldError('phone');
                      }}
                      placeholder="(000) 000-0000"
                      maxLength={14}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label={t('email')} error={fieldErrors.email}>
                    <input
                      type="email"
                      className={`${INPUT} ${fieldErrors.email ? 'border-rose' : ''}`}
                      value={email}
                      onChange={e => { setEmail(e.target.value); clearFieldError('email'); }}
                      placeholder="name@example.com"
                    />
                  </Field>
                  <Field label={t('preferredLanguage')}>
                    <select className={SELECT} value={language} onChange={e => setLanguage(e.target.value)}>
                      <option value="es">{t('langEs')}</option>
                      <option value="en">{t('langEn')}</option>
                    </select>
                  </Field>
                  <Field label={t('howFound')}>
                    <select className={SELECT} value={howFound} onChange={e => { setHowFound(e.target.value); if (e.target.value !== 'OTHER') setHowFoundOther(''); }}>
                      <option value="">{t('selectOption')}</option>
                      {REFERRAL_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {howFound === 'OTHER' && (
                      <input
                        className={`${INPUT} mt-1.5`}
                        placeholder={t('specifyHowFound')}
                        value={howFoundOther}
                        onChange={e => setHowFoundOther(e.target.value)}
                        autoFocus
                      />
                    )}
                  </Field>
                  <Field label={t('referredBy')}>
                    <ReferredBySelect
                      value={referredBy}
                      onChange={v => { setReferredBy(v); if (v !== '__otro__') setReferredByFreeText(''); }}
                      placeholder={t('selectOption')}
                    />
                    {referredBy === '__otro__' && (
                      <input
                        className={`${INPUT} mt-1.5`}
                        placeholder={t('typeReferredBy')}
                        value={referredByFreeText}
                        onChange={e => setReferredByFreeText(e.target.value)}
                        autoFocus
                      />
                    )}
                  </Field>
                </div>
              </div>

              {/* ── Sección 2: Información del caso ──────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-brand-text" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-1">
                    {t('sectionCase')}
                  </h3>
                </div>
                <p className="text-[11px] text-text-muted -mt-2">
                  {t('sectionCaseSub')}
                </p>

                <Field label={t('caseType')} required>
                  <div className="grid grid-cols-2 gap-3">
                    {(['MVA', 'GENERAL'] as const).map(ct => {
                      const active = caseType === ct;
                      return (
                        <button
                          key={ct}
                          type="button"
                          onClick={() => setCaseType(ct)}
                          className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm font-medium transition-all
                            ${active
                              ? 'border-brand bg-brand/10 text-brand-text'
                              : 'border-border bg-bg-2 text-text-muted hover:border-brand/40'
                            }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0
                            ${active ? 'border-brand' : 'border-text-muted/40'}`}>
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-brand block" />}
                          </span>
                          {ct === 'MVA'
                            ? <><Car className="w-3.5 h-3.5 shrink-0" /> MVA</>
                            : <><Stethoscope className="w-3.5 h-3.5 shrink-0" /> GM</>
                          }
                        </button>
                      );
                    })}
                  </div>
                </Field>

                {isMVA && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label={t('accidentDate')} error={fieldErrors.accidentDate}>
                      <input
                        type="date"
                        className={`${INPUT} [color-scheme:dark] ${fieldErrors.accidentDate ? 'border-rose' : ''}`}
                        value={accidentDate}
                        max={new Date().toISOString().split('T')[0]}
                        onChange={e => { setAccidentDate(e.target.value); clearFieldError('accidentDate'); }}
                      />
                    </Field>
                    <Field label={t('lawFirm')}>
                      <LawFirmAutocomplete
                        firmId={lawFirmId}
                        firmName={lawFirm}
                        onSelect={(id, name) => { setLawFirmId(id); setLawFirm(name); setAttorney(''); }}
                        searchPlaceholder={t('searchFirm')}
                        addLabel={t('addNewFirm')}
                        createLabel={t('createFirm')}
                      />
                    </Field>
                    <Field label={t('attorney')}>
                      <AttorneySelect
                        firmId={lawFirmId}
                        value={attorney}
                        onChange={setAttorney}
                        placeholder={t('attorneyPlaceholder')}
                        selectPlaceholder={t('selectAttorney')}
                      />
                    </Field>
                    <Field label={t('chiropractor')}>
                      <ProviderAutocomplete
                        value={chiropractor}
                        onChange={setChiropractor}
                        placeholder={t('searchChiro')}
                      />
                    </Field>
                  </div>
                )}

                <Field label={t('caseDescription')}>
                  <textarea
                    rows={3}
                    className={INPUT}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={t('caseDescriptionPlaceholder')}
                  />
                </Field>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-rose/30 bg-rose/10 px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 text-rose shrink-0" />
                  <p className="text-[11.5px] text-rose">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!successInfo && (
          <div className="px-4 sm:px-6 py-3 border-t border-border shrink-0 flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => { reset(); onOpenChange(false); }}
              disabled={saving}
              className="shrink-0"
            >
              {t('cancel')}
            </Button>

            <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
              <Button
                variant="outline"
                onClick={() => handleSave('exit')}
                disabled={saving}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5 shrink-0" />
                {t('saveExit')}
              </Button>

              <Button
                variant="outline"
                onClick={() => handleSave('form')}
                disabled={saving}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                {t('saveForm')}
              </Button>

              <Button
                onClick={() => handleSave('qr')}
                disabled={saving}
                className="flex items-center gap-1.5 whitespace-nowrap bg-cyan hover:bg-cyan/90 text-white border-cyan"
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                {saving ? t('saving') : t('saveQr')}
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
