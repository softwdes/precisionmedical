/**
 * POST /api/walkin/[clinicId]
 *
 * B.5 — Walk-in kiosk: crea un caso/paciente walk-in y devuelve el token de intake.
 * Sin auth requerida — es el punto de entrada público del kiosk de recepción.
 *
 * Flujo:
 *   1. Recibe firstName, lastName, phone del kiosk
 *   2. Busca si existe paciente por teléfono (mismo tenant / Phase 1A: global)
 *   3. Crea Patient si no existe
 *   4. Crea Case con source=WALK_IN + portalToken único
 *   5. Devuelve { token } para redirigir al intake wizard
 *
 * HIPAA: No hay PHI en la respuesta — solo el token opaco.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z }  from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { randomBytes }       from 'crypto';

const BodySchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName:  z.string().min(1).max(100).trim(),
  phone:     z.string().min(7).max(20).trim(),
  language:  z.enum(['es', 'en']).default('es'),
});

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

function generateCaseCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `WI-${year}-${rand}`;
}

function generatePatientCode(): string {
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `PM-${rand}`;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ clinicId: string }> },
): Promise<NextResponse> {
  const { clinicId } = await ctx.params;

  // Verify clinic exists
  const clinic = await db.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
  if (!clinic) return NextResponse.json({ ok: false, error: 'CLINIC_NOT_FOUND' }, { status: 404 });

  let parsed;
  try {
    const body = await req.json();
    parsed = BodySchema.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  // Find or create patient by phone
  let patient = await db.patient.findFirst({
    where: { phone: parsed.phone },
    select: { id: true },
  });

  if (!patient) {
    patient = await db.patient.create({
      data: {
        firstName:         parsed.firstName,
        lastName:          parsed.lastName,
        phone:             parsed.phone,
        preferredLanguage: parsed.language,
        patientCode:       generatePatientCode(),
      },
      select: { id: true },
    });
  }

  // Create case with WALK_IN source + unique portal token
  const token = generateToken();

  const newCase = await db.case.create({
    data: {
      patientId:   patient.id,
      caseCode:    generateCaseCode(),
      source:      'WALK_IN',
      status:      'INTAKE_PENDING',
      portalToken: token,
      intakeFormSentAt: new Date(),
    },
    select: { id: true, caseCode: true },
  });

  await writeAuditLog(db, {
    actorType:  'SYSTEM',
    actorUserId: null,
    action:     'WALKIN_CASE_CREATED',
    entityType: 'cases',
    entityId:   newCase.id,
    metadata: { caseCode: newCase.caseCode, clinicId, source: 'WALK_IN' },
  });

  return NextResponse.json({ ok: true, token });
}
