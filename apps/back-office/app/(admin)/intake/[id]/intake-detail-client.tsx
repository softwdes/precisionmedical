'use client';

/**
 * B.13 — Detalle de verificación de caso (Edson)
 *
 * Dos paneles paralelos:
 *   Izquierda → Verificación con Law Firm (abogado + lien)
 *   Derecha   → Verificación PIP (seguro auto-accidente)
 *
 * + Historial de comunicaciones (llamadas / emails)
 *
 * Colores (Regla #5): amber = identidad del módulo Edson
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Scale, ShieldCheck, Phone, Mail, CheckCircle2,
  Clock, AlertTriangle, Plus, MessageSquare, RefreshCw,
  ChevronRight, Building2, CalendarDays,
} from 'lucide-react';
import { PageHeader }   from '@/components/ui-phoenix/page-header';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill, type StatusState } from '@/components/ui-phoenix/status-pill';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CaseDetail {
  id:             string;
  caseCode:       string;
  caseType:       string;
  status:         string;
  accidentDate:   string | null;
  accidentType:   string | null;
  accidentLocation: string | null;
  createdAt:      string;
  pipVerifiedAt:  string | null;
  intakeFormCompletedAt: string | null;
  primaryPolicyNumber:   string | null;
  awaitingLawFirm: boolean;
  awaitingPip:     boolean;
  isReady:         boolean;
  patient: {
    id: string; firstName: string; lastName: string;
    phone: string | null; email: string | null;
    dateOfBirth: string | null; status: string;
  };
  lawFirm: { id: string; firmName: string | null; phone: string | null; email: string | null; address: string | null } | null;
  attorney: { id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null } | null;
  primaryInsurance: {
    id: string; name: string; claimsPhone: string | null; claimsEmail: string | null;
    shortCode: string; color: string;
  } | null;
  notes: {
    id: string; content: string; authorName: string;
    isPrivate: boolean; createdAt: string; type: 'call' | 'email' | 'note';
  }[];
  appointments: {
    id: string; scheduledFor: string; status: string; type: string; clinicName: string;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

// Accident type labels resolved via t() in the component — see accidentTypeLabel usage

// ─── ChecklistItem ────────────────────────────────────────────────────────────
function ChecklistItem({ done, label, meta }: { done: boolean; label: string; meta?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-md px-3 py-2 ${
      done ? 'bg-emerald/5' : 'bg-bg-2/50'
    }`}>
      {done
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0 mt-0.5" />
        : <Clock className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] ${done ? 'text-emerald' : 'text-text-2'}`}>{label}</div>
        {meta && <div className="text-[10px] text-text-muted">{meta}</div>}
      </div>
    </div>
  );
}

// ─── LogContactModal ──────────────────────────────────────────────────────────
function LogContactModal({
  caseId, onClose, onDone,
}: { caseId: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations('phoenix.intake');
  const [type,        setType]        = useState<'call' | 'email'>('call');
  const [contactName, setContactName] = useState('');
  const [description, setDescription] = useState('');
  const [saving,      setSaving]      = useState(false);

  async function submit() {
    if (!description.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/intake/${caseId}/log-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, contactName, description, authorName: 'Edson' }),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-bg-1 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="font-semibold text-text-1 text-sm">{t('logContactTitle')}</div>
          <button onClick={onClose} className="text-text-muted hover:text-text-1 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            {(['call', 'email'] as const).map(contactType => (
              <button
                key={contactType}
                type="button"
                onClick={() => setType(contactType)}
                className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-md border text-xs font-semibold transition-all ${
                  type === contactType
                    ? 'border-amber/40 bg-amber/10 text-amber'
                    : 'border-border text-text-2 hover:border-border-strong'
                }`}
              >
                {contactType === 'call' ? <Phone className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                {contactType === 'call' ? t('contactTypeCall') : t('contactTypeEmail')}
              </button>
            ))}
          </div>
          {/* Contact name */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1 block">
              {t('contactFieldName')}
            </label>
            <input
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="Bob Jones (Smith & Johnson)"
              className="w-full rounded-md border border-border bg-bg-2 px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:border-amber/50 focus:outline-none"
            />
          </div>
          {/* Description */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1 block">
              {t('contactFieldDescription')}
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Confirmó representación del caso · respondió por email..."
              rows={3}
              className="w-full rounded-md border border-border bg-bg-2 px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:border-amber/50 focus:outline-none resize-none"
            />
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-md border border-border text-text-2 text-sm hover:bg-white/5 transition-colors"
          >
            {t('actionCancel')}
          </button>
          <button
            onClick={submit}
            disabled={saving || !description.trim()}
            className="flex-1 py-2 rounded-md bg-amber text-black text-sm font-semibold hover:bg-amber/90 transition-colors disabled:opacity-50"
          >
            {saving ? t('actionSaving') : t('actionRegister')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function IntakeDetailClient({ caseId }: { caseId: string }) {
  const t = useTranslations('phoenix.intake');
  const router = useRouter();
  const [detail,      setDetail]      = useState<CaseDetail | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [verifyingPip, setVerifyingPip] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/intake/${caseId}`);
      const data = await res.json();
      if (data.ok) setDetail(data.case);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  async function verifyPip() {
    setVerifyingPip(true);
    try {
      await fetch(`/api/admin/intake/${caseId}/verify-pip`, { method: 'POST' });
      await loadDetail();
    } finally {
      setVerifyingPip(false);
    }
  }

  if (loading || !detail) {
    return (
      <div className="flex flex-col">
        <PageHeader title={t('loading')} subtitle={t('caseVerification')} />
        <div className="px-6 pb-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 rounded-lg bg-bg-2/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const d = detail;
  const patientName = `${d.patient.firstName} ${d.patient.lastName}`;

  // ─── Checklist law firm ─────────────────────────────────────────────────
  const lawFirmItems = [
    { done: !!d.lawFirm,    label: t('checkRepresentation'),          meta: d.lawFirm?.firmName ?? undefined },
    { done: !!d.accidentDate, label: t('checkDolConfirmed'),          meta: d.accidentDate ? fmtDate(d.accidentDate) : undefined },
    { done: !!d.attorney,   label: t('checkAttorneyAssigned'),        meta: d.attorney ? `${d.attorney.firstName ?? ''} ${d.attorney.lastName ?? ''}`.trim() || undefined : undefined },
    { done: false,          label: t('checkLienPending'),             meta: t('checkLienPendingMeta') },
  ];

  // ─── Checklist PIP ──────────────────────────────────────────────────────
  const pipItems = [
    { done: !!d.pipVerifiedAt, label: t('checkPipCoverage'),          meta: d.pipVerifiedAt ? t('checkPipVerifiedMeta', { date: fmtDate(d.pipVerifiedAt) }) : undefined },
    { done: false,             label: t('checkPipBenefits'),          meta: undefined },
    { done: false,             label: t('checkAdjusterContact'),      meta: undefined },
    { done: false,             label: t('checkBillingDocs'),          meta: undefined },
  ];

  const overallState: StatusState = d.isReady ? 'success' : d.awaitingLawFirm && d.awaitingPip ? 'warning' : 'info';

  return (
    <>
      {showLogModal && (
        <LogContactModal
          caseId={caseId}
          onClose={() => setShowLogModal(false)}
          onDone={() => { setShowLogModal(false); void loadDetail(); }}
        />
      )}

      <div className="flex flex-col">
        <PageHeader
          title={patientName}
          subtitle={d.caseCode}
          action={
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-2 text-xs hover:border-amber/40 hover:text-amber transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('actionInbox')}
            </button>
          }
        />

        <div className="px-4 sm:px-6 pb-8 space-y-5">
          {/* Profile banner */}
          <div className="rounded-lg border border-amber/25 bg-amber/5 p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <PersonAvatar firstName={d.patient.firstName} lastName={d.patient.lastName} size={10} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-text-1">{patientName}</span>
                  <span className="font-mono text-[11px] text-amber">{d.caseCode}</span>
                  <StatusPill
                    label={d.isReady ? t('statusReadyForAppt') : t('statusInVerification')}
                    state={overallState}
                  />
                  {!d.isReady && (
                    <StatusPill label={t('statusVerificationPending')} state="warning" />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                  {d.accidentDate && <span>DOL: {fmtDate(d.accidentDate)}</span>}
                  {d.accidentType && (() => {
                    const accidentTypeLabels: Record<string, string> = {
                      AUTO: t('accidentTypeAuto'),
                      MOTORCYCLE: t('accidentTypeMotorcycle'),
                      PEDESTRIAN: t('accidentTypePedestrian'),
                      WORKPLACE: t('accidentTypeWorkplace'),
                      OTHER: t('accidentTypeOther'),
                    };
                    return <span>{accidentTypeLabels[d.accidentType] ?? d.accidentType}</span>;
                  })()}
                  {d.accidentLocation && <span>{d.accidentLocation}</span>}
                  {d.lawFirm?.firmName && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> {d.lawFirm.firmName}
                    </span>
                  )}
                  {d.intakeFormCompletedAt && (
                    <span className="text-emerald">{t('formCompleted', { datetime: fmtDateTime(d.intakeFormCompletedAt) })}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Two-column verification panels ────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Law Firm Panel */}
            <div className={`rounded-lg border p-4 ${
              d.awaitingLawFirm ? 'border-amber/30 bg-amber/5' : 'border-emerald/30 bg-emerald/5'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Scale className={`w-4 h-4 ${d.awaitingLawFirm ? 'text-amber' : 'text-emerald'}`} />
                  <span className="text-sm font-bold text-text-1">{t('panelLawFirm')}</span>
                </div>
                <StatusPill
                  label={d.awaitingLawFirm ? t('statusInProcess') : t('statusCompleted')}
                  state={d.awaitingLawFirm ? 'warning' : 'success'}
                />
              </div>

              <div className="space-y-1.5 mb-4">
                {lawFirmItems.map((item, i) => (
                  <ChecklistItem key={i} done={item.done} label={item.label} meta={item.meta} />
                ))}
              </div>

              {/* Actions */}
              {d.awaitingLawFirm && (
                <div className="flex flex-col gap-2">
                  {d.lawFirm?.phone && (
                    <a
                      href={`tel:${d.lawFirm.phone}`}
                      className="flex items-center justify-center gap-2 py-2 rounded-md bg-amber/10 border border-amber/30 text-amber text-xs font-semibold hover:bg-amber/15 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {t('actionCallFirm', { firm: d.lawFirm.firmName ?? 'Law Firm' })}
                    </a>
                  )}
                  {d.attorney?.email && (
                    <a
                      href={`mailto:${d.attorney.email}`}
                      className="flex items-center justify-center gap-2 py-2 rounded-md border border-border text-text-2 text-xs hover:border-amber/30 hover:text-amber transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {t('actionResendSignLink')}
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* PIP Panel */}
            <div className={`rounded-lg border p-4 ${
              d.pipVerifiedAt ? 'border-emerald/30 bg-emerald/5' : 'border-rose/25 bg-rose/5'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${d.pipVerifiedAt ? 'text-emerald' : 'text-rose'}`} />
                  <span className="text-sm font-bold text-text-1">{t('panelPip')}</span>
                </div>
                <StatusPill
                  label={d.pipVerifiedAt ? t('statusVerified') : t('statusNotStarted')}
                  state={d.pipVerifiedAt ? 'success' : 'danger'}
                />
              </div>

              {/* Insurance info */}
              {d.primaryInsurance && (
                <div className="rounded-md border border-border/50 bg-bg-2/40 px-3 py-2 mb-3 flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-black text-white shrink-0"
                    style={{ backgroundColor: d.primaryInsurance.color }}
                  >
                    {d.primaryInsurance.shortCode}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-text-1">{d.primaryInsurance.name}</div>
                    {d.primaryPolicyNumber && (
                      <div className="text-[10px] text-text-muted font-mono">{d.primaryPolicyNumber}</div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 mb-4">
                {pipItems.map((item, i) => (
                  <ChecklistItem key={i} done={item.done} label={item.label} meta={item.meta} />
                ))}
              </div>

              {/* Actions */}
              {!d.pipVerifiedAt && (
                <div className="flex flex-col gap-2">
                  {d.primaryInsurance?.claimsPhone && (
                    <a
                      href={`tel:${d.primaryInsurance.claimsPhone}`}
                      className="flex items-center justify-center gap-2 py-2 rounded-md bg-amber text-black text-xs font-semibold hover:bg-amber/90 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {t('actionCallInsurer', { insurer: d.primaryInsurance.name })}
                    </a>
                  )}
                  {d.primaryInsurance?.claimsEmail && (
                    <a
                      href={`mailto:${d.primaryInsurance.claimsEmail}`}
                      className="flex items-center justify-center gap-2 py-2 rounded-md border border-border text-text-2 text-xs hover:border-rose/30 hover:text-rose transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {t('actionEmailInsurer')}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={verifyPip}
                    disabled={verifyingPip}
                    className="flex items-center justify-center gap-2 py-2 rounded-md border border-emerald/40 text-emerald text-xs font-semibold hover:bg-emerald/10 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {verifyingPip ? t('actionMarkingPip') : t('actionMarkPipVerified')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Ready banner */}
          {d.isReady && (
            <div className="rounded-lg border border-emerald/40 bg-emerald/10 p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald shrink-0" />
              <div>
                <div className="text-emerald font-bold text-sm">{t('readyBannerTitle')}</div>
                <div className="text-emerald/70 text-[11px]">
                  {t('readyBannerSub')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/calendar')}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald text-white text-xs font-semibold hover:bg-emerald/90 transition-colors shrink-0"
              >
                {t('actionGoToCalendar')}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Próximas citas */}
          {d.appointments.length > 0 && (
            <div className="rounded-lg border border-border bg-bg-1 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="w-4 h-4 text-amber" />
                <span className="text-sm font-semibold text-text-1 uppercase tracking-wider">{t('sectionAppointments')}</span>
              </div>
              <div className="space-y-2">
                {d.appointments.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-text-2">{fmtDateTime(a.scheduledFor)}</span>
                    <span className="text-text-muted">{a.clinicName}</span>
                    <span className="font-mono text-[10px] text-amber">{a.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Communication history */}
          <div className="rounded-lg border border-border bg-bg-1 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber" />
                <span className="text-sm font-semibold text-text-1 uppercase tracking-wider">
                  {t('sectionCommHistory')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowLogModal(true)}
                className="flex items-center gap-1.5 px-2.5 h-7 rounded-md border border-amber/35 text-amber text-[11px] font-semibold hover:bg-amber/10 transition-colors"
              >
                <Plus className="w-3 h-3" />
                {t('actionRegister')}
              </button>
            </div>

            {d.notes.length === 0 ? (
              <div className="text-center py-6 text-text-muted text-sm">
                {t('emptyComms')}
              </div>
            ) : (
              <div className="space-y-2">
                {d.notes.map(n => (
                  <div key={n.id} className="flex gap-2.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      n.type === 'call'  ? 'bg-cyan/10' :
                      n.type === 'email' ? 'bg-violet/10' : 'bg-bg-2'
                    }`}>
                      {n.type === 'call'  ? <Phone className="w-3 h-3 text-cyan" /> :
                       n.type === 'email' ? <Mail  className="w-3 h-3 text-violet" /> :
                       <MessageSquare className="w-3 h-3 text-text-muted" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-text-2 leading-relaxed">{n.content}</div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {n.authorName} · {fmtDateTime(n.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
