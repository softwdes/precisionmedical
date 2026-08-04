import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import { syncCashServiceBilling } from '@/lib/cash-service-billing';

/**
 * Servicios e inyectables del catálogo CASH cobrados en una visita.
 *
 * GET  /api/admin/cash-services/[appointmentId] → cargos de esta cita
 * POST /api/admin/cash-services/[appointmentId] → agrega un cargo
 *
 * Hermano de `/api/admin/braces/[appointmentId]`, mismo contrato y mismas razones.
 * Existe aparte del `plannedServiceCodes` de la cita porque son dos catálogos
 * distintos con dos destinos distintos: los CPT se facturan a la aseguradora y
 * estos los paga el paciente. Mezclarlos en el mismo JSON haría imposible
 * separar el total (`A seguro $X · Cobra hoy $Y`), que es lo único que el
 * asistente necesita saber en el mostrador.
 *
 * Sin `requireProvider`: lo carga el doctor o el asistente. Quién lo hizo queda
 * en `chargedByName` y en el audit log.
 */

type Ctx = { params: Promise<{ appointmentId: string }> };

const CHARGE_SELECT = {
  id: true,
  catalogItemId: true,
  code: true,
  name: true,
  unitPrice: true,
  cptCode: true,
  unitLabel: true,
  quantity: true,
  status: true,
  notes: true,
  chargedByName: true,
  chargedAt: true,
} as const;

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  const charges = await db.appointmentService.findMany({
    where: { appointmentId, status: 'CHARGED' },
    orderBy: { chargedAt: 'asc' },
    select: CHARGE_SELECT,
  });

  return NextResponse.json({
    charges: charges.map((c) => ({ ...c, unitPrice: Number(c.unitPrice) })),
  });
}

const BodySchema = z.object({
  catalogItemId: z.number().int().positive().optional(),
  code: z.string().min(1).max(120),
  name: z.string().min(1).max(300),
  unitPrice: z.number().nonnegative(),
  /** Código de seguro del ítem, si lo tenía. Evidencia, no se factura. */
  cptCode: z.string().max(40).nullable().optional(),
  unitLabel: z.string().max(120).nullable().optional(),
  quantity: z.number().int().min(1).max(50).default(1),
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

  // Se cuelga de la nota si ya existe (no la crea: se puede cobrar una inyección
  // sin haber empezado a escribir la nota).
  const note = await db.visitNote.findUnique({
    where: { appointmentId },
    select: { id: true },
  });

  const charge = await db.appointmentService.create({
    data: {
      appointmentId,
      visitNoteId: note?.id ?? null,
      catalogItemId: body.catalogItemId ?? null,
      code: body.code,
      name: body.name,
      unitPrice: body.unitPrice,
      cptCode: body.cptCode ?? null,
      unitLabel: body.unitLabel ?? null,
      quantity: body.quantity,
      notes: body.notes ?? null,
      chargedByName: actor.name,
    },
    select: CHARGE_SELECT,
  });

  await syncCashServiceBilling(appointmentId);

  writeAuditLog(db, {
    ...actorFromHeaders(req.headers),
    action: 'CHARGE_CASH_SERVICE',
    entityType: 'appointment_services',
    entityId: charge.id,
    metadata: {
      appointmentId,
      code: body.code,
      name: body.name,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      chargedBy: actor.name,
    },
  }).catch(() => undefined);

  return NextResponse.json(
    { charge: { ...charge, unitPrice: Number(charge.unitPrice) } },
    { status: 201 },
  );
}
