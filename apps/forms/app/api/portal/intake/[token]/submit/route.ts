/**
 * B.9 — Portal Intake Submit
 *
 * POST /api/portal/intake/[token]/submit
 *
 * El paciente completó todos los pasos del formulario.
 * Phase 1A: guarda datos mínimos + marca Case.status = INTAKE_COMPLETED.
 * Phase 2: guardar formData en tabla IntakeSubmission (PHI, después de BAA).
 *
 * Body esperado:
 * {
 *   personalData: { dateOfBirth?, phone?, email?, address?, emergencyContact? }
 *   healthHistory: { medications?, allergies?, previousInjuries?, healthStatus? }
 *   consent: { signature: string, agreedAt: string, agreedToTreatment: boolean }
 *   language: 'es' | 'en'
 * }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@precision-medical/database';

const SubmitSchema = z.object({
  personalData: z.object({
    dateOfBirth: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
  }),
  healthHistory: z.object({
    hasMedications: z.boolean().default(false),
    medications: z.string().optional(),
    hasAllergies: z.boolean().default(false),
    allergies: z.string().optional(),
    hasPreviousInjuries: z.boolean().default(false),
    previousInjuries: z.string().optional(),
    healthStatus: z.enum(['excellent', 'good', 'fair', 'poor']).default('good'),
  }),
  consent: z.object({
    signature: z.string().min(2),
    agreedToTreatment: z.boolean(),
    agreedAt: z.string(),
  }),
  language: z.enum(['es', 'en']).default('es'),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await ctx.params;

  // Verificar token
  const caseRecord = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      caseCode: true,
      status: true,
      intakeFormCompletedAt: true,
      patient: { select: { id: true } },
    },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  // Idempotente — si ya completó, no re-procesar
  if (caseRecord.intakeFormCompletedAt) {
    return NextResponse.json({
      ok: true,
      alreadyCompleted: true,
      caseCode: caseRecord.caseCode,
    });
  }

  // Validar payload
  let parsed;
  try {
    parsed = SubmitSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // Phase 1A: actualizar datos básicos del paciente (no-PHI sensitivo)
  // Phase 2: crear IntakeSubmission row con PHI encriptada
  const patientUpdates: Record<string, unknown> = {};
  if (parsed.personalData.phone) patientUpdates.phone = parsed.personalData.phone;
  if (parsed.personalData.email) patientUpdates.email = parsed.personalData.email;
  if (parsed.personalData.dateOfBirth) {
    patientUpdates.dateOfBirth = new Date(parsed.personalData.dateOfBirth);
  }

  // Transacción: actualizar paciente + caso en un solo commit
  await db.$transaction([
    // Actualizar datos del paciente si se proveyeron
    ...(Object.keys(patientUpdates).length > 0
      ? [db.patient.update({
          where: { id: caseRecord.patient.id },
          data: patientUpdates,
        })]
      : []),
    // Marcar caso como INTAKE_COMPLETED
    db.case.update({
      where: { id: caseRecord.id },
      data: {
        intakeFormCompletedAt: new Date(),
        status: 'INTAKE_COMPLETED',
        // TODO Phase 2: crear IntakeSubmission con PHI
        // intakeSubmission: { create: { ... formData encriptado ... } }
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    caseCode: caseRecord.caseCode,
    completedAt: new Date().toISOString(),
    message: parsed.language === 'es'
      ? '¡Gracias! Tu formulario fue enviado correctamente. Te contactaremos pronto.'
      : 'Thank you! Your form was submitted successfully. We\'ll contact you soon.',
  });
}
