/**
 * POST /api/admin/visit-notes/[appointmentId]/sign
 *
 * Finaliza (firma) la nota clínica: DRAFT → SIGNED con snapshot del firmante.
 * A partir de aquí la nota es INMUTABLE (requisito HIPAA) — el PUT del borrador
 * responde 409. No cierra la consulta: eso lo hace el asistente en Day Admission.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';

type Ctx = { params: Promise<{ appointmentId: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const role = await fetchDbRole(user.email);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      provider: { select: { email: true, firstName: true, lastName: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const isOwner = appt.provider?.email?.toLowerCase() === user.email.toLowerCase();
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const note = await db.visitNote.findUnique({
    where: { appointmentId },
    select: { id: true, status: true, chiefComplaint: true, hpi: true, assessment: true, plan: true },
  });
  if (!note) return NextResponse.json({ error: 'NOTE_NOT_FOUND' }, { status: 404 });
  if (note.status === 'SIGNED') {
    return NextResponse.json({ ok: true, alreadySigned: true, status: 'SIGNED' });
  }

  // Guardrail clínico: no se firma una nota vacía
  const hasContent = [note.chiefComplaint, note.hpi, note.assessment, note.plan]
    .some((v) => (v ?? '').replace(/<[^>]*>/g, '').trim().length > 0);
  if (!hasContent) return NextResponse.json({ error: 'NOTE_EMPTY' }, { status: 400 });

  const dbUser = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true },
  });

  const signerName = appt.provider
    ? `Dr. ${appt.provider.firstName} ${appt.provider.lastName}`
    : `${dbUser?.firstName ?? ''} ${dbUser?.lastName ?? ''}`.trim() || user.email;

  const signedAt = new Date();
  const updated = await db.visitNote.update({
    where: { id: note.id },
    data: {
      status: 'SIGNED',
      signedAt,
      signedById: dbUser?.id ?? null,
      signedByName: signerName,
    },
    select: { id: true, status: true, signedAt: true, signedByName: true },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: dbUser?.id ?? actor.actorUserId,
    action: 'SIGN_VISIT_NOTE',
    entityType: 'visit_notes',
    entityId: note.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      appointmentId,
      patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
      signedByName: signerName,
      signedAt: signedAt.toISOString(),
    },
  });

  return NextResponse.json({ ok: true, note: updated });
}
