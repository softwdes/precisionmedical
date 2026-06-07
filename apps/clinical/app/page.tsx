/**
 * B.16 — Clinical Home · Cola de citas del día (MA)
 *
 * La pantalla de entrada del MA muestra las citas programadas para hoy.
 * Click en "Triaje →" abre B.16 para la cita seleccionada.
 *
 * Server component que pre-carga las citas de hoy.
 */

import Link from 'next/link';
import { db }  from '@precision-medical/database';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(iso: Date): string {
  return iso.toLocaleTimeString('es-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    SCHEDULED:   { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', label: 'Agendada'     },
    CONFIRMED:   { bg: 'rgba(16,185,129,0.12)',  text: '#34d399', label: 'Confirmada'   },
    IN_PROGRESS: { bg: 'rgba(245,158,11,0.12)',  text: '#fbbf24', label: 'En triaje'    },
    COMPLETED:   { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.45)', label: 'Completada' },
    NO_SHOW:     { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', label: 'No se presentó' },
  };
  const c = config[status] ?? config['SCHEDULED'];
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 6,
      background: c.bg, color: c.text,
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em',
    }}>
      {c.label}
    </span>
  );
}

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
    },
    orderBy: { scheduledFor: 'asc' },
  });

  const pending     = appointments.filter(a => ['SCHEDULED', 'CONFIRMED'].includes(a.status));
  const inProgress  = appointments.filter(a => a.status === 'IN_PROGRESS');
  const done        = appointments.filter(a => ['COMPLETED', 'NO_SHOW'].includes(a.status));

  return (
    <div style={{ minHeight: '100vh', background: '#0a1224', padding: '0' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.01)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, color: '#fff', fontSize: 12,
            }}>LM</div>
            <div>
              <div style={{ fontWeight: 800, color: '#fff', fontSize: 15 }}>LienMaster · Clinical</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                MA · Triaje B.16
              </div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
          {now.toLocaleDateString('es-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver' })}
        </div>
      </header>

      {/* KPIs */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Pendientes', value: pending.length,    icon: Clock,         color: '#fbbf24', bg: 'rgba(245,158,11,0.08)'    },
          { label: 'En triaje',  value: inProgress.length, icon: AlertCircle,   color: '#10b981', bg: 'rgba(16,185,129,0.08)'    },
          { label: 'Completadas', value: done.length,      icon: CheckCircle2,  color: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.04)' },
        ].map(k => (
          <div key={k.label} style={{
            flex: '1 1 120px', padding: '12px 16px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.07)',
            background: k.bg,
          }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.45)', marginBottom: 4, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Appointment list */}
      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {appointments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.40)', fontSize: 14 }}>
            Sin citas programadas para hoy
          </div>
        ) : appointments.map(appt => {
          const isComplete = ['COMPLETED', 'NO_SHOW'].includes(appt.status);
          const hasTriage  = !!appt.triageRecord;
          const age = appt.patient.dateOfBirth
            ? Math.floor((now.getTime() - new Date(appt.patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
            : null;

          return (
            <div key={appt.id} style={{
              borderRadius: 12,
              border: `1px solid ${appt.status === 'IN_PROGRESS' ? 'rgba(16,185,129,0.30)' : 'rgba(255,255,255,0.07)'}`,
              background: appt.status === 'IN_PROGRESS' ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)',
              padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            }}>
              {/* Time */}
              <div style={{ minWidth: 50, textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: '#fff' }}>
                  {fmtTime(appt.scheduledFor)}
                </div>
              </div>

              {/* Avatar */}
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 13,
              }}>
                {appt.patient.firstName[0]}{appt.patient.lastName[0]}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 3 }}>
                  {appt.patient.lastName.toUpperCase()}, {appt.patient.firstName}
                  {age && <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.45)', fontSize: 12, marginLeft: 8 }}>{age} a.</span>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {appt.provider && <span>Dr. {appt.provider.lastName}</span>}
                  <span>{appt.clinic.name}</span>
                  <span style={{ textTransform: 'capitalize', fontSize: 10 }}>
                    {appt.type.replace('_', ' ').toLowerCase()}
                  </span>
                </div>
              </div>

              {/* Status */}
              <StatusBadge status={appt.status} />

              {/* Action */}
              {!isComplete && (
                <Link
                  href={`/triage/${appt.id}`}
                  style={{
                    padding: '8px 16px', borderRadius: 8,
                    background: hasTriage ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.20)',
                    border: '1px solid rgba(16,185,129,0.30)',
                    color: '#34d399',
                    fontSize: 12, fontWeight: 700, textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {hasTriage ? 'Editar triaje →' : 'Triaje →'}
                </Link>
              )}
              {isComplete && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>✓ Completada</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
