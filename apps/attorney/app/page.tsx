/**
 * B.22 — Portal del Abogado · Dashboard
 * Rose accent · acceso por magic link (Phase 1A: mock)
 */
import Link from 'next/link';
import { db } from '@precision-medical/database';
import { FileText, Clock, DollarSign, CheckCircle2, Scale, ChevronRight, AlertCircle } from 'lucide-react';

function calcAge(dob: Date | null): string {
  if (!dob) return '';
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))} a.`;
}
function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });
}

export default async function AttorneyDashboard() {
  // Phase 1A: primer bufete activo = mock session
  const attorney = await db.lawyer.findFirst({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true, firmName: true, firstName: true, lastName: true, email: true },
  });

  const cases = attorney ? await db.case.findMany({
    where: { lawFirmId: attorney.id, deletedAt: null },
    include: {
      patient: { select: { firstName: true, lastName: true, dateOfBirth: true } },
      appointments: {
        where: { status: { not: 'CANCELLED' } },
        include: {
          visitNote: { select: { id: true, status: true, signedAt: true } },
          provider:  { select: { firstName: true, lastName: true } },
          clinic:    { select: { name: true } },
        },
        orderBy: { scheduledFor: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  }) : [];

  // Clasificar casos
  const lienReady    = cases.filter(c => c.appointments.some(a => a.visitNote?.status === 'SIGNED'));
  const inTreatment  = cases.filter(c => ['ACTIVE', 'CONFIRMED', 'INTAKE_COMPLETED'].includes(c.status as string));
  const toSettle     = cases.filter(c => (c.status as string) === 'MMI');
  const closedMonth  = cases.filter(c => {
    if (c.status !== 'CLOSED') return false;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    return new Date(c.updatedAt) >= cutoff;
  });

  const now = new Date();

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e' }} suppressHydrationWarning>
      {/* Header */}
      <header style={{
        padding: '0 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(244,63,94,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 60, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg,#f43f5e,#ec4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}>
            <Scale size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>LienMaster · Portal Legal</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
              {attorney?.firmName ?? 'Bufete'} · B.22
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#34d399' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
            En tiempo real
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>
            {now.toLocaleDateString('es-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver' })}
          </div>
        </div>
      </header>

      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Welcome */}
        <div>
          <div style={{ fontWeight: 900, fontSize: 22, color: '#fff' }}>
            Bienvenido{attorney?.firstName ? `, ${attorney.firstName}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            {attorney?.firmName ?? 'Su bufete'}{attorney?.email ? ` · ${attorney.email}` : ''}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { label: 'Listos para firmar', value: lienReady.length,   icon: FileText,     color: '#fb7185', bg: 'rgba(244,63,94,0.10)',   border: 'rgba(244,63,94,0.25)' },
            { label: 'En tratamiento',     value: inTreatment.length, icon: Clock,        color: '#67e8f9', bg: 'rgba(6,182,212,0.08)',   border: 'rgba(6,182,212,0.20)' },
            { label: 'Por liquidar',       value: toSettle.length,    icon: DollarSign,   color: '#fbbf24', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.20)' },
            { label: 'Cerrados este mes',  value: closedMonth.length, icon: CheckCircle2, color: '#a78bfa', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.20)' },
          ].map(k => (
            <div key={k.label} style={{
              padding: '16px', borderRadius: 12,
              background: k.bg, border: `1px solid ${k.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <k.icon size={13} color={k.color} />
                <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
                  {k.label}
                </span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Liens listos para firmar */}
        {lienReady.length > 0 && (
          <section>
            <h2 style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
              color: '#fb7185', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fb7185', boxShadow: '0 0 8px #fb7185', display: 'inline-block' }} />
              Liens listos para firmar ({lienReady.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lienReady.map(c => {
                const appts       = c.appointments;
                const signedCount = appts.filter(a => a.visitNote?.status === 'SIGNED').length;
                const lastAppt    = appts[0];
                return (
                  <div key={c.id} style={{
                    borderRadius: 12,
                    background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.30)',
                    padding: '16px 20px',
                    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                    boxShadow: '0 0 20px rgba(244,63,94,0.08)',
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg,#f43f5e,#ec4899)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 800, fontSize: 15,
                    }}>
                      {c.patient.firstName[0]}{c.patient.lastName[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 3 }}>
                        {c.patient.lastName.toUpperCase()}, {c.patient.firstName}
                        {c.patient.dateOfBirth && (
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', fontWeight: 400, marginLeft: 8 }}>
                            {calcAge(c.patient.dateOfBirth)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginBottom: 6 }}>
                        {c.caseCode} · DOL: {fmtDate(c.accidentDate)} · {appts.length} visita{appts.length !== 1 ? 's' : ''}
                        {lastAppt && <> · Última: {fmtDate(lastAppt.scheduledFor)}</>}
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: '#34d399' }}>✓ Paciente activo</span>
                        <span style={{ fontSize: 10, color: signedCount > 0 ? '#34d399' : 'rgba(255,255,255,0.35)' }}>
                          {signedCount > 0 ? `✓ ${signedCount} nota${signedCount !== 1 ? 's' : ''} firmada${signedCount !== 1 ? 's' : ''}` : '○ Sin notas firmadas'}
                        </span>
                        <span style={{ fontSize: 10, color: signedCount > 0 ? '#34d399' : 'rgba(255,255,255,0.35)' }}>
                          {signedCount > 0 ? '✓ HCFA disponible' : '○ HCFA pendiente'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <Link href={`/cases/${c.id}`} style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                        color: 'rgba(255,255,255,0.70)', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        Ver caso
                      </Link>
                      <Link href={`/cases/${c.id}/sign`} style={{
                        padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: 'linear-gradient(135deg,#f43f5e,#ec4899)',
                        border: 'none', color: '#fff', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 4px 14px rgba(244,63,94,0.35)',
                      }}>
                        ✍️ Firmar mi parte
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Todos los casos */}
        <section>
          <h2 style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.45)', marginBottom: 12,
          }}>
            Clientes · {cases.length} caso{cases.length !== 1 ? 's' : ''}
          </h2>
          {cases.length === 0 ? (
            <div style={{
              padding: '40px', textAlign: 'center',
              border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12,
              color: 'rgba(255,255,255,0.30)', fontSize: 13,
            }}>
              <AlertCircle size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
              <div>Sin casos asignados a este bufete</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cases.map(c => {
                const appts   = c.appointments;
                const nextAppt = [...appts].reverse().find(a =>
                  new Date(a.scheduledFor) >= new Date() && a.status !== 'COMPLETED',
                );
                const statusColors: Record<string, string> = {
                  NEW_REFERRAL: '#a78bfa', INTAKE_PENDING: '#67e8f9', INTAKE_COMPLETED: '#67e8f9',
                  CONFIRMED: '#34d399', ACTIVE: '#34d399', MMI: '#fbbf24',
                  CLOSED: '#fb7185', SETTLED: '#34d399', ARCHIVED: 'rgba(255,255,255,0.25)',
                  CANCELLED: 'rgba(255,255,255,0.20)',
                };
                return (
                  <div key={c.id} style={{
                    borderRadius: 10, background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(244,63,94,0.20)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fda4af', fontWeight: 700, fontSize: 12,
                    }}>
                      {c.patient.firstName[0]}{c.patient.lastName[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}>
                        {c.patient.lastName.toUpperCase()}, {c.patient.firstName}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>
                        {c.caseCode} · {appts.length} visita{appts.length !== 1 ? 's' : ''}
                        {nextAppt && (
                          <span style={{ color: '#67e8f9' }}>
                            {' '}· Próxima: {fmtDate(nextAppt.scheduledFor)}
                            {nextAppt.provider && ` (Dr. ${nextAppt.provider.lastName})`}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em',
                      color: statusColors[c.status] ?? '#a78bfa',
                      background: `${statusColors[c.status] ?? '#a78bfa'}18`,
                      padding: '3px 8px', borderRadius: 6,
                    }}>
                      {c.status.replace(/_/g, ' ')}
                    </span>
                    <Link href={`/cases/${c.id}`} style={{
                      padding: '7px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.25)',
                      color: '#fb7185', textDecoration: 'none',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      Ver caso <ChevronRight size={12} />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
