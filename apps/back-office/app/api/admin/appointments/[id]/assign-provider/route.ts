/**
 * POST /api/admin/appointments/:id/assign-provider — ponerle dueño a una cita
 *
 * ── De dónde sale ───────────────────────────────────────────────────────────
 *
 * Desde el 2026-09-28 la cita puede agendarse SIN provider: se reserva la fecha,
 * la hora y la sede, y quién atiende se decide en el check-in (Erick: *"cita sin
 * provider es un estado normal desde ahora"*). Esta ruta es ese segundo momento.
 *
 * La usan dos pantallas con dos permisos distintos:
 *
 *   · **Day Admission** — el mostrador elige entre los providers del día.
 *   · **Mi Día** — el propio provider la toma. No elige entre varios: se elige a
 *     sí mismo, que es lo único que puede hacer.
 *
 * ── Por qué la escritura es CONDICIONAL ─────────────────────────────────────
 *
 * Dos providers mirando la misma lista de "sin asignar" van a tocar al mismo
 * paciente, y con dos a cuatro por sede eso va a pasar. El `updateMany` con
 * `providerId: null` en el WHERE hace que solo escriba el primero; al segundo se
 * le responde 409 con el nombre de quien se la llevó, en vez de pisarlo en
 * silencio y que los dos crean que el paciente es suyo.
 *
 * ── Por qué NO reasigna ─────────────────────────────────────────────────────
 *
 * Solo pone dueño donde no había. Cambiar el provider de una cita YA asignada se
 * sigue haciendo desde Editar, que es donde vive el chequeo de cruce: mover a un
 * paciente de un provider a otro puede chocar con la agenda del segundo, y este
 * camino —pensado para el mostrador con el paciente enfrente— no es el lugar
 * para resolver eso.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, Prisma, writeAuditLog, VIGENTES } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { puedeAsignarseLaCita } from '@/lib/appointment-scope';

const BodySchema = z.object({ providerId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  /**
   * El permiso no es el de siempre.
   *
   * `puedeEscribirLaCita` pregunta "¿es TUYA?", y una cita sin asignar no es de
   * nadie: a un provider le daría 403 justo en el caso que esta ruta existe para
   * resolver. Acá la pregunta es otra — ver `puedeAsignarseLaCita`.
   */
  if (!(await puedeAsignarseLaCita(parsed.providerId))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const cita = await db.appointment.findFirst({
    where:  { id, ...VIGENTES },
    select: { id: true, providerId: true, scheduledFor: true, durationMinutes: true },
  });
  if (!cita) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const provider = await db.provider.findUnique({
    where:  { id: parsed.providerId },
    select: { id: true, firstName: true, lastName: true, status: true },
  });
  if (!provider || provider.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'PROVIDER_NOT_FOUND_OR_INACTIVE' }, { status: 404 });
  }

  /**
   * Acá se corre la carrera. Si otro llegó primero, `count` vuelve en 0 y la
   * fila ya tiene dueño: no se pisa.
   */
  const { count } = await db.appointment.updateMany({
    where: { id, providerId: null, deletedAt: null },
    data:  { providerId: parsed.providerId },
  });

  if (count === 0) {
    const yaTiene = await db.appointment.findUnique({
      where:  { id },
      select: { provider: { select: { firstName: true, lastName: true } } },
    });
    return NextResponse.json({
      error: 'ALREADY_ASSIGNED',
      /** Quién se la llevó, para que el cartel lo diga en vez de "no se pudo". */
      takenBy: yaTiene?.provider
        ? `${yaTiene.provider.firstName} ${yaTiene.provider.lastName}`
        : null,
    }, { status: 409 });
  }

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'ASSIGN_PROVIDER',
    entityType:  'appointments',
    entityId:    id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    after:       { providerId: provider.id } as unknown as Prisma.JsonValue,
    metadata:    {
      providerName: `${provider.firstName} ${provider.lastName}`,
      // Si el provider se la asignó a sí mismo o se la puso el mostrador. Es el
      // número que dice cuánto se usa cada camino.
      seLaTomoElMismo: actor.actorUserId != null && (await esSuPropioProvider(provider.id)),
    },
  });

  return NextResponse.json({
    ok: true,
    appointment: { id, providerId: provider.id },
    providerName: `${provider.firstName} ${provider.lastName}`,
  });
}

/** ¿El provider asignado es el de la sesión? Solo para la metadata del audit. */
async function esSuPropioProvider(providerId: string): Promise<boolean> {
  const { getSessionProvider } = await import('@/lib/get-session-provider');
  const propio = await getSessionProvider();
  return propio?.id === providerId;
}
