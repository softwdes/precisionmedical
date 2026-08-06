/**
 * Conciliación de medicamentos — registrar algo que el paciente refiere tomar
 * pero que ESTA clínica no prescribió (B.19 · historial del tab Prescripción).
 *
 * POST /api/admin/patients/medications/[appointmentId]
 *   Agrega una entrada a Patient.medicalHistory.medications con
 *   externalPrescriber:true. NO es una receta electrónica — no toca
 *   ScriptSure ni la tabla Prescription. Es una nota del expediente.
 *
 * Escaneado por CITA (no por patientId suelto en la URL): así el guard
 * existente valida que quien escribe es el doctor dueño de la cita o staff
 * del back-office, igual que notas/labs — sin esto, cualquier doctor podría
 * editar el historial de un paciente ajeno con solo adivinar su id.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkAppointmentAccess } from '@/lib/appointment-access';

type Ctx = { params: Promise<{ appointmentId: string }> };

const BodySchema = z.object({
  name: z.string().min(1).max(300),
  status: z.enum(['IN_USE', 'HISTORY']).default('IN_USE'),
  prescribedBy: z.string().max(300).nullable().optional(),
});

interface MedEntry {
  id: string;
  name: string;
  status: 'IN_USE' | 'HISTORY';
  prescribedBy?: string;
  externalPrescriber?: boolean;
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny, actor } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patient: { select: { id: true, medicalHistory: true } } },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const mh = (appt.patient.medicalHistory ?? {}) as { medications?: MedEntry[] };
  const entry: MedEntry = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    status: body.status,
    externalPrescriber: true,
    ...(body.prescribedBy?.trim() ? { prescribedBy: body.prescribedBy.trim() } : {}),
  };
  const medications = [...(mh.medications ?? []), entry];

  await db.patient.update({
    where: { id: appt.patient.id },
    data: { medicalHistory: { ...mh, medications } as object },
  });

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'ADD_EXTERNAL_MEDICATION',
    entityType: 'Patient',
    entityId: appt.patient.id,
    metadata: { name: entry.name, status: entry.status, addedBy: actor.name },
  }).catch(() => undefined);

  return NextResponse.json({ medications }, { status: 201 });
}
