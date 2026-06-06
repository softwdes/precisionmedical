/**
 * B.4 — Confirm first appointment (24h antes)
 *
 * POST /api/admin/cases/[id]/confirm-appointment
 *
 * Status flow: INTAKE_COMPLETED → CONFIRMED
 * Marca: firstAppointmentConfirmedAt + firstAppointmentConfirmedById
 * Audit log con checklist confirmado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

const InputSchema = z.object({
  // Checklist items confirmed (Phase 1A: simple booleans · Phase 2: structured)
  checklist: z.object({
    dolConfirmed: z.boolean().default(false),
    docsBringing: z.boolean().default(false),
    timeConfirmed: z.boolean().default(false),
    infoUpToDate: z.boolean().default(false),
  }),
  notes: z.string().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);
  const { id: caseId } = await ctx.params;

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, caseCode: true, status: true, patient: { select: { firstName: true, lastName: true } } },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  // Idempotent: if already CONFIRMED, just return success
  if (caseRecord.status === 'CONFIRMED') {
    return NextResponse.json({ ok: true, alreadyConfirmed: true, case: caseRecord });
  }

  // Validation: only allow if INTAKE_COMPLETED (or higher status as edge case)
  const ALLOWED_FROM: string[] = ['INTAKE_COMPLETED', 'INTAKE_PENDING'];
  if (!ALLOWED_FROM.includes(caseRecord.status)) {
    return NextResponse.json(
      { error: 'INVALID_STATUS', message: `No se puede confirmar desde status ${caseRecord.status}. Esperado: INTAKE_COMPLETED.` },
      { status: 409 },
    );
  }

  const now = new Date();

  // Update case + create internal note with checklist
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.case.update({
      where: { id: caseId },
      data: {
        status: 'CONFIRMED',
        firstAppointmentConfirmedAt: now,
        firstAppointmentConfirmedById: actor.actorUserId,
      },
    });

    // Create internal note with checklist summary
    const checklistText = [
      parsed.checklist.dolConfirmed   ? '✓ DOL confirmado'        : '✗ DOL NO confirmado',
      parsed.checklist.docsBringing   ? '✓ Trae documentos'       : '✗ NO trae documentos',
      parsed.checklist.timeConfirmed  ? '✓ Horario confirmado'    : '✗ Horario NO confirmado',
      parsed.checklist.infoUpToDate   ? '✓ Info al día'           : '✗ Info pendiente actualizar',
    ].join('\n');

    await tx.caseNote.create({
      data: {
        caseId,
        content: `Confirmación de cita (24h antes):\n${checklistText}${parsed.notes ? `\n\nNotas: ${parsed.notes}` : ''}`,
        isPrivate: true,
        authorUserId: actor.actorUserId,
        authorName: 'Front Office',
      },
    });

    return u;
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'CONFIRM_FIRST_APPOINTMENT',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      caseCode: caseRecord.caseCode,
      patientName: `${caseRecord.patient.firstName} ${caseRecord.patient.lastName}`,
      checklist: parsed.checklist,
      notes: parsed.notes ?? null,
      previousStatus: caseRecord.status,
      newStatus: 'CONFIRMED',
    },
  });

  return NextResponse.json({
    ok: true,
    case: { id: updated.id, caseCode: updated.caseCode, status: updated.status, firstAppointmentConfirmedAt: updated.firstAppointmentConfirmedAt },
  });
}
