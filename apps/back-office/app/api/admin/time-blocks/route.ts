/**
 * Avisos de agenda del doctor — "Lunch", "se fue temprano", "conferencia".
 *
 * GET  ?from=&to=[&providerId=]  → los del rango, para pintarlos en el calendario
 * POST { providerId, startsAt, durationMinutes, label, clinicId? }
 *
 * AVISAN, no impiden (Devin, 2026-09-17: *"you can use the warn but allow
 * format"*). El sugeridor marca la hora como ocupada y el diálogo de cita avisa
 * qué hay ahí, pero si se insiste se guarda igual — mismo criterio que el cruce
 * de dos citas del mismo provider, confirmado por Erick el 2026-08-05.
 *
 * Hasta el 2026-09-17 no avisaban de NADA: eran texto suelto en la grilla y el
 * sugeridor los ignoraba. La versión anterior de este comentario lo declaraba
 * como decisión definitiva (Erick, 2026-08-20) y quedó revisada — con 0 filas
 * creadas en un mes, no había ninguna evidencia a favor.
 *
 * ── SE REPITEN ──────────────────────────────────────────────────────────────
 *
 * `startsAt` ya NO es "cuándo es": es **cuándo es la primera vez**. El GET no
 * puede filtrar por `startsAt` dentro del rango —un almuerzo creado en
 * septiembre dejaría de verse en octubre—: trae las reglas vivas y las EXPANDE
 * con `blockOccurrences`. Cada ocurrencia sale como una fila propia, con el id
 * de su regla, así que el calendario no tiene que saber que hubo una regla.
 *
 * Los crea cualquiera del staff —recepcion, asistentes—, asi que no hay chequeo
 * de rol mas alla de estar autenticado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { blockOccurrences } from '@/lib/bloqueos-recurrentes';

const CrearSchema = z.object({
  /** Opcional: sin doctor, el aviso es del calendario y lo ve todo el mundo. */
  providerId:      z.string().min(1).nullable().optional(),
  clinicId:        z.string().min(1).nullable().optional(),
  startsAt:        z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(720),
  label:           z.string().trim().min(1).max(120),
  /** Ver `BlockRepeat` en el schema. Sin valor, no se repite: lo de siempre. */
  repeatMode:      z.enum(['NONE', 'WEEKDAYS', 'WEEKLY']).optional(),
  /** `null` o ausente = para siempre. Es lo que quiere el almuerzo. */
  repeatUntil:     z.string().datetime().nullable().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ ok: false, error: 'MISSING_RANGE' }, { status: 400 });
  }
  const providerId = searchParams.get('providerId') ?? undefined;

  const desde = new Date(from);
  const hasta = new Date(to);

  const blocks = await db.providerTimeBlock.findMany({
    where: {
      /**
       * Dos familias en un OR, y las dos son necesarias:
       *
       *  · las que NO se repiten se siguen filtrando por su fecha, como antes;
       *  · las que SÍ se repiten entran si empezaron antes del fin del rango y
       *    no terminaron antes del inicio. El filtro por `startsAt` dentro del
       *    rango las habría dejado afuera en cuanto pasa el primer mes.
       */
      OR: [
        { repeatMode: 'NONE', startsAt: { gte: desde, lte: hasta } },
        {
          repeatMode: { not: 'NONE' },
          startsAt:   { lte: hasta },
          OR: [{ repeatUntil: null }, { repeatUntil: { gte: desde } }],
        },
      ],
      // Con filtro de doctor se traen los suyos Y los que no tienen doctor: esos
      // son del calendario entero, asi que filtrarlos los haria desaparecer justo
      // cuando alguien mira la agenda de una sola persona.
      ...(providerId ? { AND: [{ OR: [{ providerId }, { providerId: null }] }] } : {}),
    },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true, startsAt: true, durationMinutes: true, label: true,
      providerId: true, clinicId: true, repeatMode: true, repeatUntil: true,
      provider: { select: { firstName: true, lastName: true } },
    },
  });

  /**
   * Una fila por OCURRENCIA, no por regla.
   *
   * El calendario pinta lo que le llega y no sabe nada de repeticiones: así la
   * grilla, la vista por sedes y la de Admisión no tienen que aprender a
   * expandir cada una por su cuenta —que es exactamente cómo se separan dos
   * implementaciones de la misma regla—.
   *
   * `id` sigue siendo el de la REGLA, repetido en cada ocurrencia: es lo que el
   * diálogo necesita para editarla o borrarla. Y por eso el `key` de React no
   * puede ser sólo el id (ver el calendario, que usa id + fecha).
   */
  const ocurrencias = blocks.flatMap((b) =>
    blockOccurrences(b, desde, hasta).map((inicio) => ({
      id:              b.id,
      startsAt:        inicio.toISOString(),
      durationMinutes: b.durationMinutes,
      label:           b.label,
      providerId:      b.providerId,
      clinicId:        b.clinicId,
      providerName:    b.provider ? `${b.provider.firstName} ${b.provider.lastName}`.trim() : null,
      repeatMode:      b.repeatMode,
      repeatUntil:     b.repeatUntil ? b.repeatUntil.toISOString() : null,
    })),
  );
  ocurrencias.sort((a, z) => a.startsAt.localeCompare(z.startsAt));

  return NextResponse.json({ ok: true, blocks: ocurrencias });
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
      repeatMode:      d.repeatMode ?? 'NONE',
      repeatUntil:     d.repeatUntil ? new Date(d.repeatUntil) : null,
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
      repeatMode:      d.repeatMode ?? 'NONE',
      repeatUntil:     d.repeatUntil ?? null,
    },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    block: { ...block, startsAt: block.startsAt.toISOString() },
  }, { status: 201 });
}
