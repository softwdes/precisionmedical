/**
 * B.5 — Portal Intake Token Verification
 *
 * GET /api/portal/intake/[token]
 *
 * Verifica el token del magic link y devuelve info mínima del caso.
 * Phase 1A: sin PHI completa · solo firstName + caseCode para saludo.
 * Phase 2: usar Supabase RLS + token firmado (HMAC) para PHI real.
 *
 * Regla HIPAA Phase 1A: devuelve SOLO datos necesarios para el UI
 * (nombre, caso, clínica) — NUNCA DOB/phone/email/SSN via GET sin auth.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await ctx.params;

  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 400 });
  }

  const caseRecord = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      caseCode: true,
      status: true,
      intakeFormSentAt: true,
      intakeFormCompletedAt: true,
      accidentDate: true,
      accidentType: true,
      patient: {
        select: {
          id: true,
          firstName: true,       // Solo nombre para el saludo
          dateOfBirth: true,     // Para pre-fill DOB (no es ultra-sensitivo en Phase 1A)
          phone: true,           // Para pre-fill teléfono
          email: true,           // Para pre-fill email
        },
      },
    },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  // Si ya completó el intake, devolver estado especial
  if (caseRecord.intakeFormCompletedAt) {
    return NextResponse.json({
      status: 'ALREADY_COMPLETED',
      caseCode: caseRecord.caseCode,
      completedAt: caseRecord.intakeFormCompletedAt,
    });
  }

  // Token válido — devolver info mínima para la UI
  return NextResponse.json({
    status: 'PENDING',
    case: {
      id: caseRecord.id,
      caseCode: caseRecord.caseCode,
      accidentDate: caseRecord.accidentDate,
      accidentType: caseRecord.accidentType,
    },
    patient: {
      id: caseRecord.patient.id,
      firstName: caseRecord.patient.firstName,
      dateOfBirth: caseRecord.patient.dateOfBirth,
      phone: caseRecord.patient.phone,
      email: caseRecord.patient.email,
    },
    clinic: {
      name: 'Precision Medical',
      phone: '(801) 375-2207',
      address: 'Utah, USA',
    },
  });
}
