/**
 * B.11 — Clinical Home · Cola de citas del día
 *
 * Vista principal del MA / Recepción.
 * Flujo del paciente:
 *   SCHEDULED / CONFIRMED → [Check-in →]  →  CHECKED_IN
 *   CHECKED_IN             → [Triaje →]   →  IN_PROGRESS
 *   IN_PROGRESS            → [Ver visita →] → COMPLETED
 *
 * Server component — se recarga al navegar de vuelta.
 */

import Link from 'next/link';
import { db } from '@precision-medical/database';
import { CheckCircle2, Clock, UserCheck, AlertCircle } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: Date): string {
  return iso.toLocaleTimeString('es-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    SCHEDULED:   { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', label: 'Agendada'   },
    CONFIRMED:   { bg: 'rgba(99,102,241,0.16)',  text: '#a5b4fc', label: 'Confirmada' },
    CHECKED_IN:  { bg: 'rgba(16,185,129,0.16)',  text: '#34d399', label: '✓ En espera' },
    IN_PROGRESS: { bg: 'rgba(245,158,11,0.14)',  text: '#fbbf24', label: '⚡ En consulta' },
    COMPLETED:   { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.40)', label: 'Completada' },
    NO_SHOW:     { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', label: 'No se presentó' },
    CANCELLED:   { bg: 'rgba(239,68,68,0.08)',   text: '#fca5a5', label: 'Cancelada' },
  };
  const c = cfg[status] ?? cfg['SCHEDULED'];
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 6,
      background: c.bg, color: c.text,
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em',
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ClinicalHomePage() {
  const now   = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const eod   = new Date(now); eod.setHours(23, 59, 59, 999);

  const appointments = await db.appointment.findMany({
    where: {
      scheduledFor: { gte: today, lte: eod },
      status: { not: 'CANCELLED' },
    },
    include: {
      patient:  { select: { id: true, firstName: true, lastName: true, dateOfBirth: true } },
      clinic:   { select: { id: true, name: true } },
      provider: { select: { id: true, firstName: true, lastName: true } },
      triageRecord: { select: { id: true } },
      case: { select: { caseCode: true, intakeFormCompletedAt: true } },
    },
    orderBy: { scheduledFor: 'asc' },
  });

  // Buckets
  const needsCheckin  = appointments.filter(a => ['SCHEDULED', 'CONFIRMED'].includes(a.status));
  const waitingRoom   = appointments.filter(a => a.status === 'CHECKED_IN');
  const inProgress    = appointments.filter(a => a.status === 'IN_PROGRESS');
  const done          = appointments.filter(a => ['COMPLETED', 'NO_SHOW'].includes(a.status));

  return (
    <div style={{ minHeight: '100vh', background: '#0a1224', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>

      {/* Header */}
      <header style={{
        padding: '0 24px', height: 56,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(16,185,129,0.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #10B981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, color: '#fff', fontSize: 12,
          }}>LM</div>
          <div>
            <div style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>LienMaster · Clinical</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Recepción · MA
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>
          {now.toLocaleDateString('es-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver' })}
        </div>
      </header>

      {/* KPI row */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Por llegar',  value: needsCheckin.length, icon: Clock,        color: '#818cf8', bg: 'rgba(99,102,241,0.08)'   },
          { label: 'En espera',   value: waitingRoom.length,  icon: UserCheck,    color: '#34d399', bg: 'rgba(16,185,129,0.08)'   },
          { label: 'En consulta', value: inProgress.length,   icon: AlertCircle,  color: '#fbbf24', bg: 'rgba(245,158,11,0.08)'  },
          { label: 'Completadas', value: done.length,         icon: CheckCircle2, color: 'rgba(255,255,255,0.35)', bg: 'rgba(255,255,255,0.04)' },
        ].map(k => (
          <div key={k.label} style={{
            flex: '1 1 110px', padding: '12px 14px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.07)', background: k.bg,
          }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.40)', marginBottom: 4, fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Sala de espera (CHECKED_IN) ── */}
        {waitingRoom.length > 0 && (
          <Section title="Sala de espera" color="#34d399" count={waitingRoom.length} pulse>
            {waitingRoom.map(appt => (
              <ApptRow
                key={appt.id}
                appt={appt}
                now={now}
                action={
                  <Link href={`/triage/${appt.id}`} style={btn('emerald')}>
                    Triaje →
                  </Link>
                }
              />
            ))}
          </Section>
        )}

        {/* ── Por llegar (SCHEDULED / CONFIRMED) ── */}
        {needsCheckin.length > 0 && (
          <Section title="Citas pendientes de llegada" color="#818cf8" count={needsCheckin.length}>
            {needsCheckin.map(appt => (
              <ApptRow
                key={appt.id}
                appt={appt}
                now={now}
                action={
                  <Link href={`/checkin/${appt.id}`} style={btn('indigo')}>
                    Check-in →
                  </Link>
                }
              />
            ))}
          </Section>
        )}

        {/* ── En consulta (IN_PROGRESS) ── */}
        {inProgress.length > 0 && (
          <Section title="En consulta ahora" color="#fbbf24" count={inProgress.length}>
            {inProgress.map(appt => (
              <ApptRow
                key={appt.id}
                appt={appt}
                now={now}
                action={
                  <Link href={`/visit/${appt.id}`} style={btn('amber')}>
                    Ver visita →
                  </Link>
                }
              />
            ))}
          </Section>
        )}

        {/* ── Completadas ── */}
        {done.length > 0 && (
          <Section title="Completadas hoy" color="rgba(255,255,255,0.25)" count={done.length}>
            {done.map(appt => (
              <ApptRow key={appt.id} appt={appt} now={now} dimmed />
            ))}
          </Section>
        )}

        {appointments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>
            Sin citas programadas para hoy
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title, color, count, pulse = false, children,
}: {
  title: string; color: string; count: number; pulse?: boolean; children: React.ReactNode;
}) {
  return (
    <section>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      }}>
        {pulse && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: color,
            boxShadow: `0 0 8px ${color}`,
            display: 'inline-block', flexShrink: 0,
          }} />
        )}
        <h2 style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
          color, margin: 0,
        }}>
          {title} ({count})
        </h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

type ApptData = {
  id: string;
  scheduledFor: Date;
  status: string;
  type: string;
  checkedInAt: Date | null;
  patient: { firstName: string; lastName: string; dateOfBirth: Date | null };
  provider: { firstName: string; lastName: string } | null;
  clinic: { name: string };
  triageRecord: { id: string } | null;
  case: { caseCode: string; intakeFormCompletedAt: Date | null } | null;
};

function ApptRow({ appt, now, action, dimmed = false }: {
  appt: ApptData; now: Date; action?: React.ReactNode; dimmed?: boolean;
}) {
  const age = appt.patient.dateOfBirth
    ? Math.floor((now.getTime() - new Date(appt.patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const borderColor =
    appt.status === 'CHECKED_IN'  ? 'rgba(16,185,129,0.30)' :
    appt.status === 'IN_PROGRESS' ? 'rgba(245,158,11,0.30)' :
    'rgba(255,255,255,0.07)';

  const bgColor =
    appt.status === 'CHECKED_IN'  ? 'rgba(16,185,129,0.04)' :
    appt.status === 'IN_PROGRESS' ? 'rgba(245,158,11,0.04)' :
    'rgba(255,255,255,0.02)';

  return (
    <div style={{
      borderRadius: 11, border: `1px solid ${borderColor}`,
      background: bgColor,
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      opacity: dimmed ? 0.55 : 1,
    }}>
      {/* Time */}
      <div style={{ minWidth: 48, textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#fff' }}>
          {fmtTime(appt.scheduledFor)}
        </div>
        {appt.checkedInAt && (
          <div style={{ fontSize: 9, color: '#34d399', marginTop: 1 }}>
            ✓ {fmtTime(appt.checkedInAt)}
          </div>
        )}
      </div>

      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: dimmed
          ? 'rgba(255,255,255,0.10)'
          : 'linear-gradient(135deg, #10B981, #059669)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 800, fontSize: 12,
      }}>
        {appt.patient.firstName[0]}{appt.patient.lastName[0]}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 2 }}>
          {appt.patient.lastName.toUpperCase()}, {appt.patient.firstName}
          {age !== null && (
            <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.40)', fontSize: 11, marginLeft: 8 }}>
              {age} a.
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {appt.provider && <span>Dr. {appt.provider.lastName}</span>}
          <span>{appt.clinic.name}</span>
          {appt.case && <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)' }}>{appt.case.caseCode}</span>}
          {appt.case?.intakeFormCompletedAt && (
            <span style={{ color: '#10B981' }}>✓ Intake</span>
          )}
        </div>
      </div>

      <StatusBadge status={appt.status} />

      {action}
    </div>
  );
}

// ─── Button style helpers ──────────────────────────────────────────────────────

function btn(color: 'emerald' | 'indigo' | 'amber'): React.CSSProperties {
  const map = {
    emerald: { bg: 'rgba(16,185,129,0.20)',  border: 'rgba(16,185,129,0.40)', text: '#34d399' },
    indigo:  { bg: 'rgba(99,102,241,0.18)',  border: 'rgba(99,102,241,0.40)', text: '#a5b4fc' },
    amber:   { bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.35)', text: '#fbbf24' },
  };
  const c = map[color];
  return {
    padding: '7px 14px', borderRadius: 8,
    background: c.bg, border: `1px solid ${c.border}`,
    color: c.text, fontSize: 12, fontWeight: 700,
    textDecoration: 'none', whiteSpace: 'nowrap',
    flexShrink: 0,
  };
}
