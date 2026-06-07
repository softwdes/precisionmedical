/**
 * B.5 — Intake portal landing + multi-step form
 *
 * Ruta: /intake/[token]
 * El paciente llega aquí desde el SMS magic link.
 *
 * Server component: verifica token en DB, pasa data pre-cargada al client.
 * Si token inválido → página de error.
 * Si ya completó → página de "ya enviado".
 * Si válido → IntakeClient con el form multi-step.
 */

import { db } from '@precision-medical/database';
import { IntakeClient } from './intake-client';

interface IntakeData {
  caseId: string;
  caseCode: string;
  accidentDate: Date | null;
  accidentType: string | null;
  patient: {
    id: string;
    firstName: string;
    dateOfBirth: Date | null;
    phone: string | null;
    email: string | null;
  };
}

export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const caseRecord = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      caseCode: true,
      status: true,
      accidentDate: true,
      accidentType: true,
      intakeFormCompletedAt: true,
      patient: {
        select: {
          id: true,
          firstName: true,
          dateOfBirth: true,
          phone: true,
          email: true,
        },
      },
    },
  });

  // Token inválido
  if (!caseRecord) {
    return <InvalidToken />;
  }

  // Ya completó el intake
  if (caseRecord.intakeFormCompletedAt) {
    return <AlreadyCompleted caseCode={caseRecord.caseCode} firstName={caseRecord.patient.firstName} />;
  }

  const data: IntakeData = {
    caseId: caseRecord.id,
    caseCode: caseRecord.caseCode,
    accidentDate: caseRecord.accidentDate,
    accidentType: caseRecord.accidentType as string | null,
    patient: {
      id: caseRecord.patient.id,
      firstName: caseRecord.patient.firstName,
      dateOfBirth: caseRecord.patient.dateOfBirth,
      phone: caseRecord.patient.phone,
      email: caseRecord.patient.email,
    },
  };

  return <IntakeClient token={token} data={data} />;
}

// ─── Error states ─────────────────────────────────────────────────────────────

function InvalidToken() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: '#060810' }}>
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-4xl">🔗</div>
        <h1 className="text-xl font-bold" style={{ color: '#F43F5E' }}>
          Enlace no válido
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.60)', fontSize: 14, lineHeight: 1.6 }}>
          Este enlace no es válido o ya expiró. Comunícate con Precision Medical para recibir uno nuevo.
        </p>
        <a
          href="tel:+18013752207"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 8,
            background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.30)',
            color: '#06B6D4', fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}
        >
          📞 (801) 375-2207
        </a>
      </div>
    </div>
  );
}

function AlreadyCompleted({ caseCode, firstName }: { caseCode: string; firstName: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: '#060810' }}>
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h1 className="text-xl font-bold" style={{ color: '#10B981' }}>
          ¡Ya enviado, {firstName}!
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.60)', fontSize: 14, lineHeight: 1.6 }}>
          Tu formulario para el caso <strong style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'monospace' }}>{caseCode}</strong> ya fue enviado. El equipo de Precision Medical se comunicará contigo pronto.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.40)', fontSize: 12 }}>
          ¿Preguntas? Llama al (801) 375-2207
        </p>
      </div>
    </div>
  );
}
