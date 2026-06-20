/**
 * B.14.1 — Firma de asistencia: vista de impresión / PDF
 *
 * Ruta:   /checkin/[appointmentId]/print
 * Uso:    Ctrl+P o botón "Imprimir firma" en la pantalla de check-in
 */

import { notFound } from 'next/navigation';
import { db } from '@precision-medical/database';
import type { Metadata } from 'next';

type Props = { params: Promise<{ appointmentId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { appointmentId } = await params;
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patient: { select: { firstName: true, lastName: true } }, scheduledFor: true },
  });
  if (!appt) return { title: 'Firma de Asistencia' };
  return {
    title: `Firma — ${appt.patient.lastName}, ${appt.patient.firstName} — ${fmtDate(appt.scheduledFor)}`,
  };
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

function calcAge(dob: Date | null): string {
  if (!dob) return '';
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))} años`;
}

export default async function AttendancePrintPage({ params }: Props) {
  const { appointmentId } = await params;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      scheduledFor: true,
      type: true,
      attendanceSignedAt: true,
      attendanceSignatureSvg: true,
      attendanceSignatureHash: true,
      patient: {
        select: {
          firstName: true, lastName: true,
          dateOfBirth: true, phone: true,
          email: true, patientCode: true,
        },
      },
      case: {
        select: { caseCode: true, accidentDate: true },
      },
      clinic: {
        select: { name: true, address: true, phone: true },
      },
    },
  });

  if (!appt) notFound();
  if (!appt.attendanceSignedAt) notFound();

  // Get signer name from audit log
  const auditEntry = await db.auditLog.findFirst({
    where: { entityId: appointmentId, action: 'PATIENT_SIGN_ATTENDANCE' },
    select: { metadata: true },
    orderBy: { createdAt: 'desc' },
  });
  const meta = auditEntry?.metadata as { signerName?: string } | null;
  const signerName = meta?.signerName ?? `${appt.patient.firstName} ${appt.patient.lastName}`;

  const age = calcAge(appt.patient.dateOfBirth);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Georgia', serif; color: #111; background: #fff; }
        .page { max-width: 800px; margin: 0 auto; padding: 40px 48px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
        .clinic-name { font-size: 22px; font-weight: bold; color: #0f172a; }
        .clinic-sub { font-size: 11px; color: #555; margin-top: 3px; }
        .doc-title { text-align: right; }
        .doc-title h2 { font-size: 16px; font-weight: bold; color: #0f172a; }
        .doc-title .date { font-size: 11px; color: #555; margin-top: 4px; }
        .section { margin-bottom: 20px; }
        .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: bold; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 5px 8px; font-size: 13px; vertical-align: top; }
        td.label { color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; width: 36%; }
        td.value { color: #111; font-weight: 500; }
        .sig-box { border: 1px solid #ccc; border-radius: 4px; padding: 12px; background: #fafafa; text-align: center; }
        .sig-box img { max-width: 100%; max-height: 120px; }
        .sig-meta { font-size: 10px; color: #777; margin-top: 8px; }
        .hash { font-family: monospace; font-size: 9px; color: #aaa; word-break: break-all; margin-top: 4px; }
        .footer { margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px; font-size: 10px; color: #888; text-align: center; line-height: 1.6; }
        .badge { display: inline-block; background: #dcfce7; color: #166534; border: 1px solid #86efac; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: bold; }
        @media print {
          .no-print { display: none !important; }
          .page { padding: 20px 32px; }
        }
      `}</style>

      {/* Print button — hidden when printing */}
      <div className="no-print" style={{ background: '#f1f5f9', padding: '12px 48px', borderBottom: '1px solid #e2e8f0' }}>
        <button
          onClick={() => window.print()}
          style={{ background: '#0f172a', color: '#fff', padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px' }}
        >
          Imprimir / Guardar PDF
        </button>
      </div>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div>
            <div className="clinic-name">{appt.clinic?.name ?? 'Precision Medical Care'}</div>
            <div className="clinic-sub">{appt.clinic?.address ?? ''}</div>
            {appt.clinic?.phone && <div className="clinic-sub">{appt.clinic.phone}</div>}
          </div>
          <div className="doc-title">
            <h2>Registro de Asistencia</h2>
            <div className="date">Generado: {fmtDateTime(new Date())}</div>
            {appt.case?.caseCode && <div className="date">Caso: {appt.case.caseCode}</div>}
          </div>
        </div>

        {/* Status */}
        <div className="section" style={{ marginBottom: '16px' }}>
          <span className="badge">✓ Firma capturada</span>
          <span style={{ marginLeft: '8px', fontSize: '12px', color: '#555' }}>
            {fmtDateTime(appt.attendanceSignedAt)}
          </span>
        </div>

        {/* Patient info */}
        <div className="section">
          <div className="section-title">Datos del paciente</div>
          <table>
            <tbody>
              <tr>
                <td className="label">Nombre completo</td>
                <td className="value">{appt.patient.firstName} {appt.patient.lastName}</td>
              </tr>
              <tr>
                <td className="label">Código paciente</td>
                <td className="value" style={{ fontFamily: 'monospace' }}>{appt.patient.patientCode}</td>
              </tr>
              {appt.patient.dateOfBirth && (
                <tr>
                  <td className="label">Fecha de nac.</td>
                  <td className="value">{fmtDate(appt.patient.dateOfBirth)}{age ? ` (${age})` : ''}</td>
                </tr>
              )}
              {appt.patient.phone && (
                <tr>
                  <td className="label">Teléfono</td>
                  <td className="value" style={{ fontFamily: 'monospace' }}>{appt.patient.phone}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Appointment info */}
        <div className="section">
          <div className="section-title">Detalle de la cita</div>
          <table>
            <tbody>
              <tr>
                <td className="label">Fecha y hora</td>
                <td className="value">{fmtDateTime(appt.scheduledFor)}</td>
              </tr>
              <tr>
                <td className="label">Tipo de cita</td>
                <td className="value">{appt.type}</td>
              </tr>
              {appt.case?.caseCode && (
                <tr>
                  <td className="label">Caso MVA</td>
                  <td className="value" style={{ fontFamily: 'monospace' }}>{appt.case.caseCode}</td>
                </tr>
              )}
              {appt.case?.accidentDate && (
                <tr>
                  <td className="label">Fecha accidente</td>
                  <td className="value">{fmtDate(appt.case.accidentDate)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Signature */}
        <div className="section">
          <div className="section-title">Firma digital del paciente</div>
          <div className="sig-box">
            {appt.attendanceSignatureSvg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={appt.attendanceSignatureSvg} alt="Firma del paciente" />
            ) : (
              <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '13px' }}>
                Firma registrada digitalmente
              </div>
            )}
            <div className="sig-meta">
              <strong>{signerName}</strong> · Firmado el {fmtDateTime(appt.attendanceSignedAt)}
            </div>
            {appt.attendanceSignatureHash && (
              <div className="hash">Hash SHA-256: {appt.attendanceSignatureHash}</div>
            )}
          </div>
        </div>

        {/* Legal notice */}
        <div className="section" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '12px 16px' }}>
          <p style={{ fontSize: '11px', color: '#555', lineHeight: '1.7' }}>
            El paciente o su representante legal autorizó su asistencia a esta visita médica mediante firma digital
            capturada en tablet en las instalaciones de la clínica. La firma es legalmente vinculante conforme a la
            Ley ESIGN (15 U.S.C. § 7001) y UETA. El hash SHA-256 garantiza la integridad del documento.
          </p>
        </div>

        {/* Footer */}
        <div className="footer">
          Precision Medical Care · Documento generado {fmtDateTime(new Date())} · HIPAA compliant · Phase 1A
        </div>
      </div>
    </>
  );
}
