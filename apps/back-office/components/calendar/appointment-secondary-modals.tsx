'use client';

/**
 * B.11 — Modales secundarios del detalle de cita
 *
 * 4 modales que se abren desde el AppointmentDetailPanel:
 *   personal    → Datos personales del paciente
 *   lawyer      → Abogado & bufete
 *   insurance   → Seguro PIP
 *   callHandler → Quién atendió la llamada inicial
 *   intake      → (acción) Reenviar formulario portal
 */

import { X, User, Scale, Shield, Headphones, Phone, Mail, MapPin, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SecondaryModalType = 'personal' | 'lawyer' | 'insurance' | 'callHandler' | 'intake';

interface CalendarAppointment {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  type: string;
  status: string;
  notes: string | null;
  visitNumber: number;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    dateOfBirth: string | null;
  };
  case: {
    id: string;
    caseCode: string;
    accidentType: string | null;
    accidentDate: string | null;
    status: string;
    intakeFormCompletedAt: string | null;
    attorney: { id: string; firmName: string | null; firstName: string; lastName: string; phone: string | null; email: string | null } | null;
    primaryInsurance: { id: string; name: string } | null;
  } | null;
  clinic: { id: string; name: string };
  provider: { id: string; firstName: string; lastName: string; specialty: string | null } | null;
}

interface Props {
  type: SecondaryModalType;
  appointment: CalendarAppointment;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ageFromISO(iso: string | null): string {
  if (!iso) return '?';
  const d    = new Date(iso);
  const diff = Date.now() - d.getTime();
  return String(Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
}

function formatDOB(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AppointmentSecondaryModals({ type, appointment: appt, onClose }: Props) {
  return (
    <>
      {/* Backdrop (sobre el panel, bajo el modal) */}
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md">
        {type === 'personal'    && <PersonalModal    appt={appt} onClose={onClose} />}
        {type === 'lawyer'      && <LawyerModal      appt={appt} onClose={onClose} />}
        {type === 'insurance'   && <InsuranceModal   appt={appt} onClose={onClose} />}
        {type === 'callHandler' && <CallHandlerModal appt={appt} onClose={onClose} />}
        {type === 'intake'      && <IntakeModal      appt={appt} onClose={onClose} />}
      </div>
    </>
  );
}

// ─── Shared modal shell ───────────────────────────────────────────────────────

function ModalShell({
  title, icon, accentColor, children, footer, onClose,
}: {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="rounded-xl border bg-bg-1 shadow-2xl overflow-hidden mx-4"
      style={{ borderColor: accentColor }}>
      <div className="flex items-center gap-3 px-4 py-3.5 border-b"
        style={{ background: `color-mix(in srgb, ${accentColor} 8%, transparent)`, borderColor: accentColor + '40' }}>
        <span style={{ color: accentColor }}>{icon}</span>
        <span className="text-text-1 font-semibold text-sm flex-1">{title}</span>
        <button type="button" onClick={onClose} className="text-text-muted hover:text-text-1 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-2 text-[12.5px]">{children}</div>
      {footer && (
        <div className="px-4 py-3 border-t border-border flex gap-2">{footer}</div>
      )}
    </div>
  );
}

function DataRow({ label, value, mono, highlight, secret }: {
  label: string; value: string | null | undefined;
  mono?: boolean; highlight?: boolean; secret?: boolean;
}) {
  const display = secret ? '•••-••-' + (value?.slice(-4) ?? '????') + ' 🔒' : value ?? '—';
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-text-muted shrink-0">{label}</span>
      <span className={`text-right ${mono ? 'font-mono text-cyan' : ''} ${highlight ? 'text-text-1 font-semibold' : 'text-text-2'}`}>
        {display}
      </span>
    </div>
  );
}

function ActionBtn({ href, label, color, tel }: { href?: string; label: string; color?: string; tel?: boolean }) {
  const cls = `flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors`;
  if (href) {
    return (
      <a href={tel ? `tel:${href}` : href}
        className={cls}
        style={{ borderColor: color ?? 'rgba(255,255,255,0.12)', color: color ?? 'rgba(255,255,255,0.7)' }}>
        {tel ? <Phone className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
        {label}
      </a>
    );
  }
  return (
    <button type="button" className={cls}
      style={{ borderColor: color ?? 'rgba(255,255,255,0.12)', color: color ?? 'rgba(255,255,255,0.7)' }}>
      <Mail className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

// ─── 1. Personal ─────────────────────────────────────────────────────────────

function PersonalModal({ appt, onClose }: { appt: CalendarAppointment; onClose: () => void }) {
  const t = useTranslations('phoenix.calendar');
  const p = appt.patient;
  return (
    <ModalShell
      title={t('secondaryBtnPersonal')}
      icon={<User className="w-4 h-4" />}
      accentColor="#6366f1"
      onClose={onClose}
      footer={
        <>
          {p.phone && <ActionBtn href={p.phone} label="Llamar" color="#a5b4fc" tel />}
          {p.email && (
            <a href={`mailto:${p.email}`}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-brand/30 text-brand text-xs font-medium">
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
          )}
        </>
      }
    >
      <DataRow label={t('rowFullName')}      value={`${p.firstName} ${p.lastName}`} highlight />
      <DataRow label={t('rowDateOfBirth')}   value={`${formatDOB(p.dateOfBirth)} (${ageFromISO(p.dateOfBirth)} años)`} />
      <DataRow label={t('rowPhone')}         value={p.phone} />
      <DataRow label={t('rowEmail')}         value={p.email} />
      <DataRow label={t('rowLanguage')}      value={t('rowLanguageHint')} />
      {appt.case && (
        <DataRow label={t('rowCase')}        value={appt.case.caseCode} mono />
      )}
      <div className="pt-2 text-[11px] text-text-muted">
        ℹ️ {t('personalInfoNote')}
      </div>
    </ModalShell>
  );
}

// ─── 2. Lawyer ───────────────────────────────────────────────────────────────

function LawyerModal({ appt, onClose }: { appt: CalendarAppointment; onClose: () => void }) {
  const t = useTranslations('phoenix.calendar');
  const lawyer = appt.case?.attorney;
  if (!lawyer) {
    return (
      <ModalShell title={t('modalLawyerTitle')} icon={<Scale className="w-4 h-4" />} accentColor="#f43f5e" onClose={onClose}>
        <p className="text-text-muted text-sm text-center py-4">
          {t('lawyerEmptyTitle')}
        </p>
        <p className="text-[11px] text-text-muted text-center">
          {t('lawyerEmptyHint')}
        </p>
      </ModalShell>
    );
  }
  return (
    <ModalShell
      title={t('modalLawyerTitle')}
      icon={<Scale className="w-4 h-4" />}
      accentColor="#f43f5e"
      onClose={onClose}
      footer={
        <>
          {lawyer.phone && <ActionBtn href={lawyer.phone} label="Llamar" color="#fda4af" tel />}
          {lawyer.email && <ActionBtn label="Email" color="#fda4af" />}
        </>
      }
    >
      {lawyer.firmName && (
        <div className="rounded-lg p-3 border border-rose/20 mb-3"
          style={{ background: 'rgba(244,63,94,0.07)' }}>
          <div className="text-text-1 font-bold text-sm">{lawyer.firmName}</div>
          <div className="text-text-muted text-xs mt-0.5">{t('lawyerFirmLabel')}</div>
        </div>
      )}
      <DataRow label={t('rowLawyer')}   value={`${lawyer.firstName} ${lawyer.lastName}`} highlight />
      <DataRow label={t('rowPhone')}    value={lawyer.phone} />
      <DataRow label={t('rowEmail')}    value={lawyer.email} />
      {appt.case?.accidentDate && (
        <DataRow label={t('rowDol')}
          value={new Date(appt.case.accidentDate).toLocaleDateString('es-US', { dateStyle: 'medium' })}
          highlight />
      )}
      <div className="pt-1 flex items-center gap-1.5 text-[11px] text-emerald">
        {t('lawyerReferredBy')}
      </div>
    </ModalShell>
  );
}

// ─── 3. Insurance / PIP ──────────────────────────────────────────────────────

function InsuranceModal({ appt, onClose }: { appt: CalendarAppointment; onClose: () => void }) {
  const t = useTranslations('phoenix.calendar');
  const insurance = appt.case?.primaryInsurance;
  if (!insurance) {
    return (
      <ModalShell title={t('modalInsuranceTitle')} icon={<Shield className="w-4 h-4" />} accentColor="#10b981" onClose={onClose}>
        <p className="text-text-muted text-sm text-center py-4">
          {t('insuranceEmptyTitle')}
        </p>
        <p className="text-[11px] text-text-muted text-center">
          {t('insuranceEmptyHint')}
        </p>
      </ModalShell>
    );
  }
  return (
    <ModalShell
      title={t('modalInsuranceTitleAuto')}
      icon={<Shield className="w-4 h-4" />}
      accentColor="#10b981"
      onClose={onClose}
    >
      <div className="rounded-lg p-3 border border-emerald/20 mb-3"
        style={{ background: 'rgba(16,185,129,0.07)' }}>
        <div className="text-text-1 font-bold text-sm">{insurance.name}</div>
        <div className="text-text-muted text-xs mt-0.5">{t('insuranceCarrierLabel')}</div>
      </div>
      <div className="rounded-md px-3 py-2 text-[11px] border border-amber/30 text-amber"
        style={{ background: 'rgba(245,158,11,0.08)' }}>
        ⏳ {t('insurancePipPending')}
      </div>
      <div className="pt-2 text-[11px] text-text-muted">
        {t('insuranceVerificationPending')}
      </div>
    </ModalShell>
  );
}

// ─── 4. Call Handler ─────────────────────────────────────────────────────────

function CallHandlerModal({ appt, onClose }: { appt: CalendarAppointment; onClose: () => void }) {
  const t = useTranslations('phoenix.calendar');
  const createdAt = new Date(appt.scheduledFor);
  createdAt.setDate(createdAt.getDate() - 1); // aproximado — la cita fue agendada antes
  return (
    <ModalShell
      title={t('modalCallHandlerTitle')}
      icon={<Headphones className="w-4 h-4" />}
      onClose={onClose}
      accentColor="#06b6d4"
    >
      <div className="rounded-lg p-3 border border-cyan/20 mb-3 flex items-center gap-3"
        style={{ background: 'rgba(6,182,212,0.07)' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: 'linear-gradient(135deg,#06B6D4,#6366F1)' }}>
          FR
        </div>
        <div>
          <div className="text-text-1 font-bold text-sm">Front Office</div>
          <div className="text-text-muted text-xs">{t('callHandlerRoleLabel')} · {appt.clinic.name}</div>
        </div>
      </div>
      <DataRow label="Clínica"              value={appt.clinic.name} />
      <DataRow label={t('rowChannel')}      value={`📞 ${t('channelInboundCall')}`} />
      <DataRow label={t('rowAppointmentScheduled')} value={t('scheduledOnSameCall')} highlight />
      <div className="pt-2 text-[11px] text-text-muted rounded-md px-3 py-2 border border-border"
        style={{ background: 'rgba(255,255,255,0.02)' }}>
        📜 Información detallada del audit log disponible en Phase 1B (requiere tabla de audit de llamadas).
      </div>
    </ModalShell>
  );
}

// ─── 5. Intake resend ────────────────────────────────────────────────────────

function IntakeModal({ appt, onClose }: { appt: CalendarAppointment; onClose: () => void }) {
  const t = useTranslations('phoenix.calendar');
  const intakeDone = !!appt.case?.intakeFormCompletedAt;
  if (intakeDone) {
    return (
      <ModalShell title={t('modalIntakeTitle')} icon={<Mail className="w-4 h-4" />} accentColor="#10b981" onClose={onClose}>
        <div className="text-center py-4 space-y-2">
          <div className="text-3xl">✅</div>
          <div className="text-text-1 font-semibold">{t('intakeAlreadyDone')}</div>
          <div className="text-text-muted text-xs">
            {appt.patient.firstName} {t('intakeAlreadySentBy')}
          </div>
        </div>
      </ModalShell>
    );
  }
  return (
    <ModalShell
      title={t('modalResendTitle')}
      onClose={onClose}
      icon={<Mail className="w-4 h-4" />}
      accentColor="#06b6d4"
    >
      <p className="text-text-2 text-sm">
        {t('intakeResendDescription', { name: appt.patient.firstName })}
      </p>
      <div className="rounded-lg p-3 border border-border bg-bg-2/30 space-y-1 text-[12.5px]">
        <DataRow label={t('rowPatient')} value={`${appt.patient.firstName} ${appt.patient.lastName}`} highlight />
        {appt.patient.phone && <DataRow label={t('rowSmsTo')} value={appt.patient.phone} />}
        {appt.patient.email && <DataRow label={t('rowEmailTo')} value={appt.patient.email} />}
      </div>
      <p className="text-[11px] text-amber">
        ⚠️ {t('intakeResendNote')}
      </p>
    </ModalShell>
  );
}
