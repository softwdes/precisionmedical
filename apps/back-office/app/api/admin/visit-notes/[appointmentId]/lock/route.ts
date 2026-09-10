/**
 * Candado de la nota clínica — el que la abre primero la edita.
 *
 * POST   /api/admin/visit-notes/[appointmentId]/lock   → tomar o LATIR
 * DELETE /api/admin/visit-notes/[appointmentId]/lock   → soltar
 *
 * Decisión de Erick (2026-09-10): bloquea de verdad, y **nadie puede
 * arrebatarle la nota a otro usuario**. El candado solo se libera si lo suelta
 * su dueño, si su pestaña deja de latir, o si pasaron 10 minutos sin que toque
 * una tecla. Las reglas y el porqué de los dos relojes están en
 * `lib/visit-note-lock.ts`.
 *
 * El latido es la clave de que el aviso salga gratis: el que tiene la nota le
 * pega acá cada 20 s, y **en la respuesta** se le devuelve si alguien la está
 * esperando. Así el pedido aparece dentro de la nota que está escribiendo sin
 * ningún canal nuevo, sin realtime y sin WebSocket.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import {
  evaluarCandado, CANDADO_LIBRE, type RespuestaCandado,
} from '@/lib/visit-note-lock';

type Ctx = { params: Promise<{ appointmentId: string }> };

const CAMPOS = {
  editingByUserId: true, editingByName: true, editingSince: true,
  editingHeartbeatAt: true, editingTypedAt: true,
  waitingByUserId: true, waitingByName: true, waitingSince: true,
  status: true,
} as const;

const BodySchema = z.object({
  /** `true` si el usuario tocó una tecla desde el latido anterior. */
  typed: z.boolean().optional(),
  /** El botón "Avisarle" del que espera. */
  notify: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) {
    // Sin identidad no hay candado posible: un candado anónimo no se le puede
    // mostrar a nadie ("X está editando") ni devolver a su dueño.
    return NextResponse.json({ error: 'NO_ACTOR' }, { status: 401 });
  }
  const yo = actor.actorUserId;
  const miNombre = actor.actorName ?? null;

  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  const { typed = false, notify = false } = body.success ? body.data : {};

  const nota = await db.visitNote.findUnique({
    where: { appointmentId },
    select: CAMPOS,
  });

  // Sin nota todavía (el editor se abre antes de que exista la fila) no hay nada
  // que bloquear: el primer guardado la crea y ahí el candado empieza a valer.
  if (!nota) {
    return NextResponse.json({
      mio: true, porNombre: null, desde: null, esperando: null,
    } satisfies RespuestaCandado);
  }

  // Una nota firmada es inmutable: no se bloquea porque no se edita.
  if (nota.status === 'SIGNED') {
    return NextResponse.json({
      mio: false, porNombre: null, desde: null, esperando: null,
    } satisfies RespuestaCandado);
  }

  const ahora = new Date();
  const estado = evaluarCandado(nota, ahora);

  // ── Lo tiene OTRO y el candado vale ────────────────────────────────────────
  if (estado.tomado && estado.porUserId !== yo) {
    let esperando = nota.waitingByUserId
      ? { nombre: nota.waitingByName, desde: nota.waitingSince?.toISOString() ?? null }
      : null;

    /*
     * "Avisarle": se anota UNO solo por nota. Si cada clic sobrescribiera al
     * anterior, cinco clics serían cinco banners y el que tiene la nota deja de
     * mirarlos; y si el que espera se cambia, el primero pierde el contexto de a
     * quién le estaba resolviendo. El que ya pidió ve "avisado a las 14:32".
     */
    if (notify && !nota.waitingByUserId) {
      await db.visitNote.update({
        where: { appointmentId },
        data: { waitingByUserId: yo, waitingByName: miNombre, waitingSince: ahora },
      });
      esperando = { nombre: miNombre, desde: ahora.toISOString() };

      // Queda registrado quién le pidió la nota a quién. Aparte de la
      // trazabilidad, es de donde sale después "esta nota estuvo trabada 22
      // minutos", que es el número que dice si los 10 minutos están bien.
      await writeAuditLog(db, {
        actorType: actor.actorType,
        actorUserId: yo,
        actorRole: actor.actorRole,
        action: 'NOTE_LOCK_NUDGE',
        entityType: 'visit_notes',
        entityId: appointmentId,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          pedidoPor: miNombre,
          laTiene: estado.porNombre,
          desde: estado.desde?.toISOString() ?? null,
        },
      });
    }

    return NextResponse.json({
      mio: false,
      porNombre: estado.porNombre,
      desde: estado.desde?.toISOString() ?? null,
      esperando,
    } satisfies RespuestaCandado);
  }

  // ── Está libre, o ya es mío: tomar / refrescar ─────────────────────────────
  //
  // `soltadoPorInactividad` avisa al que ERA dueño y perdió el candado por no
  // tocar una tecla en 10 minutos. Se detecta acá, en su propio latido: figura
  // como dueño en la fila pero el reloj ya lo venció. Es lo que dispara el
  // mensaje "se guardó donde estaba y se cerró" — y se responde ANTES de
  // renovárselo, porque renovarlo en silencio sería no cumplir la regla.
  const eraMioYVencio =
    !estado.tomado && nota.editingByUserId === yo && estado.motivoLibre === 'inactividad';

  if (eraMioYVencio) {
    await db.visitNote.update({ where: { appointmentId }, data: CANDADO_LIBRE });
    return NextResponse.json({
      mio: false, porNombre: null, desde: null, esperando: null,
      soltadoPorInactividad: true,
    } satisfies RespuestaCandado);
  }

  const tomandoDeNuevo = nota.editingByUserId !== yo;
  await db.visitNote.update({
    where: { appointmentId },
    data: {
      editingByUserId: yo,
      editingByName: miNombre,
      editingHeartbeatAt: ahora,
      // `editingSince` solo se mueve cuando la TOMA: si se reescribiera en cada
      // latido, "editando desde 14:20" diría siempre "hace 20 segundos".
      ...(tomandoDeNuevo ? { editingSince: ahora, editingTypedAt: ahora } : {}),
      ...(typed ? { editingTypedAt: ahora } : {}),
      // Al tomarla de nuevo se limpia el pedido de espera: si el que esperaba es
      // justamente quien la tomó, dejarlo puesto le mostraría a sí mismo el
      // banner de "alguien está esperando".
      ...(tomandoDeNuevo ? { waitingByUserId: null, waitingByName: null, waitingSince: null } : {}),
    },
  });

  return NextResponse.json({
    mio: true,
    porNombre: miNombre,
    desde: (tomandoDeNuevo ? ahora : nota.editingSince)?.toISOString() ?? null,
    esperando: !tomandoDeNuevo && nota.waitingByUserId
      ? { nombre: nota.waitingByName, desde: nota.waitingSince?.toISOString() ?? null }
      : null,
  } satisfies RespuestaCandado);
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'NO_ACTOR' }, { status: 401 });

  const nota = await db.visitNote.findUnique({
    where: { appointmentId },
    select: { editingByUserId: true },
  });

  /*
   * Solo suelta el que lo tiene. Sin este `if`, este DELETE sería el botón para
   * arrebatarle la nota a otro usuario — exactamente lo que Erick decidió que no
   * existe. Y no es teórico: el navegador llama a soltar al desmontar el editor,
   * así que el que la abrió en solo lectura y se va estaría soltando el candado
   * ajeno al salir de la pantalla.
   */
  if (nota?.editingByUserId && nota.editingByUserId === actor.actorUserId) {
    await db.visitNote.update({ where: { appointmentId }, data: CANDADO_LIBRE });
  }

  return NextResponse.json({ ok: true });
}
