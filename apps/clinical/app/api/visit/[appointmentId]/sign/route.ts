/**
 * POST /api/visit/[appointmentId]/sign
 *
 * Firma la nota de visita. Una vez firmada es inmutable.
 * Marca el appointment como COMPLETED.
 * Escribe audit log SIGN_VISIT_NOTE.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ appointmentId: string }> };

export async function POST(
  req: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const body = await req.json() as {
    signedByName?: string;
    signedById?:   string;
  };

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true, status: true,
      checkedInAt:          true,
      attendanceSignedAt:   true,
      triageRecord:         { select: { id: true } },
      visitNote:            { select: { id: true, status: true } },
    },
  });

  if (!appt)            return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!appt.visitNote)  return NextResponse.json({ error: 'NO_NOTE' },   { status: 400 });
  if (appt.visitNote.status === 'SIGNED')
                        return NextResponse.json({ error: 'ALREADY_SIGNED' }, { status: 409 });

  // ── Guardrails clínicos ────────────────────────────────────────────────────
  const missing: string[] = [];
  if (!appt.checkedInAt)        missing.push('CHECK_IN');
  if (!appt.attendanceSignedAt) missing.push('ATTENDANCE_SIGNATURE');
  if (!appt.triageRecord)       missing.push('TRIAGE');

  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'GUARDRAIL_FAILED', missing },
      { status: 422 },
    );
  }

  const now = new Date();

  const [note] = await db.$transaction([
    // Firmar nota
    db.visitNote.update({
      where: { appointmentId },
      data: {
        status:      'SIGNED',
        signedAt:    now,
        signedById:  body.signedById  ?? actor.actorUserId ?? null,
        signedByName: body.signedByName ?? null,
      },
    }),
    // Marcar cita completada
    db.appointment.update({
      where: { id: appointmentId },
      data:  { status: 'COMPLETED' },
    }),
  ]);

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? body.signedById ?? undefined,
    action:      'SIGN_VISIT_NOTE',
    entityType:  'appointment',
    entityId:    appointmentId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { visitNoteId: note.id, signedAt: now.toISOString() },
  });

  return NextResponse.json({ ok: true, note });
}
