/**
 * B.17 — Mi Día (Doctor)
 *
 * Dashboard del doctor: resumen del día con "Siguiente paciente" hero,
 * cola de citas y acciones pendientes (notas no firmadas).
 *
 * Color accent: violet (Regla #5 — módulo Doctor)
 */

import Link  from 'next/link';
import { db } from '@precision-medical/database';
import {
  ClipboardList, UserCheck, CheckCircle2,
  Clock, AlertTriangle, ChevronRight, PenLine, FlaskConical,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(iso: Date): string {
  return iso.toLocaleTimeString('es-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

function calcAge(dob: Date | null): string {
  if (!dob) return '';
  const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${age} a.`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({
  label, value, icon: Icon, color, bg,
}: {
  label: string; value: number;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div style={{
      flex: '1 1 110px', padding: '14px 16px', borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.07)', background: bg,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function ApptRow({
  appt, isHero = false,
}: {
  appt: {
    id: string;
    scheduledFor: Date;
    type: string;
    status: string;
    patient: { firstName: string; lastName: string; dateOfBirth: Date | null } | null;
    clinic: { name: string } | null;
    provider: { firstName: string; lastName: string } | null;
    triageRecord: { id: string } | null;
    visitNote: { id: string; status: string } | null;
    labOrders: { id: string; status: string; studyName: string }[];
  };
  isHero?: boolean;
}) {
  const hasTriage   = !!appt.triageRecord;
  const noteStatus  = appt.visitNote?.status;
  const pendingLabs = appt.labOrders.filter(l => l.status === 'ORDERED' || l.status === 'IN_PROGRESS');
  const isDone      = appt.status === 'COMPLETED';
  const isNoShow    = appt.status === 'NO_SHOW';
  const isCheckedIn = appt.status === 'CHECKED_IN';
  const isInRoom    = appt.status === 'IN_PROGRESS';
  // Guardrail: triaje bloqueante solo cuando ya está en sala
  const triageBlocking = isInRoom && !hasTriage;

  const statusColors: Record<string, string> = {
    SCHEDULED:   '#a78bfa',
    CONFIRMED:   '#34d399',
    CHECKED_IN:  '#fbbf24',
    IN_PROGRESS: '#10b981',
    COMPLETED:   'rgba(255,255,255,0.35)',
    NO_SHOW:     '#f87171',
  };
  const statusLabels: Record<string, string> = {
    SCHEDULED:   'Agendada',
    CONFIRMED:   'Confirmada',
    CHECKED_IN:  '✓ Check-in',
    IN_PROGRESS: 'En triaje',
    COMPLETED:   'Completada',
    NO_SHOW:     'No se presentó',
  };

  return (
    <div style={{
      borderRadius: isHero ? 16 : 12,
      border: `1px solid ${
        isHero        ? 'rgba(139,92,246,0.40)' :
        isCheckedIn   ? 'rgba(245,158,11,0.30)' :
        isInRoom && hasTriage ? 'rgba(16,185,129,0.30)' :
        'rgba(255,255,255,0.07)'
      }`,
      background: isHero        ? 'rgba(139,92,246,0.08)'  :
                  isCheckedIn   ? 'rgba(245,158,11,0.03)'  :
                  isInRoom && hasTriage ? 'rgba(16,185,129,0.04)' :
                  'rgba(255,255,255,0.02)',
      padding: isHero ? '20px 24px' : '14px 18px',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      {/* Hora */}
      <div style={{ minWidth: 52, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'monospace', fontWeight: 900,
          fontSize: isHero ? 20 : 14,
          color: isHero ? '#a78bfa' : '#fff',
        }}>
          {fmtTime(appt.scheduledFor)}
        </div>
      </div>

      {/* Avatar */}
      {appt.patient && (
        <div style={{
          width: isHero ? 48 : 38, height: isHero ? 48 : 38,
          borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 800, fontSize: isHero ? 16 : 13,
        }}>
          {appt.patient.firstName[0]}{appt.patient.lastName[0]}
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {appt.patient && (
          <div style={{ fontWeight: 700, color: '#fff', fontSize: isHero ? 17 : 14, marginBottom: 3 }}>
            {appt.patient.lastName.toUpperCase()}, {appt.patient.firstName}
            {appt.patient.dateOfBirth && (
              <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.45)', fontSize: 12, marginLeft: 8 }}>
                {calcAge(appt.patient.dateOfBirth)}
              </span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'rgba(255,255,255,0.50)' }}>
          {appt.clinic && <span>{appt.clinic.name}</span>}
          <span style={{ textTransform: 'capitalize' }}>{appt.type.replace(/_/g, ' ').toLowerCase()}</span>
          {/* Triaje badge */}
          {hasTriage && (
            <span style={{ color: '#34d399', fontWeight: 600 }}>✓ Triaje listo</span>
          )}
          {triageBlocking && (
            <span style={{
              color: '#f87171', fontWeight: 700,
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.25)',
              padding: '1px 6px', borderRadius: 4, fontSize: 10,
            }}>⛔ Esperando triaje MA</span>
          )}
          {isCheckedIn && !hasTriage && (
            <span style={{ color: '#fbbf24', fontSize: 10 }}>⏱ En recepción</span>
          )}
          {/* Labs badge */}
          {pendingLabs.length > 0 && (
            <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: 10 }}>
              🧪 {pendingLabs.length} lab{pendingLabs.length > 1 ? 's' : ''} pendiente{pendingLabs.length > 1 ? 's' : ''}
            </span>
          )}
          {/* Nota badge */}
          {noteStatus === 'SIGNED' && (
            <span style={{ color: '#a78bfa', fontWeight: 600 }}>✓ Nota firmada</span>
          )}
          {noteStatus === 'DRAFT' && (
            <span style={{ color: 'rgba(255,255,255,0.40)' }}>Borrador</span>
          )}
        </div>
      </div>

      {/* Status chip */}
      <span style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em',
        color: statusColors[appt.status] ?? '#a78bfa',
        background: `${statusColors[appt.status] ?? '#a78bfa'}18`,
        padding: '3px 8px', borderRadius: 6,
      }}>
        {statusLabels[appt.status] ?? appt.status}
      </span>

      {/* CTA */}
      {!isDone && !isNoShow && !triageBlocking && (
        <Link
          href={`/visit/${appt.id}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: isHero ? '10px 20px' : '8px 14px',
            borderRadius: 8,
            background: noteStatus === 'DRAFT' ? 'rgba(139,92,246,0.20)' : 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.35)',
            color: '#a78bfa',
            fontSize: isHero ? 13 : 12, fontWeight: 700, textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <PenLine size={13} />
          {isHero ? 'Atender ahora →' : 'Nota →'}
        </Link>
      )}
      {/* Guardrail: triage bloqueante → botón deshabilitado */}
      {!isDone && !isNoShow && triageBlocking && (
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: isHero ? '10px 20px' : '8px 14px',
          borderRadius: 8,
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.20)',
          color: '#f87171',
          fontSize: isHero ? 13 : 12, fontWeight: 700,
          whiteSpace: 'nowrap', opacity: 0.75, cursor: 'not-allowed',
        }}>
          <AlertTriangle size={13} />
          Esperando MA
        </span>
      )}
      {isDone && noteStatus !== 'SIGNED' && (
        <Link
          href={`/visit/${appt.id}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 8,
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.30)',
            color: '#fbbf24',
            fontSize: 11, fontWeight: 700, textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <AlertTriangle size={11} />
          Firmar nota
        </Link>
      )}
      {isDone && noteStatus === 'SIGNED' && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCircle2 size={13} /> Completa
        </span>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function DoctorMiDiaPage() {
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
      visitNote:    { select: { id: true, status: true } },
      labOrders:    { select: { id: true, status: true, studyName: true } },
    },
    orderBy: { scheduledFor: 'asc' },
  });

  // Clasificar citas
  const upcoming = appointments.filter(a =>
    ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(a.status),
  );
  const done = appointments.filter(a => ['COMPLETED', 'NO_SHOW'].includes(a.status));

  // Prioridad: IN_PROGRESS con triaje > CHECKED_IN > CONFIRMED > SCHEDULED > resto (hora)
  const priorityScore = (a: typeof upcoming[number]) => {
    if (a.status === 'IN_PROGRESS' && a.triageRecord)  return 0;
    if (a.status === 'IN_PROGRESS' && !a.triageRecord) return 1;
    if (a.status === 'CHECKED_IN')                     return 2;
    if (a.status === 'CONFIRMED')                      return 3;
    return 4;
  };
  const sorted   = [...upcoming].sort((a, b) => priorityScore(a) - priorityScore(b) || a.scheduledFor.getTime() - b.scheduledFor.getTime());
  const nextAppt = sorted[0] ?? null;
  const queue    = sorted.slice(1);

  // Pendientes de firma
  const unsignedDone = done.filter(a => a.visitNote?.status !== 'SIGNED' && a.status !== 'NO_SHOW');

  // Labs pendientes del día (todas las citas)
  const totalPendingLabs = appointments.reduce((acc, a) =>
    acc + a.labOrders.filter(l => l.status === 'ORDERED' || l.status === 'IN_PROGRESS').length, 0,
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a1224' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, color: '#fff', fontSize: 14,
          }}>LM</div>
          <div>
            <div style={{ fontWeight: 800, color: '#fff', fontSize: 15 }}>LienMaster · Clinical</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Dr. · Mi Día B.17
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/" style={{ fontSize: 11, color: '#a78bfa', textDecoration: 'none' }}>
            ← Cola MA
          </Link>
          <Link href="/doctor/templates" style={{
            fontSize: 11, color: '#a78bfa', textDecoration: 'none',
            padding: '4px 10px', borderRadius: 6,
            background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.20)',
          }}>
            📋 Plantillas
          </Link>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
            {now.toLocaleDateString('es-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver' })}
          </div>
        </div>
      </header>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* KPIs */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <KpiCard label="Pendientes"  value={upcoming.length}       icon={Clock}         color="#a78bfa" bg="rgba(139,92,246,0.08)"  />
          <KpiCard label="Completadas" value={done.length}           icon={CheckCircle2}  color="rgba(255,255,255,0.45)" bg="rgba(255,255,255,0.03)" />
          <KpiCard label="Sin firmar"  value={unsignedDone.length}   icon={AlertTriangle} color="#fbbf24" bg="rgba(245,158,11,0.07)"  />
          <KpiCard label="Labs pend."  value={totalPendingLabs}      icon={FlaskConical}  color="#38bdf8" bg="rgba(56,189,248,0.07)"  />
        </div>

        {/* Acción requerida: notas sin firmar */}
        {unsignedDone.length > 0 && (
          <section>
            <h3 style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em',
              color: '#fbbf24', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <AlertTriangle size={12} /> Notas pendientes de firma ({unsignedDone.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unsignedDone.map(a => <ApptRow key={a.id} appt={a} />)}
            </div>
          </section>
        )}

        {/* Siguiente paciente */}
        {nextAppt ? (
          <section>
            <h3 style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em',
              color: '#a78bfa', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <UserCheck size={12} /> Siguiente paciente
            </h3>
            <ApptRow appt={nextAppt} isHero />
          </section>
        ) : (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            border: '1px dashed rgba(255,255,255,0.10)', borderRadius: 16,
            color: 'rgba(255,255,255,0.35)', fontSize: 14,
          }}>
            <ClipboardList size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
            <div>Sin citas pendientes para hoy</div>
          </div>
        )}

        {/* Cola del día */}
        {queue.length > 0 && (
          <section>
            <h3 style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em',
              color: 'rgba(255,255,255,0.45)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <ChevronRight size={12} /> A continuación ({queue.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {queue.map(a => <ApptRow key={a.id} appt={a} />)}
            </div>
          </section>
        )}

        {/* Completadas */}
        {done.length > 0 && (
          <section>
            <h3 style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em',
              color: 'rgba(255,255,255,0.30)', marginBottom: 10,
            }}>
              Completadas ({done.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {done.map(a => <ApptRow key={a.id} appt={a} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
