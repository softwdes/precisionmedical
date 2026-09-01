/**
 * POST /api/admin/admission/[id]/admit
 *
 * B.15 — Pasar el paciente a la sala con el doctor (IN_PROGRESS).
 * Confirma que pagos/docs fueron verificados y actualiza el status.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { nombreProviderO } from '@/lib/provider-name';
import { puedeEscribirLaCita } from '@/lib/appointment-scope';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const actor  = await resolveActor(req.headers);

  // Un doctor solo pasa a sala SUS pacientes.
  if (!(await puedeEscribirLaCita(id))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const appt = await db.appointment.findUnique({
    where:  { id },
    select: {
      id: true, status: true,
      provider: { select: { firstName: true, lastName: true } },
      patient:  { select: { firstName: true, lastName: true } },
    },
  });

  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (appt.status === 'IN_PROGRESS' || appt.status === 'COMPLETED') {
    return NextResponse.json({ ok: true, status: appt.status, alreadyDone: true });
  }

  const now = new Date();

  // Si por alguna razón pasaron directo sin check-in, también setear checkedInAt
  const data: Record<string, unknown> = {
    status:     'IN_PROGRESS',
    // Sello de inicio de la consulta — con doctorDoneAt/checkedOutAt da la
    // duración real de la atención del doctor (métricas por doctor).
    admittedAt: now,
    updatedAt:  now,
  };
  if (appt.status !== 'CHECKED_IN') {
    data.checkedInAt = now;
  }

  await db.appointment.update({
    where: { id },
    data:  data as Parameters<typeof db.appointment.update>[0]['data'],
  });

  const providerName = nombreProviderO(appt.provider, 'Sin proveedor asignado');

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'ADMIT_TO_ROOM',
    entityType:  'appointment',
    entityId:    id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    {
      patientName:  `${appt.patient.firstName} ${appt.patient.lastName}`,
      providerName,
      admittedAt:   now.toISOString(),
    },
  });

  return NextResponse.json({
    ok: true, status: 'IN_PROGRESS', admittedAt: now.toISOString(),
  });
}
