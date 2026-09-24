/**
 * POST /api/admin/referral-partners/merge  { fromId, intoId }
 *
 * Fusiona dos referidores: todo lo que señalaba a `fromId` pasa a `intoId` y el
 * primero queda borrado lógicamente.
 *
 * ── Por qué hace falta ──────────────────────────────────────────────────────
 *
 * El catálogo arranca cargado con lo que se escribió durante años sin lista, y
 * ahí el mismo lugar aparece varias veces: "Axcess", "Axcess Referral" y
 * "Axcess AF Referral" son uno solo, "Michael Grant" y "Mike Grant" también.
 * El backfill NO los junta a propósito — decidir que dos nombres son el mismo
 * lugar es criterio de la clínica, no de una consulta.
 *
 * Sin esto, "juntarlos" sería borrar uno, y como el borrado deja los vínculos
 * intactos (a propósito: si no, se pierde quién mandó a esos pacientes), el
 * conteo quedaría partido para siempre entre dos filas y el catálogo nunca
 * terminaría de limpiarse.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const BodySchema = z.object({
  fromId: z.string().min(1),
  intoId: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }
  if (body.fromId === body.intoId) {
    return NextResponse.json({ error: 'SAME_PARTNER' }, { status: 400 });
  }

  const [from, into] = await Promise.all([
    db.referralPartner.findUnique({ where: { id: body.fromId } }),
    db.referralPartner.findUnique({ where: { id: body.intoId } }),
  ]);
  if (!from || !into) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (into.deletedAt) {
    return NextResponse.json(
      { error: 'TARGET_DELETED' },
      { status: 409 },
    );
  }

  /* Una transacción: si el repunte de casos falla después de mover los
     pacientes, el que se borra se queda sin nada apuntándole y el dato se
     pierde en silencio. */
  const [pacientes, casos] = await db.$transaction([
    db.patient.updateMany({
      where: { referralPartnerId: from.id },
      data: { referralPartnerId: into.id },
    }),
    db.caseTracking.updateMany({
      where: { referralPartnerId: from.id },
      data: { referralPartnerId: into.id },
    }),
    db.referralPartner.update({
      where: { id: from.id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    }),
  ]);

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'MERGE_REFERRAL_PARTNER',
    entityType: 'referral_partners',
    entityId: into.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: from as unknown as Prisma.JsonValue,
    after: {
      intoId: into.id,
      intoName: into.name,
      pacientesMovidos: pacientes.count,
      casosMovidos: casos.count,
    } as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({
    ok: true,
    intoId: into.id,
    pacientesMovidos: pacientes.count,
    casosMovidos: casos.count,
  });
}
