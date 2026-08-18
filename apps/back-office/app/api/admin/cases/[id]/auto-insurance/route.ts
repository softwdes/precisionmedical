/**
 * Seguro de auto del caso — GET / PUT / DELETE
 *
 * Reemplaza al `consentsData.insurances[]` para las entradas de tipo AUTO
 * (paso 3 de la vista de tracking de Edson · docs/plan-vista-edson.md §3.1).
 *
 * El PUT es un upsert por `caseId`: la relación es 1:1, así que no hace falta
 * que el cliente sepa si la fila ya existía. Y a diferencia del JSON —que se
 * guardaba entero y hacía que el último en salvar borrara lo del otro— acá cada
 * quien escribe sus propios campos.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const InputSchema = z.object({
  carrierId: z.string().nullable().optional(),
  carrierNameRaw: z.string().max(200).nullable().optional(),
  policyId: z.string().max(60).nullable().optional(),
  lossDate: z.string().nullable().optional(),
  pipAvailable: z.enum(['YES', 'NO', 'UNKNOWN']).default('UNKNOWN'),
  claimNum: z.string().max(60).nullable().optional(),
  adjusterId: z.string().nullable().optional(),
  adjusterNameRaw: z.string().max(200).nullable().optional(),
  adjusterPhoneRaw: z.string().max(50).nullable().optional(),
  comments: z.string().max(2000).nullable().optional(),
  fullLien: z.boolean().default(false),
  lienComments: z.string().max(2000).nullable().optional(),
});

/**
 * Version para el PATCH: los MISMOS campos pero SIN `.default()`.
 *
 * No es `InputSchema.partial()` a proposito. `pipAvailable` y `fullLien` tienen
 * default, y un default que se cuela en un update parcial escribe un valor que
 * nadie mando — justo lo que este endpoint existe para evitar.
 */
const PartialSchema = z.object({
  carrierId: z.string().nullable().optional(),
  carrierNameRaw: z.string().max(200).nullable().optional(),
  policyId: z.string().max(60).nullable().optional(),
  lossDate: z.string().nullable().optional(),
  pipAvailable: z.enum(['YES', 'NO', 'UNKNOWN']).optional(),
  claimNum: z.string().max(60).nullable().optional(),
  adjusterId: z.string().nullable().optional(),
  adjusterNameRaw: z.string().max(200).nullable().optional(),
  adjusterPhoneRaw: z.string().max(50).nullable().optional(),
  comments: z.string().max(2000).nullable().optional(),
  fullLien: z.boolean().optional(),
  lienComments: z.string().max(2000).nullable().optional(),
});

/** "2023-01-28" → Date, o null si no es una fecha válida. */
function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const row = await db.caseAutoInsurance.findUnique({
    where: { caseId: id },
    include: {
      carrier:  { select: { id: true, name: true } },
      adjuster: { select: { id: true, name: true, phone: true, extension: true } },
    },
  });

  // La grilla y el modal caen a los datos del caso cuando la fila no los tiene:
  // la aseguradora y la fecha del accidente ya viven ahí y no se duplican.
  const kase = await db.case.findUnique({
    where: { id },
    select: {
      accidentDate: true,
      primaryPolicyNumber: true,
      primaryInsurance: { select: { id: true, name: true } },
    },
  });
  if (!kase) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    autoInsurance: row,
    fallback: {
      carrier: kase.primaryInsurance,
      policyId: kase.primaryPolicyNumber,
      lossDate: kase.accidentDate,
    },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const kase = await db.case.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!kase || kase.deletedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // El adjuster tiene que existir; si no, se guarda el nombre como texto libre
  // en vez de romper el guardado — el dato del usuario nunca se pierde.
  let adjusterId = parsed.adjusterId ?? null;
  if (adjusterId) {
    const adj = await db.insuranceAdjuster.findUnique({ where: { id: adjusterId } });
    if (!adj || adj.deletedAt) adjusterId = null;
  }

  const data = {
    carrierId: parsed.carrierId ?? null,
    carrierNameRaw: parsed.carrierId ? null : (parsed.carrierNameRaw ?? null),
    policyId: parsed.policyId ?? null,
    lossDate: parseDate(parsed.lossDate),
    pipAvailable: parsed.pipAvailable,
    claimNum: parsed.claimNum ?? null,
    adjusterId,
    adjusterNameRaw: adjusterId ? null : (parsed.adjusterNameRaw ?? null),
    adjusterPhoneRaw: adjusterId ? null : (parsed.adjusterPhoneRaw ?? null),
    comments: parsed.comments ?? null,
    fullLien: parsed.fullLien,
    lienComments: parsed.lienComments ?? null,
  };

  const before = await db.caseAutoInsurance.findUnique({ where: { caseId: id } });

  const saved = await db.caseAutoInsurance.upsert({
    where:  { caseId: id },
    create: { caseId: id, ...data },
    update: data,
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: before ? 'UPDATE_CASE_AUTO_INSURANCE' : 'CREATE_CASE_AUTO_INSURANCE',
    entityType: 'case_auto_insurances',
    entityId: saved.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before ? (before as unknown as Prisma.JsonValue) : undefined,
    after: saved as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, autoInsurance: saved });
}

/**
 * Actualizacion PARCIAL — solo toca los campos que vengan en el body.
 *
 * Existe aparte del PUT porque la grilla edita un campo suelto (el chip de PIP
 * es un clic) y el PUT es un reemplazo completo: mandarle solo `pipAvailable`
 * dejaria el claim, el adjuster y los comentarios en null. Es exactamente el
 * bug que tenia el JSON y por el que se hizo esta tabla.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = PartialSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const kase = await db.case.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!kase || kase.deletedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (parsed.carrierId !== undefined) {
    data.carrierId = parsed.carrierId ?? null;
    if (parsed.carrierId) data.carrierNameRaw = null;
  }
  if (parsed.carrierNameRaw !== undefined) data.carrierNameRaw = parsed.carrierNameRaw ?? null;
  if (parsed.policyId !== undefined)      data.policyId     = parsed.policyId ?? null;
  if (parsed.lossDate !== undefined)      data.lossDate     = parseDate(parsed.lossDate);
  if (parsed.pipAvailable !== undefined)  data.pipAvailable = parsed.pipAvailable;
  if (parsed.claimNum !== undefined)      data.claimNum     = parsed.claimNum ?? null;
  if (parsed.comments !== undefined)      data.comments     = parsed.comments ?? null;
  if (parsed.fullLien !== undefined)      data.fullLien     = parsed.fullLien;
  if (parsed.lienComments !== undefined)  data.lienComments = parsed.lienComments ?? null;

  if (parsed.adjusterId !== undefined) {
    let adjusterId = parsed.adjusterId ?? null;
    if (adjusterId) {
      const adj = await db.insuranceAdjuster.findUnique({ where: { id: adjusterId } });
      if (!adj || adj.deletedAt) adjusterId = null;
    }
    data.adjusterId = adjusterId;
    // Elegir del catalogo reemplaza al texto libre: si no, la grilla mostraria
    // el nombre viejo escrito a mano y nadie sabria cual de los dos manda.
    if (adjusterId) { data.adjusterNameRaw = null; data.adjusterPhoneRaw = null; }
  }
  if (parsed.adjusterNameRaw !== undefined)  data.adjusterNameRaw  = parsed.adjusterNameRaw ?? null;
  if (parsed.adjusterPhoneRaw !== undefined) data.adjusterPhoneRaw = parsed.adjusterPhoneRaw ?? null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'NOTHING_TO_UPDATE' }, { status: 400 });
  }

  const before = await db.caseAutoInsurance.findUnique({ where: { caseId: id } });

  const saved = await db.caseAutoInsurance.upsert({
    where:  { caseId: id },
    create: { caseId: id, ...data },
    update: data,
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: before ? 'UPDATE_CASE_AUTO_INSURANCE' : 'CREATE_CASE_AUTO_INSURANCE',
    entityType: 'case_auto_insurances',
    entityId: saved.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before ? (before as unknown as Prisma.JsonValue) : undefined,
    after: saved as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, autoInsurance: saved });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  const before = await db.caseAutoInsurance.findUnique({ where: { caseId: id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await db.caseAutoInsurance.delete({ where: { caseId: id } });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'DELETE_CASE_AUTO_INSURANCE',
    entityType: 'case_auto_insurances',
    entityId: before.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true });
}
