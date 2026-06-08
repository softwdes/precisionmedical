/**
 * B.5 — Portal del Paciente · Landing con portalToken
 *
 * Ruta: /c/[token]
 * El paciente llega aquí desde el SMS / correo magic link.
 * Server component: valida token en DB, pasa data pre-cargada al wizard.
 */

import { db } from '@precision-medical/database';
import { IntakeWizard } from './intake-wizard';

type Props = { params: Promise<{ token: string }> };

export default async function PatientPortalPage({ params }: Props) {
  const { token } = await params;

  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      caseCode: true,
      status: true,
      accidentDate: true,
      accidentType: true,
      accidentNotes: true,
      accidentLocation: true,
      primaryPolicyNumber: true,
      intakeFormCompletedAt: true,
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          email: true,
          insuranceCarrier: true,
          policyNumber: true,
        },
      },
    },
  });

  if (!rec) return <InvalidToken />;

  if (rec.intakeFormCompletedAt) {
    return (
      <AlreadyCompleted
        firstName={rec.patient.firstName}
        caseCode={rec.caseCode}
      />
    );
  }

  return (
    <IntakeWizard
      token={token}
      caseId={rec.id}
      caseCode={rec.caseCode}
      patient={{
        id:             rec.patient.id,
        firstName:      rec.patient.firstName,
        lastName:       rec.patient.lastName,
        dateOfBirth:    rec.patient.dateOfBirth?.toISOString() ?? null,
        phone:          rec.patient.phone ?? null,
        email:          rec.patient.email ?? null,
        insuranceCarrier: rec.patient.insuranceCarrier ?? null,
        policyNumber:   rec.patient.policyNumber ?? null,
      }}
      accident={{
        date:     rec.accidentDate?.toISOString() ?? null,
        type:     rec.accidentType as string | null,
        notes:    rec.accidentNotes ?? null,
        location: rec.accidentLocation ?? null,
      }}
      casePolicyNumber={rec.primaryPolicyNumber ?? null}
    />
  );
}

// ─── Error states ──────────────────────────────────────────────────────────────

function InvalidToken() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a1224', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>🔗</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#F43F5E', marginBottom: 12 }}>
          Enlace no válido
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.65, marginBottom: 24 }}>
          Este enlace no es válido o ya expiró. Comunícate con Precision Medical para recibir uno nuevo.
        </p>
        <a
          href="tel:+18013752207"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '12px 22px', borderRadius: 10,
            background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.30)',
            color: '#06B6D4', fontSize: 15, fontWeight: 700, textDecoration: 'none',
          }}
        >
          📞 (801) 375-2207
        </a>
      </div>
    </div>
  );
}

function AlreadyCompleted({ firstName, caseCode }: { firstName: string; caseCode: string }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a1224', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(135deg,#10B981,#06B6D4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, margin: '0 auto 20px',
          boxShadow: '0 0 40px rgba(16,185,129,0.35)',
        }}>✓</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#10B981', marginBottom: 12 }}>
          ¡Ya registrado, {firstName}!
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.65, marginBottom: 16 }}>
          Tu formulario para el caso{' '}
          <strong style={{ color: '#A5B4FC', fontFamily: 'monospace' }}>{caseCode}</strong>{' '}
          ya fue completado. El equipo de Precision Medical se comunicará contigo pronto.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: 12 }}>
          ¿Preguntas? (801) 375-2207
        </p>
      </div>
    </div>
  );
}
