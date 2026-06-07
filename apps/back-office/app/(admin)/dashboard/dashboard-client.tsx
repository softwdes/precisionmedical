'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PhoneCall, Send, FileCheck, CalendarCheck, AlertTriangle, AlertCircle,
  ChevronRight, Clock, Calendar, Stethoscope, Building2, MessageSquarePlus,
  FileText, Bot, Cpu, User, Plus, BarChart3,
} from 'lucide-react';
import { Button } from '@precision/ui';
import {
  PageHeader, KpiCard, TagPill, PersonAvatar, EmptyState,
} from '@/components/ui-phoenix';

// B.29 — Dashboard de Recepción · vista panel agregada

interface Kpis {
  casesCreatedToday: number;
  portalsSentToday: number;
  confirmsToday: number;
  schedulesToday: number;
}

interface StatusCounts {
  NEW_REFERRAL: number;
  INTAKE_PENDING: number;
  INTAKE_COMPLETED: number;
  CONFIRMED: number;
  ACTIVE: number;
}

interface AlertItem {
  id: string;
  caseCode: string;
  patientName: string;
}

interface AlertsByKind {
  newReferralsAged: Array<AlertItem & { createdAt: Date }>;
  intakeStalled: Array<AlertItem & { sentAt: Date }>;
  confirmedNoSched: Array<AlertItem & { confirmedAt: Date }>;
}

interface UpcomingAppointment {
  id: string;
  scheduledFor: Date;
  durationMinutes: number;
  type: string;
  status: string;
  patientName: string;
  clinicName: string;
  providerName: string | null;
  providerSpecialty: string | null;
  caseId: string | null;
  caseCode: string | null;
}

interface ActivityEvent {
  id: string;
  action: string;
  actorType: string;
  actorUserId: string | null;
  createdAt: Date;
  caseId: string | null;
  caseCode: string | null;
  patientName: string | null;
  metadata: Record<string, unknown> | null;
}

interface Props {
  kpis: Kpis;
  statusCounts: StatusCounts;
  alerts: AlertsByKind;
  upcomingAppointments: UpcomingAppointment[];
  recentActivity: ActivityEvent[];
  todayBoundary: { start: Date; end: Date; tomorrowStart: Date };
}

export function DashboardClient({
  kpis,
  statusCounts,
  alerts,
  upcomingAppointments,
  recentActivity,
  todayBoundary,
}: Props) {
  const router = useRouter();
  const totalAlerts = alerts.newReferralsAged.length + alerts.intakeStalled.length + alerts.confirmedNoSched.length;

  const apptsToday = upcomingAppointments.filter(
    (a) => new Date(a.scheduledFor).getTime() < new Date(todayBoundary.tomorrowStart).getTime(),
  );
  const apptsTomorrow = upcomingAppointments.filter(
    (a) => new Date(a.scheduledFor).getTime() >= new Date(todayBoundary.tomorrowStart).getTime(),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard de Recepción"
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-text-muted text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> B.29
            </span>
            <span>· Vista panel del día · {formatDate(new Date())}</span>
          </span>
        }
        action={
          <Link href="/front-office">
            <Button>
              <PhoneCall className="w-4 h-4 mr-2" />
              Ir al queue
            </Button>
          </Link>
        }
      />

      {/* ───── KPIs del día ───────────────────────────────────────────────── */}
      <div>
        <SectionHeader icon={Clock} label="Métricas de hoy" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Casos creados"
            value={kpis.casesCreatedToday}
            sub="Nuevas llamadas atendidas"
            color="text-brand"
          />
          <KpiCard
            label="Portales enviados"
            value={kpis.portalsSentToday}
            sub="SMS/Email al paciente"
            color="text-cyan"
          />
          <KpiCard
            label="Confirmaciones"
            value={kpis.confirmsToday}
            sub="Llamadas 24h antes"
            color="text-amber"
          />
          <KpiCard
            label="Citas agendadas"
            value={kpis.schedulesToday}
            sub="Pasaron a ACTIVE"
            color="text-emerald"
          />
        </div>
      </div>

      {/* ───── Cola por status + Alertas ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Cola por status */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-bg-1 p-5">
          <SectionHeader icon={Building2} label="Cola por status · click para filtrar" />
          <div className="space-y-2">
            <StatusRow status="NEW_REFERRAL"     count={statusCounts.NEW_REFERRAL}     label="Nuevo referido"      action="Enviar portal"          color="rose"    icon="🔴" />
            <StatusRow status="INTAKE_PENDING"   count={statusCounts.INTAKE_PENDING}   label="Intake pendiente"    action="Esperando paciente"     color="amber"   icon="🟡" />
            <StatusRow status="INTAKE_COMPLETED" count={statusCounts.INTAKE_COMPLETED} label="Por confirmar (24h)" action="Llamar para confirmar"  color="cyan"    icon="🔵" />
            <StatusRow status="CONFIRMED"        count={statusCounts.CONFIRMED}        label="Confirmado"          action="Agendar primera cita"    color="emerald" icon="🟢" />
            <StatusRow status="ACTIVE"           count={statusCounts.ACTIVE}           label="En tratamiento"      action="Doctor toma el caso"     color="brand"   icon="⚕" />
          </div>
        </div>

        {/* Alertas */}
        <div className="rounded-lg border border-border bg-bg-1 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber" />
            <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">Atención requerida</h3>
            <TagPill
              label={String(totalAlerts)}
              colorClass={totalAlerts === 0 ? 'bg-emerald/15 text-emerald border-emerald/30' : 'bg-amber/15 text-amber border-amber/30'}
              compact
            />
          </div>
          {totalAlerts === 0 ? (
            <div className="rounded-md border border-emerald/30 bg-emerald/5 px-3 py-4 text-center">
              <div className="text-emerald font-semibold text-sm">✓ Todo al día</div>
              <div className="text-text-muted text-xs mt-1">No hay casos atrasados.</div>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto scroll-thin pr-1">
              <AlertGroup
                title="Sin portal enviado (>1h)"
                tone="rose"
                items={alerts.newReferralsAged.map((c) => ({
                  id: c.id,
                  caseCode: c.caseCode,
                  patientName: c.patientName,
                  time: c.createdAt,
                  timeLabel: 'hace',
                }))}
                onClick={(id) => router.push(`/front-office/${id}`)}
              />
              <AlertGroup
                title="Paciente sin responder (>24h)"
                tone="amber"
                items={alerts.intakeStalled.map((c) => ({
                  id: c.id,
                  caseCode: c.caseCode,
                  patientName: c.patientName,
                  time: c.sentAt,
                  timeLabel: 'enviado hace',
                }))}
                onClick={(id) => router.push(`/front-office/${id}`)}
              />
              <AlertGroup
                title="Confirmado sin agendar (>48h)"
                tone="emerald"
                items={alerts.confirmedNoSched.map((c) => ({
                  id: c.id,
                  caseCode: c.caseCode,
                  patientName: c.patientName,
                  time: c.confirmedAt,
                  timeLabel: 'confirmado hace',
                }))}
                onClick={(id) => router.push(`/front-office/${id}`)}
              />
            </div>
          )}
        </div>
      </div>

      {/* ───── Próximas citas + Activity feed ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Próximas citas */}
        <div className="rounded-lg border border-border bg-bg-1 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-brand" />
            <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">Próximas citas</h3>
            <span className="text-text-muted text-xs font-mono ml-auto">
              {apptsToday.length} hoy · {apptsTomorrow.length} mañana
            </span>
          </div>

          {upcomingAppointments.length === 0 ? (
            <div className="text-text-muted text-sm italic text-center py-6">
              Sin citas agendadas para hoy o mañana.
            </div>
          ) : (
            <div className="space-y-4 max-h-[450px] overflow-y-auto scroll-thin pr-1">
              {apptsToday.length > 0 && (
                <div>
                  <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold mb-2">
                    Hoy · {formatDate(new Date())}
                  </div>
                  <div className="space-y-1.5">
                    {apptsToday.map((a) => <AppointmentRow key={a.id} appt={a} />)}
                  </div>
                </div>
              )}
              {apptsTomorrow.length > 0 && (
                <div>
                  <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold mb-2">
                    Mañana · {formatDate(new Date(todayBoundary.tomorrowStart))}
                  </div>
                  <div className="space-y-1.5">
                    {apptsTomorrow.map((a) => <AppointmentRow key={a.id} appt={a} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div className="rounded-lg border border-border bg-bg-1 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-brand" />
            <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">Actividad reciente</h3>
            <span className="text-text-muted text-xs font-mono ml-auto">{recentActivity.length} eventos</span>
          </div>

          {recentActivity.length === 0 ? (
            <div className="text-text-muted text-sm italic text-center py-6">
              Sin actividad reciente.
            </div>
          ) : (
            <div className="space-y-2 max-h-[450px] overflow-y-auto scroll-thin pr-1">
              {recentActivity.map((e) => <ActivityRow key={e.id} event={e} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-brand" />
      <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{label}</h3>
    </div>
  );
}

// ─── Status row (cola por status) ─────────────────────────────────────────────

function StatusRow({
  status, count, label, action, color, icon,
}: {
  status: string;
  count: number;
  label: string;
  action: string;
  color: 'rose' | 'amber' | 'cyan' | 'emerald' | 'brand';
  icon: string;
}) {
  const colorClasses: Record<typeof color, string> = {
    rose:    'bg-rose/5 border-rose/20 hover:bg-rose/10',
    amber:   'bg-amber/5 border-amber/20 hover:bg-amber/10',
    cyan:    'bg-cyan/5 border-cyan/20 hover:bg-cyan/10',
    emerald: 'bg-emerald/5 border-emerald/20 hover:bg-emerald/10',
    brand:   'bg-brand/5 border-brand/20 hover:bg-brand/10',
  };
  const textColors: Record<typeof color, string> = {
    rose: 'text-rose', amber: 'text-amber', cyan: 'text-cyan', emerald: 'text-emerald', brand: 'text-brand',
  };

  return (
    <Link
      href={`/front-office?filter=${status}`}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md border transition-colors group ${colorClasses[color]}`}
    >
      <span className="text-lg shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-semibold text-sm ${textColors[color]}`}>{label}</span>
          <code className={`text-[10px] font-mono ${textColors[color]} opacity-70`}>{status}</code>
        </div>
        <div className="text-text-muted text-[11px]">{action}</div>
      </div>
      <div className={`text-2xl font-bold ${textColors[color]}`}>{count}</div>
      <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-1 transition-colors" />
    </Link>
  );
}

// ─── Alert group ──────────────────────────────────────────────────────────────

function AlertGroup({
  title, tone, items, onClick,
}: {
  title: string;
  tone: 'rose' | 'amber' | 'emerald';
  items: Array<{ id: string; caseCode: string; patientName: string; time: Date; timeLabel: string }>;
  onClick: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const toneClasses: Record<typeof tone, string> = {
    rose:    'text-rose bg-rose/5 border-rose/20',
    amber:   'text-amber bg-amber/5 border-amber/20',
    emerald: 'text-emerald bg-emerald/5 border-emerald/20',
  };
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1 ${tone === 'rose' ? 'text-rose' : tone === 'amber' ? 'text-amber' : 'text-emerald'}`}>
        <AlertCircle className="w-3 h-3" />
        {title} · {items.length}
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onClick(item.id)}
            className={`w-full text-left rounded-md border px-2.5 py-1.5 text-xs transition-colors ${toneClasses[tone]} hover:opacity-90`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold truncate text-text-1">{item.patientName}</span>
              <code className="text-text-muted font-mono text-[10px] shrink-0">{item.caseCode}</code>
            </div>
            <div className="text-text-muted text-[10px] mt-0.5">{item.timeLabel} {formatRelative(item.time)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Appointment row ──────────────────────────────────────────────────────────

function AppointmentRow({ appt }: { appt: UpcomingAppointment }) {
  const time = new Date(appt.scheduledFor).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit' });
  const statusColors: Record<string, string> = {
    SCHEDULED:   'bg-cyan/15 text-cyan border-cyan/30',
    CONFIRMED:   'bg-emerald/15 text-emerald border-emerald/30',
    IN_PROGRESS: 'bg-brand/15 text-brand border-brand/30',
    PENDING:     'bg-amber/15 text-amber border-amber/30',
  };

  const content = (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-bg-2/30 hover:bg-bg-2/60 transition-colors group">
      {/* Hora */}
      <div className="text-center shrink-0 w-14">
        <div className="text-text-1 font-bold text-sm">{time}</div>
        <div className="text-text-muted text-[10px]">{appt.durationMinutes}m</div>
      </div>

      {/* Patient + provider */}
      <div className="flex-1 min-w-0">
        <div className="text-text-1 text-sm font-medium truncate">{appt.patientName}</div>
        <div className="flex items-center gap-1 text-text-muted text-[11px] truncate">
          <Stethoscope className="w-3 h-3 shrink-0" />
          {appt.providerName ?? 'Sin doctor asignado'}
          {appt.providerSpecialty && (
            <span className="opacity-70">· {appt.providerSpecialty}</span>
          )}
        </div>
      </div>

      {/* Clínica + caseCode + status */}
      <div className="text-right shrink-0">
        <div className="text-text-2 text-[11px] truncate max-w-[140px]">{appt.clinicName}</div>
        <div className="flex items-center gap-1 justify-end mt-0.5">
          {appt.caseCode && <code className="text-text-muted text-[9px] font-mono">{appt.caseCode}</code>}
          <TagPill
            label={appt.status}
            colorClass={statusColors[appt.status] ?? 'bg-bg-2 text-text-2 border-border'}
            mono
            compact
          />
        </div>
      </div>
    </div>
  );

  return appt.caseId ? (
    <Link href={`/front-office/${appt.caseId}`} className="block">{content}</Link>
  ) : content;
}

// ─── Activity row ─────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  CREATE_CASE_FROM_CALL:    { label: 'Caso creado',              icon: PhoneCall,          color: 'text-brand' },
  SEND_PORTAL_LINK:         { label: 'Portal enviado',           icon: Send,               color: 'text-cyan' },
  MARK_INTAKE_COMPLETE_DEV: { label: 'Intake completado (dev)',  icon: FileText,           color: 'text-amber' },
  CONFIRM_FIRST_APPOINTMENT:{ label: 'Cita confirmada',          icon: FileCheck,          color: 'text-emerald' },
  SCHEDULE_FIRST_APPOINTMENT:{ label: 'Cita agendada',           icon: CalendarCheck,      color: 'text-brand' },
  INSERT_CASE_NOTE:         { label: 'Nota agregada',            icon: MessageSquarePlus,  color: 'text-violet' },
};

function ActivityRow({ event }: { event: ActivityEvent }) {
  const meta = ACTION_META[event.action];
  if (!meta) return null;
  const Icon = meta.icon;
  const ActorIcon = event.actorType === 'AI_AGENT' ? Bot : event.actorType === 'SYSTEM' ? Cpu : User;

  const content = (
    <div className="flex items-start gap-3 px-3 py-2 rounded-md border border-border bg-bg-2/30 hover:bg-bg-2/60 transition-colors">
      <div className={`w-7 h-7 rounded-full bg-bg-1 border border-border flex items-center justify-center shrink-0 ${meta.color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-text-1 text-sm font-medium">{meta.label}</span>
          {event.caseCode && <code className="text-text-muted text-[10px] font-mono">{event.caseCode}</code>}
        </div>
        <div className="flex items-center gap-2 text-text-muted text-[10px] mt-0.5 truncate">
          {event.patientName && <span className="truncate">{event.patientName}</span>}
          <ActorIcon className="w-3 h-3 shrink-0" />
          <span>{formatRelative(event.createdAt)}</span>
        </div>
      </div>
    </div>
  );

  return event.caseId ? (
    <Link href={`/front-office/${event.caseId}`} className="block">{content}</Link>
  ) : content;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('es-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatRelative(d: Date | string): string {
  const h = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60);
  if (h < 1) {
    const m = Math.max(1, Math.floor(h * 60));
    return `${m}m`;
  }
  if (h < 24) return `${Math.floor(h)}h`;
  if (h < 24 * 7) return `${Math.floor(h / 24)}d`;
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric' });
}
