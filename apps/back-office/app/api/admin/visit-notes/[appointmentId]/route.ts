/**
 * Nota clínica del doctor (B.18) — borrador
 *
 * GET /api/admin/visit-notes/[appointmentId]  → nota (o null si no existe aún)
 * PUT /api/admin/visit-notes/[appointmentId]  → upsert del borrador
 *
 * Seguridad: solo el doctor dueño de la cita (o SUPER_ADMIN/ADMIN) puede leer o
 * escribir. Una nota FIRMADA es inmutable — el PUT la rechaza con 409.
 * Los signos vitales NO se editan aquí: viven en el triaje (nodo 2).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';

type Ctx = { params: Promise<{ appointmentId: string }> };

const DxSchema = z.object({
  icd10Code: z.string().max(20).nullable().optional(),
  icd10Label: z.string().max(500).nullable().optional(),
  snomedCode: z.string().max(50).nullable().optional(),
  snomedLabel: z.string().max(500).nullable().optional(),
  diagnosisId: z.string().nullable().optional(),
});

const NoteSchema = z.object({
  templateId: z.string().nullable().optional(),
  chiefComplaint: z.string().nullable().optional(),
  hpi: z.string().nullable().optional(),
  ros: z.string().nullable().optional(),
  physicalExam: z.string().nullable().optional(),
  assessment: z.string().nullable().optional(),
  plan: z.string().nullable().optional(),
  diagnoses: z.array(DxSchema).default([]),
});

/**
 * Verifica sesión y acceso a la cita.
 * Devuelve la respuesta de error si no pasa, o null si está autorizado.
 */
async function denyAccess(appointmentId: string): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { provider: { select: { email: true } } },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const isOwner = appt.provider?.email?.toLowerCase() === user.email.toLowerCase();
  if (isOwner) return null;

  const role = await fetchDbRole(user.email);
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return null;

  return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const denied = await denyAccess(appointmentId);
  if (denied) return denied;

  const note = await db.visitNote.findUnique({
    where: { appointmentId },
    include: { diagnoses: { orderBy: { sortOrder: 'asc' } } },
  });

  return NextResponse.json({ note });
}

export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const denied = await denyAccess(appointmentId);
  if (denied) return denied;
  const actor = actorFromHeaders(req.headers);

  let parsed;
  try { parsed = NoteSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const existing = await db.visitNote.findUnique({
    where: { appointmentId },
    select: { id: true, status: true },
  });

  // Nota firmada = inmutable (HIPAA)
  if (existing?.status === 'SIGNED') {
    return NextResponse.json({ error: 'NOTE_ALREADY_SIGNED' }, { status: 409 });
  }

  const { diagnoses, ...sections } = parsed;

  const note = await db.$transaction(async (tx) => {
    const saved = existing
      ? await tx.visitNote.update({ where: { appointmentId }, data: sections })
      : await tx.visitNote.create({ data: { appointmentId, ...sections } });

    // Los diagnósticos se reemplazan completos (el cliente manda la lista final)
    await tx.visitNoteDiagnosis.deleteMany({ where: { noteId: saved.id } });
    if (diagnoses.length) {
      await tx.visitNoteDiagnosis.createMany({
        data: diagnoses.map((d, i) => ({
          noteId: saved.id,
          icd10Code: d.icd10Code ?? null,
          icd10Label: d.icd10Label ?? null,
          snomedCode: d.snomedCode ?? null,
          snomedLabel: d.snomedLabel ?? null,
          diagnosisId: d.diagnosisId ?? null,
          sortOrder: i,
        })),
      });
    }

    return tx.visitNote.findUnique({
      where: { id: saved.id },
      include: { diagnoses: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  // Audit solo al CREAR la nota (Regla #3). Los autoguardados posteriores no se
  // registran para no inundar el log; la firma sí deja su propia entrada.
  if (!existing && note) {
    await writeAuditLog(db, {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      action: 'CREATE_VISIT_NOTE',
      entityType: 'visit_notes',
      entityId: note.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { appointmentId, templateId: parsed.templateId ?? null },
    });
  }

  return NextResponse.json({ ok: true, note });
}
