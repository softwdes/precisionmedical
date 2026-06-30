'use client';

/**
 * B.11 — AppointmentDetailPanel
 *
 * Slide-in panel lateral al hacer click en una cita del calendario.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Phone, MessageSquare, RefreshCw, Calendar,
  CheckCircle2, Clock, AlertTriangle, ChevronRight,
  User, Scale, Shield, Headphones, Check, Edit2, Ban,
  AlertCircle, Save,
} from 'lucide-react';
import { PersonAvatar } from '@/components/ui-phoenix/person-avatar';
import { StatusPill, type StatusState } from '@/components/ui-phoenix/status-pill';
import { AppointmentSecondaryModals, type SecondaryModalType } from './appointment-secondary-modals';
import { AppointmentDialog } from './appointment-dialog';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  appointment: CalendarAppointment;
  onClose: () => void;
  onRefresh: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: `${MONTHS_ES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
    time: d.toLocaleTimeString('es-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    dayName: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()],
    dateInput: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    timeInput: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
  };
}

function ageFromISO(iso: string | null): string {
  if (!iso) return '?';
  const dob  = new Date(iso);
  const diff = Date.now() - dob.getTime();
  return String(Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
}

const TYPE_LABEL: Record<string, string> = {
  AUTO_ACCIDENT:   'MVA · Auto Accident',
  FAMILY_PRACTICE: 'Family Practice',
  URGENT_CARE:     'Urgent Care',
  FOLLOW_UP:       'Follow-up',
  CONSULTATION:    'Consultation',
};

const SPECIALTY_LABEL: Record<string, string> = {
  CHIROPRACTIC:     'Chiropractic',
  PHYSICAL_THERAPY: 'Physical Therapy',
  PAIN_MANAGEMENT:  'Pain Management',
  ORTHOPEDICS:      'Orthopedics',
  NEUROLOGY:        'Neurology',
  RADIOLOGY:        'Radiology',
  PSYCHOLOGY:       'Psychology',
  GENERAL:          'General',
  OTHER:            'Other',
};

const STATUS_CONFIG: Record<string, { label: string; state: StatusState }> = {
  SCHEDULED:   { label: 'Agendada',       state: 'info'    },
  CONFIRMED:   { label: 'Confirmada',     state: 'success' },
  IN_PROGRESS: { label: 'En curso',       state: 'active'  },
  COMPLETED:   { label: 'Atendida',       state: 'success' },
  PENDING:     { label: 'Pendiente',      state: 'warning' },
  NO_SHOW:     { label: 'No se presentó', state: 'danger'  },
};

// ─── Componente principal ─────────────────────────────────────────────────────

export function AppointmentDetailPanel({ appointment: appt, onClose, onRefresh }: Props) {
  const router = useRouter();
  const [activeModal,   setActiveModal]   = useState<SecondaryModalType | null>(null);
  const [confirming,    setConfirming]    = useState(false);

  // Cancelar cita
  const [cancelOpen,    setCancelOpen]    = useState(false);
  const [cancelling,    setCancelling]    = useState(false);
  const [cancelError,   setCancelError]   = useState<string | null>(null);

  // Reagendar
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  // Editar (notas + duración)
  const [editOpen,      setEditOpen]      = useState(false);
  const [editNotes,     setEditNotes]     = useState(appt.notes ?? '');
  const [editDuration,  setEditDuration]  = useState(appt.durationMinutes);
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);

  const isFirst   = appt.visitNumber === 0;
  const dt        = formatDateTime(appt.scheduledFor);
  const statusCfg = STATUS_CONFIG[appt.status] ?? { label: appt.status, state: 'info' as StatusState };

  const intakeDone    = !!appt.case?.intakeFormCompletedAt;
  const lawyerDone    = !!appt.case?.attorney;
  const insuranceDone = !!appt.case?.primaryInsurance;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await fetch(`/api/admin/appointments/${appt.id}/confirm`, { method: 'POST' });
      onRefresh();
      onClose();
    } finally { setConfirming(false); }
  };

  const handleCancel = async () => {
    setCancelError(null);
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
      onRefresh();
      onClose();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Error al cancelar');
    } finally {
      setCancelling(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: editNotes.trim() || null,
          durationMinutes: editDuration,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
      onRefresh();
      setEditOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Panel */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[540px] bg-bg-1 border-l border-border flex flex-col shadow-2xl overflow-hidden">

        {/* ─── Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-cyan" />
            <div>
              <div className="text-text-1 font-semibold text-sm">{dt.dayName} {dt.date}</div>
              <div className="text-text-muted text-xs">{dt.time} · {appt.durationMinutes} min</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill label={statusCfg.label} state={statusCfg.state} />
            <button type="button" onClick={onClose}
              className="w-8 h-8 rounded-md hover:bg-white/5 flex items-center justify-center text-text-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── Scrollable body ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Banner primera cita */}
          {isFirst && (
            <div className="rounded-xl border-2 border-rose/40 p-4"
              style={{ background: 'linear-gradient(135deg,rgba(236,72,153,0.12),rgba(244,63,94,0.07))' }}>
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">🆕</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm">PRIMERA CITA — llamar al paciente para confirmar</div>
                  <div className="text-text-2 text-xs mt-1 leading-relaxed">
                    Verificar antes de la fecha: DOL · abogado · seguro · formulario completado.
                  </div>
                </div>
                {appt.patient.phone && (
                  <a href={`tel:${appt.patient.phone}`}
                    className="shrink-0 px-3 py-2 rounded-lg text-white text-xs font-bold transition-opacity hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#ec4899,#f43f5e)', boxShadow: '0 4px 14px rgba(236,72,153,0.35)' }}>
                    📞 Llamar
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Paciente */}
          <div className="rounded-lg border border-border bg-bg-2/30 p-4">
            <div className="flex items-center gap-3">
              <PersonAvatar firstName={appt.patient.firstName} lastName={appt.patient.lastName} size={10} />
              <div className="flex-1 min-w-0">
                <div className="text-text-1 font-bold text-sm">
                  {appt.patient.firstName} {appt.patient.lastName}
                  {appt.case && <span className="ml-2 text-rose font-mono text-[11px]">#{appt.case.caseCode}</span>}
                </div>
                <div className="text-text-muted text-xs mt-0.5">{ageFromISO(appt.patient.dateOfBirth)} años</div>
              </div>
              {isFirst ? (
                <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full text-white"
                  style={{ background: 'linear-gradient(135deg,#ec4899,#f43f5e)' }}>
                  🆕 1ra cita
                </span>
              ) : (
                <span className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-bg-2 text-text-muted border border-border">
                  Visita {appt.visitNumber + 1}
                </span>
              )}
            </div>
          </div>

          {/* Info de la cita */}
          <div className="rounded-lg border border-border bg-bg-1 p-4">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📅 Información de la cita</div>
            <div className="space-y-2 text-[12.5px]">
              <Row label="Fecha y hora"  value={`${dt.dayName} ${dt.date} · ${dt.time}`} highlight />
              <Row label="Duración"      value={`${appt.durationMinutes} min`} />
              <Row label="Clínica"       value={appt.clinic.name} />
              {appt.provider && (
                <Row label="Doctor" value={`Dr. ${appt.provider.firstName} ${appt.provider.lastName}`} />
              )}
              {appt.provider?.specialty && (
                <Row label="Especialidad" value={SPECIALTY_LABEL[appt.provider.specialty] ?? appt.provider.specialty} />
              )}
              <Row label="Tipo" value={TYPE_LABEL[appt.type] ?? appt.type} chip chipColor={appt.type === 'AUTO_ACCIDENT' ? 'rose' : 'emerald'} />
              {appt.case?.accidentDate && (
                <Row label="Fecha accidente (DOL)"
                  value={new Date(appt.case.accidentDate).toLocaleDateString('es-US', { dateStyle: 'medium' })} highlight />
              )}
            </div>
          </div>

          {/* Checklist pre-cita */}
          <div className="rounded-lg border border-border bg-bg-1 p-4">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">🎯 Estado pre-cita</div>
            <div className="space-y-2">
              <CheckItem done={intakeDone}    label="Formulario del paciente"             sublabel={intakeDone ? 'Completado' : 'Pendiente — reenviar si necesario'} />
              <CheckItem done={lawyerDone}    label="Abogado verificado"                  sublabel={lawyerDone ? (appt.case?.attorney?.firmName ?? (`${appt.case?.attorney?.firstName ?? ''} ${appt.case?.attorney?.lastName ?? ''}`.trim() || '—')) : 'Sin abogado asignado'} />
              <CheckItem done={insuranceDone} label="PIP / Seguro verificado"             sublabel={insuranceDone ? (appt.case?.primaryInsurance?.name ?? '—') : 'Pendiente de verificar'} />
              <CheckItem done={appt.status === 'CONFIRMED'} label="Llamada de confirmación (24h antes)" sublabel={appt.status === 'CONFIRMED' ? 'Confirmada' : 'No realizada'} />
            </div>
          </div>

          {/* Notas */}
          {!editOpen ? (
            <div className="rounded-lg border border-border bg-bg-1 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">📝 Notas de la cita</div>
                <button type="button" onClick={() => { setEditNotes(appt.notes ?? ''); setEditDuration(appt.durationMinutes); setEditOpen(true); }}
                  className="text-[10px] text-brand hover:underline flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> Editar
                </button>
              </div>
              <p className="text-text-2 text-[12.5px] leading-relaxed min-h-[40px]">
                {appt.notes || <span className="text-text-muted italic">Sin notas.</span>}
              </p>
            </div>
          ) : (
            /* ── Panel de edición inline ── */
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-brand">✏️ Editar cita</div>

              <div>
                <label className="text-text-muted text-[11px] mb-1 block">Duración (min)</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[15, 30, 45, 60, 90, 120].map((d) => (
                    <button key={d} type="button" onClick={() => setEditDuration(d)}
                      className={`px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                        editDuration === d
                          ? 'bg-brand/20 border-brand/50 text-brand'
                          : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                      }`}>
                      {d}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-text-muted text-[11px] mb-1 block">Notas</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[72px]"
                  placeholder="Notas para el doctor..."
                  maxLength={2000}
                />
              </div>

              {saveError && (
                <div className="text-rose text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {saveError}
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => setEditOpen(false)} disabled={saving}
                  className="flex-1 px-3 py-2 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={handleSaveEdit} disabled={saving}
                  className="flex-1 px-3 py-2 rounded-md bg-brand/15 border border-brand/40 text-brand text-xs font-semibold hover:bg-brand/20 transition-colors flex items-center justify-center gap-1.5">
                  {saving ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          )}

          {/* Acciones rápidas */}
          <div className="rounded-lg border border-border bg-bg-1 p-4">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📞 Acciones rápidas</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {appt.patient.phone && (
                <a href={`tel:${appt.patient.phone}`}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                  <Phone className="w-4 h-4" />
                  Llamar
                </a>
              )}
              {appt.patient.phone && (
                <a href={`sms:${appt.patient.phone}`}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                  <MessageSquare className="w-4 h-4" />
                  SMS
                </a>
              )}
              <button type="button"
                onClick={() => setRescheduleOpen(true)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                <RefreshCw className="w-4 h-4" />
                Reagendar
              </button>
              <button type="button"
                onClick={() => setActiveModal('intake')}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-white/5 text-text-2 hover:text-text-1 transition-colors text-[11px] font-medium">
                <MessageSquare className="w-4 h-4" />
                Reenviar form
              </button>
            </div>
          </div>

          {/* Modales secundarios */}
          <div className="rounded-lg border border-border bg-bg-1 p-4">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3">📂 Ver información detallada</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <SecondaryBtn icon={<User className="w-4 h-4" />}     label="Datos personales"      color="brand"   onClick={() => setActiveModal('personal')} />
              <SecondaryBtn icon={<Scale className="w-4 h-4" />}    label="Abogado & bufete"      color="rose"    done={lawyerDone}    onClick={() => setActiveModal('lawyer')} />
              <SecondaryBtn icon={<Shield className="w-4 h-4" />}   label="Seguro (PIP)"          color="emerald" done={insuranceDone} onClick={() => setActiveModal('insurance')} />
              <SecondaryBtn icon={<Headphones className="w-4 h-4" />} label="Quién atendió llamada" color="cyan"   onClick={() => setActiveModal('callHandler')} />
            </div>
          </div>
        </div>

        {/* ─── Footer ───────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-4 border-t border-border flex flex-col gap-2">
          {/* Confirm cancelar */}
          {cancelOpen ? (
            <div className="rounded-lg border border-rose/30 bg-rose/5 p-3 space-y-2">
              <p className="text-rose text-xs font-semibold">¿Cancelar esta cita?</p>
              <p className="text-text-muted text-[11px]">Esta acción no se puede deshacer. La cita pasará a status CANCELLED.</p>
              {cancelError && <p className="text-rose text-[11px] flex items-center gap-1"><AlertCircle className="w-3 h-3" />{cancelError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setCancelOpen(false); setCancelError(null); }} disabled={cancelling}
                  className="flex-1 px-3 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 transition-colors">
                  Volver
                </button>
                <button type="button" onClick={handleCancel} disabled={cancelling}
                  className="flex-1 px-3 py-1.5 rounded-md bg-rose/15 border border-rose/40 text-rose text-xs font-semibold hover:bg-rose/20 transition-colors flex items-center justify-center gap-1.5">
                  {cancelling ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                  {cancelling ? 'Cancelando...' : 'Sí, cancelar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button type="button"
                onClick={() => setCancelOpen(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-rose/30 text-rose hover:bg-rose/10 text-xs font-medium transition-colors sm:mr-auto">
                <Ban className="w-3.5 h-3.5" />
                Cancelar cita
              </button>
              <button type="button"
                onClick={() => { setEditNotes(appt.notes ?? ''); setEditDuration(appt.durationMinutes); setEditOpen(true); }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-text-2 hover:bg-white/5 text-xs font-medium transition-colors">
                <Edit2 className="w-3.5 h-3.5" />
                Editar
              </button>
              {appt.status !== 'CONFIRMED' && appt.status !== 'COMPLETED' && (
                <button type="button" onClick={handleConfirm} disabled={confirming}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-emerald/15 border border-emerald/40 text-emerald hover:bg-emerald/20 text-xs font-semibold transition-colors disabled:opacity-50">
                  {confirming ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Marcar confirmada
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Secondary modals */}
      {activeModal && (
        <AppointmentSecondaryModals
          type={activeModal}
          appointment={appt}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* Reagendar — AppointmentDialog pre-llenado con fecha+hora actual */}
      <AppointmentDialog
        mode="free"
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        initialDate={dt.dateInput}
        initialTime={dt.timeInput}
        onSuccess={() => { onRefresh(); onClose(); }}
      />
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value, highlight, chip, chipColor }: {
  label: string; value: string; highlight?: boolean; chip?: boolean; chipColor?: 'rose' | 'emerald';
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted shrink-0">{label}</span>
      {chip ? (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
          chipColor === 'rose' ? 'bg-rose/15 text-rose border border-rose/30' : 'bg-emerald/15 text-emerald border border-emerald/30'
        }`}>{value}</span>
      ) : (
        <span className={highlight ? 'text-text-1 font-semibold' : 'text-text-2'}>{value}</span>
      )}
    </div>
  );
}

function CheckItem({ done, label, sublabel }: { done: boolean; label: string; sublabel: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`mt-0.5 shrink-0 ${done ? 'text-emerald' : 'text-text-muted'}`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4 text-amber" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[12.5px] ${done ? 'text-text-1' : 'text-text-2'}`}>{label}</div>
        <div className={`text-[11px] ${done ? 'text-emerald' : 'text-amber'}`}>{sublabel}</div>
      </div>
    </div>
  );
}

type BtnColor = 'brand' | 'rose' | 'emerald' | 'cyan';
const BTN_COLOR_MAP: Record<BtnColor, { bg: string; border: string; text: string }> = {
  brand:   { bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.25)',  text: '#a5b4fc' },
  rose:    { bg: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.25)',   text: '#fda4af' },
  emerald: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)', text: '#6ee7b7' },
  cyan:    { bg: 'rgba(6,182,212,0.08)',   border: 'rgba(6,182,212,0.25)',  text: '#67e8f9' },
};

function SecondaryBtn({ icon, label, color, done, onClick }: {
  icon: React.ReactNode; label: string; color: BtnColor; done?: boolean; onClick: () => void;
}) {
  const c = BTN_COLOR_MAP[color];
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-2.5 p-3 rounded-lg text-left transition-opacity hover:opacity-80"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <span style={{ color: c.text }}>{icon}</span>
      <span className="flex-1 text-[12.5px] font-medium" style={{ color: c.text }}>{label}</span>
      {done !== undefined && <span className={`text-[10px] ${done ? 'text-emerald' : 'text-amber'}`}>{done ? '✓' : '⏳'}</span>}
      <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
    </button>
  );
}
