/**
 * Avisos de agenda del doctor — "Lunch", "se fue temprano", "conferencia".
 *
 * GET  ?from=&to=[&providerId=]  → los del rango, para pintarlos en el calendario
 * POST { providerId, startsAt, durationMinutes, label, clinicId? }
 *
 * NO bloquean nada (decision de Erick 2026-08-20): el sugeridor de horarios los
 * ignora y se puede agendar encima sin aviso. Son informacion para que la lea una
 * persona, igual que en el v2. Por eso este endpoint no toca `available-slots`
 * ni `findOverlappingAppointments`.
 *
 * Los crea cualquiera del staff —recepcion, asistentes—, asi que no hay chequeo
 * de rol mas alla de estar autenticado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const CrearSchema = z.object({
  /** Opcional: sin doctor, el aviso es del calendario y lo ve todo el mundo. */
  providerId:      z.string().min(1).nullable().optional(),
  clinicId:        z.string().min(1).nullable().optional(),
  startsAt:        z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(720),
  label:           z.string().trim().min(1).max(120),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ ok: false, error: 'MISSING_RANGE' }, { status: 400 });
  }
  const providerId = searchParams.get('providerId') ?? undefined;

  const blocks = await db.providerTimeBlock.findMany({
    where: {
      startsAt: { gte: new Date(from), lte: new Date(to) },
      // Con filtro de doctor se traen los suyos Y los que no tienen doctor: esos
      // son del calendario entero, asi que filtrarlos los haria desaparecer justo
      // cuando alguien mira la agenda de una sola persona.
      ...(providerId ? { OR: [{ providerId }, { providerId: null }] } : {}),
    },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true, startsAt: true, durationMinutes: true, label: true,
      providerId: true, clinicId: true,
      provider: { select: { firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    blocks: blocks.map((b) => ({
      id:              b.id,
      startsAt:        b.startsAt.toISOString(),
      durationMinutes: b.durationMinutes,
      label:           b.label,
      providerId:      b.providerId,
      clinicId:        b.clinicId,
      providerName:    b.provider ? `${b.provider.firstName} ${b.provider.lastName}`.trim() : null,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body   = await req.json().catch(() => null);
  const parsed = CrearSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  // Solo se valida el doctor si vino; sin doctor el aviso es del calendario.
  const provider = d.providerId
    ? await db.provider.findFirst({
        where:  { id: d.providerId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      })
    : null;
  if (d.providerId && !provider) {
    return NextResponse.json({ ok: false, error: 'PROVIDER_NOT_FOUND' }, { status: 404 });
  }

  const actor = await resolveActor(req.headers);

  const block = await db.providerTimeBlock.create({
    data: {
      providerId:      d.providerId ?? null,
      clinicId:        d.clinicId ?? null,
      startsAt:        new Date(d.startsAt),
      durationMinutes: d.durationMinutes,
      label:           d.label,
      createdByUserId: actor.actorUserId ?? null,
    },
    select: { id: true, startsAt: true, durationMinutes: true, label: true, providerId: true, clinicId: true },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'CREATE_TIME_BLOCK',
    entityType:  'provider_time_blocks',
    entityId:    block.id,
    metadata:    {
      label:           block.label,
      providerId:      block.providerId,
      providerName:    provider ? `${provider.firstName} ${provider.lastName}`.trim() : null,
      startsAt:        block.startsAt.toISOString(),
      durationMinutes: block.durationMinutes,
    },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    block: { ...block, startsAt: block.startsAt.toISOString() },
  }, { status: 201 });
}
