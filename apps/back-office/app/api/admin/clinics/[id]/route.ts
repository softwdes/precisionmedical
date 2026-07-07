import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  name:    z.string().min(1).max(100).optional(),
  address: z.string().max(200).nullable().optional(),
  phone:   z.string().max(30).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const actor = actorFromHeaders(req.headers);
  let parsed;
  try { parsed = UpdateSchema.parse(await req.json()); }
  catch { return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 }); }

  const clinic = await db.clinic.findUnique({ where: { id }, select: { id: true } });
  if (!clinic) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (parsed.name) {
    const dup = await db.clinic.findFirst({ where: { name: parsed.name, NOT: { id } }, select: { id: true } });
    if (dup) return NextResponse.json({ error: 'DUPLICATE_NAME', message: `Ya existe una clínica con el nombre "${parsed.name}".` }, { status: 409 });
  }

  const updated = await db.clinic.update({ where: { id }, data: parsed });

  await writeAuditLog(db, {
    actorType: actor.actorType, actorUserId: actor.actorUserId,
    action: 'UPDATE_CLINIC', entityType: 'clinics', entityId: id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    after: updated,
  });

  return NextResponse.json({ clinic: updated });
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const clinic = await db.clinic.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { appointments: true } } },
  });
  if (!clinic) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (clinic._count.appointments > 0) {
    return NextResponse.json({
      error: 'HAS_APPOINTMENTS',
      message: `No se puede eliminar "${clinic.name}" — tiene ${clinic._count.appointments} cita(s) registrada(s).`,
    }, { status: 409 });
  }

  await db.clinic.delete({ where: { id } });

  await writeAuditLog(db, {
    actorType: actor.actorType, actorUserId: actor.actorUserId,
    action: 'DELETE_CLINIC', entityType: 'clinics', entityId: id,
    ipAddress: actor.ipAddress, userAgent: actor.userAgent,
  });

  return NextResponse.json({ ok: true });
}
