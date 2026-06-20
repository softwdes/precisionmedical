'use client';

/**
 * B.12/B.13/B.23/B.24 — Bandeja de trabajo Edson
 *
 * Tab Pre-visita: checklist por caso de tareas antes de la primera cita.
 * Tab Cobranzas:  cola de casos activos/MMI/cerrados sin settlement, ordenados por urgencia.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardList, Phone, Mail, CheckCircle2, AlertTriangle,
  Clock, Building2, Shield, FileText, TrendingUp, ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix/page-header';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreVisitCase {
  id: string;
  caseCode: string;
  status: string;
  intakeFormSentAt: Date | null;
  intakeFormCompletedAt: Date | null;
  pipVerifiedAt: Date | null;
  firstAppointmentConfirmedAt: Date | null;
  createdAt: Date;
  accidentDate: Date | null;
  source: string;
  patient: { firstName: string; lastName: string; phone: string | null; email: string | null } | null;
  lawFirm: { firmName: string | null; phone: string | null; email: string | null } | null;
  attorney: { firstName: string | null; lastName: string | null; email: string | null } | null;
  primaryInsurance: { name: string } | null;
  appointments: { id: string; scheduledFor: Date; type: string; status: string }[];
  lienSignatures: { signerType: string }[];
  intakeSubmission: { id: string } | null;
}

interface CollectionsCase {
  id: string;
  caseCode: string;
  status: string;
  createdAt: Date;
  accidentDate: Date | null;
  updatedAt: Date;
  patient: { firstName: string; lastName: string; phone: string | null; email: string | null } | null;
  lawFirm: { firmName: string | null; phone: string | null; email: string | null } | null;
  attorney: { firstName: string | null; lastName: string | null; email: string | null } | null;
  primaryInsurance: { name: string } | null;
  lienSignatures: { signerType: string; signedAt: Date | null }[];
  appointments: { id: string }[];
  notes: { content: string; createdAt: Date }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(d: Date | string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(d: Date | string): number {
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function fmtDate(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric', timeZone: 'America/Denver' });
}

function fmtTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
}

const STATUS_LABELS: Record<string, string> = {
  NEW_REFERRAL:      'Nueva ref.',
  INTAKE_PENDING:    'Intake pend.',
  INTAKE_COMPLETED:  'Intake OK',
  CONFIRMED:         'Confirmado',
  ACTIVE:            'Activo',
  MMI:               'MMI',
  CLOSED:            'Cerrado',
};

const STATUS_COLOR: Record<string, string> = {
  NEW_REFERRAL:     '#f59e0b',
  INTAKE_PENDING:   '#f59e0b',
  INTAKE_COMPLETED: '#34d399',
  CONFIRMED:        '#6366f1',
  ACTIVE:           '#6366f1',
  MMI:              '#f59e0b',
  CLOSED:           '#f87171',
};

// ─── Task checklist for pre-visit ─────────────────────────────────────────────

interface Task {
  id:    string;
  label: string;
  done:  boolean;
  urgent?: boolean;
  action?: string;
}

function getPreVisitTasks(c: PreVisitCase): Task[] {
  const lienPatient  = c.lienSignatures.some(s => s.signerType === 'PATIENT');
  const lienAttorney = c.lienSignatures.some(s => s.signerType === 'ATTORNEY');

  return [
    {
      id: 'firm',
      label: 'Bufete legal asignado',
      done: !!c.lawFirm,
      urgent: !c.lawFirm,
      action: 'Asignar bufete en detalle del caso',
    },
    {
      id: 'insurance',
      label: 'Seguro primario (PIP) registrado',
      done: !!c.primaryInsurance,
      urgent: !c.primaryInsurance,
      action: 'Registrar seguro en detalle del caso',
    },
    {
      id: 'pip',
      label: 'PIP verificado',
      done: !!c.pipVerifiedAt,
      urgent: !c.pipVerifiedAt && !!c.primaryInsurance,
      action: 'Llamar a aseguradora para confirmar cobertura PIP',
    },
    {
      id: 'intake',
      label: 'Portal intake completado',
      done: !!c.intakeFormCompletedAt || !!c.intakeSubmission,
      urgent: !c.intakeFormSentAt,
      action: !c.intakeFormSentAt ? 'Enviar magic link al paciente' : 'Recordar al paciente completar el portal',
    },
    {
      id: 'lien_patient',
      label: 'Lien firmado — paciente',
      done: lienPatient,
      urgent: !lienPatient,
      action: 'Enviar link de firma al paciente',
    },
    {
      id: 'lien_attorney',
      label: 'Lien firmado — abogado',
      done: lienAttorney,
      urgent: !lienAttorney && !!c.lawFirm,
      action: 'Contactar abogado para firma del lien',
    },
    {
      id: 'confirm',
      label: 'Primera cita confirmada (24h)',
      done: !!c.firstAppointmentConfirmedAt,
      action: 'Llamar paciente para confirmar asistencia',
    },
  ];
}

// ─── Pre-visit row ────────────────────────────────────────────────────────────

function PreVisitRow({ c }: { c: PreVisitCase }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const tasks  = getPreVisitTasks(c);
  const done   = tasks.filter(t => t.done).length;
  const total  = tasks.length;
  const urgent = tasks.filter(t => t.urgent).length;
  const appt   = c.appointments[0];
  const days   = appt ? daysUntil(appt.scheduledFor) : null;

  const patientName = c.patient ? `${c.patient.lastName.toUpperCase()}, ${c.patient.firstName}` : '—';

  return (
    <div className={`rounded-xl border bg-bg-1 overflow-hidden transition-all ${
      urgent > 0 ? 'border-amber/30' : done === total ? 'border-emerald/25' : 'border-border'
    }`}>
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors flex-wrap"
      >
        {/* Progress ring (simple) */}
        <div className="relative w-9 h-9 shrink-0">
          <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15" fill="none"
              stroke={urgent > 0 ? '#f59e0b' : done === total ? '#34d399' : '#6366f1'}
              strokeWidth="3"
              strokeDasharray={`${(done / total) * 94.2} 94.2`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-text-1">
            {done}/{total}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-text-1">{patientName}</span>
            <span className="font-mono text-[10px] text-text-muted">{c.caseCode}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: `${STATUS_COLOR[c.status]}18`, color: STATUS_COLOR[c.status] }}>
              {STATUS_LABELS[c.status] ?? c.status}
            </span>
          </div>
          <div className="flex gap-3 mt-0.5 text-[11px] text-text-muted flex-wrap">
            {c.lawFirm && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.lawFirm.firmName}</span>}
            {c.primaryInsurance && <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{c.primaryInsurance.name}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {appt && (
            <div className="text-right">
              <div className={`text-[11px] font-semibold ${days !== null && days <= 2 ? 'text-rose' : days !== null && days <= 5 ? 'text-amber' : 'text-text-1'}`}>
                {days !== null && days <= 0 ? 'Hoy' : days !== null && days === 1 ? 'Mañana' : `En ${days} días`}
              </div>
              <div className="text-[10px] text-text-muted">{fmtDate(appt.scheduledFor)} {fmtTime(appt.scheduledFor)}</div>
            </div>
          )}
          {urgent > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber">
              <AlertTriangle className="w-3 h-3" />{urgent}
            </span>
          )}
          {done === total && <CheckCircle2 className="w-4 h-4 text-emerald" />}
          <ChevronRight className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {/* Expanded tasks */}
      {open && (
        <div className="border-t border-border px-4 py-3 space-y-2.5">
          {tasks.map(task => (
            <div key={task.id} className="flex items-start gap-2.5">
              <div className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border flex items-center justify-center ${
                task.done
                  ? 'bg-emerald/15 border-emerald/40'
                  : task.urgent
                  ? 'bg-amber/10 border-amber/40'
                  : 'bg-bg-2 border-border'
              }`}>
                {task.done && <CheckCircle2 className="w-2.5 h-2.5 text-emerald" />}
                {!task.done && task.urgent && <AlertTriangle className="w-2 h-2 text-amber" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[12px] ${task.done ? 'line-through text-text-muted' : 'text-text-1'}`}>
                  {task.label}
                </div>
                {!task.done && task.action && (
                  <div className="text-[10px] text-text-muted mt-0.5">{task.action}</div>
                )}
              </div>
            </div>
          ))}

          {/* Quick actions */}
          <div className="pt-2 flex gap-2 flex-wrap border-t border-border/50">
            <button
              type="button"
              onClick={() => router.push(`/front-office/${c.id}`)}
              className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/8 px-3 py-1.5 text-[11px] font-semibold text-brand hover:bg-brand/12 transition-colors"
            >
              <FileText className="w-3 h-3" /> Ver caso
            </button>
            {c.patient?.phone && (
              <a
                href={`tel:${c.patient.phone}`}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] text-text-muted hover:text-text-1 transition-colors"
              >
                <Phone className="w-3 h-3" /> {c.patient.phone}
              </a>
            )}
            {c.lawFirm?.email && (
              <a
                href={`mailto:${c.lawFirm.email}?subject=Caso ${c.caseCode} — ${patientName}`}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] text-text-muted hover:text-text-1 transition-colors"
              >
                <Mail className="w-3 h-3" /> Email bufete
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Collections row ──────────────────────────────────────────────────────────

function CollectionsRow({ c }: { c: CollectionsCase }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const patientName = c.patient ? `${c.patient.lastName.toUpperCase()}, ${c.patient.firstName}` : '—';
  const daysSinceContact = c.notes[0] ? daysAgo(c.notes[0].createdAt) : daysAgo(c.updatedAt);
  const lienPatient  = c.lienSignatures.some(s => s.signerType === 'PATIENT');
  const lienAttorney = c.lienSignatures.some(s => s.signerType === 'ATTORNEY');
  const lienFull     = lienPatient && lienAttorney;

  const urgencyColor =
    daysSinceContact > 60 ? '#f87171' :
    daysSinceContact > 30 ? '#f59e0b' :
    '#6366f1';

  return (
    <div className={`rounded-xl border bg-bg-1 overflow-hidden transition-all ${
      daysSinceContact > 60 ? 'border-rose/30' :
      daysSinceContact > 30 ? 'border-amber/25' :
      'border-border'
    }`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors flex-wrap"
      >
        {/* Days indicator */}
        <div className="shrink-0 text-center" style={{ minWidth: 48 }}>
          <div className="text-[18px] font-black" style={{ color: urgencyColor, lineHeight: 1 }}>
            {daysSinceContact}
          </div>
          <div className="text-[8px] text-text-muted uppercase tracking-wider">días</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-text-1">{patientName}</span>
            <span className="font-mono text-[10px] text-text-muted">{c.caseCode}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: `${STATUS_COLOR[c.status]}18`, color: STATUS_COLOR[c.status] }}>
              {STATUS_LABELS[c.status] ?? c.status}
            </span>
          </div>
          <div className="flex gap-3 mt-0.5 text-[11px] text-text-muted flex-wrap">
            {c.lawFirm && <span>{c.lawFirm.firmName}</span>}
            <span>{c.appointments.length} visita{c.appointments.length !== 1 ? 's' : ''}</span>
            {c.primaryInsurance && <span>{c.primaryInsurance.name}</span>}
          </div>
          {c.notes[0] && (
            <div className="mt-0.5 text-[10px] text-text-muted truncate">
              Último contacto: {fmtDate(c.notes[0].createdAt)} — {c.notes[0].content.slice(0, 80)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!lienFull && (
            <span className="text-[10px] text-amber font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Lien incompleto
            </span>
          )}
          <ChevronRight className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Status del lien */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">Estado del Lien</div>
            <div className="flex gap-3 text-[11px]">
              <span className={`flex items-center gap-1 ${lienPatient ? 'text-emerald' : 'text-text-muted'}`}>
                {lienPatient ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                Paciente
              </span>
              <span className={`flex items-center gap-1 ${lienAttorney ? 'text-emerald' : 'text-text-muted'}`}>
                {lienAttorney ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                Abogado
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => router.push(`/billing/${c.id}`)}
              className="flex items-center gap-1.5 rounded-lg border border-amber/30 bg-amber/8 px-3 py-1.5 text-[11px] font-semibold text-amber hover:bg-amber/12 transition-colors"
            >
              <TrendingUp className="w-3 h-3" /> Ir a billing
            </button>
            {c.patient?.phone && (
              <a
                href={`tel:${c.patient.phone}`}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] text-text-muted hover:text-text-1 transition-colors"
              >
                <Phone className="w-3 h-3" /> {c.patient.phone}
              </a>
            )}
            {c.lawFirm?.phone && (
              <a
                href={`tel:${c.lawFirm.phone}`}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] text-text-muted hover:text-text-1 transition-colors"
              >
                <Phone className="w-3 h-3" /> {c.lawFirm.firmName}
              </a>
            )}
            {c.lawFirm?.email && (
              <a
                href={`mailto:${c.lawFirm.email}?subject=Settlement pendiente – ${c.caseCode}`}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] text-text-muted hover:text-text-1 transition-colors"
              >
                <Mail className="w-3 h-3" /> Email bufete
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Client ──────────────────────────────────────────────────────────────

export function EdsonClient({
  preVisitCases,
  collectionsCases,
}: {
  preVisitCases:    PreVisitCase[];
  collectionsCases: CollectionsCase[];
}) {
  const [tab, setTab] = useState<'previsita' | 'cobranzas'>('previsita');

  const urgentPre      = preVisitCases.filter(c => getPreVisitTasks(c).some(t => t.urgent)).length;
  const overdue60      = collectionsCases.filter(c => daysAgo(c.notes[0]?.createdAt ?? c.updatedAt) > 60).length;

  return (
    <div className="flex flex-col gap-5 p-5 pb-10">
      <PageHeader
        title="Bandeja Edson"
        subtitle="Cola de trabajo: pre-visita y cobranzas de settlements pendientes"
      />

      {/* Tabs */}
      <div className="flex gap-2 p-1 rounded-xl bg-bg-1 border border-border w-full sm:w-auto self-start">
        {([
          { key: 'previsita',  label: 'Pre-visita',  badge: urgentPre,    color: 'amber' },
          { key: 'cobranzas',  label: 'Cobranzas',   badge: overdue60,    color: 'rose'  },
        ] as const).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all ${
              tab === t.key
                ? 'bg-bg-0 text-text-1 shadow-sm border border-border'
                : 'text-text-muted hover:text-text-1'
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                t.color === 'amber' ? 'bg-amber/15 text-amber' : 'bg-rose/15 text-rose'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Pre-visita ── */}
      {tab === 'previsita' && (
        <div className="flex flex-col gap-3">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total',           value: preVisitCases.length,    color: '#a78bfa' },
              { label: 'Con alertas',     value: urgentPre,               color: '#f59e0b' },
              { label: 'Listos',          value: preVisitCases.filter(c => getPreVisitTasks(c).every(t => t.done)).length, color: '#34d399' },
              { label: 'Lien incompleto', value: preVisitCases.filter(c => !c.lienSignatures.some(s => s.signerType === 'PATIENT') || !c.lienSignatures.some(s => s.signerType === 'ATTORNEY')).length, color: '#f87171' },
            ].map(k => (
              <div key={k.label} className="rounded-lg border border-border bg-bg-1 p-3">
                <div className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">{k.label}</div>
                <div className="text-[24px] font-black leading-none" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {preVisitCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3 rounded-xl border border-border bg-bg-1">
              <CheckCircle2 className="w-10 h-10 text-emerald opacity-50" />
              <div className="text-text-muted text-[13px]">Sin casos con citas próximas pendientes</div>
            </div>
          ) : (
            <>
              {/* Urgentes primero */}
              {preVisitCases
                .sort((a, b) => {
                  const ua = getPreVisitTasks(a).filter(t => t.urgent).length;
                  const ub = getPreVisitTasks(b).filter(t => t.urgent).length;
                  if (ub !== ua) return ub - ua;
                  const da = a.appointments[0]?.scheduledFor;
                  const db2 = b.appointments[0]?.scheduledFor;
                  if (da && db2) return new Date(da).getTime() - new Date(db2).getTime();
                  return 0;
                })
                .map(c => <PreVisitRow key={c.id} c={c} />)
              }
            </>
          )}
        </div>
      )}

      {/* ── Tab: Cobranzas ── */}
      {tab === 'cobranzas' && (
        <div className="flex flex-col gap-3">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total',       value: collectionsCases.length, color: '#a78bfa' },
              { label: '+60 días',    value: overdue60,                color: '#f87171' },
              { label: '+30 días',    value: collectionsCases.filter(c => daysAgo(c.notes[0]?.createdAt ?? c.updatedAt) > 30).length, color: '#f59e0b' },
              { label: 'MMI cerrado', value: collectionsCases.filter(c => c.status === 'CLOSED').length, color: '#6366f1' },
            ].map(k => (
              <div key={k.label} className="rounded-lg border border-border bg-bg-1 p-3">
                <div className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">{k.label}</div>
                <div className="text-[24px] font-black leading-none" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {collectionsCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3 rounded-xl border border-border bg-bg-1">
              <CheckCircle2 className="w-10 h-10 text-emerald opacity-50" />
              <div className="text-text-muted text-[13px]">Sin casos pendientes de settlement</div>
            </div>
          ) : (
            collectionsCases
              .sort((a, b) => {
                const da = daysAgo(a.notes[0]?.createdAt ?? a.updatedAt);
                const db2 = daysAgo(b.notes[0]?.createdAt ?? b.updatedAt);
                return db2 - da;
              })
              .map(c => <CollectionsRow key={c.id} c={c} />)
          )}
        </div>
      )}

      {/* Note on B.12/B.13 */}
      <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-[11px] text-text-muted">
        <span className="font-semibold text-brand">B.12/B.13/B.23/B.24</span> · Pre-visita muestra citas próximas (14 días) con tareas incompletas.
        Cobranzas muestra casos ACTIVO/MMI/CERRADO sin settlement, ordenados por días sin contacto.
      </div>
    </div>
  );
}
