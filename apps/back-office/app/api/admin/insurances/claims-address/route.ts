/**
 * Dirección de billing de una aseguradora — PATCH
 *
 * PATCH /api/admin/insurances/claims-address  { carrierId, claimsAddress }
 *
 * Existe aparte del PATCH del catálogo porque aquel exige el objeto completo
 * (nombre, código, tipo, canal HCFA…) y desde el modal del caso solo se está
 * escribiendo la dirección. Mandar el resto de los campos desde ahí sería
 * arrastrar todo el registro para tocar un campo, y cualquier valor que el
 * modal no conociera se sobrescribiría.
 *
 * OJO: es dato de la ASEGURADORA. Cambiarla afecta a todos sus casos, y la UI
 * lo dice explícitamente.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const Schema = z.object({
  carrierId: z.string().min(1),
  claimsAddress: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = Schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const before = await db.insuranceCarrier.findUnique({ where: { id: parsed.carrierId } });
  if (!before || before.deletedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const updated = await db.insuranceCarrier.update({
    where: { id: parsed.carrierId },
    data: { claimsAddress: parsed.claimsAddress?.trim() || null },
    select: { id: true, name: true, claimsAddress: true },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'UPDATE_INSURANCE_CLAIMS_ADDRESS',
    entityType: 'insurance_carriers',
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: { claimsAddress: before.claimsAddress } as unknown as Prisma.JsonValue,
    after: { claimsAddress: updated.claimsAddress } as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, carrier: updated });
}
