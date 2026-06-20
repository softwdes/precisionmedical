/**
 * B.11 — Check-in del paciente · Pantalla de confirmación de identidad
 *
 * Ruta: /checkin/[appointmentId]
 * Quién la usa: Recepción / MA
 * Flujo:
 *   1. Staff ve datos del paciente + cita
 *   2. Verifica verbalmente la identidad
 *   3. Pulsa "Confirmar llegada" → CHECKED_IN + checkedInAt
 *   4. Redirect → / (cola del día)
 */

import { db } from '@precision-medical/database';
import { notFound } from 'next/navigation';
import { CheckinClient } from './checkin-client';

type Props = { params: Promise<{ appointmentId: string }> };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString('es-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}
function calcAge(dob: Date | null): number | null {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
}

export default async function CheckinPage({ params }: Props) {
  const { appointmentId } = await params;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id:                      true,
      scheduledFor:            true,
      status:                  true,
      type:                    true,
      checkedInAt:             true,
      attendanceSignedAt:      true,
      notes:                   true,
      patient: {
        select: {
          id:          true,
          firstName:   true,
          lastName:    true,
          dateOfBirth: true,
          phone:       true,
          email:       true,
        },
      },
      provider: { select: { firstName: true, lastName: true } },
      clinic:   { select: { name: true } },
      case: {
        select: {
          id:           true,
          caseCode:     true,
          accidentDate: true,
          accidentType: true,
          intakeFormCompletedAt: true,
        },
      },
    },
  });

  if (!appt) notFound();

  const age = calcAge(appt.patient.dateOfBirth);
  const alreadyCheckedIn = appt.status === 'CHECKED_IN' || appt.status === 'IN_PROGRESS';
  const alreadySigned    = !!appt.attendanceSignedAt;

  return (
    <div style={{
      minHeight: '100vh', background: '#0a1224', color: '#fff',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      {/* Header */}
      <header style={{
        padding: '0 24px', height: 56,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(16,185,129,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 7,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.60)', textDecoration: 'none', fontSize: 12,
          }}>
            ← Cola del día
          </a>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.10)' }} />
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: '#10B981',
          }}>
            B.11 · Check-in
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>
          {fmtTime(appt.scheduledFor)}
        </div>
      </header>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '28px 20px' }}>

        {/* Already checked in banner */}
        {alreadyCheckedIn && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 20,
            background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)',
            display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>
                Paciente ya registrado
              </div>
              {appt.checkedInAt && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 2 }}>
                  Check-in: {fmtTime(appt.checkedInAt)}
                  {appt.status === 'IN_PROGRESS' && ' · En consulta'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Patient identity card */}
        <div style={{
          background: 'rgba(16,185,129,0.05)',
          border: '1px solid rgba(16,185,129,0.20)',
          borderRadius: 14, padding: '20px 24px', marginBottom: 16,
        }}>
          <div style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
            color: 'rgba(16,185,129,0.80)', fontWeight: 700, marginBottom: 14,
          }}>
            Verificar identidad del paciente
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Avatar */}
            <div style={{
              width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #10B981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 900, color: '#fff',
            }}>
              {appt.patient.firstName[0]}{appt.patient.lastName[0]}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                {appt.patient.lastName.toUpperCase()}, {appt.patient.firstName}
                {age && (
                  <span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.45)', marginLeft: 10 }}>
                    {age} años
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                {appt.patient.dateOfBirth && (
                  <span>🎂 {fmtDate(appt.patient.dateOfBirth)}</span>
                )}
                {appt.patient.phone && (
                  <span>📞 {appt.patient.phone}</span>
                )}
                {appt.patient.email && (
                  <span>✉️ {appt.patient.email}</span>
                )}
              </div>
            </div>
          </div>

          {/* ID verification checklist */}
          <div style={{
            marginTop: 16, padding: '12px 14px',
            background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Verificar verbalmente
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                `Nombre: ${appt.patient.firstName} ${appt.patient.lastName}`,
                appt.patient.dateOfBirth ? `Fecha de nacimiento: ${fmtDate(appt.patient.dateOfBirth)}` : null,
                appt.case ? `Caso: ${appt.case.caseCode}` : null,
              ].filter(Boolean).map((item, i) => (
                <div key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#10B981', flexShrink: 0 }}>○</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Appointment info */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        }}>
          <div style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.35)', fontWeight: 700, marginBottom: 12,
          }}>
            Detalles de la cita
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 28px' }}>
            {[
              { label: 'Hora',    value: fmtTime(appt.scheduledFor) },
              { label: 'Tipo',    value: appt.type.replace(/_/g, ' ') },
              { label: 'Doctor',  value: appt.provider ? `Dr. ${appt.provider.lastName}, ${appt.provider.firstName}` : '—' },
              { label: 'Clínica', value: appt.clinic.name },
              { label: 'Caso',    value: appt.case?.caseCode ?? '—' },
              { label: 'Accidente', value: appt.case?.accidentDate ? fmtDate(appt.case.accidentDate) : '—' },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.30)', fontWeight: 700 }}>{f.label}</div>
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, marginTop: 2 }}>{f.value}</div>
              </div>
            ))}
          </div>

          {/* Intake status */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: appt.case?.intakeFormCompletedAt ? '#10B981' : '#fbbf24' }}>
                  {appt.case?.intakeFormCompletedAt ? '✓' : '○'}
                </span>
                <span style={{ color: appt.case?.intakeFormCompletedAt ? '#10B981' : 'rgba(255,255,255,0.40)' }}>
                  Formulario de intake
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: alreadySigned ? '#10B981' : '#fbbf24' }}>
                  {alreadySigned ? '✓' : '○'}
                </span>
                <span style={{ color: alreadySigned ? '#10B981' : 'rgba(255,255,255,0.40)' }}>
                  Firma de asistencia
                  {appt.attendanceSignedAt && (
                    <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>
                      {fmtTime(appt.attendanceSignedAt)}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Client: check-in action */}
        <CheckinClient
          appointmentId={appointmentId}
          patientName={`${appt.patient.firstName} ${appt.patient.lastName}`}
          alreadyCheckedIn={alreadyCheckedIn}
          alreadySigned={alreadySigned}
        />

      </div>
    </div>
  );
}
