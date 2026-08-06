import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import { syncBraceBilling } from '@/lib/brace-billing';

/**
 * Férulas / DME entregados en una visita.
 *
 * GET  /api/admin/braces/[appointmentId]  → entregas de esta cita + historial del paciente
 * POST /api/admin/braces/[appointmentId]  → registra una entrega (fila por férula)
 *
 * Sin `requireProvider`: la férula la puede cargar el doctor o el asistente desde
 * Day Admission (decisión de Erick 2026-08-03). Quién la cargó queda en
 * `dispensedByName` y en el audit log.
 *
 * Los datos del catálogo se copian al registro (snapshot): si el precio cambia
 * mañana, esta visita tiene que seguir mostrando lo que realmente se cobró.
 */

type Ctx = { params: Promise<{ appointmentId: string }> };

const BRACE_SELECT = {
  id: true,
  code: true,
  name: true,
  sizeLabel: true,
  hcpcsCode: true,
  unitPrice: true,
  side: true,
  quantity: true,
  status: true,
  notes: true,
  voidReason: true,
  dispensedByName: true,
  dispensedAt: true,
} as const;

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const [braces, history] = await Promise.all([
    db.appointmentBrace.findMany({
      where: { appointmentId },
      orderBy: { dispensedAt: 'asc' },
      select: BRACE_SELECT,
    }),
    // Lo que ya se le entregó en otras visitas — evita duplicar una férula que
    // el paciente ya tiene.
    db.appointmentBrace.findMany({
      where: {
        appointmentId: { not: appointmentId },
        appointment: { patientId: appt.patientId },
        status: 'DISPENSED',
      },
      orderBy: { dispensedAt: 'desc' },
      take: 20,
      select: { ...BRACE_SELECT, appointmentId: true },
    }),
  ]);

  return NextResponse.json({ braces, history });
}

const BodySchema = z.object({
  catalogItemId: z.number().int().positive().optional(),
  code: z.string().min(1).max(120),
  name: z.string().min(1).max(300),
  sizeLabel: z.string().max(120).nullable().optional(),
  hcpcsCode: z.string().max(40).nullable().optional(),
  unitPrice: z.number().nonnegative(),
  side: z.enum(['NA', 'LEFT', 'RIGHT']).default('NA'),
  quantity: z.number().int().min(1).max(20).default(1),
  notes: z.string().max(500).nullable().optional(),
});

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

  // Se cuelga de la nota si ya existe (no la crea: se puede entregar una férula
  // sin haber empezado a escribir la nota).
  const note = await db.visitNote.findUnique({
    where: { appointmentId },
    select: { id: true },
  });

  const brace = await db.appointmentBrace.create({
    data: {
      appointmentId,
      visitNoteId: note?.id ?? null,
      catalogItemId: body.catalogItemId ?? null,
      code: body.code,
      name: body.name,
      sizeLabel: body.sizeLabel ?? null,
      hcpcsCode: body.hcpcsCode ?? null,
      unitPrice: body.unitPrice,
      side: body.side,
      quantity: body.quantity,
      notes: body.notes ?? null,
      dispensedByName: actor.name,
    },
    select: BRACE_SELECT,
  });

  // Cobro: la férula se paga completa, junto con los servicios de la visita.
  await syncBraceBilling(appointmentId);

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'DISPENSE_BRACE',
    entityType: 'appointment_braces',
    entityId: brace.id,
    metadata: {
      appointmentId,
      code: body.code,
      name: body.name,
      side: body.side,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      dispensedBy: actor.name,
    },
  }).catch(() => undefined);

  return NextResponse.json({ brace }, { status: 201 });
}
