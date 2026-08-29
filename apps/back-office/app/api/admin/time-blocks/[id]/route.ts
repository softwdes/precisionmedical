/**
 * PATCH  { label?, startsAt?, durationMinutes? } — editar el aviso
 * DELETE — liberar el horario: "se borra y listo", como en el v2.
 *
 * El borrado es REAL, no logico: el aviso no es un hecho clinico ni financiero,
 * es una nota operativa del dia. Lo que queda es el AuditLog con el texto que
 * tenia, por si hay que reconstruir por que esa hora estuvo marcada.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const PatchSchema = z.object({
  label:           z.string().trim().min(1).max(120).optional(),
  startsAt:        z.string().datetime().optional(),
  durationMinutes: z.number().int().min(5).max(720).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const body   = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }

  const antes = await db.providerTimeBlock.findUnique({ where: { id } });
  if (!antes) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const d = parsed.data;
  const block = await db.providerTimeBlock.update({
    where: { id },
    data: {
      ...(d.label           !== undefined && { label: d.label }),
      ...(d.startsAt        !== undefined && { startsAt: new Date(d.startsAt) }),
      ...(d.durationMinutes !== undefined && { durationMinutes: d.durationMinutes }),
    },
    select: { id: true, startsAt: true, durationMinutes: true, label: true, providerId: true, clinicId: true },
  });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'UPDATE_TIME_BLOCK',
    entityType:  'provider_time_blocks',
    entityId:    id,
    before:      { label: antes.label, startsAt: antes.startsAt.toISOString(), durationMinutes: antes.durationMinutes },
    after:       { label: block.label, startsAt: block.startsAt.toISOString(), durationMinutes: block.durationMinutes },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true, block: { ...block, startsAt: block.startsAt.toISOString() } });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const antes = await db.providerTimeBlock.findUnique({ where: { id } });
  if (!antes) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const actor = await resolveActor(req.headers);
  // El audit log va ANTES del delete: la fila desaparece y este registro es la
  // unica traza de que esa hora estuvo marcada y con que texto.
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'DELETE_TIME_BLOCK',
    entityType:  'provider_time_blocks',
    entityId:    id,
    before:      {
      label:           antes.label,
      providerId:      antes.providerId,
      startsAt:        antes.startsAt.toISOString(),
      durationMinutes: antes.durationMinutes,
    },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  await db.providerTimeBlock.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
