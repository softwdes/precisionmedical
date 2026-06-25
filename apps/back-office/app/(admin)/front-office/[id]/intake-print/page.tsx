/**
 * Intake Print — /front-office/[id]/intake-print
 * Vista de impresión del formulario completado por el paciente.
 * Accessible solo para staff (ruta protegida por (admin) layout).
 */

import { notFound } from 'next/navigation';
import { db } from '@precision-medical/database';
import { PrintButton } from './print-button';

type Props = { params: Promise<{ id: string }> };

function fmt(d: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return '—';
  const iso = typeof d === 'string' ? d : d.toISOString();
  const [y, mo, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString('es-US', opts ?? { month: 'long', day: 'numeric', year: 'numeric' });
}

function age(dob: Date | null): string {
  if (!dob) return '—';
  const iso = dob.toISOString();
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
  const birth = new Date(y, mo - 1, d);
  const today = new Date();
  let a = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
  return `${a} años`;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid #e5e7eb' }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#111827' }}>{value || '—'}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: '#4f46e5', borderBottom: '2px solid #4f46e5', paddingBottom: 4, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default async function IntakePrintPage({ params }: Props) {
  const { id: caseId } = await params;

  const rec = await db.case.findUnique({
    where: { id: caseId, deletedAt: null },
    select: {
      id: true,
      caseCode: true,
      accidentDate: true,
      accidentType: true,
      accidentLocation: true,
      accidentNotes: true,
      primaryPolicyNumber: true,
      intakeFormCompletedAt: true,
      patient: {
        select: {
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          email: true,
          preferredLanguage: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          guardianName: true,
          guardianPhone: true,
          guardianRelation: true,
          insuranceCarrier: true,
          policyNumber: true,
        },
      },
      primaryInsurance: { select: { name: true, shortCode: true, claimsPhone: true } },
      lawFirm: { select: { firmName: true, phone: true, email: true } },
      attorney: { select: { firstName: true, lastName: true, email: true } },
      intakeSubmission: {
        select: {
          healthStatus: true,
          hasMedications: true, medications: true,
          hasAllergies: true, allergies: true,
          hasPreviousInjuries: true, previousInjuries: true,
          takePhotosAtClinic: true,
          language: true,
          submittedAt: true,
        },
      },
    },
  });

  if (!rec) notFound();

  const p = rec.patient;
  const sub = rec.intakeSubmission;
  const isMinor = (() => {
    if (!p.dateOfBirth) return false;
    const iso = p.dateOfBirth.toISOString();
    const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
    const birth = new Date(y, mo - 1, d);
    const today = new Date();
    let a = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
    return a < 18;
  })();

  const HEALTH_LABEL: Record<string, string> = {
    excellent: 'Excelente', good: 'Buena', fair: 'Regular', poor: 'Deficiente',
  };

  const ACCIDENT_LABEL: Record<string, string> = {
    AUTO: 'Auto', MOTORCYCLE: 'Motocicleta', PEDESTRIAN: 'Peatón', WORKPLACE: 'Trabajo', OTHER: 'Otro',
  };

  const RELATION_LABEL: Record<string, string> = {
    FATHER: 'Padre', MOTHER: 'Madre', LEGAL_GUARDIAN: 'Tutor legal', OTHER: 'Otro',
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#fff', minHeight: '100vh', padding: '32px 40px', maxWidth: 800, margin: '0 auto', color: '#111827' }}>
      <style>{`@media print { .no-print { display: none !important; } body { margin: 0; } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingBottom: 16, borderBottom: '3px solid #4f46e5' }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4f46e5', fontWeight: 700, marginBottom: 4 }}>
            PRECISION MEDICAL CARE
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#111827' }}>
            Formulario de Intake del Paciente
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            Caso: <strong style={{ fontFamily: 'monospace', color: '#4f46e5' }}>{rec.caseCode}</strong>
            {rec.intakeFormCompletedAt && (
              <span style={{ marginLeft: 16 }}>
                Completado: {new Date(rec.intakeFormCompletedAt).toLocaleString('es-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
                })}
              </span>
            )}
          </div>
        </div>
        <PrintButton />
      </div>

      {/* Datos personales */}
      <Section title="Datos Personales">
        <Row label="Nombre completo" value={`${p.firstName} ${p.lastName}`} />
        <Row label="Fecha de nacimiento" value={`${fmt(p.dateOfBirth)} (${age(p.dateOfBirth)})`} />
        <Row label="Teléfono" value={p.phone} />
        <Row label="Email" value={p.email} />
        <Row label="Idioma preferido" value={p.preferredLanguage === 'en' ? 'English' : p.preferredLanguage === 'es' ? 'Español' : '—'} />
      </Section>

      {/* Responsable legal (si es menor) */}
      {isMinor && (
        <Section title="⚠ Responsable Legal (Paciente Menor)">
          <Row label="Nombre del responsable" value={p.guardianName} />
          <Row label="Teléfono del responsable" value={p.guardianPhone} />
          <Row label="Relación" value={p.guardianRelation ? (RELATION_LABEL[p.guardianRelation] ?? p.guardianRelation) : undefined} />
        </Section>
      )}

      {/* Contacto de emergencia */}
      <Section title="Contacto de Emergencia">
        <Row label="Nombre" value={p.emergencyContactName} />
        <Row label="Teléfono" value={p.emergencyContactPhone} />
      </Section>

      {/* Accidente */}
      <Section title="Datos del Accidente">
        <Row label="Fecha del accidente" value={fmt(rec.accidentDate)} />
        <Row label="Tipo de accidente" value={rec.accidentType ? (ACCIDENT_LABEL[rec.accidentType] ?? rec.accidentType) : undefined} />
        <Row label="Lugar del accidente" value={rec.accidentLocation} />
        <Row label="Descripción / notas" value={rec.accidentNotes} />
      </Section>

      {/* Seguro */}
      <Section title="Información del Seguro">
        <Row label="Aseguradora" value={rec.primaryInsurance?.name ?? p.insuranceCarrier} />
        <Row label="Número de póliza" value={rec.primaryPolicyNumber ?? p.policyNumber} />
        {rec.primaryInsurance?.claimsPhone && (
          <Row label="Teléfono de claims" value={rec.primaryInsurance.claimsPhone} />
        )}
      </Section>

      {/* Historial médico */}
      {sub && (
        <Section title="Historial Médico">
          <Row label="Salud general" value={sub.healthStatus ? (HEALTH_LABEL[sub.healthStatus] ?? sub.healthStatus) : undefined} />
          <Row label="Medicamentos" value={sub.hasMedications ? (sub.medications || 'Sí (sin detalles)') : 'No'} />
          <Row label="Alergias" value={sub.hasAllergies ? (sub.allergies || 'Sí (sin detalles)') : 'No'} />
          <Row label="Lesiones previas" value={sub.hasPreviousInjuries ? (sub.previousInjuries || 'Sí (sin detalles)') : 'No'} />
          <Row label="Fotos ID en clínica" value={sub.takePhotosAtClinic ? 'Sí' : 'No (enviadas en formulario)'} />
        </Section>
      )}

      {!sub && (
        <div style={{ padding: '16px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, fontSize: 13, color: '#92400e', marginBottom: 24 }}>
          ⚠ El paciente no ha completado el historial médico (pasos 5-7 del formulario).
        </div>
      )}

      {/* Legal */}
      {(rec.lawFirm || rec.attorney) && (
        <Section title="Información Legal">
          {rec.lawFirm && <Row label="Bufete" value={rec.lawFirm.firmName} />}
          {rec.lawFirm?.phone && <Row label="Teléfono bufete" value={rec.lawFirm.phone} />}
          {rec.attorney && <Row label="Abogado asignado" value={`${rec.attorney.firstName ?? ''} ${rec.attorney.lastName ?? ''}`.trim()} />}
          {rec.attorney?.email && <Row label="Email abogado" value={rec.attorney.email} />}
        </Section>
      )}

      {/* Footer */}
      <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #e5e7eb', fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
        Precision Medical Care · Documento generado el {new Date().toLocaleDateString('es-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' })} · Uso interno — contiene información médica confidencial (HIPAA Phase 1A mock data)
      </div>

    </div>
  );
}
