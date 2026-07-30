'use client';

import { useState, useCallback, useEffect, useRef, useTransition, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Pencil, Trash2, Users, Phone, PhoneCall, PhoneOutgoing, Mail, Calendar, Car, Shield, UserCheck, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, UserPlus, Briefcase, QrCode, CalendarDays, Download, Printer, Copy, Check, Stethoscope, CheckCircle2, MoreHorizontal, FolderOpen, FileText, CreditCard, ClipboardList, History, Camera, Upload, ImageOff, RefreshCw, Search, X as XIcon } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@precision/ui';
import { PersonAvatar, TagPill } from '@/components/ui-phoenix';
import { PatientEditDialog, type EditablePatient } from './patient-edit-dialog';
import { MedicalHistoryDialog } from './medical-history-dialog';
import { CaseWizardDialog } from '@/components/cases/case-wizard-dialog';
import { NewCaseDialog, type NewCaseInitialState } from '@/components/cases/new-case-dialog';
import { QuickRegisterDialog } from '@/components/patients/quick-register-dialog';
import { SendPortalDialog } from '@/components/cases/send-portal-dialog';
import QRCode from 'qrcode';

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length > 6) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  if (digits.length > 0) return `(${digits}`;
  return '';
}

function fmtLocalDate(d: Date | string | null | undefined, locale = 'en-US'): string {
  if (!d) return '—';
  const iso = typeof d === 'string' ? d : (d as Date).toISOString();
  const [y, mo, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Case action types ──────────────────────────────────────────────────────
interface CaseRow {
  id: string;
  caseCode: string;
  status: string;
  caseType: string | null;
  accidentType: string | null;
  accidentDate: string | null;
  accidentNotes: string | null;
  intakeFormCompletedAt: string | null;
  consentsData: Record<string, unknown> | null;
  hasIntakeSubmission?: boolean;
  firstAppointment: { scheduledFor: string } | null;
  lastAppointment:  { scheduledFor: string } | null;
}

const CASE_TYPE_LABEL: Record<string, string> = {
  MVA: 'MVA',
  GENERAL: 'GM',
  GENERAL_MEDICINE: 'GM',
  GM: 'GM',
  SELFPAY: 'Self-Pay',
  NURSING_HOME: 'Nursing Home',
};

type MissingKey =
  | 'missingPersonal'
  | 'missingEmergency'
  | 'missingDemographics'
  | 'missingAccident'
  | 'missingInsurance'
  | 'missingMedicalHistory'
  | 'missingConsents';

function MissingTooltip({ items, pct, missingLabel }: { items: string[]; pct?: number; missingLabel: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function handleEnter() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.top - 8, left: r.left });
  }

  if (!items.length) return null;

  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[10px] text-text-muted font-medium flex-shrink-0">{missingLabel}</span>
        <p className="text-[10px] text-text-muted truncate cursor-default select-none flex-1 min-w-0">
          {items.join(', ')}
        </p>
        {pct !== undefined && (
          <span className="text-[10px] text-text-muted tabular-nums flex-shrink-0">{pct}%</span>
        )}
      </div>
      {pos && (
        <div
          className="fixed z-[9999] w-max max-w-[240px] rounded-lg border border-border bg-bg-1 shadow-lg shadow-black/40 p-2.5 pointer-events-none -translate-y-full"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">{missingLabel}</p>
          <ul className="space-y-1">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[11px] text-text-2">
                <span className="w-1 h-1 rounded-full bg-rose flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function calcIntakeProgress(c: CaseRow, p: PatientRow): {
  pct: number; missingKeys: MissingKey[]; colorClass: string; barClass: string;
} {
  if (c.intakeFormCompletedAt) {
    return { pct: 100, missingKeys: [], colorClass: 'bg-emerald/10 text-emerald border-emerald/20', barClass: 'bg-emerald' };
  }
  const cd = (c.consentsData ?? {}) as Record<string, unknown>;
  const missingKeys: MissingKey[] = [];

  // 1. Info personal — dirección + fecha de nacimiento
  if (!p.addressLine1 || !p.addressCity || !p.dateOfBirth) missingKeys.push('missingPersonal');
  // 2. Contacto de emergencia
  if (!p.emergencyContactName) missingKeys.push('missingEmergency');
  // 3. Demografía — raza, sexo, estado civil
  if (!p.race || !p.sex || !p.maritalStatus) missingKeys.push('missingDemographics');
  // 4. Info del accidente — fecha registrada en el caso
  if (!c.accidentDate && !c.accidentType) missingKeys.push('missingAccident');
  // 5. Seguros — array no vacío en consentsData
  const ins = cd.insurances;
  if (!ins || !Array.isArray(ins) || ins.length === 0) missingKeys.push('missingInsurance');
  // 6. Historia médica — IntakeSubmission creado
  if (!c.hasIntakeSubmission) missingKeys.push('missingMedicalHistory');
  // 7. Consentimientos + firma
  const hasConsents = cd.hipaa && cd.treatment && cd.financial && cd.financialSignatureSvg;
  if (!hasConsents) missingKeys.push('missingConsents');

  const total = 7;
  const done  = total - missingKeys.length;
  const pct   = Math.round((done / total) * 100);

  const colorClass = pct === 100 ? 'bg-emerald/10 text-emerald border-emerald/20'
    : pct >= 57  ? 'bg-amber/10 text-amber border-amber/20'
    : 'bg-rose/10 text-rose border-rose/20';
  const barClass = pct === 100 ? 'bg-emerald' : pct >= 57 ? 'bg-amber' : 'bg-rose';

  return { pct, missingKeys, colorClass, barClass };
}

type TFunc = ReturnType<typeof useTranslations<'phoenix.patients'>>;

function formatProgress(prog: ReturnType<typeof calcIntakeProgress>, t: TFunc) {
  const { pct, missingKeys } = prog;
  const badge = pct === 100
    ? t('progressComplete')
    : t('progressIncomplete', { pct });
  const missingItems = missingKeys.map(k => t(k as Parameters<typeof t>[0]));
  const sub = missingItems.length > 0
    ? `${t('progressMissingLabel')} ${missingItems.join(', ')}`
    : '';
  return { badge, sub, missingItems };
}


interface AppointmentItem {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  type: string;
  status: string;
  notes: string | null;
  checkedInAt: string | null;
  attendanceSignedAt: string | null;
  clinic: { id: string; name: string };
  provider: { id: string; firstName: string; lastName: string; specialty: string | null } | null;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Denver' });
}

const APPT_STATUS_COLOR: Record<string, string> = {
  SCHEDULED:  'bg-brand/10 text-brand border-brand/20',
  CONFIRMED:  'bg-cyan/10 text-cyan border-cyan/20',
  CHECKED_IN: 'bg-emerald/10 text-emerald border-emerald/20',
  COMPLETED:  'bg-emerald/10 text-emerald border-emerald/20',
  CANCELLED:  'bg-rose/10 text-rose border-rose/20',
  NO_SHOW:    'bg-amber/10 text-amber border-amber/20',
};

// ── Law firm select (same as CaseWizardDialog) ────────────────────────────
interface LawFirmOption { id: string; label: string; }

function LawFirmSelectInline({ firmId, onChange }: {
  firmId: string | null;
  onChange: (label: string, id: string | null) => void;
}) {
  const [firms, setFirms] = useState<LawFirmOption[]>([]);
  useEffect(() => {
    fetch('/api/admin/lawyers/autocomplete').then(r => r.json()).then(j => setFirms(j.results ?? [])).catch(() => {});
  }, []);
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Firma de abogados</label>
      <select value={firmId ?? ''} onChange={e => {
        const sel = firms.find(f => f.id === e.target.value);
        onChange(sel?.label ?? '', sel?.id ?? null);
      }} className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 outline-none focus:border-brand appearance-none">
        <option value="">Nombre de la firma de abogados que refirió el caso médico...</option>
        {firms.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
    </div>
  );
}

// ── Case View Dialog ───────────────────────────────────────────────────────
interface CaseDetail {
  id: string; caseCode: string; caseType: string; status: string;
  accidentType: string | null; accidentDate: string | null;
  accidentLocation: string | null; accidentNotes: string | null;
  consentsData: Record<string, unknown> | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string };
  lawFirm: { id: string; firmName: string } | null;
  attorney: { id: string; firstName: string; lastName: string } | null;
  primaryInsurance: { id: string; name: string } | null;
  specialty: { id: string; name: string } | null;
}

const CASE_STATUS_LABEL: Record<string, string> = {
  NEW_REFERRAL:     'Nuevo referido', INTAKE_PENDING: 'Intake pendiente',
  INTAKE_COMPLETED: 'Intake completo', CONFIRMED: 'Confirmado',
  ACTIVE: 'Activo', MMI: 'MMI', CLOSED: 'Cerrado',
  SETTLED: 'Liquidado', ARCHIVED: 'Archivado', CANCELLED: 'Cancelado',
};
const CASE_STATUS_COLOR: Record<string, string> = {
  NEW_REFERRAL:     'bg-brand/10 text-[#4338CA] dark:text-[#818CF8] border-brand/20',
  INTAKE_PENDING:   'bg-amber/10 text-amber border-amber/20',
  INTAKE_COMPLETED: 'bg-cyan/10 text-cyan border-cyan/20',
  CONFIRMED:        'bg-cyan/10 text-cyan border-cyan/20',
  ACTIVE:           'bg-emerald/10 text-emerald border-emerald/20',
  MMI:              'bg-violet/10 text-violet border-violet/20',
  CLOSED:           'bg-text-muted/10 text-text-muted border-text-muted/20',
  SETTLED:          'bg-emerald/10 text-emerald border-emerald/20',
  ARCHIVED:         'bg-text-muted/10 text-text-muted border-text-muted/20',
  CANCELLED:        'bg-rose/10 text-rose border-rose/20',
};

function fmtIsoDate(iso: string | null | undefined, locale = 'en-US'): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

function CaseViewDialog({ caseId, open, onClose, onEdit }: {
  caseId: string; open: boolean; onClose: () => void; onEdit: () => void;
}) {
  const t      = useTranslations('phoenix.patients');
  const tWiz   = useTranslations('caseWizard');
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}`)
      .then(r => r.json())
      .then(j => setDetail(j.case ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, caseId]);

  const cd = detail?.consentsData as Record<string, string> | null;
  const lawFirmName    = detail?.lawFirm?.firmName ?? (cd?.lawFirm as string | undefined) ?? null;
  const chiropractor   = (cd?.chiropractor as string | undefined) ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-brand" />
            {detail?.caseCode ?? 'Caso'}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            {detail?.patient ? `${detail.patient.firstName} ${detail.patient.lastName}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-2">
            {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-md bg-bg-2 animate-pulse" />)}
          </div>
        )}

        {!loading && detail && (
          <div className="space-y-4">
            {/* Status + type */}
            <div className="flex items-center gap-2 flex-wrap">
              <TagPill label={t(`caseStatus.${detail.status}` as Parameters<typeof t>[0]) ?? detail.status} colorClass={CASE_STATUS_COLOR[detail.status] ?? 'bg-bg-2 text-text-2 border-border'} />
              <span className="text-[11px] text-text-muted border border-border rounded px-1.5 py-0.5">{detail.caseType}</span>
              {detail.specialty && <span className="text-[11px] text-text-muted">{detail.specialty.name}</span>}
            </div>

            {/* Case info */}
            <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('caseInfoTitle')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-[12.5px]">
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelType')}</span><span className="text-text-1 font-medium">{detail.caseType}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelStatus')}</span><span className="text-text-1">{t(`caseStatus.${detail.status}` as Parameters<typeof t>[0]) ?? detail.status}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelCreated')}</span><span className="text-text-1">{fmtIsoDate(detail.createdAt)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelAccident')}</span><span className="text-text-1">{fmtIsoDate(detail.accidentDate)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelAttorney')}</span><span className="text-text-1">{detail.attorney ? `${detail.attorney.firstName} ${detail.attorney.lastName}` : t('caseNotSpecified')}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelChiro')}</span><span className="text-text-1">{chiropractor ?? t('caseNotSpecified')}</span></div>
              </div>
              {detail.accidentNotes && (
                <div className="pt-1 border-t border-border/40">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{t('caseLabelDesc')}</p>
                  <p className="text-[12.5px] text-text-2">{detail.accidentNotes}</p>
                </div>
              )}
            </div>

            {/* Law firm */}
            <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('caseLabelLawFirm')}</p>
              </div>
              {lawFirmName ? (
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-3 py-2.5">
                  <p className="text-[12.5px] text-text-1 font-medium">{lawFirmName}</p>
                </div>
              ) : (
                <p className="text-[12px] text-text-muted italic">{t('caseNoLawFirm')}</p>
              )}
            </div>

            {/* Insurance */}
            <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('caseLabelInsurance')}</p>
              {detail.primaryInsurance ? (
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-3 py-2.5">
                  <p className="text-[12.5px] text-text-1 font-medium">{detail.primaryInsurance.name}</p>
                </div>
              ) : (
                <p className="text-[12px] text-text-muted italic">{t('caseNoInsurance')}</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>{t('btnClose')}</Button>
          <Button className="w-full sm:w-auto" onClick={() => { onClose(); onEdit(); }}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> {t('caseEditBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Case Edit Dialog — replica wizard step 1 ──────────────────────────────
function isoToDisp(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
}
function dispToIso(disp: string): string {
  const c = disp.replace(/\D/g, '');
  if (c.length < 8) return '';
  return `${c.slice(4, 8)}-${c.slice(0, 2)}-${c.slice(2, 4)}`;
}
function fmtDateInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
  return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
}

function CaseEditDialog({ caseId, open, onClose, onSaved }: {
  caseId: string; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const tWiz   = useTranslations('caseWizard');
  const [detail, setDetail]     = useState<CaseDetail | null>(null);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const [caseType, setCaseType]       = useState<'MVA' | 'GENERAL'>('MVA');
  const [accDateDisp, setAccDateDisp] = useState('');
  const [description, setDescription] = useState('');
  const [lawFirmId, setLawFirmId]     = useState<string | null>(null);
  const [lawFirmLabel, setLawFirmLabel] = useState('');
  const [attorney, setAttorney]       = useState('');
  const [chiropractor, setChiropractor] = useState('');

  const isMVA = caseType === 'MVA';

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}`)
      .then(r => r.json())
      .then(j => {
        const c: CaseDetail = j.case;
        if (!c) return;
        setDetail(c);
        setCaseType((c.caseType === 'MVA' ? 'MVA' : 'GENERAL') as 'MVA' | 'GENERAL');
        setAccDateDisp(c.accidentDate?.slice(0, 10) ?? '');
        setDescription(c.accidentNotes ?? '');
        setLawFirmId(c.lawFirm?.id ?? null);
        setLawFirmLabel(c.lawFirm?.firmName ?? '');
        const cd = (c.consentsData ?? {}) as Record<string, string>;
        setAttorney((cd.attorney as string | undefined) ?? '');
        setChiropractor((cd.chiropractor as string | undefined) ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, caseId]);

  async function handleSave() {
    setSaving(true);
    setError('');
    const accidentDate = accDateDisp || null;
    try {
      const res = await fetch(`/api/admin/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseType,
          accidentDate,
          accidentNotes: description || null,
          lawFirmId: lawFirmId || null,
          lawFirmLabel: lawFirmLabel || null,
          chiropractor: chiropractor || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.message ?? 'Error al guardar.'); return; }
      onSaved();
      onClose();
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <Pencil className="w-4 h-4 text-brand" />
            Editar caso {detail?.caseCode ?? ''}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            {detail?.patient ? `${detail.patient.firstName} ${detail.patient.lastName}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-2">
            {[1,2,3,4].map(i => <div key={i} className="h-11 rounded-md bg-bg-2 animate-pulse" />)}
          </div>
        )}

        {!loading && (
          <div className="space-y-5 py-1">
            {/* Tipo de caso — same cards as wizard */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">{tWiz('caseType')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([['MVA', tWiz('caseTypeMVA'), Car], ['GENERAL', tWiz('caseTypeGM'), Stethoscope]] as const).map(([val, label, Icon]) => (
                  <button key={val} type="button" onClick={() => setCaseType(val)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm text-left transition-all ${
                      caseType === val ? 'border-brand bg-brand/10 text-brand font-medium' : 'border-border bg-bg-2/40 text-text-muted hover:border-brand/40'
                    }`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                    {caseType === val && <Check className="w-3.5 h-3.5 ml-auto text-brand" />}
                  </button>
                ))}
              </div>
            </div>

            {/* MVA-only fields */}
            {isMVA && (
              <>
                {/* Fecha del accidente */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Fecha del accidente</label>
                  <input type="date"
                    value={accDateDisp}
                    onChange={e => setAccDateDisp(e.target.value)}
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 outline-none focus:border-brand [color-scheme:dark]"
                  />
                </div>

                {/* Descripción */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Descripción del accidente</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                    placeholder="Describe brevemente los síntomas y el accidente."
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand resize-none"
                  />
                </div>

                {/* Firma de abogados */}
                <LawFirmSelectInline
                  firmId={lawFirmId}
                  onChange={(label, id) => { setLawFirmLabel(label); setLawFirmId(id); }}
                />

                {/* Abogado + Quiropráctico */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Abogado representante</label>
                    <input type="text" value={attorney} onChange={e => setAttorney(e.target.value)}
                      placeholder="Nombre del abogado"
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Quiropráctico tratante</label>
                    <input type="text" value={chiropractor} onChange={e => setChiropractor(e.target.value)}
                      placeholder="Nombre del quiropráctico"
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand"
                    />
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── QR Dialog ──────────────────────────────────────────────────────────────
function CaseQrDialog({ caseId, caseCode, open, onClose }: {
  caseId: string; caseCode: string; open: boolean; onClose: () => void;
}) {
  const [portalUrl, setPortalUrl]   = useState('');
  const [qrDataUrl, setQrDataUrl]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [copied, setCopied]         = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}/generate-portal-token`, { method: 'POST' })
      .then(r => r.json())
      .then(async (j) => {
        if (j.portalUrl) {
          setPortalUrl(j.portalUrl);
          const url = await QRCode.toDataURL(j.portalUrl, {
            width: 220, margin: 2,
            color: { dark: '#e2e8f0', light: '#12141f' },
          });
          setQrDataUrl(url);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, caseId]);

  function handleCopy() {
    navigator.clipboard.writeText(portalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-caso-${caseCode}.png`;
    a.click();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-brand" />
            Patient Access
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs font-mono">
            Case #{caseCode}
          </DialogDescription>
        </DialogHeader>

        <p className="text-[11px] text-text-muted leading-relaxed -mt-1">
          Share this QR code or link with the patient so they can securely complete
          or update their registration information.
        </p>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-[220px] h-[220px] rounded-lg bg-bg-2 animate-pulse" />
          </div>
        )}

        {!loading && portalUrl && (
          <>
            <div className="flex items-center gap-2 rounded-md bg-bg-2 border border-border px-3 py-2">
              <span className="text-[11px] text-text-2 truncate flex-1 font-mono">{portalUrl}</span>
              <button
                onClick={handleCopy}
                className="p-1 rounded text-text-muted hover:text-brand transition-colors shrink-0"
                title="Copy link"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {qrDataUrl && (
              <div className="flex justify-center">
                <img src={qrDataUrl} alt="QR Code" className="rounded-lg w-[220px] h-[220px]" />
              </div>
            )}
          </>
        )}

        {!loading && !portalUrl && (
          <div className="text-[11px] text-rose text-center py-4">Could not generate the link.</div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Close</Button>
          {qrDataUrl && (
            <Button className="w-full sm:w-auto" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5 mr-1" /> Download QR
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Appointments Dialog ────────────────────────────────────────────────────
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Denver' });
}
function addMinutes(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Denver' });
}
function fmtApptDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/Denver' });
}

function CaseAppointmentsDialog({ caseId, caseCode, open, onClose }: {
  caseId: string; caseCode: string; open: boolean; onClose: () => void;
}) {
  const t = useTranslations('phoenix.patients');
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading]           = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}/appointments`)
      .then(r => r.json())
      .then(j => setAppointments(j.appointments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, caseId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-brand" />
            {t('apptDialogTitle')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            {t('apptDialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="space-y-2 p-4">
              {[1,2,3].map(i => <div key={i} className="h-10 rounded bg-bg-2 animate-pulse" />)}
            </div>
          )}

          {!loading && appointments.length === 0 && (
            <div className="text-center py-12 text-text-muted">
              <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">{t('apptNoResults')}</p>
            </div>
          )}

          {!loading && appointments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-2 border-b border-border">
                  <tr>
                    {[t('apptColDate'),t('apptColStart'),t('apptColEnd'),t('apptColStatus'),t('apptColSigned'),t('apptColCheckin'),t('apptColCheckout'),t('apptColDoctor'),t('apptColSpecialty'),t('apptColActions')].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {appointments.map(a => (
                    <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">{fmtApptDate(a.scheduledFor)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">{fmtTime(a.scheduledFor)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">{addMinutes(a.scheduledFor, a.durationMinutes)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <TagPill label={a.status === 'SCHEDULED' ? 'Pending' : a.status} colorClass={APPT_STATUS_COLOR[a.status] ?? 'bg-bg-2 text-text-2 border-border'} />
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-text-muted whitespace-nowrap">
                        {a.attendanceSignedAt ? <span className="text-emerald">✓ Signed</span> : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] whitespace-nowrap">
                        {a.checkedInAt ? <span className="text-emerald text-[10px]">✓</span> : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-text-muted whitespace-nowrap">—</td>
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">
                        {a.provider ? `${a.provider.firstName} ${a.provider.lastName}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-text-muted whitespace-nowrap">
                        {a.provider?.specialty ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { onClose(); router.push(`/triage/${a.id}`); }}
                            className="p-1.5 rounded text-text-muted hover:text-emerald hover:bg-emerald/10 transition-colors"
                            title="View detail"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { onClose(); router.push(`/triage/${a.id}`); }}
                            className="p-1.5 rounded text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                            title="Edit / Triage"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                            title="Forms"
                          >
                            <CalendarDays className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded text-text-muted hover:text-amber hover:bg-amber/10 transition-colors"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-bg-1">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span>Rows per page</span>
            <select className="bg-bg-2 border border-border rounded px-2 py-1 text-[11px] text-text-1 focus:outline-none">
              <option>10</option>
              <option>25</option>
            </select>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-text-muted">
            <span>Page 1 of 1</span>
            <div className="flex gap-1 ml-2">
              {['«','‹','›','»'].map(s => (
                <button key={s} disabled className="w-7 h-7 rounded border border-border text-text-muted disabled:opacity-30 hover:border-brand hover:text-brand transition-colors text-xs">
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_COLORS: Record<string, string> = {
  NEW:        'bg-brand/15 text-[#4338CA] dark:text-[#818CF8] border-brand/30',
  ACTIVE:     'bg-emerald/15 text-emerald border-emerald/30',
  COMPLETED:  'bg-cyan/15 text-cyan border-cyan/30',
  DISCHARGED: 'bg-amber/15 text-amber border-amber/30',
  INACTIVE:   'bg-text-muted/15 text-text-muted border-text-muted/30',
};

// STATUS_LABEL is now computed inside PatientsClient using t()

export interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  patientCode: string | null;
  status: string;
  preferredLanguage: string | null;
  sex: string | null;
  maritalStatus: string | null;
  employer: string | null;
  preferredPharmacy: string | null;
  communicationPreference: string | null;
  referralSource: string | null;
  race: string | null;
  ethnicity: string | null;
  socialSecurityNumber: string | null;
  addressLine1: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  emergency2Name: string | null;
  emergency2Phone: string | null;
  emergency2Relation: string | null;
  dateOfBirth: Date | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelation: string | null;
  accidentDate: Date | null;
  accidentType: string | null;
  insuranceCarrier: string | null;
  policyNumber: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  medicalHistory: any;
  createdAt: Date;
  updatedAt: Date;
  latestCase: {
    id: string;
    caseCode: string;
    caseType: string;
    accidentDate: string | null;
    status: string;
    portalToken: string | null;
    intakeFormSentAt: string | null;
    intakeFormCompletedAt: string | null;
    consentsData: Record<string, unknown> | null;
    hasIntakeSubmission: boolean;
  } | null;
  caseCount: number;
}

interface Props {
  patients: PatientRow[];
  q?: string;
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  specialties: Array<{ id: string; name: string; color: string }>;
  clinics: Array<{ id: string; name: string; address: string | null }>;
  providers: Array<{ id: string; firstName: string; lastName: string; specialty: string }>;
  inactiveOnly?: boolean;
  inactiveTotal?: number;
  activeTotal?: number;
  agentName?: string;
  /**
   * Portal médico: limita la vista a los pacientes del doctor de sesión.
   * Oculta acciones administrativas (crear/archivar/enviar portal) y las
   * URLs internas usan basePath. La búsqueda server-side también se filtra.
   */
  scopeProviderId?: string;
  /** Prefijo de rutas para navegación/paginación (default '/patients') */
  basePath?: string;
}


// ── InsuranceEntry (mismo tipo que forms wizard) ──────────────────────────
type InsuranceEntry = {
  id: string; insType: 'MEDICAL' | 'AUTO';
  carrier: string; policyId: string; holderName: string; groupNum: string;
  holderDOB: string; holderRelation: string; effectiveDate: string;
  copay: string; deductible: string;
  lossDate: string; pipAvailable: string; claimNum: string;
  adjusterName: string; adjusterPhone: string; adjusterFax: string;
  adjusterPhone2: string; adjusterEmail: string; comments: string;
  fullLien: boolean; lienComments: string;
};

function emptyInsEntry(insType: 'MEDICAL' | 'AUTO'): InsuranceEntry {
  return {
    id: Math.random().toString(36).slice(2),
    insType, carrier: '', policyId: '', holderName: '', groupNum: '',
    holderDOB: '', holderRelation: '', effectiveDate: '', copay: '', deductible: '',
    lossDate: '', pipAvailable: '', claimNum: '', adjusterName: '', adjusterPhone: '',
    adjusterFax: '', adjusterPhone2: '', adjusterEmail: '', comments: '',
    fullLien: false, lienComments: '',
  };
}

const insLabel = 'text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5';
const insInput = 'w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand';

function NuevoSeguroDialog({ onClose, onSave }: {
  onClose: () => void;
  onSave: (entry: InsuranceEntry) => void;
}) {
  const t = useTranslations('phoenix.patients');
  const [tab, setTab] = useState<'MEDICAL' | 'AUTO'>('MEDICAL');
  const [entry, setEntry] = useState<InsuranceEntry>(() => emptyInsEntry('MEDICAL'));
  const [errors, setErrors] = useState<Partial<Record<keyof InsuranceEntry, string>>>({});

  const today = new Date().toISOString().split('T')[0];
  const minDOB = `${new Date().getFullYear() - 120}-01-01`;

  function switchTab(tp: 'MEDICAL' | 'AUTO') { setTab(tp); setEntry(emptyInsEntry(tp)); setErrors({}); }
  function set(k: keyof InsuranceEntry, v: string | boolean) {
    setEntry(prev => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors(prev => ({ ...prev, [k]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof InsuranceEntry, string>> = {};
    if (!entry.carrier.trim()) e.carrier = t('segurosErrRequired');
    if (!entry.policyId.trim()) {
      e.policyId = t('segurosErrRequired');
    } else if (!/^[a-zA-Z0-9\-]{4,30}$/.test(entry.policyId.trim())) {
      e.policyId = t('segurosErrPolicyFormat');
    }
    if (tab === 'MEDICAL') {
      if (!entry.holderRelation.trim()) e.holderRelation = t('segurosErrRequired');
      if (!entry.effectiveDate) e.effectiveDate = t('segurosErrRequired');
      if (entry.holderDOB && entry.holderDOB < minDOB) e.holderDOB = t('segurosErrDOBRange');
      const copayVal = parseFloat(entry.copay);
      if (entry.copay && (isNaN(copayVal) || copayVal < 0 || copayVal > 999999)) e.copay = t('segurosErrAmount');
      const dedVal = parseFloat(entry.deductible);
      if (entry.deductible && (isNaN(dedVal) || dedVal < 0 || dedVal > 999999)) e.deductible = t('segurosErrAmount');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() { if (validate()) { onSave(entry); onClose(); } }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-brand" /> {t('segurosNewTitle')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">{t('segurosNewDesc')}</DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex px-6 pt-4 gap-2 shrink-0">
          {(['MEDICAL', 'AUTO'] as const).map(tp => (
            <button key={tp} onClick={() => switchTab(tp)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === tp ? 'bg-brand text-white' : 'bg-bg-2 text-text-2 hover:bg-bg-2/80 border border-border'}`}
            >
              {tp === 'MEDICAL' ? t('segurosTabMedico') : t('segurosTabAuto')}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {tab === 'MEDICAL' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={insLabel}>{t('segurosCarrier')} <span className="text-rose">*</span></label>
                  <input className={`${insInput} ${errors.carrier ? 'border-rose' : ''}`} value={entry.carrier} onChange={e => set('carrier', e.target.value)} />
                  {errors.carrier && <p className="text-[11px] text-rose mt-1">{errors.carrier}</p>}
                </div>
                <div>
                  <label className={insLabel}>{t('segurosPolicyId')} <span className="text-rose">*</span></label>
                  <input className={`${insInput} ${errors.policyId ? 'border-rose' : ''}`} value={entry.policyId} onChange={e => set('policyId', e.target.value)} />
                  {errors.policyId && <p className="text-[11px] text-rose mt-1">{errors.policyId}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={insLabel}>{t('segurosHolderName')}</label><input className={insInput} value={entry.holderName} onChange={e => set('holderName', e.target.value)} /></div>
                <div><label className={insLabel}>{t('segurosGroupNum')}</label><input className={insInput} value={entry.groupNum} onChange={e => set('groupNum', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={insLabel}>{t('segurosHolderDOB')}</label>
                  <input
                    type="date"
                    min={minDOB}
                    max={today}
                    className={`${insInput} [color-scheme:dark] ${errors.holderDOB ? 'border-rose' : ''}`}
                    value={entry.holderDOB}
                    onChange={e => set('holderDOB', e.target.value)}
                  />
                  {errors.holderDOB && <p className="text-[11px] text-rose mt-1">{errors.holderDOB}</p>}
                </div>
                <div>
                  <label className={insLabel}>{t('segurosHolderRelation')} <span className="text-rose">*</span></label>
                  <input className={`${insInput} ${errors.holderRelation ? 'border-rose' : ''}`} value={entry.holderRelation} onChange={e => set('holderRelation', e.target.value)} />
                  {errors.holderRelation && <p className="text-[11px] text-rose mt-1">{errors.holderRelation}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={insLabel}>{t('segurosEffectiveDate')} <span className="text-rose">*</span></label>
                  <input
                    type="date"
                    className={`${insInput} [color-scheme:dark] ${errors.effectiveDate ? 'border-rose' : ''}`}
                    value={entry.effectiveDate}
                    onChange={e => set('effectiveDate', e.target.value)}
                  />
                  {errors.effectiveDate && <p className="text-[11px] text-rose mt-1">{errors.effectiveDate}</p>}
                </div>
                <div>
                  <label className={insLabel}>{t('segurosCopay')}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm select-none">$</span>
                    <input
                      type="number"
                      min="0"
                      max="999999"
                      step="0.01"
                      className={`${insInput} pl-7 ${errors.copay ? 'border-rose' : ''}`}
                      placeholder="0.00"
                      value={entry.copay}
                      onChange={e => set('copay', e.target.value)}
                    />
                  </div>
                  {errors.copay && <p className="text-[11px] text-rose mt-1">{errors.copay}</p>}
                </div>
                <div>
                  <label className={insLabel}>{t('segurosDeductible')}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm select-none">$</span>
                    <input
                      type="number"
                      min="0"
                      max="999999"
                      step="0.01"
                      className={`${insInput} pl-7 ${errors.deductible ? 'border-rose' : ''}`}
                      placeholder="0.00"
                      value={entry.deductible}
                      onChange={e => set('deductible', e.target.value)}
                    />
                  </div>
                  {errors.deductible && <p className="text-[11px] text-rose mt-1">{errors.deductible}</p>}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={insLabel}>{t('segurosCarrier')} <span className="text-rose">*</span></label>
                  <input className={`${insInput} ${errors.carrier ? 'border-rose' : ''}`} value={entry.carrier} onChange={e => set('carrier', e.target.value)} />
                  {errors.carrier && <p className="text-[11px] text-rose mt-1">{errors.carrier}</p>}
                </div>
                <div>
                  <label className={insLabel}>{t('segurosPolicyId')} <span className="text-rose">*</span></label>
                  <input className={`${insInput} ${errors.policyId ? 'border-rose' : ''}`} value={entry.policyId} onChange={e => set('policyId', e.target.value)} />
                  {errors.policyId && <p className="text-[11px] text-rose mt-1">{errors.policyId}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={insLabel}>{t('segurosLossDate')}</label><input type="date" className={`${insInput} [color-scheme:dark]`} value={entry.lossDate} onChange={e => set('lossDate', e.target.value)} /></div>
                <div><label className={insLabel}>{t('segurosPip')}</label><input className={insInput} value={entry.pipAvailable} onChange={e => set('pipAvailable', e.target.value)} /></div>
              </div>
              <div><label className={insLabel}>{t('segurosClaimNum')}</label><input className={insInput} value={entry.claimNum} onChange={e => set('claimNum', e.target.value)} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={insLabel}>{t('segurosAdjusterName')}</label><input className={insInput} value={entry.adjusterName} onChange={e => set('adjusterName', e.target.value)} /></div>
                <div><label className={insLabel}>{t('segurosAdjusterPhone')}</label><input className={insInput} placeholder="(000) 000-0000" inputMode="numeric" maxLength={14} value={entry.adjusterPhone} onChange={e => set('adjusterPhone', fmtPhone(e.target.value))} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={insLabel}>{t('segurosAdjusterFax')}</label><input className={insInput} placeholder="(000) 000-0000" inputMode="numeric" maxLength={14} value={entry.adjusterFax} onChange={e => set('adjusterFax', fmtPhone(e.target.value))} /></div>
                <div><label className={insLabel}>{t('segurosAdjusterPhone2')}</label><input className={insInput} placeholder="(000) 000-0000" inputMode="numeric" maxLength={14} value={entry.adjusterPhone2} onChange={e => set('adjusterPhone2', fmtPhone(e.target.value))} /></div>
              </div>
              <div><label className={insLabel}>{t('segurosAdjusterEmail')}</label><input type="email" className={insInput} value={entry.adjusterEmail} onChange={e => set('adjusterEmail', e.target.value)} /></div>
              <div><label className={insLabel}>{t('segurosComments')}</label><textarea className={`${insInput} resize-none`} rows={3} value={entry.comments} onChange={e => set('comments', e.target.value)} /></div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={entry.fullLien} onChange={e => set('fullLien', e.target.checked)} className="w-4 h-4 rounded border border-border accent-brand" />
                <span className="text-sm text-text-2">{t('segurosFullLien')}</span>
              </label>
              {entry.fullLien && (
                <div><label className={insLabel}>{t('segurosLienComments')}</label><textarea className={`${insInput} resize-none`} rows={2} value={entry.lienComments} onChange={e => set('lienComments', e.target.value)} /></div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border flex-col sm:flex-row gap-2 shrink-0">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>{t('btnCancel')}</Button>
          <Button className="w-full sm:w-auto" onClick={handleSave}>{t('segurosGuardar')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const INS_TYPE_COLOR: Record<string, string> = {
  MEDICAL: 'bg-cyan/10 text-cyan border-cyan/20',
  AUTO:    'bg-amber/10 text-amber border-amber/20',
};

function SegurosDialog({ patient, onClose }: { patient: PatientRow; onClose: () => void }) {
  const t = useTranslations('phoenix.patients');
  const cd = patient.latestCase?.consentsData as Record<string, unknown> | null;
  const initialIns = Array.isArray(cd?.insurances) ? (cd!.insurances as InsuranceEntry[]) : [];
  const [insurances, setInsurances] = useState<InsuranceEntry[]>(initialIns);
  const [showNuevo, setShowNuevo]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  async function saveInsurances(updated: InsuranceEntry[]) {
    if (!patient.latestCase) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/cases/${patient.latestCase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consents: { insurances: updated } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.message ?? 'Error al guardar.'); return; }
      setInsurances(updated);
    } catch { setError('Error de red.'); }
    finally { setSaving(false); }
  }

  const insTypeLabel = { MEDICAL: t('segurosTypeMedical'), AUTO: t('segurosTypeAuto') };

  async function handleAdd(entry: InsuranceEntry) { await saveInsurances([...insurances, entry]); }
  async function handleDelete(id: string) { await saveInsurances(insurances.filter(i => i.id !== id)); }

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand" />
              {t('menuInsurance')} — {patient.firstName} {patient.lastName}
            </DialogTitle>
            <DialogDescription className="text-text-muted text-xs">
              {patient.latestCase?.caseCode ?? t('segurosNoCase')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {!patient.latestCase && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
                <Shield className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">{t('segurosNoCase')}</p>
                <p className="text-[11px] text-center">{t('segurosNoCaseDesc')}</p>
              </div>
            )}

            {patient.latestCase && insurances.length === 0 && !saving && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
                <Shield className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">{t('segurosEmpty')}</p>
                <p className="text-[11px]">{t('segurosEmptyDesc')}</p>
              </div>
            )}

            {saving && (
              <div className="flex items-center justify-center py-6 text-text-muted gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">{t('segurosSaving')}</span>
              </div>
            )}

            {!saving && insurances.map((ins) => (
              <div key={ins.id} className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TagPill
                      label={insTypeLabel[ins.insType] ?? ins.insType}
                      colorClass={INS_TYPE_COLOR[ins.insType] ?? 'bg-bg-2 text-text-2 border-border'}
                    />
                    <span className="text-sm font-medium text-text-1">{ins.carrier || '—'}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(ins.id)}
                    disabled={saving}
                    className="p-1.5 rounded text-text-muted hover:text-rose hover:bg-rose/10 transition-colors shrink-0"
                    title={t('segurosDelete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                  {ins.policyId && <div className="flex justify-between"><span className="text-text-muted">{t('segurosPolicyLabel')}</span><span className="text-text-1 font-mono">{ins.policyId}</span></div>}
                  {ins.insType === 'MEDICAL' && ins.holderName && <div className="flex justify-between"><span className="text-text-muted">{t('segurosHolderLabel')}</span><span className="text-text-1">{ins.holderName}</span></div>}
                  {ins.insType === 'MEDICAL' && ins.holderRelation && <div className="flex justify-between"><span className="text-text-muted">{t('segurosRelationLabel')}</span><span className="text-text-1">{ins.holderRelation}</span></div>}
                  {ins.insType === 'MEDICAL' && ins.copay && <div className="flex justify-between"><span className="text-text-muted">{t('segurosCopay')}</span><span className="text-text-1 font-mono">${parseFloat(ins.copay).toFixed(2)}</span></div>}
                  {ins.insType === 'MEDICAL' && ins.deductible && <div className="flex justify-between"><span className="text-text-muted">{t('segurosDeductible')}</span><span className="text-text-1 font-mono">${parseFloat(ins.deductible).toFixed(2)}</span></div>}
                  {ins.insType === 'MEDICAL' && ins.effectiveDate && <div className="flex justify-between"><span className="text-text-muted">{t('segurosEffectiveDate')}</span><span className="text-text-1">{new Date(ins.effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</span></div>}
                  {ins.insType === 'AUTO' && ins.claimNum && <div className="flex justify-between"><span className="text-text-muted">{t('segurosClaimLabel')}</span><span className="text-text-1 font-mono">{ins.claimNum}</span></div>}
                  {ins.insType === 'AUTO' && ins.adjusterName && <div className="flex justify-between"><span className="text-text-muted">{t('segurosAdjusterLabel')}</span><span className="text-text-1">{ins.adjusterName}</span></div>}
                  {ins.insType === 'AUTO' && ins.adjusterPhone && <div className="flex justify-between"><span className="text-text-muted">{t('segurosTelLabel')}</span><span className="text-text-1 font-mono">{ins.adjusterPhone}</span></div>}
                  {ins.insType === 'AUTO' && ins.adjusterEmail && <div className="flex justify-between"><span className="text-text-muted">{t('segurosEmailLabel')}</span><span className="text-text-1 truncate max-w-[130px]">{ins.adjusterEmail}</span></div>}
                  {ins.insType === 'AUTO' && ins.lossDate && <div className="flex justify-between"><span className="text-text-muted">{t('segurosLossLabel')}</span><span className="text-text-1">{ins.lossDate}</span></div>}
                  {ins.insType === 'AUTO' && ins.pipAvailable && <div className="flex justify-between"><span className="text-text-muted">{t('segurosPipLabel')}</span><span className="text-text-1">{ins.pipAvailable}</span></div>}
                  {ins.fullLien && <div className="flex items-center gap-1.5 col-span-2"><span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" /><span className="text-amber font-medium">{t('segurosFullLienLabel')}</span></div>}
                </div>
              </div>
            ))}

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border flex-col sm:flex-row gap-2 shrink-0">
            <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>{t('btnClose')}</Button>
            {patient.latestCase && (
              <Button className="w-full sm:w-auto" onClick={() => setShowNuevo(true)} disabled={saving}>
                <Plus className="w-3.5 h-3.5 mr-1" /> {t('segurosAdd')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showNuevo && (
        <NuevoSeguroDialog
          onClose={() => setShowNuevo(false)}
          onSave={handleAdd}
        />
      )}
    </>
  );
}

// ── QR Paciente dialog ─────────────────────────────────────────────────────
function QrPatientDialog({ patient, onClose }: { patient: PatientRow; onClose: () => void }) {
  const t = useTranslations('phoenix.patients');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    if (!patient.latestCase?.id) return;
    setLoading(true);
    fetch(`/api/admin/cases/${patient.latestCase.id}/generate-portal-token`, { method: 'POST' })
      .then(r => r.json())
      .then(async (j) => {
        if (j.portalUrl) {
          setPortalUrl(j.portalUrl);
          const url = await QRCode.toDataURL(j.portalUrl, {
            width: 280, margin: 2,
            color: { dark: '#e2e8f0', light: '#12141f' },
          });
          setQrDataUrl(url);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient.latestCase?.id]);

  const copyLink = async () => {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-${patient.firstName}-${patient.lastName}.png`;
    a.click();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('qrPatientTitle')} · {patient.firstName} {patient.lastName}</DialogTitle>
          <DialogDescription>{t('qrShareDesc')}</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          {loading && (
            <div className="flex justify-center py-10 text-text-muted">
              <RefreshCw className="w-6 h-6 animate-spin opacity-40" />
            </div>
          )}
          {!loading && portalUrl && (
            <>
              <div className="flex items-center gap-2 rounded-md border border-border bg-bg-2 px-3 py-2">
                <code className="flex-1 text-[11px] font-mono text-text-2 truncate">{portalUrl}</code>
                <button onClick={copyLink} className="p-1.5 rounded hover:bg-bg-1 text-text-muted hover:text-text-1 transition-colors shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              {qrDataUrl ? (
                <div className="flex justify-center">
                  <img src={qrDataUrl} alt="QR" className="rounded-lg border border-border" width={280} height={280} />
                </div>
              ) : (
                <div className="flex justify-center py-10 text-text-muted">
                  <RefreshCw className="w-6 h-6 animate-spin opacity-40" />
                </div>
              )}
            </>
          )}
          {!loading && !portalUrl && !patient.latestCase && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
              <QrCode className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">{t('qrNoPortal')}</p>
              <p className="text-[11px] text-center">{t('qrNoPortalDesc')}</p>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>{t('btnClose')}</Button>
          {qrDataUrl && (
            <Button onClick={downloadQr}>
              <Download className="w-3.5 h-3.5 mr-1" /> {t('btnDownload')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── In-App Camera (getUserMedia) ────────────────────────────────────────────
function InAppCamera({
  facingMode, guideType, onCapture, onCancel, onPermissionError,
}: {
  facingMode: 'user' | 'environment';
  guideType:  'face' | 'document';
  onCapture:        (f: File) => void;
  onCancel:         () => void;
  onPermissionError: () => void;
}) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(stream => {
      if (!active) { stream.getTracks().forEach(tr => tr.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(() => { if (active) setError('Sin acceso a la cámara.'); });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(tr => tr.stop());
      streamRef.current = null;
    };
  }, [facingMode]);

  const handleCapture = () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;
    const w = video.videoWidth || 1280; const h = video.videoHeight || 720;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(blob => {
      if (!blob) return;
      streamRef.current?.getTracks().forEach(tr => tr.stop());
      onCapture(new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  if (error) return (
    <div className="rounded-xl border border-rose/25 bg-black/80 p-5 text-center space-y-3">
      <p className="text-2xl">📷</p>
      <p className="text-[12px] text-text-muted leading-relaxed">{error}</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-[12px] text-text-muted hover:bg-bg-2 transition-colors">Cancelar</button>
        <button onClick={onPermissionError} className="flex-[2] py-2 rounded-lg border border-brand/40 bg-brand/10 text-[12px] text-brand font-semibold hover:bg-brand/20 transition-colors">Usar archivo</button>
      </div>
    </div>
  );

  const isOval = guideType === 'face';
  return (
    <div className="rounded-xl overflow-hidden border border-brand/30 bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-black/70">
        <button onClick={onCancel} className="text-[12px] text-text-muted hover:text-text-2 transition-colors">← Cancelar</button>
        <span className="text-[10px] font-bold tracking-widest text-brand">{isOval ? 'SELFIE' : 'DOCUMENTO'}</span>
        <div className="w-10" />
      </div>
      {/* Video */}
      <div className={`relative bg-[#111] ${isOval ? 'px-8 pt-4 pb-2' : 'px-3 py-2'}`}>
        {isOval ? (
          <div className="mx-auto relative" style={{ width: '100%', maxWidth: 200, aspectRatio: '3/4', borderRadius: '50%', overflow: 'hidden', border: '2.5px solid rgba(99,102,241,0.65)' }}>
            <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setReady(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: 'block' }} />
            {!ready && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] text-text-muted">Iniciando cámara…</div>}
          </div>
        ) : (
          <div className="relative w-full rounded-lg overflow-hidden bg-[#111]" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setReady(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {/* Corner markers */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute" style={{ inset: '14%' }}>
                {[['top-0 left-0 border-t border-l'],['top-0 right-0 border-t border-r'],['bottom-0 left-0 border-b border-l'],['bottom-0 right-0 border-b border-r']].map(([cls], i) => (
                  <div key={i} className={`absolute w-5 h-5 border-brand/80 border-2 ${cls}`} />
                ))}
              </div>
            </div>
            {!ready && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] text-text-muted">Iniciando cámara…</div>}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {/* Shutter */}
      <div className="flex flex-col items-center gap-3 py-5 bg-black/80">
        <p className="text-[11px] text-text-muted">{isOval ? 'Centra tu rostro en el óvalo' : 'Alinea el documento dentro del marco'}</p>
        <button onClick={handleCapture} disabled={!ready} aria-label="Capturar"
          className="w-16 h-16 rounded-full border-[3px] border-white/70 flex items-center justify-center disabled:opacity-40 hover:scale-105 transition-transform">
          <div className={`w-12 h-12 rounded-full transition-colors ${ready ? 'bg-white' : 'bg-white/30'}`} />
        </button>
        <p className="text-[10px] text-white/25">Capturar</p>
      </div>
    </div>
  );
}

// ── Archivos personales dialog ─────────────────────────────────────────────
type PhotoKey = 'selfie' | 'insuranceCardFront' | 'insuranceCardBack' | 'dlFront';

// Resize + re-encode image so upload stays well under Vercel's 4.5MB body limit.
// maxSideKB is the target max file size in KB.
function compressImage(file: File, maxSideKB = 1400): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const MAX_SIDE = 1600; // px — enough for ID documents at typical DPI
      let { width, height } = img;
      if (width > MAX_SIDE || height > MAX_SIDE) {
        if (width > height) { height = Math.round((height / width) * MAX_SIDE); width = MAX_SIDE; }
        else { width = Math.round((width / height) * MAX_SIDE); height = MAX_SIDE; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no ctx')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      // Try quality 0.85 first; if still too large, drop to 0.70
      canvas.toBlob(blob1 => {
        if (!blob1) { reject(new Error('toBlob failed')); return; }
        if (blob1.size <= maxSideKB * 1024) {
          resolve(new File([blob1], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
          return;
        }
        canvas.toBlob(blob2 => {
          const final = blob2 ?? blob1;
          resolve(new File([final], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.70);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = objUrl;
  });
}

function ArchivosDialog({ patient, onClose }: { patient: PatientRow; onClose: () => void }) {
  const t      = useTranslations('phoenix.patients');
  const router = useRouter();

  const initialPhotos = ((patient.latestCase?.consentsData as Record<string, unknown> | null)?.photos ?? {}) as Record<string, string>;
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>(initialPhotos);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]   = useState<Record<string, boolean>>({});
  const [errors, setErrors]       = useState<Record<string, string>>({});

  const PHOTO_SLOTS: { key: PhotoKey; label: string; capture: 'user' | 'environment' }[] = [
    { key: 'selfie',             label: t('photoSlotSelfie'),       capture: 'user' },
    { key: 'insuranceCardFront', label: t('photoSlotInsCardFront'), capture: 'environment' },
    { key: 'insuranceCardBack',  label: t('photoSlotInsCardBack'),  capture: 'environment' },
    { key: 'dlFront',            label: t('photoSlotDlFront'),      capture: 'environment' },
  ];

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [cameraSlot, setCameraSlot] = useState<PhotoKey | null>(null);

  async function handleFile(photoKey: PhotoKey, file: File) {
    setErrors(p => ({ ...p, [photoKey]: '' }));

    // Compress/resize to ≤1.5MB before upload (Vercel body limit is 4.5MB,
    // multipart overhead + JPEG at 1920×1080 can exceed it)
    let uploadFile = file;
    try {
      uploadFile = await compressImage(file, 1400);
    } catch {
      // If compression fails, attempt upload with original (may fail on large files)
    }

    // Optimistic preview
    const blobUrl = URL.createObjectURL(uploadFile);
    setPhotoUrls(p => ({ ...p, [photoKey]: blobUrl }));
    setUploading(p => ({ ...p, [photoKey]: true }));

    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('photoType', photoKey);
      const res  = await fetch(`/api/admin/patients/${patient.id}/upload-photo`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json.url) {
        setPhotoUrls(p => {
          if (p[photoKey] === blobUrl) URL.revokeObjectURL(blobUrl);
          return { ...p, [photoKey]: json.url };
        });
        router.refresh();
      } else {
        setPhotoUrls(p => ({ ...p, [photoKey]: initialPhotos[photoKey] ?? '' }));
        const detail = (json as { error?: string }).error ?? '';
        setErrors(p => ({ ...p, [photoKey]: detail === 'NO_CASE_FOUND' ? 'Paciente sin caso activo.' : 'Error al subir. Intenta de nuevo.' }));
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      setPhotoUrls(p => ({ ...p, [photoKey]: initialPhotos[photoKey] ?? '' }));
      setErrors(p => ({ ...p, [photoKey]: 'Error de conexión.' }));
      URL.revokeObjectURL(blobUrl);
    } finally {
      setUploading(p => ({ ...p, [photoKey]: false }));
    }
  }

  async function handleDelete(photoKey: PhotoKey) {
    setErrors(p => ({ ...p, [photoKey]: '' }));
    setDeleting(p => ({ ...p, [photoKey]: true }));
    try {
      const res = await fetch(`/api/admin/patients/${patient.id}/upload-photo?photoType=${photoKey}`, { method: 'DELETE' });
      if (res.ok) {
        setPhotoUrls(p => { const n = { ...p }; delete n[photoKey]; return n; });
        router.refresh();
      } else {
        setErrors(p => ({ ...p, [photoKey]: 'Error al eliminar.' }));
      }
    } catch {
      setErrors(p => ({ ...p, [photoKey]: 'Error de conexión.' }));
    } finally {
      setDeleting(p => ({ ...p, [photoKey]: false }));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl p-0">
        <DialogTitle className="sr-only">{patient.firstName} {patient.lastName} — Archivos</DialogTitle>
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-1">{patient.firstName} {patient.lastName}</h2>
          <p className="text-[12px] text-text-muted mt-0.5">{t('archivosSubtitle')}</p>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">
          {!patient.latestCase && (
            <div className="rounded-md border border-amber/30 bg-amber/10 px-4 py-3 text-[12px] text-amber">
              Este paciente no tiene casos registrados. Las fotos se guardarán cuando se cree el primer caso.
            </div>
          )}

          {/* In-app camera overlay */}
          {cameraSlot && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
              <div className="w-full max-w-sm">
                <InAppCamera
                  facingMode={PHOTO_SLOTS.find(s => s.key === cameraSlot)?.capture ?? 'environment'}
                  guideType={cameraSlot === 'selfie' ? 'face' : 'document'}
                  onCapture={file => { handleFile(cameraSlot, file); setCameraSlot(null); }}
                  onCancel={() => setCameraSlot(null)}
                  onPermissionError={() => { setCameraSlot(null); fileRefs.current[cameraSlot]?.click(); }}
                />
              </div>
            </div>
          )}

          {/* Fotos de identificación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PHOTO_SLOTS.map(({ key, label }) => {
              const url       = photoUrls[key] ?? null;
              const isLoading = uploading[key] ?? false;
              const isDel     = deleting[key] ?? false;
              const err       = errors[key] ?? '';

              return (
                <div key={key} className="rounded-lg border border-border bg-bg-2/40 overflow-hidden flex flex-col">
                  {/* Hidden file input (Archivo button) */}
                  <input
                    ref={el => { fileRefs.current[key] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(key, f); e.target.value = ''; }}
                  />

                  <p className="px-3 pt-3 pb-1 text-[11px] font-semibold text-cyan">{label}</p>

                  {/* Preview area */}
                  <div className="flex-1 mx-3 mb-1 rounded-md bg-bg-2 border border-border/60 overflow-hidden flex items-center justify-center min-h-[140px] relative">
                    {isLoading || isDel ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-text-muted opacity-50" />
                    ) : url ? (
                      <>
                        <img src={url} alt={label} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 hover:bg-black/50 transition-colors group">
                          <button
                            onClick={() => fileRefs.current[key]?.click()}
                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 rounded px-2 py-1"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-white" />
                            <span className="text-[10px] text-white font-medium">Reemplazar</span>
                          </button>
                          <button
                            onClick={() => handleDelete(key)}
                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-rose/20 hover:bg-rose/40 rounded px-2 py-1"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose" />
                            <span className="text-[10px] text-rose font-medium">Eliminar</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        disabled={!patient.latestCase}
                        onClick={() => setCameraSlot(key)}
                        className="flex flex-col items-center gap-2 text-text-muted py-6 hover:text-text-2 transition-colors disabled:cursor-not-allowed group"
                      >
                        <Camera className="w-7 h-7 opacity-30 group-hover:opacity-60 transition-opacity" />
                        <span className="text-[10px] opacity-0 group-hover:opacity-60 transition-opacity">Abrir cámara</span>
                      </button>
                    )}
                  </div>

                  {err && <p className="px-3 text-[10px] text-rose mb-1">{err}</p>}

                  {/* Action buttons */}
                  <div className="flex gap-1.5 px-3 py-2">
                    <button
                      disabled={!patient.latestCase || isLoading}
                      onClick={() => setCameraSlot(key)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md border border-border text-[11px] text-text-2 hover:bg-bg-2 hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Camera className="w-3 h-3" /> {t('btnCamera')}
                    </button>
                    <button
                      disabled={!patient.latestCase || isLoading}
                      onClick={() => fileRefs.current[key]?.click()}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md border border-border text-[11px] text-text-2 hover:bg-bg-2 hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Upload className="w-3 h-3" /> {t('btnFile')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Personal files — sección futura */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-2">
                <FolderOpen className="w-3.5 h-3.5" /> {t('archivosPersonalFiles')}
              </div>
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <div className="grid grid-cols-3 bg-bg-2 border-b border-border px-3 py-2">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('archivosColName')}</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('archivosColSize')}</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right">{t('archivosColDate')}</span>
              </div>
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
                <FolderOpen className="w-10 h-10 opacity-15" />
                <p className="text-sm font-medium">{t('archivosEmptyDir')}</p>
                <p className="text-[11px]">{t('archivosEmptyDirDesc')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-border flex justify-end">
          <Button variant="outline" onClick={onClose}>{t('btnClose')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PatientsClient({ patients, q, page, pageSize = 15, totalPages, total, inactiveTotal = 0, activeTotal, specialties, clinics, providers, inactiveOnly = false, agentName, scopeProviderId, basePath = '/patients' }: Props) {
  const doctorMode = !!scopeProviderId;
  const t      = useTranslations('phoenix.patients');
  const router = useRouter();

  const STATUS_LABEL: Record<string, string> = {
    NEW:        t('patientStatus.NEW'),
    ACTIVE:     t('patientStatus.ACTIVE'),
    COMPLETED:  t('patientStatus.COMPLETED'),
    DISCHARGED: t('patientStatus.DISCHARGED'),
    INACTIVE:   t('patientStatus.INACTIVE'),
  };
  const [newCaseOpen,    setNewCaseOpen]    = useState(false);
  const [newCaseInitial, setNewCaseInitial] = useState<NewCaseInitialState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null);
  const [deleteError,  setDeleteError]  = useState('');
  const [deleting,     setDeleting]     = useState(false);
  const [editTarget,   setEditTarget]   = useState<PatientRow | null>(null);
  const [viewTarget,   setViewTarget]   = useState<PatientRow | null>(null);
  const [quickRegister, setQuickRegister] = useState(false);
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [wizardPatient, setWizardPatient] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [expandedCases, setExpandedCases] = useState<Record<string, CaseRow[]>>({});
  const [loadingCases,  setLoadingCases]  = useState<Record<string, boolean>>({});
  const [pdfCaseId,      setPdfCaseId]      = useState<string | null>(null);
  const [caseQrTarget,   setCaseQrTarget]   = useState<CaseRow | null>(null);
  const [caseApptTarget, setCaseApptTarget] = useState<CaseRow | null>(null);
  const [caseViewTarget, setCaseViewTarget] = useState<CaseRow | null>(null);
  const [caseEditTarget, setCaseEditTarget] = useState<CaseRow | null>(null);
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<CaseRow | null>(null);
  const [segurosTarget,       setSegurosTarget]       = useState<PatientRow | null>(null);
  const [qrPatientTarget,    setQrPatientTarget]    = useState<PatientRow | null>(null);
  const [archivosTarget,     setArchivosTarget]     = useState<PatientRow | null>(null);
  const [medHistoryTarget,   setMedHistoryTarget]   = useState<PatientRow | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const [searchValue,   setSearchValue]   = useState(q ?? '');
  const [isSearching,   setIsSearching]   = useState(false);
  const [localPatients, setLocalPatients] = useState<PatientRow[]>(patients);
  const [localTotal,    setLocalTotal]    = useState(total);
  const [localPages,    setLocalPages]    = useState(totalPages);
  const [isPending, startTransition] = useTransition();

  // Sync si el servidor devuelve datos nuevos (navegación de página)
  useEffect(() => { setLocalPatients(patients); setLocalTotal(total); setLocalPages(totalPages); }, [patients, total, totalPages]);

  useEffect(() => {
    const val = searchValue.trim();

    // Si está vacío restaurar datos originales y limpiar URL
    if (!val) {
      setIsSearching(false);
      setLocalPatients(patients);
      setLocalTotal(total);
      setLocalPages(totalPages);
      history.replaceState(null, '', `${basePath}${inactiveOnly ? '?showInactive=1' : ''}`);
      return;
    }

    // Spinner inmediato
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: val });
        if (inactiveOnly) params.set('showInactive', '1');
        if (scopeProviderId) params.set('providerId', scopeProviderId);
        const res  = await fetch(`/api/admin/patients/list?${params}`);
        const data = await res.json();
        startTransition(() => {
          setLocalPatients(data.patients ?? []);
          setLocalTotal(data.total ?? 0);
          setLocalPages(data.totalPages ?? 1);
        });
        // Actualizar URL sin navegar (para compartir) — sin exponer providerId
        params.delete('providerId');
        history.replaceState(null, '', `${basePath}?${params}`);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchValue, inactiveOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const openMenu = (id: string, btn: HTMLButtonElement) => {
    const r = btn.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setOpenMenuId(id);
  };

  const [sendPortalTarget, setSendPortalTarget] = useState<{ id: string; caseCode: string; patient: { firstName: string; lastName: string; phone: string | null; email: string | null; preferredLanguage?: 'es' | 'en' } } | null>(null);
  const [deletingCase, setDeletingCase]    = useState(false);
  const [deleteCaseError, setDeleteCaseError] = useState('');

  const toggleExpand = useCallback(async (patientId: string) => {
    if (expandedId === patientId) { setExpandedId(null); return; }
    setExpandedId(patientId);
    if (expandedCases[patientId]) return;
    setLoadingCases(prev => ({ ...prev, [patientId]: true }));
    try {
      const res  = await fetch(`/api/admin/patients/${patientId}/cases`);
      const json = await res.json().catch(() => ({ cases: [] }));
      setExpandedCases(prev => ({ ...prev, [patientId]: json.cases ?? [] }));
    } finally {
      setLoadingCases(prev => ({ ...prev, [patientId]: false }));
    }
  }, [expandedId, expandedCases]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/admin/patients/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(json.message ?? 'Error al eliminar.');
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setDeleteError('Error de red. Intenta de nuevo.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteCase() {
    if (!deleteCaseTarget) return;
    setDeletingCase(true);
    setDeleteCaseError('');
    try {
      const res = await fetch(`/api/admin/cases/${deleteCaseTarget.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setDeleteCaseError(json.message ?? 'Error al cancelar.'); return; }
      const pid = Object.keys(expandedCases).find(k => (expandedCases[k] ?? []).some(c => c.id === deleteCaseTarget.id));
      setDeleteCaseTarget(null);
      if (pid) {
        setExpandedCases(prev => { const n = { ...prev }; delete n[pid]; return n; });
        setLoadingCases(prev => ({ ...prev, [pid]: true }));
        try {
          const r2 = await fetch(`/api/admin/patients/${pid}/cases`);
          const j2 = await r2.json().catch(() => ({ cases: [] }));
          setExpandedCases(prev => ({ ...prev, [pid]: j2.cases ?? [] }));
        } finally {
          setLoadingCases(prev => ({ ...prev, [pid]: false }));
        }
      }
    } catch {
      setDeleteCaseError('Error de red. Intenta de nuevo.');
    } finally {
      setDeletingCase(false);
    }
  }

  const [restoreTarget,  setRestoreTarget]  = useState<PatientRow | null>(null);
  const [restoring,      setRestoring]      = useState(false);
  const [restoreError,   setRestoreError]   = useState('');

  async function handleRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    setRestoreError('');
    try {
      const res = await fetch(`/api/admin/patients/${restoreTarget.id}/restore`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setRestoreError(json.message ?? 'Error al restaurar.'); return; }
      setRestoreTarget(null);
      router.refresh();
    } catch {
      setRestoreError('Error de red. Intenta de nuevo.');
    } finally {
      setRestoring(false);
    }
  }

  function buildPageUrl(p: number, size = pageSize) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 0) params.set('page', String(p));
    if (inactiveOnly) params.set('showInactive', '1');
    if (size !== 15) params.set('size', String(size));
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  }

  function toggleInactiveUrl() {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (!inactiveOnly) params.set('showInactive', '1');
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  }

  return (
    <>
      {/* Título + conteo unificado */}
      <div className="flex items-baseline gap-2 mb-3">
        <h1 className="text-2xl font-bold text-text-1">{t('listTitle')}</h1>
        {localTotal > 0 && (
          <span className="text-sm font-medium text-text-muted tabular-nums">
            · {localTotal.toLocaleString()}
          </span>
        )}
      </div>

      {/* Toolbar: búsqueda + acciones en una sola fila */}
      <div className="flex flex-wrap items-center gap-2 mb-1">
        {/* Search form — izquierda, ocupa el espacio disponible */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
          <div className="relative flex-1">
            {isSearching || isPending
              ? <RefreshCw className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand animate-spin pointer-events-none" />
              : <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            }
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className={`w-full pl-8 pr-3 py-2 bg-bg-2 border rounded-md text-sm text-text-1 placeholder:text-text-muted focus:outline-none transition-colors ${
                isSearching || isPending ? 'border-brand/50' : 'border-border focus:border-brand'
              }`}
              autoComplete="off"
            />
            {false && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-brand font-medium animate-pulse">
                Buscando…
              </span>
            )}
          </div>
          {searchValue && (
            <button
              type="button"
              onClick={() => setSearchValue('')}
              className="p-2 rounded-md border border-border text-text-muted hover:text-text-1 hover:border-border-strong transition-colors"
              title={t('btnClear')}
              aria-label={t('btnClear')}
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Acciones — derecha (solo admin; el doctor no crea pacientes/casos) */}
        {!doctorMode && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Quick Register deshabilitado temporalmente */}
          {/* "New patient" (patient-create-dialog.tsx) fue eliminado del todo:
              "Create Patient / Create Case" es el único camino de creación, y
              es el que tiene la detección de menor de edad con vínculo real al
              padre/apoderado. El otro dialog había quedado huérfano (nadie lo
              importaba) y mantenerlo habría sido una segunda implementación del
              mismo flujo lista para desviarse — el mismo patrón que ya causó
              bugs con calcAge y los generadores de código duplicados. */}
          <button
            type="button"
            onClick={() => { setNewCaseInitial(null); setNewCaseOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-emerald text-white text-sm font-medium hover:bg-emerald/90 transition-colors whitespace-nowrap"
            title={t('btnCreatePatientCaseTooltip')}
          >
            <PhoneOutgoing className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('btnCreatePatientCase')}</span>
            <span className="sm:hidden">{t('btnCreateShort')}</span>
          </button>
        </div>
        )}
      </div>

      {/* Tabs: Activos / Archivados */}
      <div className="flex items-center gap-1 border-b border-border mb-3">
        <a
          href={`${basePath}${q ? `?q=${q}` : ''}`}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            !inactiveOnly
              ? 'border-brand text-brand'
              : 'border-transparent text-text-muted hover:text-text-1'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          {t('btnActive')}
          <span className={`ml-1 text-[10px] rounded-full px-1.5 py-0.5 tabular-nums font-semibold ${
            !inactiveOnly ? 'bg-brand/10 text-brand' : 'bg-bg-2 text-text-muted'
          }`}>
            {!inactiveOnly ? localTotal : (activeTotal ?? total)}
          </span>
        </a>
        <a
          href={`${basePath}?showInactive=1${q ? `&q=${q}` : ''}`}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            inactiveOnly
              ? 'border-amber text-amber'
              : 'border-transparent text-text-muted hover:text-text-1'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('btnInactive')}
          <span className={`ml-1 text-[10px] rounded-full px-1.5 py-0.5 tabular-nums font-semibold ${
            inactiveOnly ? 'bg-amber/10 text-amber' : 'bg-bg-2 text-text-muted'
          }`}>
            {inactiveOnly ? localTotal : inactiveTotal}
          </span>
        </a>
      </div>

      <div className="relative rounded-lg border border-border">
        {(isSearching || isPending) && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-12 bg-bg-1/60 backdrop-blur-[1px] rounded-lg pointer-events-none">
            <div className="flex items-center gap-2 bg-bg-2 border border-border rounded-full px-3 py-1.5 shadow-lg pointer-events-auto">
              <RefreshCw className="w-3.5 h-3.5 text-brand animate-spin" />
              <span className="text-[11px] text-text-2 font-medium">{t('searching')}</span>
            </div>
          </div>
        )}
        <div className="overflow-x-auto rounded-lg">
        <table className={`w-full min-w-[820px] table-fixed text-sm transition-opacity duration-150 ${isSearching || isPending ? 'opacity-40' : 'opacity-100'}`}>
          <thead className="bg-bg-2 border-b border-border">
            <tr>
              <th className="sticky left-0 z-10 bg-bg-2 text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted w-[200px]">{t('colPatient')}</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell w-[160px]">{t('colContact')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell w-[56px]">{t('colCases')}</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell w-[90px]">{t('colStatus')}</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden lg:table-cell w-[200px]">{t('colAdmission')}</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden lg:table-cell w-[64px]">{t('colForm')}</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden xl:table-cell w-[96px]">{t('colCreated')}</th>
              <th className="sticky right-0 z-10 bg-bg-2 w-[48px] px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-text-muted text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {q ? t('noResultsFor', { q }) : t('noPatients')}
                </td>
              </tr>
            )}
            {localPatients.map((p) => (
              <Fragment key={p.id}>
              <tr className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                {/* Chevron expand */}
                <td className="sticky left-0 z-10 bg-bg-0 px-4 py-3.5 w-[200px]">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleExpand(p.id)}
                      className="p-1.5 rounded text-text-muted hover:text-brand transition-colors shrink-0"
                      title={expandedId === p.id ? t('tooltipCollapse') : t('tooltipExpand')}
                      aria-label={expandedId === p.id ? t('tooltipCollapse') : t('tooltipExpand')}
                      aria-expanded={expandedId === p.id}
                      aria-controls={`cases-row-${p.id}`}
                    >
                      {expandedId === p.id
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <div className="min-w-0">
                      <button
                        onClick={() => router.push(`${basePath}/${p.id}`)}
                        className="text-text-1 text-[13px] font-medium hover:text-brand transition-colors text-left truncate block w-full"
                        title={`${p.firstName} ${p.lastName}`}
                        aria-label={`Ver perfil de ${p.firstName} ${p.lastName}`}
                      >
                        {p.firstName} {p.lastName}
                      </button>
                      {p.patientCode && (
                        <div className="text-text-muted text-[10px] font-mono">{p.patientCode}</div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Contact */}
                <td className="px-4 py-3.5 hidden sm:table-cell w-[160px]">
                  <div className="text-text-2 text-[12px] space-y-0.5">
                    {p.phone
                      ? <div className="font-mono truncate">{p.phone}</div>
                      : <span className="text-text-muted">—</span>}
                    {p.email && <div className="text-text-muted text-[11px] truncate">{p.email}</div>}
                    {p.preferredLanguage && (
                      <div className="text-[10px] text-text-muted">{p.preferredLanguage === 'es' ? '🇪🇸 ES' : '🇺🇸 EN'}</div>
                    )}
                  </div>
                </td>

                {/* Casos */}
                <td className="px-3 py-3.5 hidden md:table-cell w-[56px] text-center">
                  <button
                    onClick={() => toggleExpand(p.id)}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-bg-2 border border-border text-[11px] font-semibold text-text-2 hover:bg-brand/10 hover:border-brand/40 hover:text-brand transition-colors tabular-nums"
                    title={p.caseCount === 1 ? t('caseCountSingular') : t('caseCountPlural', { n: p.caseCount })}
                    aria-label={p.caseCount === 1 ? t('caseCountSingular') : t('caseCountPlural', { n: p.caseCount })}
                  >
                    {p.caseCount}
                  </button>
                </td>

                {/* Estado */}
                <td className="px-4 py-3.5 hidden sm:table-cell w-[90px]">
                  <TagPill
                    label={STATUS_LABEL[p.status] ?? p.status}
                    colorClass={STATUS_COLORS[p.status] ?? 'bg-bg-2 text-text-2 border-border'}
                  />
                </td>

                {/* Admisión */}
                <td className="px-4 py-3.5 hidden lg:table-cell w-[200px]">
                  {p.latestCase ? (() => {
                    const prog = calcIntakeProgress(
                      {
                        id: '', caseCode: '', status: p.latestCase.status,
                        caseType: p.latestCase.caseType, accidentType: null,
                        accidentDate: p.latestCase.accidentDate, accidentNotes: null,
                        intakeFormCompletedAt: p.latestCase.intakeFormCompletedAt,
                        consentsData: p.latestCase.consentsData,
                        hasIntakeSubmission: p.latestCase.hasIntakeSubmission,
                        firstAppointment: null, lastAppointment: null,
                      },
                      p,
                    );
                    const { badge, missingItems } = formatProgress(prog, t);
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <TagPill label={badge} colorClass={prog.colorClass} />
                        </div>
                        <div className="h-1 rounded-full bg-bg-2 overflow-hidden w-full mb-0.5">
                          <div className={`h-full rounded-full transition-all ${prog.barClass}`} style={{ width: `${prog.pct}%` }} />
                        </div>
                        <MissingTooltip items={missingItems} pct={prog.pct < 100 ? prog.pct : undefined} missingLabel={t('progressMissingLabel')} />
                      </div>
                    );
                  })() : <span className="text-[10px] text-text-muted">—</span>}
                </td>

                {/* Formulario */}
                <td className="px-3 py-3.5 hidden lg:table-cell w-[64px]">
                  <div className="flex items-center gap-1.5">
                    {/* Ícono email — clickeable si hay caso + email (solo admin) */}
                    {p.latestCase && p.email && !doctorMode ? (
                      <button
                        onClick={() => setSendPortalTarget({
                          id: p.latestCase!.id,
                          caseCode: p.latestCase!.caseCode,
                          patient: {
                            firstName: p.firstName,
                            lastName: p.lastName,
                            phone: p.phone,
                            email: p.email,
                            preferredLanguage: (p.preferredLanguage as 'es' | 'en' | null) ?? undefined,
                          },
                        })}
                        className="p-1.5 rounded hover:bg-brand/10 transition-colors group"
                        title={p.latestCase.intakeFormSentAt ? t('tooltipSendFormResend', { date: fmtLocalDate(p.latestCase.intakeFormSentAt) }) : t('tooltipSendFormNew')}
                        aria-label={p.latestCase.intakeFormSentAt ? t('tooltipSendFormResend', { date: fmtLocalDate(p.latestCase.intakeFormSentAt) }) : t('tooltipSendFormNew')}
                      >
                        <Mail className={`w-3.5 h-3.5 transition-colors ${p.latestCase.intakeFormSentAt ? 'text-brand' : 'text-text-muted group-hover:text-brand'}`} />
                      </button>
                    ) : (
                      <span title={!p.email ? t('tooltipNoEmail') : t('tooltipNoCase')}>
                        <Mail className="w-3.5 h-3.5 text-text-muted opacity-25" />
                      </span>
                    )}
                    {/* Form completed icon */}
                    <span title={p.latestCase?.intakeFormCompletedAt ? t('tooltipFormCompleted', { date: fmtLocalDate(p.latestCase.intakeFormCompletedAt) }) : t('tooltipFormPending')}>
                      <CheckCircle2 className={`w-3.5 h-3.5 ${p.latestCase?.intakeFormCompletedAt ? 'text-emerald' : 'text-text-muted opacity-25'}`} />
                    </span>
                  </div>
                </td>

                {/* Created */}
                <td className="hidden xl:table-cell px-4 py-3.5 text-[11px] text-text-muted tabular-nums whitespace-nowrap">
                  {fmtLocalDate(p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt))}
                </td>

                {/* Acciones */}
                <td className="sticky right-0 z-10 bg-bg-0 px-4 py-3.5">
                  <div className="flex justify-end">
                    <button
                      onClick={(e) => openMenu(p.id, e.currentTarget)}
                      className="p-2 rounded-md text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors"
                      title={t('colActions')}
                      aria-label={`${t('colActions')} — ${p.firstName} ${p.lastName}`}
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === p.id}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>

              {/* ── Fila expandida: casos del paciente ── */}
              {expandedId === p.id && (
                <tr key={`${p.id}-cases`} id={`cases-row-${p.id}`} className="bg-white/[0.03] border-b border-white/[0.06]">
                  <td colSpan={7} className="px-6 py-2 overflow-x-auto">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between flex-wrap gap-2 py-1.5">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5">
                          <Briefcase className="w-3 h-3" /> {t('patientCases')}
                        </span>
                        {!inactiveOnly && (
                          <button
                            onClick={() => setWizardPatient({ id: p.id, firstName: p.firstName, lastName: p.lastName })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand text-white text-[11px] font-medium hover:bg-brand/90 transition-colors"
                          >
                            <Plus className="w-3 h-3" /> {t('btnAddCase')}
                          </button>
                        )}
                      </div>

                      {loadingCases[p.id] && (
                        <p className="text-[11px] text-text-muted py-2">{t('loadingCases')}</p>
                      )}

                      {!loadingCases[p.id] && (expandedCases[p.id] ?? []).length === 0 && (
                        <p className="text-[11px] text-text-muted py-2">{t('noCasesRegistered')}</p>
                      )}

                      {!loadingCases[p.id] && (expandedCases[p.id] ?? []).length > 0 && (
                        <>
                        {/* Mobile cards */}
                        <div className="md:hidden divide-y divide-white/[0.06]">
                          {(expandedCases[p.id] ?? []).map((c) => {
                            const prog = calcIntakeProgress(c, p);
                            const { badge: progBadge } = formatProgress(prog, t);
                            return (
                              <div key={c.id} className="py-2 flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    {c.caseType === 'MVA' ? <Car className="w-3 h-3 text-text-muted shrink-0" /> : <Stethoscope className="w-3 h-3 text-text-muted shrink-0" />}
                                    <span className="text-[11px] font-mono text-text-1">{c.caseCode}</span>
                                    <TagPill label={c.status} colorClass={
                                      c.status === 'CANCELLED' ? 'bg-rose/10 text-rose border-rose/20'
                                      : c.status === 'ACTIVE'  ? 'bg-emerald/10 text-emerald border-emerald/20'
                                      : 'bg-brand/10 text-brand border-brand/20'
                                    } />
                                  </div>
                                  <div className="flex items-center gap-0.5">
                                    {!doctorMode && <button onClick={() => router.push(`/front-office/${c.id}`)} className="p-2 rounded text-text-muted hover:text-emerald hover:bg-emerald/10 transition-colors" title={t('tooltipViewCase')} aria-label={`${t('tooltipViewCase')} — ${c.caseCode}`}><Eye className="w-3 h-3" /></button>}
                                    <button onClick={() => setCaseEditTarget(c)} className="p-2 rounded text-text-muted hover:text-brand hover:bg-brand/10 transition-colors" title={t('tooltipEditCase')} aria-label={`${t('tooltipEditCase')} — ${c.caseCode}`}><Pencil className="w-3 h-3" /></button>
                                    <button onClick={() => setCaseApptTarget(c)} className="p-2 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors" title={t('tooltipViewAppts')} aria-label={`${t('tooltipViewAppts')} — ${c.caseCode}`}><CalendarDays className="w-3 h-3" /></button>
                                    <button onClick={() => setCaseQrTarget(c)} className="p-2 rounded text-text-muted hover:text-brand hover:bg-brand/10 transition-colors" title={t('tooltipPatientQr')} aria-label={`${t('tooltipPatientQr')} — ${c.caseCode}`}><QrCode className="w-3 h-3" /></button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                  {c.caseType && <span className="text-[10px] text-text-muted">{CASE_TYPE_LABEL[c.caseType] ?? c.caseType}</span>}
                                  {c.accidentDate && <span className="text-[10px] text-text-muted tabular-nums">{fmtLocalDate(c.accidentDate)}</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <TagPill label={progBadge} colorClass={prog.colorClass} />
                                  {prog.pct < 100 && (
                                    <div className="flex-1 h-1.5 rounded-full bg-bg-2 overflow-hidden">
                                      <div className={`h-full rounded-full ${prog.barClass}`} style={{ width: `${prog.pct}%` }} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full min-w-[640px] border-collapse">
                            <thead>
                              <tr className="bg-bg-0 border-b border-white/[0.06]">
                                <th className="sticky left-0 z-10 bg-bg-0 text-left px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold text-text-muted w-[110px]">ID</th>
                                <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold text-text-muted w-[60px]">{t('colType')}</th>
                                <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold text-text-muted">{t('colDescription')}</th>
                                <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold text-text-muted w-[100px]">{t('colAccidentDate')}</th>
                                <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold text-text-muted w-[90px]">{t('colFirstAppt')}</th>
                                <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold text-text-muted w-[90px]">{t('colLastAppt')}</th>
                                <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold text-text-muted w-[160px]">{t('colProgress')}</th>
                                <th className="sticky right-0 z-10 bg-bg-0 text-right px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold text-text-muted w-[120px]">{t('colActions')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(expandedCases[p.id] ?? []).map((c, idx) => {
                                const prog = calcIntakeProgress(c, p);
                                const { badge: progBadge, missingItems: progMissing } = formatProgress(prog, t);
                                return (
                                  <tr
                                    key={c.id}
                                    className="bg-bg-0 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02] transition-colors"
                                  >
                                    {/* Código caso */}
                                    <td className="sticky left-0 z-10 bg-bg-0 px-3 py-2">
                                      <div className="flex items-center gap-1.5">
                                        {c.caseType === 'MVA' ? <Car className="w-3 h-3 text-text-muted shrink-0" /> : <Stethoscope className="w-3 h-3 text-text-muted shrink-0" />}
                                        <span className="text-[11px] font-mono text-text-1">{c.caseCode}</span>
                                      </div>
                                      <TagPill
                                        label={c.status}
                                        colorClass={
                                          c.status === 'CANCELLED' ? 'bg-rose/10 text-rose border-rose/20'
                                          : c.status === 'ACTIVE'  ? 'bg-emerald/10 text-emerald border-emerald/20'
                                          : 'bg-brand/10 text-brand border-brand/20'
                                        }
                                      />
                                    </td>

                                    {/* Tipo (caseType: MVA / GM) */}
                                    <td className="px-3 py-2">
                                      <span className="text-[11px] font-medium text-text-2">
                                        {c.caseType ? (CASE_TYPE_LABEL[c.caseType] ?? c.caseType) : '—'}
                                      </span>
                                    </td>

                                    {/* Descripción (accidentNotes) */}
                                    <td className="px-3 py-2 max-w-[180px]">
                                      <span className="text-[11px] text-text-2 line-clamp-2">{c.accidentNotes ?? '—'}</span>
                                    </td>

                                    {/* Fecha accidente */}
                                    <td className="px-3 py-2">
                                      <span className="text-[11px] text-text-2 tabular-nums">
                                        {c.accidentDate ? fmtLocalDate(c.accidentDate) : <span className="text-text-muted">—</span>}
                                      </span>
                                    </td>

                                    {/* 1ª cita */}
                                    <td className="px-3 py-2">
                                      <span className="text-[11px] text-text-2 tabular-nums">
                                        {c.firstAppointment ? fmtApptDate(c.firstAppointment.scheduledFor) : <span className="text-text-muted">N/D</span>}
                                      </span>
                                    </td>

                                    {/* Última cita */}
                                    <td className="px-3 py-2">
                                      <span className="text-[11px] text-text-2 tabular-nums">
                                        {c.lastAppointment ? fmtApptDate(c.lastAppointment.scheduledFor) : <span className="text-text-muted">N/D</span>}
                                      </span>
                                    </td>

                                    {/* Progress */}
                                    <td className="px-3 py-2 min-w-[140px]">
                                      <div className="flex items-center gap-2 mb-1">
                                        <TagPill label={progBadge} colorClass={prog.colorClass} />
                                      </div>
                                      {prog.pct < 100 && (
                                        <div className="h-1.5 rounded-full bg-bg-2 overflow-hidden w-full">
                                          <div
                                            className={`h-full rounded-full transition-all ${prog.barClass}`}
                                            style={{ width: `${prog.pct}%` }}
                                          />
                                        </div>
                                      )}
                                      <MissingTooltip items={progMissing} pct={prog.pct < 100 ? prog.pct : undefined} missingLabel={t('progressMissingLabel')} />
                                    </td>

                                    {/* Acciones */}
                                    <td className="sticky right-0 z-10 bg-bg-0 px-3 py-2">
                                      <div className="flex items-center justify-end gap-0.5">
                                        {!doctorMode && (
                                          <button
                                            onClick={() => router.push(`/front-office/${c.id}`)}
                                            className="p-1.5 rounded text-text-muted hover:text-emerald hover:bg-emerald/10 transition-colors"
                                            title={t('tooltipViewCase')}
                                            aria-label={`${t('tooltipViewCase')} — ${c.caseCode}`}
                                          >
                                            <Eye className="w-3 h-3" />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => setCaseEditTarget(c)}
                                          className="p-1.5 rounded text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                                          title={t('tooltipEditCase')}
                                          aria-label={`${t('tooltipEditCase')} — ${c.caseCode}`}
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        {!doctorMode && (
                                          <button
                                            onClick={() => { setDeleteCaseTarget(c); setDeleteCaseError(''); }}
                                            className="p-1.5 rounded text-text-muted hover:text-rose hover:bg-rose/10 transition-colors"
                                            title={t('tooltipCancelCase')}
                                            aria-label={`${t('tooltipCancelCase')} — ${c.caseCode}`}
                                            disabled={c.status === 'CANCELLED'}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => setPdfCaseId(c.id)}
                                          className="p-1.5 rounded text-text-muted hover:text-amber hover:bg-amber/10 transition-colors"
                                          title={t('tooltipDownloadPdf')}
                                          aria-label={`${t('tooltipDownloadPdf')} — ${c.caseCode}`}
                                        >
                                          <Printer className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() => setCaseApptTarget(c)}
                                          className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                                          title={t('tooltipViewAppts')}
                                          aria-label={`${t('tooltipViewAppts')} — ${c.caseCode}`}
                                        >
                                          <CalendarDays className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() => setCaseQrTarget(c)}
                                          className="p-1.5 rounded text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                                          title={t('tooltipPatientQr')}
                                          aria-label={`${t('tooltipPatientQr')} — ${c.caseCode}`}
                                        >
                                          <QrCode className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* ─── Paginación ─────────────────────────────────────────────────────── */}
      <nav aria-label={t('paginationNav')} className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <label htmlFor="page-size-select" className="sr-only">{t('rowsPerPage')}</label>
          <span aria-hidden="true">{t('rowsPerPage')}</span>
          <select
            id="page-size-select"
            value={pageSize}
            onChange={(e) => router.push(buildPageUrl(0, Number(e.target.value)))}
            className="bg-bg-2 border border-border rounded px-2 py-1 text-[11px] text-text-1 focus:outline-none focus:border-brand cursor-pointer"
            aria-label={t('rowsPerPage')}
          >
            {[10, 15, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {localPages > 0 && (
            <span className="ml-2" aria-live="polite" aria-atomic="true">
              {t('pageInfo', { page: page + 1, total: localPages })}
            </span>
          )}
        </div>
        {localPages > 1 && (
          <div className="flex gap-1" role="group" aria-label={t('pageControls')}>
            <button
              onClick={() => router.push(buildPageUrl(page - 1))}
              disabled={page === 0}
              aria-label={t('prevPage', { page: page, total: localPages })}
              className="p-2 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => router.push(buildPageUrl(page + 1))}
              disabled={page >= localPages - 1}
              aria-label={t('nextPage', { page: page + 2, total: localPages })}
              className="p-2 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </nav>

      {/* ─── View modal ─────────────────────────────────────────────────────── */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => { if (!o) setViewTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-text-1 flex items-center gap-2">
              {viewTarget && <PersonAvatar firstName={viewTarget.firstName} lastName={viewTarget.lastName} size={8} />}
              {viewTarget?.firstName} {viewTarget?.lastName}
            </DialogTitle>
            <DialogDescription className="text-text-muted text-xs font-mono">
              {viewTarget?.patientCode}
            </DialogDescription>
          </DialogHeader>

          {viewTarget && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Contacto</p>
                {viewTarget.phone && (
                  <div className="flex items-center gap-2 text-text-2">
                    <Phone className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-mono">{viewTarget.phone}</span>
                    {viewTarget.phone2 && <span className="font-mono text-text-muted">· {viewTarget.phone2}</span>}
                  </div>
                )}
                {viewTarget.email && (
                  <div className="flex items-center gap-2 text-text-2">
                    <Mail className="w-3.5 h-3.5 text-text-muted" />
                    <span>{viewTarget.email}</span>
                  </div>
                )}
                {viewTarget.dateOfBirth && (
                  <div className="flex items-center gap-2 text-text-2">
                    <Calendar className="w-3.5 h-3.5 text-text-muted" />
                    <span>{fmtLocalDate(viewTarget.dateOfBirth)}</span>
                  </div>
                )}
              </div>

              {(viewTarget.accidentDate || viewTarget.accidentType) && (
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Accidente</p>
                  <div className="flex items-center gap-2 text-text-2">
                    <Car className="w-3.5 h-3.5 text-text-muted" />
                    <span>{fmtLocalDate(viewTarget.accidentDate)}</span>
                    {viewTarget.accidentType && <span className="text-text-muted">· {viewTarget.accidentType}</span>}
                  </div>
                </div>
              )}

              {(viewTarget.insuranceCarrier || viewTarget.policyNumber) && (
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Seguro</p>
                  <div className="flex items-center gap-2 text-text-2">
                    <Shield className="w-3.5 h-3.5 text-text-muted" />
                    <span>{viewTarget.insuranceCarrier ?? '—'}</span>
                    {viewTarget.policyNumber && <span className="text-text-muted font-mono text-xs">· {viewTarget.policyNumber}</span>}
                  </div>
                </div>
              )}

              {viewTarget.guardianName && (
                <div className="rounded-md bg-amber/10 border border-amber/30 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-amber">Responsable legal</p>
                  <div className="flex items-center gap-2 text-text-2">
                    <UserCheck className="w-3.5 h-3.5 text-amber" />
                    <span>{viewTarget.guardianName}</span>
                    {viewTarget.guardianRelation && <span className="text-text-muted text-xs">· {viewTarget.guardianRelation}</span>}
                  </div>
                  {viewTarget.guardianPhone && (
                    <div className="flex items-center gap-2 text-text-2 pl-5">
                      <span className="font-mono text-xs">{viewTarget.guardianPhone}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <TagPill
                  label={STATUS_LABEL[viewTarget.status] ?? viewTarget.status}
                  colorClass={STATUS_COLORS[viewTarget.status] ?? 'bg-bg-2 text-text-2 border-border'}
                />
                <span className="text-text-muted text-xs">{viewTarget.caseCount} caso{viewTarget.caseCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setViewTarget(null)}>Cerrar</Button>
            <Button className="w-full sm:w-auto" onClick={() => { setEditTarget(viewTarget); setViewTarget(null); }}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit modal ─────────────────────────────────────────────────────── */}
      {editTarget && (
        <PatientEditDialog
          patient={editTarget as EditablePatient}
          externalOpen
          onClose={() => { setEditTarget(null); router.refresh(); }}
        />
      )}

      {/* ─── Case Wizard ─────────────────────────────────────────────────────── */}
      {wizardPatient && (
        <CaseWizardDialog
          open={!!wizardPatient}
          onOpenChange={(v) => { if (!v) setWizardPatient(null); }}
          patient={wizardPatient}
          onCreated={() => {
            setExpandedCases(prev => { const n = { ...prev }; delete n[wizardPatient.id]; return n; });
            toggleExpand(wizardPatient.id);
          }}
        />
      )}

      {/* ─── Quick Register ──────────────────────────────────────────────────── */}
      <QuickRegisterDialog open={quickRegister} onOpenChange={setQuickRegister} />

      {/* ─── Send Portal Link ────────────────────────────────────────────────── */}
      <SendPortalDialog
        open={!!sendPortalTarget}
        onOpenChange={(o) => { if (!o) setSendPortalTarget(null); }}
        caseInfo={sendPortalTarget}
      />

      {/* ─── Seguros ─────────────────────────────────────────────────────────── */}
      {segurosTarget && (
        <SegurosDialog patient={segurosTarget} onClose={() => setSegurosTarget(null)} />
      )}

      {/* ─── QR Paciente ─────────────────────────────────────────────────────── */}
      {qrPatientTarget && (
        <QrPatientDialog
          patient={qrPatientTarget}
          onClose={() => setQrPatientTarget(null)}
        />
      )}

      {/* ─── Archivos personales ─────────────────────────────────────────────── */}
      {archivosTarget && (
        <ArchivosDialog
          patient={archivosTarget}
          onClose={() => setArchivosTarget(null)}
        />
      )}

      {/* ─── Historial médico ────────────────────────────────────────────────── */}
      {medHistoryTarget && (
        <MedicalHistoryDialog
          patient={medHistoryTarget}
          open={true}
          onClose={() => setMedHistoryTarget(null)}
        />
      )}

      {/* ─── Menú acciones (fixed, escapa overflow-hidden de la tabla) ────────── */}
      {openMenuId && (() => {
        const p = localPatients.find(x => x.id === openMenuId);
        if (!p) return null;
        return (
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
            className="w-52 rounded-lg border border-border bg-bg-1 shadow-xl py-1 text-sm"
          >
            <button onClick={() => { setEditTarget(p); setOpenMenuId(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 hover:bg-bg-2 hover:text-text-1 transition-colors text-left">
              <Pencil className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuEdit')}
            </button>
            <button onClick={() => { setSegurosTarget(p); setOpenMenuId(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 hover:bg-bg-2 hover:text-text-1 transition-colors text-left">
              <Shield className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuInsurance')}
            </button>
            <button onClick={() => { setQrPatientTarget(p); setOpenMenuId(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 hover:bg-bg-2 hover:text-text-1 transition-colors text-left">
              <QrCode className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuPatientQr')}
            </button>
            <button onClick={() => { setArchivosTarget(p); setOpenMenuId(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 hover:bg-bg-2 hover:text-text-1 transition-colors text-left">
              <FolderOpen className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuPersonalFiles')}
            </button>
            <button onClick={() => { setMedHistoryTarget(p); setOpenMenuId(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 hover:bg-bg-2 hover:text-text-1 transition-colors text-left">
              <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuMedicalHistory')}
            </button>
            <button disabled
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 transition-colors text-left opacity-40 cursor-not-allowed">
              <History className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuAuditHistory')}
            </button>
            {/* Archivar/restaurar: acciones administrativas — ocultas en el portal médico */}
            {!doctorMode && (
              <>
                <div className="my-1 border-t border-border/60" />
                {p.status === 'INACTIVE' ? (
                  <button onClick={() => { setRestoreTarget(p); setRestoreError(''); setOpenMenuId(null); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-emerald hover:bg-emerald/10 transition-colors text-left">
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" /> Restaurar paciente
                  </button>
                ) : (
                  <button onClick={() => { setDeleteTarget(p); setDeleteError(''); setOpenMenuId(null); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-rose hover:bg-rose/10 transition-colors text-left">
                    <Trash2 className="w-3.5 h-3.5 shrink-0" /> {t('menuDelete')}
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* ─── Case QR dialog ─────────────────────────────────────────────────── */}
      {caseQrTarget && (
        <CaseQrDialog
          caseId={caseQrTarget.id}
          caseCode={caseQrTarget.caseCode}
          open={!!caseQrTarget}
          onClose={() => setCaseQrTarget(null)}
        />
      )}

      {/* ─── Case Appointments dialog ────────────────────────────────────────── */}
      {caseApptTarget && (
        <CaseAppointmentsDialog
          caseId={caseApptTarget.id}
          caseCode={caseApptTarget.caseCode}
          open={!!caseApptTarget}
          onClose={() => setCaseApptTarget(null)}
        />
      )}

      {/* ─── Delete Case confirm ─────────────────────────────────────────────── */}
      <Dialog open={!!deleteCaseTarget} onOpenChange={(o) => { if (!o) setDeleteCaseTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-text-1">{t('deleteCaseTitle')}</DialogTitle>
            <DialogDescription className="text-text-2 text-sm mt-1">
              {t('deleteCaseBody')}
            </DialogDescription>
          </DialogHeader>
          {deleteCaseError && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose mt-2">
              {deleteCaseError}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDeleteCase} disabled={deletingCase}>
              {deletingCase ? t('btnDeleting') : t('menuDelete')}
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteCaseTarget(null)} disabled={deletingCase}>
              {t('btnCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Case View dialog ────────────────────────────────────────────────── */}
      {caseViewTarget && (
        <CaseViewDialog
          caseId={caseViewTarget.id}
          open={!!caseViewTarget}
          onClose={() => setCaseViewTarget(null)}
          onEdit={() => setCaseEditTarget(caseViewTarget)}
        />
      )}

      {/* ─── Case Edit (full wizard in edit mode) ──────────────────────────── */}
      {caseEditTarget && (
        <CaseWizardDialog
          open={!!caseEditTarget}
          onOpenChange={(v) => { if (!v) setCaseEditTarget(null); }}
          patient={{ id: '', firstName: '', lastName: '' }}
          editCaseId={caseEditTarget.id}
          onSaved={async () => {
            const pid = Object.keys(expandedCases).find(k => (expandedCases[k] ?? []).some(c => c.id === caseEditTarget.id));
            setCaseEditTarget(null);
            if (pid) {
              // Clear cache and re-fetch so the updated case shows up
              setExpandedCases(prev => { const n = { ...prev }; delete n[pid]; return n; });
              setLoadingCases(prev => ({ ...prev, [pid]: true }));
              try {
                const res = await fetch(`/api/admin/patients/${pid}/cases`);
                const json = await res.json().catch(() => ({ cases: [] }));
                setExpandedCases(prev => ({ ...prev, [pid]: json.cases ?? [] }));
              } finally {
                setLoadingCases(prev => ({ ...prev, [pid]: false }));
              }
            }
          }}
        />
      )}

      {/* ─── Nueva llamada / Crear caso ─────────────────────────────────────── */}
      <NewCaseDialog
        open={newCaseOpen}
        onOpenChange={(open) => {
          setNewCaseOpen(open);
          if (!open) { setNewCaseInitial(null); router.refresh(); }
        }}
        specialties={specialties}
        clinics={clinics}
        providers={providers}
        initialState={newCaseInitial}
        agentName={agentName}
      />

      {/* ─── Delete confirm ──────────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-text-1">{t('deletePatientTitle')}</DialogTitle>
            <DialogDescription className="text-text-2 text-sm mt-1">
              {t('deletePatientBody', { name: `${deleteTarget?.firstName ?? ''} ${deleteTarget?.lastName ?? ''}` })}
            </DialogDescription>
          </DialogHeader>
          {(deleteTarget?.caseCount ?? 0) > 0 && (
            <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber mt-2">
              Este paciente tiene {deleteTarget!.caseCount} caso{deleteTarget!.caseCount !== 1 ? 's' : ''} asociado{deleteTarget!.caseCount !== 1 ? 's' : ''}. Al archivarlo, sus casos también quedarán ocultos. Los datos se conservan y se pueden restaurar.
            </div>
          )}
          {deleteError && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose mt-2">
              {deleteError}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t('btnCancel')}
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDelete} disabled={deleting}>
              {deleting ? t('btnDeleting') : t('btnYesDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Restore confirm ─────────────────────────────────────────────────── */}
      <Dialog open={!!restoreTarget} onOpenChange={(o) => { if (!o) setRestoreTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-text-1">Restaurar paciente</DialogTitle>
            <DialogDescription className="text-text-2 text-sm mt-1">
              ¿Restaurar a <strong>{restoreTarget?.firstName} {restoreTarget?.lastName}</strong>? El paciente y todos sus casos archivados volverán a estar visibles.
            </DialogDescription>
          </DialogHeader>
          {restoreError && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose mt-2">
              {restoreError}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRestoreTarget(null)} disabled={restoring}>
              Cancelar
            </Button>
            <Button className="w-full sm:w-auto bg-emerald hover:bg-emerald/90 text-white" onClick={handleRestore} disabled={restoring}>
              {restoring ? 'Restaurando...' : 'Sí, restaurar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── PDF Viewer modal ────────────────────────────────────────────────── */}
      <Dialog open={!!pdfCaseId} onOpenChange={(o) => { if (!o) setPdfCaseId(null); }}>
        <DialogContent className="max-w-5xl w-full p-0 gap-0 overflow-hidden" style={{ height: '90vh' }}>
          <DialogHeader className="px-4 py-3 border-b border-border flex-row items-center justify-between shrink-0">
            <DialogTitle className="text-text-1 text-sm flex items-center gap-2">
              <Printer className="w-4 h-4 text-amber" />
              Patient Intake Form
            </DialogTitle>
          </DialogHeader>
          {pdfCaseId && (
            <iframe
              src={`/api/admin/cases/${pdfCaseId}/pdf`}
              className="w-full flex-1"
              style={{ height: 'calc(90vh - 57px)', border: 'none' }}
              title="Patient Intake Form"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

