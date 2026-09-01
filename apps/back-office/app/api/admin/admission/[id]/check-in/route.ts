/**
 * POST /api/admin/admission/[id]/check-in
 *
 * B.14 — Marcar paciente como llegado (CHECKED_IN).
 * Escribe audit log con actor.
 *
 * Body opcional: `{ source: 'doctor-portal' }` — lo manda Mi Día cuando el
 * propio provider marca la llegada porque no hay nadie en el mostrador. Queda en
 * la metadata del audit log, que es de donde después se lee (ver
 * `llegadaMarcadaPorElProvider`): decide si el resumen de la consulta le ofrece
 * también el Checkout, y es el número que dice cuántas veces por semana un
 * provider está cubriendo un puesto vacío.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { puedeEscribirLaCita, CHECK_IN_SOURCE_PORTAL } from '@/lib/appointment-scope';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const actor  = await resolveActor(req.headers);

  // Un doctor solo toca SUS citas. El staff del mostrador marca la de cualquiera.
  if (!(await puedeEscribirLaCita(id))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // El mostrador llama sin body; el portal manda `source`. Un body ausente o
  // roto no puede tumbar un check-in — es el paciente parado en la puerta.
  let source: string | null = null;
  try {
    const body = await req.json() as { source?: unknown };
    if (body?.source === CHECK_IN_SOURCE_PORTAL) source = CHECK_IN_SOURCE_PORTAL;
  } catch { /* sin body */ }

  const appt = await db.appointment.findUnique({
    where:  { id },
    select: { id: true, status: true, patient: { select: { firstName: true, lastName: true } } },
  });

  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (appt.status === 'CHECKED_IN' || appt.status === 'IN_PROGRESS' || appt.status === 'COMPLETED') {
    return NextResponse.json({ ok: true, status: appt.status, alreadyDone: true });
  }

  const now = new Date();
  await db.appointment.update({
    where: { id },
    data:  {
      status:      'CHECKED_IN',
      checkedInAt: now,
    } as Parameters<typeof db.appointment.update>[0]['data'],
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'CHECK_IN',
    entityType:  'appointment',
    entityId:    id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    {
      patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
      checkedInAt: now.toISOString(),
      ...(source ? { source } : {}),
    },
  });

  return NextResponse.json({ ok: true, status: 'CHECKED_IN', checkedInAt: now.toISOString() });
}
